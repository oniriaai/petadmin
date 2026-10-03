import axios from "axios";

/**
 * Deactivation and tenant suspension must bite on the NEXT request.
 *
 * Tokens are stateless and last 12h, and `isActive` used to be checked only at /auth/login and
 * /auth/me. So deactivating a user — or suspending a whole daycare for non-payment — left their
 * token working on every operational route until it expired. These assertions exist so that
 * cannot come back.
 *
 * The suite creates and removes its own tenant, like tests/platform-console.e2e.ts, so it never
 * touches the seeded daycares or the users the other suites log in as.
 */

const BASE_URL = process.env.API_URL ?? "http://localhost:3001/api/v1";

interface TestResult { name: string; passed: boolean; error?: string; duration: number }
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

const clientFor = (token: string, daycareId?: string, businessUnit?: string) =>
  axios.create({
    baseURL: BASE_URL,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(daycareId ? { "X-Daycare-Id": daycareId } : {}),
      ...(businessUnit ? { "X-Business-Unit": businessUnit } : {}),
    },
    validateStatus: () => true,
  } as any);

async function login(username: string, password: string, businessUnit?: string) {
  const res = await axios.post(
    `${BASE_URL}/auth/login`,
    { username, password, ...(businessUnit ? { businessUnit } : {}) },
    { validateStatus: () => true } as any,
  );
  return res;
}

function expectStatus(actual: number, expected: number, what: string) {
  if (actual !== expected) throw new Error(`${what}: esperaba ${expected}, recibió ${actual}`);
}

const SUFFIX = Date.now().toString(36);
const SLUG_PREFIX = "e2e-susp";
const SLUG = `${SLUG_PREFIX}-${SUFFIX}`;
const ADMIN_USER = `susp_admin_${SUFFIX}`;
const STAFF_USER = `susp_staff_${SUFFIX}`;
const PASSWORD = "suspension123";

async function run() {
  console.log("🚀 Pruebas de suspensión de usuarios y guarderías\n");

  const superPassword = process.env.SUPERADMIN_PASSWORD || "superadmin123";
  const superRes = await login("superadmin", superPassword);
  if (superRes.status !== 200) {
    console.error(`No se pudo autenticar al superadmin: ${superRes.status}`);
    process.exit(1);
  }
  const console_ = clientFor(superRes.data.token);

  let daycareId = "";
  let staffId = "";
  let staffToken = "";
  let adminToken = "";

  await test("Alta de una guardería de prueba con un usuario de operación", async () => {
    const created = await console_.post("/platform/daycares", {
      slug: SLUG,
      name: `Suspensión ${SUFFIX}`,
      units: ["GROOMING"],
      modules: ["reservas", "peluqueria"],
      admin: { username: ADMIN_USER, password: PASSWORD, name: "Admin Suspensión" },
    });
    expectStatus(created.status, 201, "Alta de guardería");
    daycareId = created.data.daycare.id;

    const staff = await console_.post(`/platform/daycares/${daycareId}/users`, {
      username: STAFF_USER,
      password: PASSWORD,
      name: "Staff Suspensión",
      role: "grooming",
    });
    expectStatus(staff.status, 201, "Provisión de usuario de operación");
    staffId = staff.data.id;
  });

  await test("Ambos usuarios pueden autenticarse y operar", async () => {
    const admin = await login(ADMIN_USER, PASSWORD, "GROOMING");
    expectStatus(admin.status, 200, "Login del admin");
    adminToken = admin.data.token;

    const staff = await login(STAFF_USER, PASSWORD, "GROOMING");
    expectStatus(staff.status, 200, "Login del staff");
    staffToken = staff.data.token;

    const reachable = await clientFor(staffToken, undefined, "GROOMING").get("/clients");
    expectStatus(reachable.status, 200, "El staff debería leer sus clientes");
  });

  await test("Desactivar al usuario invalida su token en la petición siguiente", async () => {
    const deactivated = await console_.patch(`/platform/daycares/${daycareId}/users/${staffId}`, {
      isActive: false,
    });
    expectStatus(deactivated.status, 200, "Desactivación del usuario");

    // The same token that worked a moment ago, with no re-login in between.
    const refused = await clientFor(staffToken, undefined, "GROOMING").get("/clients");
    expectStatus(refused.status, 403, "Un usuario desactivado debería ser rechazado");
    if (refused.data?.code !== "USER_INACTIVE") {
      throw new Error(`Esperaba code=USER_INACTIVE, recibió ${JSON.stringify(refused.data)}`);
    }
  });

  await test("Un usuario desactivado tampoco puede volver a autenticarse", async () => {
    const denied = await login(STAFF_USER, PASSWORD, "GROOMING");
    expectStatus(denied.status, 401, "Login de un usuario desactivado");
  });

  await test("Reactivar al usuario restablece el acceso sin esperar al TTL", async () => {
    const reactivated = await console_.patch(`/platform/daycares/${daycareId}/users/${staffId}`, {
      isActive: true,
    });
    expectStatus(reactivated.status, 200, "Reactivación del usuario");

    const allowed = await clientFor(staffToken, undefined, "GROOMING").get("/clients");
    expectStatus(allowed.status, 200, "El token original debería volver a funcionar");
  });

  await test("Suspender la guardería invalida los tokens de TODOS sus usuarios", async () => {
    const suspended = await console_.patch(`/platform/daycares/${daycareId}`, { isActive: false });
    expectStatus(suspended.status, 200, "Suspensión de la guardería");

    // Neither user was named in the suspension; both must stop working anyway.
    const staffRefused = await clientFor(staffToken, undefined, "GROOMING").get("/clients");
    expectStatus(staffRefused.status, 403, "El staff debería ser rechazado");
    if (staffRefused.data?.code !== "DAYCARE_INACTIVE") {
      throw new Error(`Esperaba code=DAYCARE_INACTIVE, recibió ${JSON.stringify(staffRefused.data)}`);
    }

    const adminRefused = await clientFor(adminToken, undefined, "GROOMING").get("/clients");
    expectStatus(adminRefused.status, 403, "El admin del inquilino debería ser rechazado");
    if (adminRefused.data?.code !== "DAYCARE_INACTIVE") {
      throw new Error(`Esperaba code=DAYCARE_INACTIVE, recibió ${JSON.stringify(adminRefused.data)}`);
    }
  });

  await test("La suspensión del inquilino no afecta a la consola de plataforma", async () => {
    // The superadmin belongs to no daycare, so nothing here should touch it.
    const overview = await console_.get("/platform/overview");
    expectStatus(overview.status, 200, "La consola debería seguir operativa");
  });

  await test("Reactivar la guardería restablece a sus usuarios", async () => {
    const reactivated = await console_.patch(`/platform/daycares/${daycareId}`, { isActive: true });
    expectStatus(reactivated.status, 200, "Reactivación de la guardería");

    const allowed = await clientFor(adminToken, undefined, "GROOMING").get("/clients");
    expectStatus(allowed.status, 200, "El admin debería volver a operar");
  });

  await test("Un token manipulado o firmado con otra clave es rechazado", async () => {
    const [header, payload] = adminToken.split(".");
    const forged = `${header}.${payload}.${"a".repeat(43)}`;
    const refused = await clientFor(forged, undefined, "GROOMING").get("/clients");
    expectStatus(refused.status, 401, "Una firma inválida debería ser 401");
  });

  await cleanup(daycareId);

  const passed = results.filter((r) => r.passed).length;
  console.log("\n" + "=".repeat(60));
  console.log("📊 Resumen de suspensión:");
  console.log(`   Pasadas: ${passed}/${results.length}`);
  console.log(`   Fallidas: ${results.length - passed}/${results.length}`);
  console.log("=".repeat(60));
  if (passed !== results.length) process.exit(1);
}

/**
 * Removes the throwaway tenant and anything left by an earlier run that failed halfway.
 *
 * There is no delete endpoint in the console — deleting a daycare with operational data is
 * deliberately not one request away — so this goes to the database directly, exactly as
 * tests/platform-console.e2e.ts does, which is also what keeps that decision from being
 * weakened for the sake of a test.
 */
async function cleanup(daycareId: string): Promise<void> {
  const { prisma } = await import("../src/db");
  try {
    const stale = await prisma.daycare.findMany({
      where: { slug: { startsWith: SLUG_PREFIX } },
      select: { id: true },
    });
    const ids = [...new Set([...stale.map((row) => row.id), ...(daycareId ? [daycareId] : [])])];
    for (const id of ids) {
      await prisma.platformAuditLog.deleteMany({ where: { daycareId: id } });
      await prisma.user.deleteMany({ where: { daycareId: id } });
      await prisma.businessUnitSetting.deleteMany({ where: { daycareId: id } });
      await prisma.daycareModule.deleteMany({ where: { daycareId: id } });
      await prisma.daycare.deleteMany({ where: { id } });
    }
  } finally {
    await prisma.$disconnect();
  }
}

run().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
