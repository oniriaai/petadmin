/**
 * End-to-end coverage of the vendor console (`/platform`) against a running stack.
 *
 * The suite creates its own throwaway daycare so it never depends on, or disturbs, the seeded
 * tenants. It cleans that daycare up at the end; if it fails halfway the leftover rows are
 * harmless and are removed by the next run, which deletes by slug prefix first.
 */
import axios, { type AxiosInstance } from "axios";

const BASE_URL = process.env.API_URL ?? "http://localhost:3001/api/v1";
const SLUG_PREFIX = "e2e-console";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed += 1;
  } catch (error) {
    const detail =
      axios.isAxiosError(error) && error.response
        ? `${error.response.status} ${JSON.stringify(error.response.data)}`
        : error instanceof Error
          ? error.message
          : String(error);
    console.error(`✗ ${name}: ${detail}`);
    failed += 1;
  }
}

function expectStatus(actual: number, expected: number, label: string): void {
  if (actual !== expected) throw new Error(`${label}: esperaba ${expected}, recibió ${actual}`);
}

/** Never throws on a non-2xx, so a status can be asserted instead of caught. */
function clientFor(token: string, daycareId?: string): AxiosInstance {
  return axios.create({
    baseURL: BASE_URL,
    validateStatus: () => true,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(daycareId ? { "X-Daycare-Id": daycareId } : {}),
    },
  });
}

/**
 * `daycare` is the tenant slug. Usernames are unique per daycare rather than globally, so a
 * login that names no daycare is only unambiguous while the username happens to be unique
 * across the whole installation. Passing it here keeps this suite independent of whatever
 * other tenants exist.
 */
async function login(
  username: string,
  password: string,
  businessUnit?: string,
  daycare?: string,
): Promise<string> {
  const res = await axios.post(`${BASE_URL}/auth/login`, { username, password, businessUnit, daycare });
  return res.data.token;
}

async function main(): Promise<void> {
  console.log("\n🏢 Consola de plataforma\n" + "=".repeat(60));

  const superadmin = await login(
    process.env.SUPERADMIN_USERNAME ?? "superadmin",
    process.env.SUPERADMIN_PASSWORD ?? "superadmin123",
  );
  const tenantAdmin = await login("pethijos_admin", "pethijos123", "GROOMING");
  const platform = clientFor(superadmin);
  const tenant = clientFor(tenantAdmin);

  const slug = `${SLUG_PREFIX}-${Date.now()}`;
  const adminUsername = `${slug}_admin`;
  let createdId = "";

  await test("La consola es inalcanzable para un usuario de guardería", async () => {
    for (const path of ["/platform/overview", "/platform/daycares", "/platform/modules", "/platform/audit"]) {
      const res = await tenant.get(path);
      expectStatus(res.status, 403, `GET ${path}`);
      // A tenant must not be told the console exists as a purchasable module.
      if (res.data?.code === "MODULE_DISABLED") {
        throw new Error(`GET ${path}: la consola no debe presentarse como un módulo deshabilitado`);
      }
    }
    expectStatus((await tenant.post("/platform/daycares", {})).status, 403, "POST /platform/daycares");
  });

  await test("Sin autenticación la consola responde 401, no 403", async () => {
    const anon = axios.create({ baseURL: BASE_URL, validateStatus: () => true });
    expectStatus((await anon.get("/platform/daycares")).status, 401, "GET /platform/daycares");
  });

  await test("El catálogo de módulos no ofrece el núcleo ni la propia consola", async () => {
    const res = await platform.get("/platform/modules");
    expectStatus(res.status, 200, "GET /platform/modules");
    const ids = res.data.modules.map((m: { id: string }) => m.id);
    if (ids.includes("nucleo")) throw new Error("el núcleo no es vendible");
    if (ids.includes("plataforma")) throw new Error("la consola no es vendible");
    if (!ids.includes("guarderia") || !ids.includes("peluqueria")) {
      throw new Error(`catálogo incompleto: ${ids.join(", ")}`);
    }
    if (!res.data.roles.includes("admin") || res.data.roles.includes("superadmin")) {
      throw new Error("superadmin no debe ser un rol asignable");
    }
  });

  await test("Crear una guardería crea entitlements, ajustes y su primer administrador", async () => {
    const res = await platform.post("/platform/daycares", {
      slug,
      name: "Guardería E2E",
      units: ["GROOMING"],
      modules: ["reservas", "peluqueria"],
      admin: { username: adminUsername, password: "e2e-password", name: "Admin E2E" },
    });
    expectStatus(res.status, 201, "POST /platform/daycares");
    createdId = res.data.daycare.id;
    if (res.data.admin.role !== "admin") throw new Error("el primer usuario debe ser admin");
    if (res.data.admin.businessUnit !== "GLOBAL") throw new Error("un admin abarca ambas unidades");
    if ("passwordHash" in res.data.admin) throw new Error("la respuesta no debe incluir el hash");

    const detail = await platform.get(`/platform/daycares/${createdId}`);
    expectStatus(detail.status, 200, "GET detalle");
    const enabled = detail.data.entitlements.filter((e: { isEnabled: boolean }) => e.isEnabled);
    const enabledIds = enabled.map((e: { moduleId: string }) => e.moduleId).sort();
    if (enabledIds.join(",") !== "peluqueria,reservas") {
      throw new Error(`entitlements inesperados: ${enabledIds.join(",")}`);
    }
    // Every toggleable module must have a row, enabled or not, so the matrix is complete.
    if (detail.data.entitlements.length < 7) {
      throw new Error(`la matriz debe listar todos los módulos vendibles, tiene ${detail.data.entitlements.length}`);
    }
  });

  await test("El identificador es único entre guarderías; el nombre de usuario no", async () => {
    const dupSlug = await platform.post("/platform/daycares", {
      slug,
      name: "Otra",
      units: ["DAYCARE"],
      admin: { username: `${slug}_otro`, password: "e2e-password", name: "Otro" },
    });
    expectStatus(dupSlug.status, 409, "slug repetido");

    // Usernames are unique PER DAYCARE since 20260906000000_per_tenant_usernames. This used to
    // be a 409 whose message had to suggest renaming the user after another customer's; two
    // clients can now both have the same one.
    const sameUser = await platform.post("/platform/daycares", {
      slug: `${slug}-2`,
      name: "Otra",
      units: ["DAYCARE"],
      admin: { username: adminUsername, password: "e2e-password", name: "Otro" },
    });
    expectStatus(sameUser.status, 201, "mismo usuario en otra guardería");

    // Removed again straight away: leaving it would make `adminUsername` ambiguous, and the
    // assertions below log in with it and no slug. Deleted inline rather than through
    // `cleanup`, which disconnects Prisma and so must only run at the very end.
    const victimId = sameUser.data.daycare.id as string;
    const { prisma } = await import("../src/db");
    await prisma.platformAuditLog.deleteMany({ where: { daycareId: victimId } });
    await prisma.user.deleteMany({ where: { daycareId: victimId } });
    await prisma.businessUnitSetting.deleteMany({ where: { daycareId: victimId } });
    await prisma.daycareModule.deleteMany({ where: { daycareId: victimId } });
    await prisma.daycare.deleteMany({ where: { id: victimId } });
  });

  await test("Las dependencias entre módulos se validan sobre el estado resultante", async () => {
    const put = (modules: Array<{ moduleId: string; isEnabled: boolean }>) =>
      platform.put(`/platform/daycares/${createdId}/modules`, { modules });

    // Turning both off together is coherent and must be accepted.
    expectStatus(
      (await put([{ moduleId: "reservas", isEnabled: false }, { moduleId: "peluqueria", isEnabled: false }])).status,
      200,
      "quitar ambos",
    );

    // Enabling a module whose prerequisite is now off.
    expectStatus((await put([{ moduleId: "guarderia", isEnabled: true }])).status, 400, "guarderia sin reservas");

    // With the prerequisite in the same request it is fine.
    expectStatus(
      (await put([{ moduleId: "reservas", isEnabled: true }, { moduleId: "guarderia", isEnabled: true }])).status,
      200,
      "guarderia con reservas",
    );

    // The other half of the same invariant: pulling the prerequisite out from under a module
    // that is already on. Validating only the modules being enabled would miss this.
    expectStatus((await put([{ moduleId: "reservas", isEnabled: false }])).status, 400, "quitar reservas bajo guarderia");

    // Restore the state the rest of the suite expects: reservas + peluqueria, guarderia off.
    expectStatus(
      (await put([{ moduleId: "guarderia", isEnabled: false }, { moduleId: "peluqueria", isEnabled: true }])).status,
      200,
      "restaurar",
    );
  });

  await test("El núcleo y la consola no se pueden alternar", async () => {
    for (const moduleId of ["nucleo", "plataforma", "no-existe"]) {
      const res = await platform.put(`/platform/daycares/${createdId}/modules`, {
        modules: [{ moduleId, isEnabled: true }],
      });
      expectStatus(res.status, 400, `toggle ${moduleId}`);
    }
  });

  await test("Un cambio de entitlement surte efecto en la siguiente petición, sin esperar al TTL", async () => {
    const newAdmin = await login(adminUsername, "e2e-password", "GROOMING", slug);
    const tenantClient = clientFor(newAdmin);

    expectStatus((await tenantClient.get("/incomes")).status, 403, "finanzas deshabilitado");

    expectStatus(
      (
        await platform.put(`/platform/daycares/${createdId}/modules`, {
          modules: [{ moduleId: "finanzas", isEnabled: true }],
        })
      ).status,
      200,
      "habilitar finanzas",
    );

    // No sleep: the console invalidates the gate's cache on write, so this must be immediate.
    expectStatus((await tenantClient.get("/incomes")).status, 200, "finanzas habilitado");

    expectStatus(
      (
        await platform.put(`/platform/daycares/${createdId}/modules`, {
          modules: [{ moduleId: "finanzas", isEnabled: false }],
        })
      ).status,
      200,
      "deshabilitar finanzas",
    );
    const denied = await tenantClient.get("/incomes");
    expectStatus(denied.status, 403, "finanzas deshabilitado de nuevo");
    if (denied.data?.code !== "MODULE_DISABLED") throw new Error("falta el código MODULE_DISABLED");
  });

  await test("GET /auth/me refleja los entitlements del inquilino", async () => {
    const newAdmin = await login(adminUsername, "e2e-password", "GROOMING", slug);
    const res = await clientFor(newAdmin).get("/auth/me");
    expectStatus(res.status, 200, "GET /auth/me");
    if (res.data.daycare?.id !== createdId) throw new Error("la guardería no coincide");
    if (!res.data.enabledModules.includes("nucleo")) throw new Error("el núcleo siempre está disponible");
    if (!res.data.enabledModules.includes("peluqueria")) throw new Error("falta peluqueria");
    if (res.data.enabledModules.includes("guarderia")) throw new Error("guarderia no está habilitado");
    if (res.data.fullAccess !== false) throw new Error("un inquilino no tiene acceso total");

    // Pinned, the superadmin sees that tenant's view -- but is still marked full-access.
    const pinned = await clientFor(superadmin, createdId).get("/auth/me");
    expectStatus(pinned.status, 200, "GET /auth/me (superadmin fijado)");
    if (pinned.data.daycare?.id !== createdId) throw new Error("la guardería fijada no coincide");
    if (pinned.data.fullAccess !== true) throw new Error("el superadmin sí tiene acceso total");

    const unpinned = await clientFor(superadmin).get("/auth/me");
    if (unpinned.data.daycare !== null) throw new Error("sin fijar no hay guardería");
    if (!unpinned.data.enabledModules.includes("guarderia")) throw new Error("sin fijar el alcance es total");
  });

  await test("El rol superadmin no se puede asignar a un usuario de guardería", async () => {
    const res = await platform.post(`/platform/daycares/${createdId}/users`, {
      username: `${slug}_super`,
      password: "e2e-password",
      name: "Intento",
      role: "superadmin",
    });
    expectStatus(res.status, 400, "rol superadmin");
  });

  await test("Un rol debe caber en una unidad que la guardería compró", async () => {
    // The daycare was created with GROOMING only.
    const res = await platform.post(`/platform/daycares/${createdId}/users`, {
      username: `${slug}_guarderia`,
      password: "e2e-password",
      name: "Operario",
      role: "daycare",
    });
    expectStatus(res.status, 400, "rol daycare sin unidad DAYCARE");

    const ok = await platform.post(`/platform/daycares/${createdId}/users`, {
      username: `${slug}_peluquero`,
      password: "e2e-password",
      name: "Peluquero",
      role: "grooming",
    });
    expectStatus(ok.status, 201, "rol grooming");
    if (ok.data.businessUnit !== "GROOMING") throw new Error("la unidad se deriva del rol");
  });

  await test("Un usuario solo se edita a través de su propia guardería", async () => {
    const users = await platform.get(`/platform/daycares/${createdId}`);
    const target = users.data.users.find((u: { username: string }) => u.username === adminUsername);
    if (!target) throw new Error("no se encontró el administrador creado");

    // The same id, named under a different daycare, must not be editable.
    const seeded = await platform.get("/platform/daycares");
    const otherId = seeded.data.find((d: { id: string }) => d.id !== createdId)?.id;
    if (!otherId) throw new Error("se necesita otra guardería para esta prueba");
    const crossed = await platform.patch(`/platform/daycares/${otherId}/users/${target.id}`, { name: "Cambiado" });
    expectStatus(crossed.status, 404, "edición cruzada");
  });

  await test("No se puede desactivar al único administrador activo", async () => {
    const detail = await platform.get(`/platform/daycares/${createdId}`);
    const admin = detail.data.users.find((u: { username: string }) => u.username === adminUsername);
    const res = await platform.patch(`/platform/daycares/${createdId}/users/${admin.id}`, { isActive: false });
    expectStatus(res.status, 409, "desactivar único admin");
  });

  await test("No se puede quitar una unidad con usuarios activos asignados", async () => {
    const res = await platform.patch(`/platform/daycares/${createdId}`, { units: ["DAYCARE"] });
    expectStatus(res.status, 409, "quitar GROOMING con un peluquero activo");
  });

  await test("Desactivar una guardería impide el login de sus usuarios", async () => {
    expectStatus(
      (await platform.patch(`/platform/daycares/${createdId}`, { isActive: false })).status,
      200,
      "desactivar",
    );
    const res = await axios.post(
      `${BASE_URL}/auth/login`,
      { daycare: slug, username: adminUsername, password: "e2e-password", businessUnit: "GROOMING" },
      { validateStatus: () => true },
    );
    expectStatus(res.status, 403, "login en guardería desactivada");

    expectStatus(
      (await platform.patch(`/platform/daycares/${createdId}`, { isActive: true })).status,
      200,
      "reactivar",
    );
  });

  await test("Cada escritura queda registrada en la auditoría", async () => {
    const res = await platform.get(`/platform/audit?daycareId=${createdId}&limit=50`);
    expectStatus(res.status, 200, "GET /platform/audit");
    const actions = new Set(res.data.map((row: { action: string }) => row.action));
    for (const action of ["daycare.create", "daycare.update", "module.toggle", "user.provision"]) {
      if (!actions.has(action)) throw new Error(`falta la acción ${action} en la auditoría`);
    }
    const actors = new Set(res.data.map((row: { actorUsername: string }) => row.actorUsername));
    if (actors.size !== 1) throw new Error(`se esperaba un único actor, hubo: ${[...actors].join(", ")}`);
    // The password must never reach the audit trail in the clear.
    const serialized = JSON.stringify(res.data);
    if (serialized.includes("e2e-password")) throw new Error("la auditoría no debe contener contraseñas");
  });

  await test("La guardería de prueba se elimina al terminar", async () => {
    await cleanup(createdId);
    const res = await platform.get(`/platform/daycares/${createdId}`);
    expectStatus(res.status, 404, "la guardería ya no existe");
  });

  console.log("=".repeat(60));
  console.log(`📊 Consola de plataforma:\n   Pasadas: ${passed}/${passed + failed}\n   Fallidas: ${failed}/${passed + failed}`);
  console.log("=".repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}

/**
 * Removes the throwaway tenant. There is no delete endpoint in the console -- deleting a daycare
 * with operational data is not something we want to be one request away -- so the test talks to
 * the database directly, which is also what keeps that decision from being weakened for the
 * sake of a test.
 */
async function cleanup(daycareId: string): Promise<void> {
  if (!daycareId) return;
  const { prisma } = await import("../src/db");
  await prisma.platformAuditLog.deleteMany({ where: { daycareId } });
  await prisma.user.deleteMany({ where: { daycareId } });
  await prisma.businessUnitSetting.deleteMany({ where: { daycareId } });
  await prisma.daycareModule.deleteMany({ where: { daycareId } });
  await prisma.daycare.deleteMany({ where: { id: daycareId } });
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
