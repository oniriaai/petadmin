import type { Request, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

/**
 * Edge protections: who may call the API from where, and how often.
 *
 * None of this existed: `cors()` accepted every origin and nothing was rate limited, so
 * `/auth/login` allowed unlimited credential stuffing (against usernames that are globally
 * unique, so guessing one is guessing a real account) and `/storage/upload-url` would mint
 * presigned URLs for as long as a caller kept asking, at the bucket owner's expense.
 */

const isProduction = process.env.NODE_ENV === "production";

/** The Vite dev server, used when CORS_ORIGINS is unset outside production. */
const DEV_ORIGINS = [
  `http://localhost:${process.env.FRONTEND_PORT ?? 5174}`,
  `http://127.0.0.1:${process.env.FRONTEND_PORT ?? 5174}`,
];

function configuredOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw) return isProduction ? [] : DEV_ORIGINS;
  return raw
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

/**
 * An allowlist rather than a reflector.
 *
 * Requests with no `Origin` header (server-to-server, curl, the e2e suites) are allowed: the
 * header is a browser protection, and refusing its absence would break every non-browser
 * caller without making anything safer.
 */
export function corsOptions() {
  const allowed = configuredOrigins();
  return {
    origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
      if (!origin) return callback(null, true);
      if (allowed.includes(origin.replace(/\/$/, ""))) return callback(null, true);
      callback(null, false);
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Business-Unit", "X-Daycare-Id"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 600,
  };
}

function tooMany(message: string) {
  return (_req: Request, res: Response) => {
    res.status(429).json({ message, code: "RATE_LIMITED" });
  };
}

/**
 * The global ceiling. Generous enough that ordinary front-desk use never reaches it; it exists
 * so one misbehaving client cannot saturate the process.
 */
export const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.RATE_LIMIT_GLOBAL ?? 600),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: tooMany("Demasiadas peticiones. Espera un momento e inténtalo de nuevo."),
});

const LOGIN_WINDOW_MS = 10 * 60_000;
const LOGIN_LIMIT = Number(process.env.RATE_LIMIT_LOGIN ?? 10);

function submittedAccount(req: Request): string {
  const field = (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : "");
  // Usernames are unique per daycare, so the slug is part of which account is being guessed.
  return `${field(req.body?.daycare)}|${field(req.body?.username)}`;
}

function failedLoginLimiter(limit: number, keyGenerator: (req: Request) => string) {
  return rateLimit({
    windowMs: LOGIN_WINDOW_MS,
    limit,
    // Successful logins are not counted, so a busy shift signing in on a shared NAT is
    // unaffected.
    skipSuccessfulRequests: true,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator,
    handler: tooMany("Demasiados intentos de inicio de sesión. Espera unos minutos."),
  });
}

// ipKeyGenerator normalises IPv6 into a subnet key; a raw req.ip would let an attacker rotate
// through a /64 they control for free.
const clientKey = (req: Request) => ipKeyGenerator(req.ip ?? "");

/**
 * Failed sign-in attempts, counted three ways.
 *
 * There used to be one counter, keyed by IP and username together, described as covering both
 * a host working through a list of accounts and a distributed attempt at one account. It
 * covered neither: every new username was a fresh key for the same host, and every new host a
 * fresh key for the same username. Each of those now has a counter of its own, wider than the
 * first so that a front desk mistyping passwords behind one address is not what trips it:
 *
 *   - one host at one account: RATE_LIMIT_LOGIN (10);
 *   - one host at any number of accounts: RATE_LIMIT_LOGIN_IP (five times that);
 *   - any number of hosts at one account: RATE_LIMIT_LOGIN_ACCOUNT (five times that).
 */
export const loginLimiter = [
  failedLoginLimiter(Number(process.env.RATE_LIMIT_LOGIN_IP ?? LOGIN_LIMIT * 5), clientKey),
  failedLoginLimiter(
    Number(process.env.RATE_LIMIT_LOGIN_ACCOUNT ?? LOGIN_LIMIT * 5),
    submittedAccount,
  ),
  failedLoginLimiter(LOGIN_LIMIT, (req) => `${clientKey(req)}|${submittedAccount(req)}`),
];

/**
 * Signups from the public page, keyed by IP.
 *
 * Each one hashes a password, writes a row and either opens a payment at the gateway or sends
 * an email to an address nobody has verified yet, so an open form is a way to spend the
 * platform's money and to mail strangers. Nobody signs a business up this often.
 */
export const signupLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: Number(process.env.RATE_LIMIT_SIGNUP ?? 20),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator(req) {
    return ipKeyGenerator(req.ip ?? "");
  },
  handler: tooMany("Demasiados registros desde esta conexión. Inténtalo más tarde."),
});

/**
 * Object-storage operations, keyed by tenant rather than by IP.
 *
 * Every one of these costs money at the storage provider, and the unit that should bear the
 * limit is the tenant: a whole daycare's staff share one budget, and one tenant cannot exhaust
 * another's. Mounted behind `requireAuth`, so `req.user` is always set.
 */
export const storageLimiter = rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.RATE_LIMIT_STORAGE ?? 60),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator(req) {
    return req.user?.daycareId ?? req.user?.userId ?? ipKeyGenerator(req.ip ?? "");
  },
  handler: tooMany("Demasiadas operaciones de archivos. Espera un momento."),
});

/**
 * Configuration that must not be wrong in production, checked before the server accepts a
 * single request.
 *
 * The JWT secret is the one that matters most: it used to default to "change_me" in two
 * places, so a deploy that forgot to set it ran with a publicly known signing key and anyone
 * could mint a superadmin token. `prisma/seed.ts` already refuses to run without
 * SUPERADMIN_PASSWORD outside development; this is the same rule for the rest.
 */
/**
 * Secrets that are published in this repository: the code's own fallback and the value in
 * `.env.example`. The second is longer than 32 characters, so the length rule alone let a
 * production deployment started from a copied `.env` sign its tokens with a public key.
 */
const KNOWN_JWT_SECRETS = ["change_me", "dev_only_insecure_secret"];

export function assertSecureConfig(): void {
  if (!isProduction) return;

  const problems: string[] = [];
  const secret = process.env.JWT_SECRET;
  if (!secret || KNOWN_JWT_SECRETS.some((known) => secret.includes(known))) {
    problems.push("JWT_SECRET no está definido o conserva un valor de ejemplo");
  } else if (secret.length < 32) {
    problems.push("JWT_SECRET debe tener al menos 32 caracteres");
  }
  if (configuredOrigins().length === 0) {
    problems.push("CORS_ORIGINS debe listar los orígenes permitidos del frontend");
  }
  if (!process.env.DATABASE_URL) {
    problems.push("DATABASE_URL no está definido");
  }
  // Only when the gateway is on: a deployment that does not sell from the page needs neither.
  if (process.env.PAYPHONE_TOKEN?.trim()) {
    if ((process.env.BILLING_ENCRYPTION_KEY?.trim().length ?? 0) < 32) {
      problems.push(
        "BILLING_ENCRYPTION_KEY debe tener al menos 32 caracteres cuando PAYPHONE_TOKEN está definido",
      );
    }
    if (!process.env.PUBLIC_SITE_URL?.trim()) {
      problems.push(
        "PUBLIC_SITE_URL debe indicar la dirección del sitio: PayPhone devuelve ahí al cliente",
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Configuración insegura para NODE_ENV=production:\n  - ${problems.join("\n  - ")}`,
    );
  }
}
