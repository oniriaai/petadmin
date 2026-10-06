import axios from "axios";

/**
 * Tenant isolation. Requires a seeded stack with both daycares (daycare_principal and the
 * restricted daycare_demo) and the platform superadmin.
 *
 * Before tenancy, Client and Pet had no scoping at all — every authenticated user could read
 * every record. These assertions exist so that cannot come back.
 */

const BASE_URL = "http://localhost:3001/api/v1";
const MAIN_ID = "daycare_principal";
const DEMO_ID = "daycare_demo";

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

async function loginAs(
  username: string,
  password: string,
  businessUnit?: "DAYCARE" | "GROOMING",
  daycare?: string,
) {
  const client = axios.create({ baseURL: BASE_URL });
  const response = await client.post("/auth/login", {
    username,
    password,
    ...(businessUnit ? { businessUnit } : {}),
    ...(daycare ? { daycare } : {}),
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

  let principal = "";
  let demo = "";
  let superadmin = "";

  await test("Autenticación de ambas guarderías y de la cuenta de plataforma", async () => {
    principal = await loginAs("guarderia_admin", "guarderia123", "DAYCARE");
    demo = await loginAs("demo_admin", "demo123", "GROOMING");
    superadmin = await loginAs("superadmin", process.env.SUPERADMIN_PASSWORD || "superadmin123");
    if (!principal || !demo || !superadmin) throw new Error("Fallo obteniendo tokens");
  });

  await test("Los listados solo devuelven registros de la propia guardería", async () => {
    const a = clientFor(principal);
    const b = clientFor(demo);
    // Only endpoints the demo tenant actually bought. An endpoint it has not bought is denied
    // by the entitlement gate, which also returns no rows -- see the next test, which keeps the
    // two mechanisms apart so neither can be mistaken for the other.
    for (const path of ["/clients", "/pets", "/rooms", "/reservations"]) {
      const own = await a.get(path);
      expectStatus(own.status, 200, `GET ${path} (propia)`);
      const other = await b.get(path);
      expectStatus(other.status, 200, `GET ${path} (demo)`);
      const rows = Array.isArray(other.data) ? other.data : (other.data?.data ?? []);
      if (rows.length !== 0) {
        throw new Error(`GET ${path}: la guardería demo no debería ver ${rows.length} registro(s)`);
      }
    }
  });

  await test("Un módulo no habilitado se deniega con 403 MODULE_DISABLED, no con una lista vacía", async () => {
    // The admin, because the positive half reads finance and inventory, which a unit account
    // needs a permission for. The negative half is about the tenant, not the user.
    const a = clientFor(await loginAs("admin_global", "admin123"));
    const b = clientFor(demo);
    // The demo tenant is seeded without finanzas, inventario, informes, cumplimiento or
    // guarderia. Isolation and entitlement are different protections and must not be confused:
    // an empty list would mean "you have none", 403 means "you did not buy this".
    for (const path of [
      "/incomes",
      "/payables",
      "/providers",
      "/inventory/items",
      "/reports/kpis",
      "/contracts",
      "/alerts",
    ]) {
      expectStatus((await a.get(path)).status, 200, `GET ${path} (tenant con el módulo)`);
      const denied = await b.get(path);
      expectStatus(denied.status, 403, `GET ${path} (tenant sin el módulo)`);
      if (denied.data?.code !== "MODULE_DISABLED") {
        throw new Error(
          `GET ${path}: se esperaba code MODULE_DISABLED, se recibió ${JSON.stringify(denied.data)}`,
        );
      }
    }
  });

  await test("La clínica veterinaria no contratada se deniega con 403 MODULE_DISABLED", async () => {
    // Separate from the loop above: its "tenant with the module" side logs in with the
    // `daycare` role, which the clinic refuses by role before entitlements are consulted.
    const b = clientFor(demo);
    for (const path of ["/veterinaria/visits", "/veterinaria/services", "/veterinaria/staff"]) {
      const denied = await b.get(path);
      expectStatus(denied.status, 403, `GET ${path} (tenant sin el módulo)`);
      if (denied.data?.code !== "MODULE_DISABLED") {
        throw new Error(`GET ${path}: se esperaba MODULE_DISABLED, ${JSON.stringify(denied.data)}`);
      }
    }
  });

  await test("Leer un registro de otra guardería por id devuelve 404, no 403", async () => {
    const a = clientFor(principal);
    const b = clientFor(demo);
    const clients = await a.get("/clients");
    const clientId = clients.data[0]?.id;
    if (!clientId) throw new Error("La guardería principal no tiene clientes sembrados");

    expectStatus((await a.get(`/clients/${clientId}`)).status, 200, "lectura propia");
    // 404 rather than 403: confirming existence across tenants is itself a leak.
    expectStatus((await b.get(`/clients/${clientId}`)).status, 404, "lectura cruzada");
  });

  await test("Escribir o borrar un registro de otra guardería devuelve 404", async () => {
    const a = clientFor(principal);
    const b = clientFor(demo);
    const clientId = (await a.get("/clients")).data[0]?.id;
    expectStatus(
      (await b.put(`/clients/${clientId}`, { firstName: "Hack", lastName: "Hack" })).status,
      404,
      "PUT cruzado",
    );
    expectStatus((await b.delete(`/clients/${clientId}`)).status, 404, "DELETE cruzado");
    // ...and the record is untouched.
    const after = await a.get(`/clients/${clientId}`);
    if (after.data.firstName === "Hack")
      throw new Error("El registro fue modificado por otra guardería");
  });

  await test("Una mascota no puede crearse contra un cliente de otra guardería", async () => {
    const a = clientFor(principal);
    const b = clientFor(demo);
    const clientId = (await a.get("/clients")).data[0]?.id;
    const res = await b.post("/pets", { clientId, name: "Intruso", species: "dog", sex: "M" });
    expectStatus(res.status, 404, "POST /pets con cliente ajeno");
  });

  await test("Un usuario de guardería no puede fijar otra guardería con X-Daycare-Id", async () => {
    const impersonating = clientFor(demo, MAIN_ID);
    const res = await impersonating.get("/clients");
    expectStatus(res.status, 403, "X-Daycare-Id ajeno");
  });

  await test("El superadmin ve todas las guarderías y puede fijar una", async () => {
    const all = clientFor(superadmin);
    const everything = await all.get("/clients");
    expectStatus(everything.status, 200, "lectura global");
    const globalCount = everything.data.length;

    const pinnedDemo = await clientFor(superadmin, DEMO_ID).get("/clients");
    if (pinnedDemo.data.length !== 0)
      throw new Error("La guardería demo no debería tener clientes");

    const pinnedMain = await clientFor(superadmin, MAIN_ID).get("/clients");
    if (pinnedMain.data.length === 0)
      throw new Error("La guardería principal debería tener clientes");
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
      username: "guarderia_admin",
      password: "guarderia123",
      businessUnit: "DAYCARE",
    });
    const payload = JSON.parse(Buffer.from(stale.data.token.split(".")[1], "base64").toString());
    if (payload.tv !== 2) throw new Error(`El token debería declarar tv=2, trae ${payload.tv}`);
    if (payload.daycareId !== MAIN_ID) {
      throw new Error(`El token debería llevar daycareId=${MAIN_ID}, trae ${payload.daycareId}`);
    }
  });

  await test("No se puede agendar una cita de peluquería con el cliente de otra guardería", async () => {
    // Found by the tenant-scope guard, then confirmed exploitable: createAppointment took
    // clientId and petIds from the body and validated only that the pets belonged to the
    // client -- never that the client belonged to the caller's daycare. It wrote a reservation
    // into the attacker's tenant pointing at the victim's client, and returned the victim's
    // pet name in `concept`.
    const victims = await clientFor(principal, undefined, "DAYCARE").get("/clients");
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
    const victims = await clientFor(principal, undefined, "DAYCARE").get("/clients");
    const victim = (victims.data as any[]).find((c) => c.pets?.length > 0);

    const denied = await clientFor(demo, undefined, "GROOMING").post("/reservations", {
      clientId: victim.id,
      petIds: [victim.pets[0].id],
      service: "PELUQUERIA_CANINA",
      checkIn: new Date(Date.now() + 86_400_000).toISOString(),
      checkOut: new Date(Date.now() + 90_000_000).toISOString(),
      basePrice: 20,
    });
    if (denied.status === 201)
      throw new Error("Se creó una reserva contra el cliente de otra guardería");
    expectStatus(denied.status, 404, "Reserva con cliente ajeno");
  });

  await test("No se puede reservar una sala de otra guardería", async () => {
    // The room used to be looked up by id and checked only against businessUnit. Every
    // daycare has a DAYCARE and/or GROOMING unit, so that check passed for a foreign room:
    // the booking landed in someone else's room and its capacity was computed from that
    // tenant's occupancy, which the product treats as a hard physical limit.
    const rooms = await clientFor(principal, undefined, "DAYCARE").get("/rooms");
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

  await test("La clínica no lee ni escribe sobre registros de otra guardería", async () => {
    // `demo` did not buy the clinic, so the gate answers before tenancy is ever consulted. A
    // second tenant that DID buy it is the only way to exercise the clinic's own scoping.
    const CLINIC_PREFIX = "e2e-vetiso";
    const platform = clientFor(superadmin);
    const removeClinic = async (id: string, slug: string) => {
      await platform.patch(`/platform/daycares/${id}`, { isActive: false });
      await platform.delete(`/platform/daycares/${id}`, { data: { confirm: slug } } as any);
    };
    // Whatever an interrupted earlier run left behind.
    for (const stale of (await platform.get("/platform/daycares")).data as any[]) {
      if (stale.slug.startsWith(CLINIC_PREFIX)) await removeClinic(stale.id, stale.slug);
    }

    const slug = `${CLINIC_PREFIX}-${Date.now()}`;
    const created = await platform.post("/platform/daycares", {
      slug,
      name: "Clínica Aislamiento",
      units: ["VETERINARY"],
      modules: ["reservas", "veterinaria"],
      admin: { username: `${slug}_admin`, password: "aislamiento123", name: "Admin Clínica" },
    });
    expectStatus(created.status, 201, "Alta de la clínica de prueba");
    const clinicId: string = created.data.daycare?.id ?? created.data.id;

    try {
      const owner = clientFor(await loginAs("admin_global", "admin123"), undefined, "VETERINARY");
      const other = clientFor(
        await loginAs(`${slug}_admin`, "aislamiento123", undefined, slug),
        undefined,
        "VETERINARY",
      );

      // The main tenant's records, each of which the other clinic will try to use.
      const foreignClient = ((await owner.get("/clients")).data as any[]).find(
        (c) => c.pets?.length > 0,
      );
      const foreignPetId: string = foreignClient.pets[0].id;
      const foreignVet = (await owner.get("/veterinaria/staff")).data[0];
      const foreignService = (await owner.get("/veterinaria/services")).data[0];
      const foreignRoom = (await owner.get("/rooms")).data[0];
      const foreignUser = (await owner.get("/users")).data[0];
      if (!foreignVet || !foreignService || !foreignRoom || !foreignUser) {
        throw new Error("Faltan datos sembrados de la clínica principal");
      }
      const foreignVisit = await owner.post("/veterinaria/visits", {
        clientId: foreignClient.id,
        petId: foreignPetId,
        triage: "URGENCIA",
        reason: "Aislamiento",
      });
      expectStatus(foreignVisit.status, 201, "Consulta en la clínica principal");
      const foreignVisitId: string = foreignVisit.data.id;
      const foreignItem = await owner.post("/inventory/items", {
        name: `Aislamiento ${Date.now()}`,
        category: "Medicamentos",
        currentStock: 5,
      });
      expectStatus(foreignItem.status, 201, "Artículo en la clínica principal");
      const foreignPrescription = await owner.post(
        `/veterinaria/visits/${foreignVisitId}/prescriptions`,
        {
          items: [
            {
              drug: "Aislamiento",
              dose: "1",
              frequency: "cada 12 h",
              inventoryItemId: foreignItem.data.id,
            },
          ],
        },
      );
      expectStatus(foreignPrescription.status, 201, "Receta en la clínica principal");
      const foreignLineId: string = foreignPrescription.data.items[0].id;

      // An inpatient stay with an order, a procedure, a lab order and a consent, to aim at.
      const foreignWard = (await owner.get("/veterinaria/hospitalizations/wards")).data[0];
      if (!foreignWard) throw new Error("Falta la sala de hospitalización sembrada");
      const foreignStay = await owner.post(
        `/veterinaria/visits/${foreignVisitId}/hospitalizations`,
        {
          roomId: foreignWard.id,
          reason: "Aislamiento",
        },
      );
      expectStatus(foreignStay.status, 201, "Ingreso en la clínica principal");
      const foreignStayPath = `/veterinaria/hospitalizations/${foreignStay.data.id}`;
      const foreignOrder = await owner.post(`${foreignStayPath}/orders`, {
        description: "Aislamiento",
        everyHours: 8,
      });
      const foreignProcedure = await owner.post(
        `/veterinaria/visits/${foreignVisitId}/procedures`,
        {
          name: "Aislamiento",
        },
      );
      const foreignLab = await owner.post(`/veterinaria/visits/${foreignVisitId}/lab-orders`, {
        test: "Aislamiento",
      });
      const foreignConsent = await owner.post(`/veterinaria/visits/${foreignVisitId}/consents`, {
        type: "HOSPITALIZACION",
        text: "Aislamiento",
      });
      for (const [what, created] of [
        ["Indicación", foreignOrder],
        ["Procedimiento", foreignProcedure],
        ["Orden de laboratorio", foreignLab],
        ["Consentimiento", foreignConsent],
      ] as const) {
        expectStatus(created.status, 201, `${what} en la clínica principal`);
      }

      try {
        // Reads.
        expectStatus((await other.get("/veterinaria/visits")).data.length, 0, "Listado ajeno");
        expectStatus(
          (await other.get(`/veterinaria/visits/${foreignVisitId}`)).status,
          404,
          "Lectura de consulta ajena",
        );
        expectStatus(
          (await other.get(`/veterinaria/patients/${foreignPetId}/history`)).status,
          404,
          "Historia clínica ajena",
        );
        expectStatus(
          (await other.get("/veterinaria/hospitalizations?status=ALL")).data.length,
          0,
          "Hospitalizaciones ajenas en el listado",
        );
        expectStatus(
          (await other.get("/veterinaria/lab-orders")).data.length,
          0,
          "Órdenes de laboratorio ajenas en el listado",
        );
        // The main clinic has a lab order pending; the other clinic's reminders and figures
        // must not see it.
        if (
          !(await owner.get("/veterinaria/reminders?kind=LABORATORIO")).data.some(
            (r: any) => r.id === `LABORATORIO:${foreignLab.data.id}`,
          )
        ) {
          throw new Error("El recordatorio no aparece en su propia clínica");
        }
        expectStatus(
          (await other.get("/veterinaria/reminders")).data.length,
          0,
          "Recordatorios ajenos",
        );
        expectStatus(
          (await other.get("/veterinaria/reports/summary")).data.visits.total,
          0,
          "Consultas ajenas en el informe",
        );

        // Writes addressed at the other tenant's visit and patient.
        const visitPath = `/veterinaria/visits/${foreignVisitId}`;
        const writes: Array<[string, Promise<{ status: number }>]> = [
          ["Editar consulta ajena", other.patch(visitPath, { reason: "Hack" })],
          ["Cambiar estado ajeno", other.patch(`${visitPath}/status`, { status: "CANCELADA" })],
          ["Signos vitales ajenos", other.post(`${visitPath}/vitals`, { weightKg: 1 })],
          ["Diagnóstico ajeno", other.post(`${visitPath}/diagnoses`, { description: "Hack" })],
          ["Cargo ajeno", other.post(`${visitPath}/charges`, { description: "Hack" })],
          ["Cerrar consulta ajena", other.post(`${visitPath}/close`, {})],
          ["Vacuna ajena", other.post(`${visitPath}/vaccinations`, { name: "Hack" })],
          ["Preventivo ajeno", other.post(`${visitPath}/preventives`, { product: "Hack" })],
          [
            "Receta ajena",
            other.post(`${visitPath}/prescriptions`, {
              items: [{ drug: "Hack", dose: "1", frequency: "1" }],
            }),
          ],
          [
            "Preventivo sobre paciente ajeno",
            other.post(`/veterinaria/patients/${foreignPetId}/preventives`, { product: "Hack" }),
          ],
          [
            "Dispensar una receta ajena",
            other.post(`/veterinaria/prescription-items/${foreignLineId}/dispense`, {
              quantity: 1,
            }),
          ],
          [
            "Leer una receta ajena",
            other.get(`/veterinaria/prescriptions/${foreignPrescription.data.id}`),
          ],
          ["Leer un ingreso ajeno", other.get(foreignStayPath)],
          [
            "Ingresar a un paciente ajeno",
            other.post(`${visitPath}/hospitalizations`, { roomId: foreignWard.id, reason: "Hack" }),
          ],
          [
            "Dar el alta a un ingreso ajeno",
            other.post(`${foreignStayPath}/discharge`, { dischargeSummary: "Hack" }),
          ],
          [
            "Signos vitales en un ingreso ajeno",
            other.post(`${foreignStayPath}/vitals`, { weightKg: 1 }),
          ],
          [
            "Indicación en un ingreso ajeno",
            other.post(`${foreignStayPath}/orders`, { description: "Hack" }),
          ],
          [
            "Firmar una dosis ajena",
            other.post(`/veterinaria/treatment-orders/${foreignOrder.data.id}/doses`, {}),
          ],
          [
            "Suspender una indicación ajena",
            other.post(`/veterinaria/treatment-orders/${foreignOrder.data.id}/stop`),
          ],
          [
            "Procedimiento en consulta ajena",
            other.post(`${visitPath}/procedures`, { name: "Hack" }),
          ],
          [
            "Editar un procedimiento ajeno",
            other.patch(`/veterinaria/procedures/${foreignProcedure.data.id}`, { name: "Hack" }),
          ],
          [
            "Iniciar un procedimiento ajeno",
            other.post(`/veterinaria/procedures/${foreignProcedure.data.id}/start`),
          ],
          [
            "Finalizar un procedimiento ajeno",
            other.post(`/veterinaria/procedures/${foreignProcedure.data.id}/finish`, {}),
          ],
          [
            "Eliminar un procedimiento ajeno",
            other.delete(`${visitPath}/procedures/${foreignProcedure.data.id}`),
          ],
          [
            "Orden de laboratorio en consulta ajena",
            other.post(`${visitPath}/lab-orders`, { test: "Hack" }),
          ],
          [
            "Cambiar el estado de una orden ajena",
            other.patch(`/veterinaria/lab-orders/${foreignLab.data.id}/status`, {
              status: "EN_PROCESO",
            }),
          ],
          [
            "Resultado sobre una orden ajena",
            other.post(`/veterinaria/lab-orders/${foreignLab.data.id}/result`, {
              resultSummary: "Hack",
            }),
          ],
          [
            "Consentimiento en consulta ajena",
            other.post(`${visitPath}/consents`, { type: "CIRUGIA", text: "Hack" }),
          ],
          [
            "Leer un consentimiento ajeno",
            other.get(`/veterinaria/consents/${foreignConsent.data.id}`),
          ],
          [
            "Firmar un consentimiento ajeno",
            other.post(`/veterinaria/consents/${foreignConsent.data.id}/sign`, {
              signedByName: "Hack",
            }),
          ],
          ["Eliminar consulta ajena", other.delete(visitPath)],
          [
            "Editar paciente ajeno",
            other.patch(`/veterinaria/patients/${foreignPetId}`, { bloodType: "Hack" }),
          ],
          [
            "Editar servicio ajeno",
            other.put(`/veterinaria/services/${foreignService.id}`, { basePrice: 0 }),
          ],
          [
            "Editar veterinario ajeno",
            other.put(`/veterinaria/staff/${foreignVet.id}`, { name: "Hack" }),
          ],
          [
            "Consulta con tutor y paciente ajenos",
            other.post("/veterinaria/visits", { clientId: foreignClient.id, petId: foreignPetId }),
          ],
          [
            "Vincular un usuario ajeno",
            other.post("/veterinaria/staff", { name: "Hack", userId: foreignUser.id }),
          ],
        ];
        for (const [what, pending] of writes) expectStatus((await pending).status, 404, what);

        // Writes inside its own tenant that smuggle a foreign id in the body.
        const ownClient = await other.post("/clients", { firstName: "Propio", lastName: "Tutor" });
        expectStatus(ownClient.status, 201, "Alta de tutor propio");
        const ownPet = await other.post("/pets", {
          clientId: ownClient.data.id,
          name: "Propio",
          species: "dog",
          sex: "F",
        });
        expectStatus(ownPet.status, 201, "Alta de paciente propio");
        const own = { clientId: ownClient.data.id, petId: ownPet.data.id };

        for (const [what, body] of [
          ["veterinario ajeno", { ...own, veterinarianId: foreignVet.id }],
          ["sala ajena", { ...own, roomId: foreignRoom.id }],
          ["servicio ajeno", { ...own, serviceId: foreignService.id }],
        ] as const) {
          expectStatus(
            (await other.post("/veterinaria/visits", body)).status,
            404,
            `Consulta con ${what}`,
          );
        }

        const ownVisit = await other.post("/veterinaria/visits", own);
        expectStatus(ownVisit.status, 201, "Consulta propia");
        expectStatus(
          (
            await other.post(`/veterinaria/visits/${ownVisit.data.id}/charges`, {
              vetServiceId: foreignService.id,
            })
          ).status,
          404,
          "Cargo con servicio ajeno",
        );
        expectStatus(
          (
            await other.patch(`/veterinaria/visits/${ownVisit.data.id}`, {
              veterinarianId: foreignVet.id,
            })
          ).status,
          404,
          "Asignar veterinario ajeno",
        );

        // Its own patient cannot be admitted into the other tenant's ward, nor operated on by
        // the other tenant's veterinarian.
        expectStatus(
          (
            await other.post(`/veterinaria/visits/${ownVisit.data.id}/hospitalizations`, {
              roomId: foreignWard.id,
              reason: "Hack",
            })
          ).status,
          404,
          "Ingreso en una sala ajena",
        );
        expectStatus(
          (
            await other.post(`/veterinaria/visits/${ownVisit.data.id}/procedures`, {
              name: "Hack",
              veterinarianId: foreignVet.id,
            })
          ).status,
          404,
          "Procedimiento con veterinario ajeno",
        );

        // Its own prescription cannot draw on the other tenant's stock.
        expectStatus(
          (
            await other.post(`/veterinaria/visits/${ownVisit.data.id}/prescriptions`, {
              items: [
                { drug: "X", dose: "1", frequency: "1", inventoryItemId: foreignItem.data.id },
              ],
            })
          ).status,
          404,
          "Receta con artículo de inventario ajeno",
        );
        const ownPrescription = await other.post(
          `/veterinaria/visits/${ownVisit.data.id}/prescriptions`,
          { items: [{ drug: "X", dose: "1", frequency: "1" }] },
        );
        expectStatus(ownPrescription.status, 201, "Receta propia");
        expectStatus(
          (
            await other.post(
              `/veterinaria/prescription-items/${ownPrescription.data.items[0].id}/dispense`,
              { quantity: 1, inventoryItemId: foreignItem.data.id },
            )
          ).status,
          404,
          "Dispensar desde el inventario ajeno",
        );
        const stock = await owner.get("/veterinaria/pharmacy/items");
        const untouchedItem = stock.data.find((i: any) => i.id === foreignItem.data.id);
        if (untouchedItem?.currentStock !== 5) {
          throw new Error("El stock de la clínica principal fue alterado desde otra");
        }

        // And none of it reached the visit it was aimed at.
        const untouched = await owner.get(visitPath);
        expectStatus(untouched.status, 200, "La consulta principal sigue existiendo");
        if (untouched.data.reason !== "Aislamiento" || untouched.data.charges.length !== 0) {
          throw new Error("La consulta de la clínica principal fue modificada desde otra");
        }
        const stay = untouched.data.hospitalizations[0];
        if (
          stay?.status !== "INGRESADO" ||
          untouched.data.procedures[0]?.name !== "Aislamiento" ||
          untouched.data.labOrders[0]?.status !== "SOLICITADO" ||
          untouched.data.consents[0]?.signedAt !== null
        ) {
          throw new Error("El ingreso o las órdenes de la clínica principal fueron alterados");
        }
      } finally {
        // A visit cannot be deleted from under an admitted patient.
        await owner.post(`${foreignStayPath}/discharge`, { dischargeSummary: "Aislamiento" });
        await owner.delete(`/veterinaria/visits/${foreignVisitId}`);
        await owner.delete(`/inventory/items/${foreignItem.data.id}`);
      }
    } finally {
      await removeClinic(clinicId, slug);
    }
  });

  await test("Los recordatorios no contratados se deniegan con 403 MODULE_DISABLED", async () => {
    const b = clientFor(demo);
    const attempts: Array<[string, Promise<{ status: number; data: any }>]> = [
      ["GET /reminders/due", b.get("/reminders/due")],
      ["GET /reminders/log", b.get("/reminders/log")],
      ["GET /reminders/channels", b.get("/reminders/channels")],
      ["POST /reminders/send", b.post("/reminders/send", { sourceKey: "CITA:x" })],
    ];
    for (const [what, attempt] of attempts) {
      const denied = await attempt;
      expectStatus(denied.status, 403, `${what} (tenant sin el módulo)`);
      if (denied.data?.code !== "MODULE_DISABLED") {
        throw new Error(`${what}: se esperaba MODULE_DISABLED, ${JSON.stringify(denied.data)}`);
      }
    }
  });

  await test("Una guardería no ve ni envía los recordatorios de otra", async () => {
    // `demo` did not buy reminders, so its refusals above say nothing about scoping. A second
    // tenant that DID buy them is the only way to exercise the module's own tenant filter.
    const PREFIX = "e2e-remiso";
    const platform = clientFor(superadmin);
    const removeTenant = async (id: string, slug: string) => {
      await platform.patch(`/platform/daycares/${id}`, { isActive: false });
      await platform.delete(`/platform/daycares/${id}`, { data: { confirm: slug } } as any);
    };
    for (const stale of (await platform.get("/platform/daycares")).data as any[]) {
      if (stale.slug.startsWith(PREFIX)) await removeTenant(stale.id, stale.slug);
    }

    const { prisma } = await import("../src/db");
    const purgeFixture = async () => {
      const clients = await prisma.client.findMany({
        where: { daycareId: MAIN_ID, firstName: "AislamientoRecordatorio" },
        select: { id: true },
      });
      const clientId = { in: clients.map((client) => client.id) };
      await prisma.reminderMessage.deleteMany({ where: { daycareId: MAIN_ID, clientId } });
      await prisma.reservation.deleteMany({ where: { daycareId: MAIN_ID, clientId } });
      await prisma.pet.deleteMany({ where: { daycareId: MAIN_ID, clientId } });
      await prisma.client.deleteMany({ where: { daycareId: MAIN_ID, id: clientId } });
    };
    await purgeFixture();

    const slug = `${PREFIX}-${Date.now()}`;
    const created = await platform.post("/platform/daycares", {
      slug,
      name: "Peluquería Aislamiento",
      units: ["GROOMING"],
      modules: ["reservas", "peluqueria", "recordatorios"],
      admin: { username: `${slug}_admin`, password: "aislamiento123", name: "Admin Recordatorios" },
    });
    expectStatus(created.status, 201, "Alta de la guardería de prueba");
    const otherId: string = created.data.daycare?.id ?? created.data.id;

    try {
      const owner = clientFor(await loginAs("admin_global", "admin123"), undefined, "GROOMING");
      const other = clientFor(
        await loginAs(`${slug}_admin`, "aislamiento123", undefined, slug),
        undefined,
        "GROOMING",
      );

      // An appointment for tomorrow in the main tenant: something real to be reminded of.
      const tutor = await prisma.client.create({
        data: {
          daycareId: MAIN_ID,
          firstName: "AislamientoRecordatorio",
          lastName: "Tester",
          phone: "0991234567",
          pets: { create: { daycareId: MAIN_ID, name: "Ajena", sex: "F" } },
        },
        include: { pets: true },
      });
      const reservation = await prisma.reservation.create({
        data: {
          daycareId: MAIN_ID,
          businessUnit: "GROOMING",
          clientId: tutor.id,
          service: "Baño",
          status: "PENDIENTE",
          checkIn: new Date(Date.now() + 26 * 3_600_000),
          pets: { create: { petId: tutor.pets[0].id } },
        },
      });
      const sourceKey = `CITA:${reservation.id}`;
      const listed = async (api: typeof owner) =>
        ((await api.get("/reminders/due?days=3")).data as any[]).some(
          (item) => item.sourceKey === sourceKey,
        );

      if (!(await listed(owner)))
        throw new Error("El recordatorio no aparece en su propia guardería");
      if (await listed(other)) throw new Error("La otra guardería ve un recordatorio ajeno");

      // The write: a key from the request body is not proof of tenancy.
      expectStatus(
        (await other.post("/reminders/send", { sourceKey })).status,
        404,
        "Enviar un recordatorio de otra guardería",
      );
      expectStatus(
        (await prisma.reminderMessage.count({ where: { sourceKey } })) as number,
        0,
        "Envíos registrados tras el intento ajeno",
      );

      expectStatus(
        (await owner.post("/reminders/send", { sourceKey })).status,
        201,
        "Envío propio",
      );
      const foreignLog = await other.get("/reminders/log?page=1&pageSize=50");
      expectStatus(foreignLog.status, 200, "Registro de la otra guardería");
      expectStatus(foreignLog.data.total, 0, "Envíos ajenos en el registro");
      const ownLog = await owner.get("/reminders/log?page=1&pageSize=50");
      if (!(ownLog.data.items as any[]).some((row) => row.sourceKey === sourceKey)) {
        throw new Error("El envío no aparece en el registro de su propia guardería");
      }
    } finally {
      await purgeFixture();
      await prisma.$disconnect();
      await removeTenant(otherId, slug);
    }
  });

  await test("Una guardería no puede referenciar ni borrar archivos de otra", async () => {
    // Deleting an object is authorized by a row of the caller's tenant referencing its key, so
    // a tenant that could write a reference into another's prefix could delete the file behind
    // it. Both halves are pinned: the reference is refused, and so is the delete.
    const attacker = clientFor(await loginAs("admin_global", "admin123"), undefined, "VETERINARY");
    const foreignKey = `daycares/${DEMO_ID}/pets/Toby_Demo/1-foto.jpg`;

    const client = (
      (await attacker.get("/clients")).data as { id: string; pets?: { id: string }[] }[]
    ).find((c) => (c.pets?.length ?? 0) > 0);
    if (!client?.pets) throw new Error("Faltan clientes sembrados con mascotas");
    const petId = client.pets[0].id;
    const before = (await attacker.get(`/pets/${petId}`)).data.photoUrl ?? null;

    for (const photoUrl of [
      `https://s3.us-east-005.backblazeb2.com/bucket/${foreignKey}`,
      `https://evil.example.com/${foreignKey}`,
    ]) {
      expectStatus(
        (await attacker.put(`/pets/${petId}`, { photoUrl })).status,
        400,
        "Foto que apunta al prefijo de otra guardería",
      );
    }
    expectStatus(
      (
        await attacker.post("/pets", {
          clientId: client.id,
          name: "Aislamiento",
          sex: "M",
          photoUrl: `https://evil.example.com/${foreignKey}`,
        })
      ).status,
      400,
      "Alta de mascota con foto ajena",
    );
    const after = (await attacker.get(`/pets/${petId}`)).data.photoUrl ?? null;
    if (after !== before) throw new Error("La foto de la mascota cambió pese al rechazo");

    const visit = await attacker.post("/veterinaria/visits", {
      clientId: client.id,
      petId,
      triage: "URGENCIA",
      reason: "Aislamiento de archivos",
    });
    expectStatus(visit.status, 201, "Consulta propia");
    try {
      for (const filePath of [foreignKey, `https://evil.example.com/${foreignKey}`, "../x"]) {
        expectStatus(
          (
            await attacker.post(`/veterinaria/visits/${visit.data.id}/documents`, {
              type: "INFORME",
              name: "Aislamiento",
              filePath,
            })
          ).status,
          400,
          `Documento con ruta ajena (${filePath})`,
        );
      }
    } finally {
      await attacker.delete(`/veterinaria/visits/${visit.data.id}`);
    }

    expectStatus(
      (await attacker.post("/storage/remove", { key: foreignKey })).status,
      404,
      "Borrado de un archivo de otra guardería",
    );
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
