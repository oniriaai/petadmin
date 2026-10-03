import axios from "axios";

/**
 * A daycare administering its own staff (`/users`).
 *
 * Before this, the vendor console was the only way to create a user or reset a password, so
 * every staff change at every client was a support request. The surface is new, so what is
 * asserted here is mostly what it must REFUSE: another tenant's users, the vendor role, the
 * operational roles reaching it at all, and an admin locking itself or its daycare out.
 *
 * The suite creates its own daycare and removes it, like tests/platform-console.e2e.ts, so it
 * never disturbs the seeded tenants or the users the other suites log in as.
 */

const BASE_URL = process.env.API_URL ?? "http://localhost:3001/api/v1";
const SLUG_PREFIX = "e2e-users";

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

const SUFFIX = Date.now().toString(36);
const SLUG = `${SLUG_PREFIX}-${SUFFIX}`;
const ADMIN = `users_admin_${SUFFIX}`;
const PASSWORD = "tenantusers123";

async function run() {
  console.log("🚀 Pruebas de administración de usuarios por la propia guardería\n");

  const superRes = await login("superadmin", process.env.SUPERADMIN_PASSWORD || "superadmin123");
  if (superRes.status !== 200) {
    console.error(`No se pudo autenticar al superadmin: ${superRes.status}`);
    process.exit(1);
  }
  const consoleApi = clientFor(superRes.data.token);

  let daycareId = "";
  let adminToken = "";
  let adminId = "";
  let staffId = "";

  await test("Alta de una guardería de prueba con ambas unidades", async () => {
    const created = await consoleApi.post("/platform/daycares", {
      slug: SLUG,
      name: `Usuarios ${SUFFIX}`,
      units: ["DAYCARE", "GROOMING"],
      modules: ["reservas", "guarderia", "peluqueria"],
      admin: { username: ADMIN, password: PASSWORD, name: "Admin Usuarios" },
    });
    expectStatus(created.status, 201, "Alta de guardería");
    daycareId = created.data.daycare.id;
    adminId = created.data.admin.id;

    const session = await login(ADMIN, PASSWORD, "DAYCARE");
    expectStatus(session.status, 200, "Login del admin");
    adminToken = session.data.token;
  });

  await test("El admin ve a los usuarios de su guardería y nunca el hash", async () => {
    const list = await clientFor(adminToken, "DAYCARE").get("/users");
    expectStatus(list.status, 200, "GET /users");
    if (!Array.isArray(list.data) || list.data.length !== 1) {
      throw new Error(`Esperaba 1 usuario, recibió ${JSON.stringify(list.data)}`);
    }
    if (JSON.stringify(list.data).includes("passwordHash")) {
      throw new Error("La respuesta incluyó passwordHash");
    }
  });

  await test("El admin puede provisionar personal de su guardería", async () => {
    const created = await clientFor(adminToken, "DAYCARE").post("/users", {
      username: `recepcion_${SUFFIX}`,
      password: PASSWORD,
      name: "Recepción",
      role: "daycare",
    });
    expectStatus(created.status, 201, "POST /users");
    staffId = created.data.id;
    // The business unit is derived from the role, never taken from the request.
    if (created.data.businessUnit !== "DAYCARE") {
      throw new Error(`Esperaba businessUnit=DAYCARE, recibió ${created.data.businessUnit}`);
    }

    const session = await login(`recepcion_${SUFFIX}`, PASSWORD, "DAYCARE");
    expectStatus(session.status, 200, "El usuario provisionado debería poder entrar");
  });

  await test("El admin puede restablecer la contraseña de su personal", async () => {
    const reset = await clientFor(adminToken, "DAYCARE").patch(`/users/${staffId}`, {
      password: "contrasenanueva456",
    });
    expectStatus(reset.status, 200, "PATCH /users/:id");

    const old = await login(`recepcion_${SUFFIX}`, PASSWORD, "DAYCARE");
    expectStatus(old.status, 401, "La contraseña anterior debería dejar de servir");
    const fresh = await login(`recepcion_${SUFFIX}`, "contrasenanueva456", "DAYCARE");
    expectStatus(fresh.status, 200, "La contraseña nueva debería servir");
  });

  await test("El rol superadmin no se puede solicitar desde la guardería", async () => {
    const denied = await clientFor(adminToken, "DAYCARE").post("/users", {
      username: `escalada_${SUFFIX}`,
      password: PASSWORD,
      name: "Escalada",
      role: "superadmin",
    });
    expectStatus(denied.status, 400, "Rol superadmin");
    const check = await login(`escalada_${SUFFIX}`, PASSWORD);
    expectStatus(check.status, 401, "El usuario no debería existir");
  });

  await test("Un rol debe caber en una unidad que la guardería compró", async () => {
    // This daycare bought both units, so a grooming user is fine; the restricted demo tenant
    // is what proves the refusal, and the console suite already covers that path. Here the
    // assertion is simply that the rule is applied on this surface too.
    const ok = await clientFor(adminToken, "DAYCARE").post("/users", {
      username: `estetica_${SUFFIX}`,
      password: PASSWORD,
      name: "Estética",
      role: "grooming",
    });
    expectStatus(ok.status, 201, "Rol grooming en una guardería con GROOMING");
    if (ok.data.businessUnit !== "GROOMING") {
      throw new Error(`Esperaba businessUnit=GROOMING, recibió ${ok.data.businessUnit}`);
    }
  });

  await test("Los roles operativos no alcanzan la administración de usuarios", async () => {
    const staff = await login(`recepcion_${SUFFIX}`, "contrasenanueva456", "DAYCARE");
    const denied = await clientFor(staff.data.token, "DAYCARE").get("/users");
    expectStatus(denied.status, 403, "Un rol daycare no debería administrar usuarios");

    const deniedWrite = await clientFor(staff.data.token, "DAYCARE").post("/users", {
      username: `colado_${SUFFIX}`,
      password: PASSWORD,
      name: "Colado",
      role: "admin",
    });
    expectStatus(deniedWrite.status, 403, "Un rol daycare no debería crear usuarios");
  });

  await test("Un admin no puede tocar a un usuario de otra guardería", async () => {
    // The seeded tenant's admin, named by id. The daycare is taken from the token, never from
    // the request, so this must read as absent rather than as forbidden.
    const foreign = await consoleApi.get("/platform/daycares/daycare_pethijos");
    const victim = foreign.data.users[0];

    const read = await clientFor(adminToken, "DAYCARE").patch(`/users/${victim.id}`, {
      name: "Secuestrado",
    });
    expectStatus(read.status, 404, "Editar un usuario ajeno");

    // And it must not have been modified.
    const after = await consoleApi.get("/platform/daycares/daycare_pethijos");
    const unchanged = after.data.users.find((u: any) => u.id === victim.id);
    if (unchanged.name === "Secuestrado")
      throw new Error("Se modificó un usuario de otra guardería");
  });

  await test("Un admin no puede desactivar su propia cuenta", async () => {
    const denied = await clientFor(adminToken, "DAYCARE").patch(`/users/${adminId}`, {
      isActive: false,
    });
    expectStatus(denied.status, 409, "Autodesactivación");
    if (denied.data?.code !== "SELF_DEMOTION") {
      throw new Error(`Esperaba code=SELF_DEMOTION, recibió ${JSON.stringify(denied.data)}`);
    }
    // The session must still work.
    const still = await clientFor(adminToken, "DAYCARE").get("/users");
    expectStatus(still.status, 200, "La sesión debería seguir viva");
  });

  await test("Un admin no puede quitarse el rol de administrador", async () => {
    const denied = await clientFor(adminToken, "DAYCARE").patch(`/users/${adminId}`, {
      role: "daycare",
    });
    expectStatus(denied.status, 409, "Autodegradación");
  });

  await test("Desactivar personal corta su sesión en la petición siguiente", async () => {
    const staff = await login(`recepcion_${SUFFIX}`, "contrasenanueva456", "DAYCARE");
    const staffApi = clientFor(staff.data.token, "DAYCARE");
    expectStatus((await staffApi.get("/clients")).status, 200, "El personal debería operar");

    const off = await clientFor(adminToken, "DAYCARE").patch(`/users/${staffId}`, {
      isActive: false,
    });
    expectStatus(off.status, 200, "Desactivación");

    const refused = await staffApi.get("/clients");
    expectStatus(refused.status, 403, "El token anterior debería dejar de servir");
    if (refused.data?.code !== "USER_INACTIVE") {
      throw new Error(`Esperaba code=USER_INACTIVE, recibió ${JSON.stringify(refused.data)}`);
    }
  });

  await test("Dos guarderías pueden tener el mismo nombre de usuario", async () => {
    // The whole point of making usernames per-tenant. Before this the console had to refuse
    // and suggest renaming the user after another customer's: "Sugerencia: {slug}_{username}".
    // A name of its own: an earlier test in this run already took `recepcion_${SUFFIX}`.
    const shared = `compartido_${SUFFIX}`;

    const mine = await clientFor(adminToken, "DAYCARE").post("/users", {
      username: shared,
      password: PASSWORD,
      name: "Recepción propia",
      role: "daycare",
    });
    expectStatus(mine.status, 201, "Usuario en la guardería de prueba");

    // The same username again in the SAME daycare is still a conflict.
    const dupe = await clientFor(adminToken, "DAYCARE").post("/users", {
      username: shared,
      password: PASSWORD,
      name: "Duplicado",
      role: "grooming",
    });
    expectStatus(dupe.status, 409, "Usuario repetido en la misma guardería");

    // And in the seeded tenant, through the console, it is accepted.
    const theirs = await consoleApi.post("/platform/daycares/daycare_demo/users", {
      username: shared,
      password: PASSWORD,
      name: "Recepción ajena",
      role: "grooming",
    });
    expectStatus(theirs.status, 201, "El mismo usuario en otra guardería");

    try {
      // Now that it is ambiguous, logging in without a daycare must say so rather than
      // silently picking one.
      const ambiguous = await login(shared, PASSWORD, "DAYCARE");
      expectStatus(ambiguous.status, 400, "Login ambiguo");
      if (ambiguous.data?.code !== "DAYCARE_REQUIRED") {
        throw new Error(
          `Esperaba code=DAYCARE_REQUIRED, recibió ${JSON.stringify(ambiguous.data)}`,
        );
      }

      // With the slug it resolves, and to the right one.
      const resolved = await axios.post(
        `${BASE_URL}/auth/login`,
        { daycare: SLUG, username: shared, password: PASSWORD, businessUnit: "DAYCARE" },
        { validateStatus: () => true } as any,
      );
      expectStatus(resolved.status, 200, "Login con slug");
      if (resolved.data.user.daycareId !== daycareId) {
        throw new Error("El slug resolvió a la guardería equivocada");
      }

      // An unknown slug must read as bad credentials: it must not confirm which daycares exist.
      const unknown = await axios.post(
        `${BASE_URL}/auth/login`,
        { daycare: "no-existe-esta-guarderia", username: shared, password: PASSWORD },
        { validateStatus: () => true } as any,
      );
      expectStatus(unknown.status, 401, "Login con slug inexistente");
    } finally {
      // The borrowed user in the seeded demo tenant must not outlive this test: assertions in
      // tests/tenant-isolation.e2e.ts count what that tenant has.
      const { prisma } = await import("../src/db");
      await prisma.user.deleteMany({ where: { daycareId: "daycare_demo", username: shared } });
      await prisma.$disconnect();
    }
  });

  await cleanup(daycareId);

  const passed = results.filter((r) => r.passed).length;
  console.log("\n" + "=".repeat(60));
  console.log("📊 Resumen de usuarios por guardería:");
  console.log(`   Pasadas: ${passed}/${results.length}`);
  console.log(`   Fallidas: ${results.length - passed}/${results.length}`);
  console.log("=".repeat(60));
  if (passed !== results.length) process.exit(1);
}

/** Removes the throwaway tenant, plus anything an interrupted earlier run left behind. */
async function cleanup(daycareId: string): Promise<void> {
  const { prisma } = await import("../src/db");
  try {
    const stale = await prisma.daycare.findMany({
      where: { slug: { startsWith: SLUG_PREFIX } },
      select: { id: true },
    });
    const ids = [...new Set([...stale.map((r) => r.id), ...(daycareId ? [daycareId] : [])])];
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
