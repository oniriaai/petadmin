import "dotenv/config";
import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { prisma } from "./db";
import {
  errorHandler,
  initErrorReporting,
  logger,
  requestLogger,
} from "./middleware/observability";
import { tenantGuardContext } from "./core/tenancy/guard";
import { assertSecureConfig, corsOptions, globalLimiter } from "./middleware/security";
import { startRecurringPlansScheduler } from "./modules/reservas";
import { startRemindersScheduler } from "./modules/recordatorios";
import { startBillingScheduler } from "./modules/suscripciones";
import { registerBackendModules } from "./platform/module-registry";

// Before anything is mounted: a production process with a default signing secret must not
// start at all, rather than start and quietly accept forged tokens.
assertSecureConfig();
initErrorReporting();

const app = express();
const port = Number(process.env.BACKEND_PORT ?? 3001);

// Behind a reverse proxy, req.ip is the proxy unless Express is told otherwise, which would
// make every IP-keyed rate limit share one bucket. Opt in explicitly: trusting the header
// when nothing strips it lets a caller spoof its own address.
if (process.env.TRUST_PROXY) {
  const value = process.env.TRUST_PROXY;
  app.set("trust proxy", /^\d+$/.test(value) ? Number(value) : value);
}

app.disable("x-powered-by");
app.use(requestLogger);
app.use(helmet());
// Nothing in front of the API compresses for it, and the list endpoints answer with large JSON.
app.use(compression());
app.use(cors(corsOptions()));
// Files go straight to object storage through presigned URLs, so no request body here is more
// than a form. The limit was 10mb, parsed synchronously on the only thread.
app.use(express.json({ limit: "1mb" }));
app.use(globalLimiter);
// Establishes the per-request context the tenant-scope guard in db.ts reads. Must wrap the
// routers, so it is mounted before them and after the body parser.
app.use(tenantGuardContext);

/** Public liveness probe. Detailed deployment state stays out of unauthenticated responses. */
app.get("/api/v1/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

/**
 * Readiness for an orchestrator: cheap, unauthenticated, and it says nothing about the
 * deployment beyond whether this process can take traffic.
 */
app.get("/api/v1/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ready: true });
  } catch {
    res.status(503).json({ ready: false });
  }
});

registerBackendModules(app);

app.use(errorHandler);

/**
 * Whether this process also runs the scheduled work: the daily recurring-plan generation, the
 * hourly reminders and the hourly subscription billing.
 *
 * In development it does, so `docker compose up` behaves as it always has. In production it
 * must not: N replicas would each run it, and a redeploy resets the timer so it may never
 * fire at all. There each is a scheduled one-shot instead (`dist/jobs/run-recurring-plans.js`,
 * `dist/jobs/run-reminders.js` and `dist/jobs/run-billing.js`, the `scheduler`, `reminders` and
 * `billing` services in docker-compose.prod.yml).
 */
const runSchedulerInProcess = process.env.RUN_SCHEDULER_IN_PROCESS
  ? process.env.RUN_SCHEDULER_IN_PROCESS.toLowerCase() === "true"
  : process.env.NODE_ENV !== "production";

const server = app.listen(port, () => {
  logger.info(`Argos Suite backend escuchando en http://localhost:${port}/api/v1`);
  if (runSchedulerInProcess) {
    startRecurringPlansScheduler();
    startRemindersScheduler();
    startBillingScheduler();
  } else {
    logger.info(
      "[recurring-plans] [reminders] [billing] schedulers en proceso desactivados; ejecútalos como jobs programados",
    );
  }
});

/**
 * Stops taking connections, lets the requests in flight finish, then closes the pool.
 *
 * Without this a redeploy or a scale-down killed the process mid-request: the orchestrator
 * sends SIGTERM and follows with SIGKILL, and whatever was being written at that moment was
 * cut off. The timer is the backstop for a connection that never ends.
 */
const SHUTDOWN_GRACE_MS = 15_000;
let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} recibido; cerrando el servidor`);

  const force = setTimeout(() => {
    logger.warn("El servidor no cerró a tiempo; saliendo de todos modos");
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);
  force.unref();

  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
  // Idle keep-alive sockets would otherwise hold `close` open until the proxy drops them.
  server.closeIdleConnections();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
