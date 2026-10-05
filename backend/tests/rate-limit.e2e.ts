import axios from "axios";

/**
 * Edge protections: login throttling and CORS origin control.
 *
 * Neither existed — `cors()` reflected every origin and nothing was rate limited, so /auth/login
 * accepted unlimited guesses against usernames that are globally unique. These assertions exist
 * so that cannot come back.
 *
 * Every login attempt here uses a username unique to this run, because the limiter is keyed by
 * IP **and** username: a shared username would leave a real account throttled for the rest of
 * the window and make the other suites fail.
 */

const BASE_URL = "http://localhost:3001/api/v1";
const LOGIN_LIMIT = Number(process.env.RATE_LIMIT_LOGIN ?? 10);

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}
const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const startTime = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, duration: Date.now() - startTime });
    console.log(`✓ ${name}`);
  } catch (error: any) {
    let message = error instanceof Error ? error.message : "Unknown error";
    if (axios.isAxiosError(error) && error.response) {
      message = `${error.response.status} ${JSON.stringify(error.response.data)}`;
    }
    results.push({ name, passed: false, error: message, duration: Date.now() - startTime });
    console.error(`✗ ${name}: ${message}`);
  }
}

const raw = axios.create({ baseURL: BASE_URL, validateStatus: () => true } as any);

function expectStatus(actual: number, expected: number, what: string) {
  if (actual !== expected) throw new Error(`${what}: esperaba ${expected}, recibió ${actual}`);
}

async function run() {
  console.log("🚀 Pruebas de límite de peticiones y CORS\n");

  const unique = `nadie_${Date.now().toString(36)}`;

  await test(`Los intentos fallidos de login se cortan en ${LOGIN_LIMIT}`, async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < LOGIN_LIMIT + 2; attempt += 1) {
      const res = await raw.post("/auth/login", { username: unique, password: "incorrecta" });
      statuses.push(res.status);
    }

    const refused = statuses.filter((status) => status === 401).length;
    const limited = statuses.filter((status) => status === 429).length;

    if (limited === 0) {
      throw new Error(`Ningún intento fue limitado. Estados: ${statuses.join(",")}`);
    }
    if (refused > LOGIN_LIMIT) {
      throw new Error(`Se permitieron ${refused} intentos, el límite es ${LOGIN_LIMIT}`);
    }
    // The limit must engage before the window ends, not merely at some point.
    expectStatus(statuses[statuses.length - 1], 429, "El último intento");
  });

  await test("La respuesta limitada se identifica con code=RATE_LIMITED", async () => {
    const res = await raw.post("/auth/login", { username: unique, password: "incorrecta" });
    expectStatus(res.status, 429, "Intento adicional");
    if (res.data?.code !== "RATE_LIMITED") {
      throw new Error(`Esperaba code=RATE_LIMITED, recibió ${JSON.stringify(res.data)}`);
    }
  });

  await test("El límite es por usuario: otra cuenta sigue pudiendo autenticarse", async () => {
    // The seeded tenant admin, untouched by the attempts above because the key includes the
    // username. If this fails, the limiter is keyed by IP alone and one attacker could lock
    // every account on a shared NAT out of the product.
    const ok = await raw.post("/auth/login", {
      username: "guarderia_admin",
      password: "guarderia123",
      businessUnit: "DAYCARE",
    });
    expectStatus(ok.status, 200, "Login legítimo tras los intentos fallidos");
  });

  await test("Un origen no autorizado no recibe cabecera CORS", async () => {
    const res = await raw.get("/health", { headers: { Origin: "https://evil.example" } });
    const allowed = res.headers["access-control-allow-origin"];
    if (allowed) {
      throw new Error(`Se autorizó un origen arbitrario: access-control-allow-origin=${allowed}`);
    }
  });

  await test("El origen configurado del frontend sí recibe cabecera CORS", async () => {
    const origin = `http://localhost:${process.env.FRONTEND_PORT ?? 5174}`;
    const res = await raw.get("/health", { headers: { Origin: origin } });
    if (res.headers["access-control-allow-origin"] !== origin) {
      throw new Error(
        `El origen del frontend debería estar permitido; recibió ${res.headers["access-control-allow-origin"]}`,
      );
    }
  });

  await test("Las cabeceras de endurecimiento de helmet están presentes", async () => {
    const res = await raw.get("/health");
    if (!res.headers["x-content-type-options"]) {
      throw new Error("Falta x-content-type-options; helmet no está montado");
    }
    if (res.headers["x-powered-by"]) {
      throw new Error("x-powered-by sigue anunciando Express");
    }
  });

  const passed = results.filter((r) => r.passed).length;
  console.log("\n" + "=".repeat(60));
  console.log("📊 Resumen de límites y CORS:");
  console.log(`   Pasadas: ${passed}/${results.length}`);
  console.log(`   Fallidas: ${results.length - passed}/${results.length}`);
  console.log("=".repeat(60));
  if (passed !== results.length) process.exit(1);
}

run();
