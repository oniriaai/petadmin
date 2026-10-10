import axios from "axios";

/**
 * Per-user permissions (`src/core/tenancy/permissions.ts`).
 *
 * Role, unit and entitlement decide which modules a user reaches; permissions decide what it may
 * do inside them. What is pinned here is the boundary a staff account starts behind (no finance,
 * no exports, no deletes, inventory read-only), that an admin moves it, and that a grant or a
 * revocation bites on the very next request of a token that was already issued.
 *
 * That a charge is still recorded when a staff user without `finanzas.read` closes a stay is
 * pinned in tests/modular-domains.e2e.ts, which runs that workflow end to end.
 *
 * The suite creates its own daycare and removes it, like tests/tenant-users.e2e.ts, so it never
 * disturbs the seeded tenants or the users the other suites log in as.
 */

const BASE_URL = process.env.API_URL ?? "http://localhost:3001/api/v1";
const SLUG_PREFIX = "e2e-perms";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}
const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`✓ ${name}`);
  } catch (error: any) {
    let message = error instanceof Error ? error.message : "Unknown error";
    if (axios.isAxiosError(error) && error.response) {
      message = `${error.response.status} ${JSON.stringify(error.response.data)}`;
    }
    results.push({ name, passed: false, error: message });
    console.error(`✗ ${name}: ${message}`);
  }
}

const clientFor = (token: string, businessUnit?: string) =>
  axios.create({
    baseURL: BASE_URL,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(businessUnit ? { "X-Business-Unit": businessUnit } : {}),
    },
    validateStatus: () => true,
  } as any);

async function login(username: string, password: string, businessUnit?: string) {
  return axios.post(
    `${BASE_URL}/auth/login`,
    { username, password, ...(businessUnit ? { businessUnit } : {}) },
    { validateStatus: () => true } as any,
  );
}

function expectStatus(actual: number, expected: number, what: string) {
  if (actual !== expected) throw new Error(`${what}: esperaba ${expected}, recibió ${actual}`);
}

function expectDenied(res: { status: number; data: any }, permission: string, what: string) {
  expectStatus(res.status, 403, what);
  if (res.data?.code !== "PERMISSION_DENIED" || res.data?.permission !== permission) {
    throw new Error(
      `${what}: esperaba PERMISSION_DENIED (${permission}), recibió ${JSON.stringify(res.data)}`,
    );
  }
}

function expectSame(actual: unknown, expected: unknown, what: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${what}: esperaba ${JSON.stringify(expected)}, recibió ${JSON.stringify(actual)}`,
    );
  }
}

const SUFFIX = Date.now().toString(36);
const SLUG = `${SLUG_PREFIX}-${SUFFIX}`;
const ADMIN = `perms_admin_${SUFFIX}`;
const STAFF = `perms_staff_${SUFFIX}`;
const PASSWORD = "permissions123";

const ALL_PERMISSIONS = [
  "finanzas.read",
  "finanzas.write",
  "inventario.read",
  "inventario.write",
  "datos.export",
  "registros.delete",
];

async function run() {
  console.log("🚀 Pruebas de permisos por usuario\n");

  const superRes = await login("superadmin", process.env.SUPERADMIN_PASSWORD || "superadmin123");
  if (superRes.status !== 200) {
    console.error(`No se pudo autenticar al superadmin: ${superRes.status}`);
    process.exit(1);
  }
  const consoleApi = clientFor(superRes.data.token);

  let daycareId = "";
  let staffId = "";
  let admin = clientFor("");
  let staff = clientFor("");
  let clientId = "";

  const setPermissions = async (permissions: string[]) => {
    const res = await admin.patch(`/users/${staffId}`, { permissions });
    expectStatus(res.status, 200, `PATCH /users/:id ${JSON.stringify(permissions)}`);
    return res.data.permissions as string[];
  };

  await test("Alta de una guardería de prueba con finanzas, inventario e informes", async () => {
    const created = await consoleApi.post("/platform/daycares", {
      slug: SLUG,
      name: `Permisos ${SUFFIX}`,
      units: ["DAYCARE"],
      modules: ["reservas", "guarderia", "finanzas", "inventario", "informes"],
      admin: { username: ADMIN, password: PASSWORD, name: "Admin Permisos" },
    });
    expectStatus(created.status, 201, "Alta de guardería");
    daycareId = created.data.daycare.id;

    const session = await login(ADMIN, PASSWORD, "DAYCARE");
    expectStatus(session.status, 200, "Login del admin");
    admin = clientFor(session.data.token, "DAYCARE");
  });

  await test("El admin tiene todos los permisos sin que nadie se los haya concedido", async () => {
    const me = await admin.get("/auth/me");
    expectStatus(me.status, 200, "GET /auth/me");
    expectSame(me.data.permissions, ALL_PERMISSIONS, "permisos del admin");
    for (const path of ["/incomes", "/inventory/items", "/reports/finance", "/export/clients"]) {
      expectStatus((await admin.get(path)).status, 200, `GET ${path} (admin)`);
    }
  });

  await test("Un usuario nuevo nace con el permiso mínimo: ver inventario", async () => {
    const created = await admin.post("/users", {
      username: STAFF,
      password: PASSWORD,
      name: "Recepción",
      role: "daycare",
    });
    expectStatus(created.status, 201, "POST /users");
    staffId = created.data.id;
    expectSame(created.data.permissions, ["inventario.read"], "permisos por defecto");

    const session = await login(STAFF, PASSWORD, "DAYCARE");
    expectStatus(session.status, 200, "Login del personal");
    staff = clientFor(session.data.token);

    const me = await staff.get("/auth/me");
    expectSame(me.data.permissions, ["inventario.read"], "permisos en /auth/me");
  });

  await test("Sin permiso no se leen las finanzas, tampoco por el dashboard ni los informes", async () => {
    for (const path of [
      "/incomes",
      "/payables",
      "/providers",
      "/incomes/summary",
      "/payables/summary",
      "/reports/finance",
    ]) {
      expectDenied(await staff.get(path), "finanzas.read", `GET ${path}`);
    }
    expectDenied(
      await staff.post("/incomes", {
        type: "OTRO",
        concept: "X",
        amount: 1,
        paymentMethod: "EFECTIVO",
      }),
      "finanzas.write",
      "POST /incomes",
    );

    // The summary every user opens stays reachable, without the money in it.
    const summary = await staff.get("/dashboard/summary");
    expectStatus(summary.status, 200, "GET /dashboard/summary");
    if (summary.data.ingresosHoy !== null || summary.data.ingresosMes !== null) {
      throw new Error(`El resumen expuso ingresos: ${JSON.stringify(summary.data)}`);
    }
    if (typeof summary.data.reservasHoy !== "number") {
      throw new Error("El resumen debería conservar los datos operativos");
    }
    // The transport route is floor work, not a financial report.
    expectStatus((await staff.get("/reports/transport")).status, 200, "GET /reports/transport");
  });

  await test("El inventario se ve pero no se modifica", async () => {
    expectStatus((await staff.get("/inventory/items")).status, 200, "GET /inventory/items");
    expectDenied(
      await staff.post("/inventory/items", { name: "Shampoo", category: "Higiene" }),
      "inventario.write",
      "POST /inventory/items",
    );
  });

  await test("Sin permiso no se exporta ni se elimina un registro, pero sí se trabaja con él", async () => {
    expectDenied(await staff.get("/export/clients"), "datos.export", "GET /export/clients");

    const created = await staff.post("/clients", { firstName: "Tutor", lastName: "Permisos" });
    expectStatus(created.status, 201, "POST /clients");
    clientId = created.data.id;
    expectStatus(
      (await staff.put(`/clients/${clientId}`, { firstName: "Tutora", lastName: "Permisos" }))
        .status,
      200,
      "PUT /clients/:id",
    );
    expectDenied(
      await staff.delete(`/clients/${clientId}`),
      "registros.delete",
      "DELETE /clients/:id",
    );
    expectStatus((await staff.get(`/clients/${clientId}`)).status, 200, "el tutor sigue ahí");
  });

  await test("El personal no puede concederse permisos", async () => {
    expectStatus(
      (await staff.patch(`/users/${staffId}`, { permissions: ALL_PERMISSIONS })).status,
      403,
      "PATCH /users/:id (personal)",
    );
    expectDenied(await staff.get("/incomes"), "finanzas.read", "GET /incomes tras el intento");
  });

  await test("Un permiso desconocido se rechaza", async () => {
    const res = await admin.patch(`/users/${staffId}`, { permissions: ["finanzas.todo"] });
    expectStatus(res.status, 400, "PATCH con permiso inexistente");
  });

  await test("Exportar no abre las hojas financieras por sí solo", async () => {
    expectSame(await setPermissions(["datos.export"]), ["datos.export"], "permisos guardados");
    expectStatus((await staff.get("/export/clients")).status, 200, "GET /export/clients");
    expectDenied(await staff.get("/export/incomes"), "finanzas.read", "GET /export/incomes");
    // Replacing the list also dropped the default: a grant is the whole list, not an addition.
    expectDenied(await staff.get("/inventory/items"), "inventario.read", "GET /inventory/items");
  });

  await test("Un permiso concedido vale en la siguiente petición, sin volver a entrar", async () => {
    const stored = await setPermissions(["finanzas.write", "registros.delete"]);
    // Writing implies reading: the stored list carries both.
    expectSame(
      stored,
      ["finanzas.read", "finanzas.write", "registros.delete"],
      "permisos guardados",
    );

    expectStatus((await staff.get("/incomes")).status, 200, "GET /incomes");
    expectStatus((await staff.get("/reports/finance")).status, 200, "GET /reports/finance");
    const income = await staff.post("/incomes", {
      type: "OTRO",
      concept: `Ingreso permisos ${SUFFIX}`,
      amount: 10,
      vatPercent: 0,
      paymentMethod: "EFECTIVO",
    });
    expectStatus(income.status, 201, "POST /incomes");

    const summary = await staff.get("/dashboard/summary");
    if (typeof summary.data.ingresosHoy !== "number") {
      throw new Error("Con finanzas.read el resumen debería incluir los ingresos");
    }
    expectStatus((await staff.delete(`/clients/${clientId}`)).status, 200, "DELETE /clients/:id");
  });

  await test("Un permiso retirado deja de valer en la siguiente petición", async () => {
    expectSame(await setPermissions([]), [], "permisos guardados");
    expectDenied(await staff.get("/incomes"), "finanzas.read", "GET /incomes");
    expectSame((await staff.get("/auth/me")).data.permissions, [], "permisos en /auth/me");
  });

  await test("La consola del proveedor también concede permisos y publica el catálogo", async () => {
    const catalog = await consoleApi.get("/platform/modules");
    expectSame(
      (catalog.data.permissions ?? []).map((p: { id: string }) => p.id),
      ALL_PERMISSIONS,
      "catálogo de permisos",
    );

    const res = await consoleApi.patch(`/platform/daycares/${daycareId}/users/${staffId}`, {
      permissions: ["inventario.write"],
    });
    expectStatus(res.status, 200, "PATCH desde la consola");
    expectSame(res.data.permissions, ["inventario.read", "inventario.write"], "permisos guardados");
    const item = await staff.post("/inventory/items", {
      name: `Shampoo ${SUFFIX}`,
      category: "Higiene",
    });
    expectStatus(item.status, 201, "POST /inventory/items");
  });

  await test("Un cambio de rol invalida la sesión emitida con el rol anterior", async () => {
    const promoted = await admin.patch(`/users/${staffId}`, { role: "admin" });
    expectStatus(promoted.status, 200, "ascenso a admin");
    // The old token still says `daycare`. It must not keep working as either role.
    expectStatus((await staff.get("/clients")).status, 401, "token con el rol anterior");

    const session = await login(STAFF, PASSWORD, "DAYCARE");
    expectStatus(session.status, 200, "nuevo login");
    const asAdmin = clientFor(session.data.token, "DAYCARE");
    expectStatus((await asAdmin.get("/incomes")).status, 200, "GET /incomes como admin");

    const demoted = await admin.patch(`/users/${staffId}`, { role: "daycare" });
    expectStatus(demoted.status, 200, "vuelta a personal");
    // The reverse is the dangerous direction: a demoted admin must not keep everything.
    expectStatus((await asAdmin.get("/incomes")).status, 401, "token de admin tras la degradación");
  });

  await cleanup(daycareId);

  const passed = results.filter((r) => r.passed).length;
  console.log("\n" + "=".repeat(60));
  console.log("📊 Resumen de permisos por usuario:");
  console.log(`   Pasadas: ${passed}/${results.length}`);
  console.log(`   Fallidas: ${results.length - passed}/${results.length}`);
  console.log("=".repeat(60));
  // Explicit: the offboarding service loads the storage client, whose handles outlive the run.
  process.exit(passed === results.length ? 0 : 1);
}

/**
 * Removes the throwaway tenant, plus anything an interrupted earlier run left behind. Through
 * the offboarding service rather than a list of tables: this suite creates business rows, and
 * that is the one place that knows the order they come out in.
 */
async function cleanup(daycareId: string): Promise<void> {
  const { prisma } = await import("../src/db");
  const { deleteDaycare } = await import("../src/modules/platform-admin/offboarding.service");
  try {
    const stale = await prisma.daycare.findMany({
      where: {
        OR: [{ slug: { startsWith: SLUG_PREFIX } }, ...(daycareId ? [{ id: daycareId }] : [])],
      },
      select: { id: true, slug: true },
    });
    for (const daycare of stale) {
      // Deleting an active tenant is refused on purpose; suspend it first, as the console does.
      await prisma.daycare.update({ where: { id: daycare.id }, data: { isActive: false } });
      await deleteDaycare(daycare.id, daycare.slug);
      await prisma.platformAuditLog.deleteMany({ where: { daycareId: daycare.id } });
    }
  } finally {
    await prisma.$disconnect();
  }
}

run().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
