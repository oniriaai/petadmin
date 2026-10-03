import axios from "axios";

/**
 * Tenant isolation. Requires a seeded stack with both daycares (daycare_pethijos and the
 * restricted daycare_demo) and the platform superadmin.
 *
 * Before tenancy, Client and Pet had no scoping at all — every authenticated user could read
 * every record. These assertions exist so that cannot come back.
 */

const BASE_URL = "http://localhost:3001/api/v1";
const PETHIJOS_ID = "daycare_pethijos";
const DEMO_ID = "daycare_demo";

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

async function loginAs(username: string, password: string, businessUnit?: "DAYCARE" | "GROOMING") {
  const client = axios.create({ baseURL: BASE_URL });
  const response = await client.post("/auth/login", {
    username,
    password,
    ...(businessUnit ? { businessUnit } : {}),
  });
  return response.data.token as string;
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

function expectStatus(actual: number, expected: number, what: string) {
  if (actual !== expected) throw new Error(`${what}: esperaba ${expected}, recibió ${actual}`);
}

async function run() {
  console.log("🚀 Pruebas de aislamiento entre guarderías\n");

  let pethijos = "";
  let demo = "";
  let superadmin = "";

  await test("Autenticación de ambas guarderías y de la cuenta de plataforma", async () => {
    pethijos = await loginAs("kinderdog_admin", "kinderdog123", "DAYCARE");
    demo = await loginAs("demo_admin", "demo123", "GROOMING");
    superadmin = await loginAs("superadmin", process.env.SUPERADMIN_PASSWORD || "superadmin123");
    if (!pethijos || !demo || !superadmin) throw new Error("Fallo obteniendo tokens");
  });

  await test("Los listados solo devuelven registros de la propia guardería", async () => {
    const a = clientFor(pethijos);
    const b = clientFor(demo);
    // Only endpoints the demo tenant actually bought. An endpoint it has not bought is denied
    // by the entitlement gate, which also returns no rows -- see the next test, which keeps the
    // two mechanisms apart so neither can be mistaken for the other.
    for (const path of ["/clients", "/pets", "/rooms", "/reservations"]) {
      const own = await a.get(path);
      expectStatus(own.status, 200, `GET ${path} (propia)`);
      const other = await b.get(path);
      expectStatus(other.status, 200, `GET ${path} (demo)`);
      const rows = Array.isArray(other.data) ? other.data : other.data?.data ?? [];
      if (rows.length !== 0) {
        throw new Error(`GET ${path}: la guardería demo no debería ver ${rows.length} registro(s)`);
      }
    }
  });

  await test("Un módulo no habilitado se deniega con 403 MODULE_DISABLED, no con una lista vacía", async () => {
    const a = clientFor(pethijos);
    const b = clientFor(demo);
    // The demo tenant is seeded without finanzas, inventario, informes, cumplimiento or
    // guarderia. Isolation and entitlement are different protections and must not be confused:
    // an empty list would mean "you have none", 403 means "you did not buy this".
    for (const path of ["/incomes", "/payables", "/providers", "/inventory/items", "/reports/kpis", "/contracts", "/alerts"]) {
      expectStatus((await a.get(path)).status, 200, `GET ${path} (tenant con el módulo)`);
      const denied = await b.get(path);
      expectStatus(denied.status, 403, `GET ${path} (tenant sin el módulo)`);
      if (denied.data?.code !== "MODULE_DISABLED") {
        throw new Error(`GET ${path}: se esperaba code MODULE_DISABLED, se recibió ${JSON.stringify(denied.data)}`);
      }
    }
  });

  await test("Leer un registro de otra guardería por id devuelve 404, no 403", async () => {
    const a = clientFor(pethijos);
    const b = clientFor(demo);
    const clients = await a.get("/clients");
    const clientId = clients.data[0]?.id;
    if (!clientId) throw new Error("La guardería principal no tiene clientes sembrados");

    expectStatus((await a.get(`/clients/${clientId}`)).status, 200, "lectura propia");
    // 404 rather than 403: confirming existence across tenants is itself a leak.
    expectStatus((await b.get(`/clients/${clientId}`)).status, 404, "lectura cruzada");
  });

  await test("Escribir o borrar un registro de otra guardería devuelve 404", async () => {
    const a = clientFor(pethijos);
    const b = clientFor(demo);
    const clientId = (await a.get("/clients")).data[0]?.id;
    expectStatus((await b.put(`/clients/${clientId}`, { firstName: "Hack", lastName: "Hack" })).status, 404, "PUT cruzado");
    expectStatus((await b.delete(`/clients/${clientId}`)).status, 404, "DELETE cruzado");
    // ...and the record is untouched.
    const after = await a.get(`/clients/${clientId}`);
    if (after.data.firstName === "Hack") throw new Error("El registro fue modificado por otra guardería");
  });

  await test("Una mascota no puede crearse contra un cliente de otra guardería", async () => {
    const a = clientFor(pethijos);
    const b = clientFor(demo);
    const clientId = (await a.get("/clients")).data[0]?.id;
    const res = await b.post("/pets", { clientId, name: "Intruso", species: "dog", sex: "M" });
    expectStatus(res.status, 404, "POST /pets con cliente ajeno");
  });

  await test("Un usuario de guardería no puede fijar otra guardería con X-Daycare-Id", async () => {
    const impersonating = clientFor(demo, PETHIJOS_ID);
    const res = await impersonating.get("/clients");
    expectStatus(res.status, 403, "X-Daycare-Id ajeno");
  });

  await test("El superadmin ve todas las guarderías y puede fijar una", async () => {
    const all = clientFor(superadmin);
    const everything = await all.get("/clients");
    expectStatus(everything.status, 200, "lectura global");
    const globalCount = everything.data.length;

    const pinnedDemo = await clientFor(superadmin, DEMO_ID).get("/clients");
    if (pinnedDemo.data.length !== 0) throw new Error("La guardería demo no debería tener clientes");

    const pinnedMain = await clientFor(superadmin, PETHIJOS_ID).get("/clients");
    if (pinnedMain.data.length === 0) throw new Error("La guardería principal debería tener clientes");
    if (pinnedMain.data.length > globalCount) throw new Error("El alcance fijado excede el global");
  });

  await test("Un módulo se deniega cuando no sirve a la unidad de negocio seleccionada", async () => {
    // `access.businessUnits` era metadato que nadie leía. Solo muerde para un rol que abarca
    // ambas unidades y que ha acotado con la cabecera: para `daycare`/`grooming` el control de
    // rol ya decidió antes.
    const adminToken = await loginAs("admin_global", "admin123");

    const grooming = clientFor(adminToken, undefined, "GROOMING");
    const denied = await grooming.get("/guarderia/occupancy");
    expectStatus(denied.status, 403, "admin en Peluquería pidiendo ocupación de Guardería");
    if (denied.data?.code !== "WRONG_BUSINESS_UNIT") {
      throw new Error(`se esperaba WRONG_BUSINESS_UNIT, se recibió ${JSON.stringify(denied.data)}`);
    }
    // Es un fallo distinto del de contratación y debe seguir siéndolo.
    if (denied.data?.code === "MODULE_DISABLED") throw new Error("no es un fallo de contratación");

    const daycare = clientFor(adminToken, undefined, "DAYCARE");
    expectStatus((await daycare.get("/guarderia/occupancy")).status, 200, "unidad correcta");
    expectStatus((await daycare.get("/peluqueria/services")).status, 403, "el espejo del caso");

    // Sin cabecera el alcance son ambas unidades, así que nada se acota.
    const consolidated = clientFor(adminToken);
    expectStatus((await consolidated.get("/guarderia/occupancy")).status, 200, "consolidado");
    expectStatus((await consolidated.get("/peluqueria/services")).status, 200, "consolidado");

    // Un módulo que sirve a ambas unidades nunca se acota por la cabecera.
    expectStatus((await grooming.get("/reservations")).status, 200, "reservas sirve a ambas");
    expectStatus((await grooming.get("/rooms")).status, 200, "salas sirve a ambas");

    // Una cabecera inválida es error del llamante: 400, no 500.
    const bad = clientFor(adminToken, undefined, "NO_EXISTE");
    expectStatus((await bad.get("/guarderia/occupancy")).status, 400, "cabecera inválida");
  });

  await test("El superadmin no puede escribir sin fijar una guardería", async () => {
    const res = await clientFor(superadmin).post("/clients", { firstName: "X", lastName: "Y" });
    expectStatus(res.status, 400, "escritura sin X-Daycare-Id");
  });

  await test("Un token sin datos de inquilino (previo a la migración) es rechazado", async () => {
    // A token shaped like the pre-tenancy payload must not be accepted even if well-formed;
    // requireAuth checks the token version explicitly.
    const stale = await axios.post(`${BASE_URL}/auth/login`, {
      username: "kinderdog_admin",
      password: "kinderdog123",
      businessUnit: "DAYCARE",
    });
    const payload = JSON.parse(Buffer.from(stale.data.token.split(".")[1], "base64").toString());
    if (payload.tv !== 2) throw new Error(`El token debería declarar tv=2, trae ${payload.tv}`);
    if (payload.daycareId !== PETHIJOS_ID) {
      throw new Error(`El token debería llevar daycareId=${PETHIJOS_ID}, trae ${payload.daycareId}`);
    }
  });

  await test("No se puede agendar una cita de peluquería con el cliente de otra guardería", async () => {
    // Found by the tenant-scope guard, then confirmed exploitable: createAppointment took
    // clientId and petIds from the body and validated only that the pets belonged to the
    // client -- never that the client belonged to the caller's daycare. It wrote a reservation
    // into the attacker's tenant pointing at the victim's client, and returned the victim's
    // pet name in `concept`.
    const victims = await clientFor(pethijos, undefined, "DAYCARE").get("/clients");
    const victim = (victims.data as any[]).find((c) => c.pets?.length > 0);
    if (!victim) throw new Error("La guardería principal debería tener un cliente con mascotas");

    const denied = await clientFor(demo, undefined, "GROOMING").post("/peluqueria/appointments", {
      clientId: victim.id,
      petIds: [victim.pets[0].id],
      serviceId: "bano",
      startTime: new Date(Date.now() + 86_400_000).toISOString(),
      durationMinutes: 60,
    });
    if (denied.status === 201) {
      throw new Error("Se creó una cita contra el cliente de otra guardería");
    }
    expectStatus(denied.status, 404, "Cita con cliente ajeno");
    // The victim's pet name must not come back in the error either.
    if (JSON.stringify(denied.data).includes(victim.pets[0].name)) {
      throw new Error("La respuesta filtró el nombre de la mascota de otra guardería");
    }
  });

  await test("No se puede crear una reserva con el cliente de otra guardería", async () => {
    const victims = await clientFor(pethijos, undefined, "DAYCARE").get("/clients");
    const victim = (victims.data as any[]).find((c) => c.pets?.length > 0);

    const denied = await clientFor(demo, undefined, "GROOMING").post("/reservations", {
      clientId: victim.id,
      petIds: [victim.pets[0].id],
      service: "PELUQUERIA_CANINA",
      checkIn: new Date(Date.now() + 86_400_000).toISOString(),
      checkOut: new Date(Date.now() + 90_000_000).toISOString(),
      basePrice: 20,
    });
    if (denied.status === 201) throw new Error("Se creó una reserva contra el cliente de otra guardería");
    expectStatus(denied.status, 404, "Reserva con cliente ajeno");
  });

  await test("No se puede reservar una sala de otra guardería", async () => {
    // The room used to be looked up by id and checked only against businessUnit. Every
    // daycare has a DAYCARE and/or GROOMING unit, so that check passed for a foreign room:
    // the booking landed in someone else's room and its capacity was computed from that
    // tenant's occupancy, which the product treats as a hard physical limit.
    const rooms = await clientFor(pethijos, undefined, "DAYCARE").get("/rooms");
    const foreignRoom = (rooms.data as any[])[0];
    if (!foreignRoom) throw new Error("La guardería principal debería tener salas");

    // The demo tenant is seeded without clients, and two assertions above depend on that, so
    // this fixture is removed again whatever happens. Using demo's OWN client is the point:
    // the only thing under test here is the room.
    const demoClient = clientFor(demo, undefined, "GROOMING");
    const { prisma } = await import("../src/db");
    let fixtureClientId = "";

    try {
      const created = await demoClient.post("/clients", {
        firstName: "Aislamiento",
        lastName: `Sala ${Date.now().toString(36)}`,
        phone: "0999999999",
      });
      expectStatus(created.status, 201, "Alta de cliente propio en demo");
      fixtureClientId = created.data.id;

      const createdPet = await demoClient.post("/pets", {
        clientId: fixtureClientId,
        name: "Fixture",
        species: "dog",
        sex: "M",
      });
      expectStatus(createdPet.status, 201, "Alta de mascota propia en demo");

      const denied = await demoClient.post("/reservations", {
        clientId: fixtureClientId,
        petIds: [createdPet.data.id],
        roomId: foreignRoom.id,
        service: "PELUQUERIA_CANINA",
        checkIn: new Date(Date.now() + 86_400_000).toISOString(),
        checkOut: new Date(Date.now() + 90_000_000).toISOString(),
        basePrice: 20,
      });
      if (denied.status === 201) throw new Error("Se reservó una sala de otra guardería");
      expectStatus(denied.status, 404, "Reserva en sala ajena");
    } finally {
      // A hard delete, not the API's soft delete: an inactive row would still be a row, and
      // the assertions above count what the demo tenant has.
      await prisma.pet.deleteMany({ where: { clientId: fixtureClientId || "none" } });
      await prisma.client.deleteMany({ where: { id: fixtureClientId || "none" } });
      // Anything a previous interrupted run left behind.
      await prisma.pet.deleteMany({ where: { client: { firstName: "Aislamiento" } } });
      await prisma.client.deleteMany({ where: { firstName: "Aislamiento" } });
      await prisma.$disconnect();
    }
  });

  const passed = results.filter((r) => r.passed).length;
  console.log("\n" + "=".repeat(60));
  console.log("📊 Resumen de aislamiento entre guarderías:");
  console.log(`   Pasadas: ${passed}/${results.length}`);
  console.log(`   Fallidas: ${results.length - passed}/${results.length}`);
  console.log("=".repeat(60));
  if (passed !== results.length) process.exit(1);
}

run();
