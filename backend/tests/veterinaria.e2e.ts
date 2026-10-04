import axios from "axios";

/**
 * The veterinary clinic: a visit from the waiting room to the till, and who may reach it.
 *
 * Runs against the seeded main tenant, which has the VETERINARY unit, the `veterinaria` module, a
 * `veterinary` login, clinic rooms, a staff veterinarian and a priced catalogue. Cross-tenant
 * behaviour is covered in `tenant-isolation.e2e.ts`.
 */

const BASE_URL = process.env.API_URL || "http://localhost:3001/api/v1";

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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    results.push({ name, passed: false, error: message });
    console.error(`✗ ${name}: ${message}`);
  }
}

async function loginAs(username: string, password: string): Promise<string> {
  const response = await axios.post(`${BASE_URL}/auth/login`, { username, password });
  return response.data.token as string;
}

const clientFor = (token: string, businessUnit?: string) =>
  axios.create({
    baseURL: BASE_URL,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(businessUnit ? { "X-Business-Unit": businessUnit } : {}),
    },
    validateStatus: () => true,
  });

function expectStatus(actual: number, expected: number, what: string) {
  if (actual !== expected) throw new Error(`${what}: esperaba ${expected}, recibió ${actual}`);
}

function expectEqual<T>(actual: T, expected: T, what: string) {
  if (actual !== expected) throw new Error(`${what}: esperaba ${expected}, recibió ${actual}`);
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

async function run() {
  console.log("🩺 Pruebas de la clínica veterinaria\n");

  let vet = clientFor("");
  let admin = clientFor("");
  let grooming = clientFor("");
  let adminToken = "";

  let clientId = "";
  let petId = "";
  let veterinarianId = "";
  let roomId = "";
  let service: { id: string; name: string; basePrice: number } = { id: "", name: "", basePrice: 0 };
  let visitId = "";
  let pharmacyVisitId = "";
  let stockItemId = "";
  let total = 0;
  const cleanupVisitIds: string[] = [];

  await test("Autenticación del rol veterinary, del administrador y de peluquería", async () => {
    vet = clientFor(await loginAs("vet_admin", "vet12345"));
    adminToken = await loginAs("admin_global", "admin123");
    admin = clientFor(adminToken, "VETERINARY");
    grooming = clientFor(await loginAs("pethijos_admin", "pethijos123"));
  });

  await test("La sesión del rol veterinary queda fijada a la unidad Veterinaria", async () => {
    const me = await vet.get("/auth/me");
    expectStatus(me.status, 200, "GET /auth/me");
    expectEqual(me.data.user.role, "veterinary", "rol");
    expectEqual(me.data.user.businessUnit, "VETERINARY", "unidad");
    if (!me.data.enabledModules.includes("veterinaria")) {
      throw new Error("la guardería principal debería tener el módulo veterinaria");
    }
    if (!me.data.units.includes("VETERINARY")) throw new Error("falta la unidad VETERINARY");
  });

  await test("Catálogo, personal y salas de la clínica", async () => {
    const services = await vet.get("/veterinaria/services");
    expectStatus(services.status, 200, "GET services");
    service = services.data.find((s: { basePrice: number }) => s.basePrice > 0);
    if (!service) throw new Error("el catálogo sembrado no tiene servicios con precio");

    const staff = await vet.get("/veterinaria/staff");
    expectStatus(staff.status, 200, "GET staff");
    const internal = staff.data.find((s: { isExternal: boolean }) => !s.isExternal);
    if (!internal) throw new Error("no hay veterinario de planta sembrado");
    veterinarianId = internal.id;

    // The shared rooms module must serve the clinic unit, and only show clinic rooms to it.
    const rooms = await vet.get("/rooms");
    expectStatus(rooms.status, 200, "GET /rooms como veterinary");
    if (rooms.data.some((r: { businessUnit: string }) => r.businessUnit !== "VETERINARY")) {
      throw new Error("el rol veterinary ve salas de otra unidad");
    }
    roomId = rooms.data.find((r: { type: string }) => r.type === "consultorio")?.id;
    if (!roomId) throw new Error("no hay consultorio sembrado");
  });

  await test("Solo un administrador modifica el catálogo y el personal", async () => {
    const body = { name: `Servicio E2E ${Date.now()}`, category: "OTRO", basePrice: 9 };
    expectStatus((await vet.post("/veterinaria/services", body)).status, 403, "alta como vet");
    expectStatus(
      (await vet.post("/veterinaria/staff", { name: "Intruso" })).status,
      403,
      "alta de personal como vet",
    );

    const created = await admin.post("/veterinaria/services", body);
    expectStatus(created.status, 201, "alta como admin");
    const updated = await admin.put(`/veterinaria/services/${created.data.id}`, { basePrice: 11 });
    expectEqual(updated.data.basePrice, 11, "precio actualizado");
    expectStatus(
      (await admin.delete(`/veterinaria/services/${created.data.id}`)).status,
      200,
      "baja como admin",
    );
    const active = await vet.get("/veterinaria/services");
    if (active.data.some((s: { id: string }) => s.id === created.data.id)) {
      throw new Error("un servicio dado de baja sigue en el catálogo activo");
    }
  });

  await test("Preparar tutor y paciente en el núcleo", async () => {
    const client = await vet.post("/clients", {
      firstName: "Clínica",
      lastName: "Tester",
      phone: "0999999999",
      email: `clinica_${Date.now()}@example.com`,
    });
    expectStatus(client.status, 201, "alta de tutor");
    clientId = client.data.id;
    const pet = await vet.post("/pets", {
      clientId,
      name: "Paciente E2E",
      species: "dog",
      sex: "M",
    });
    expectStatus(pet.status, 201, "alta de paciente");
    petId = pet.data.id;
  });

  await test("Una consulta sin hora entra directamente a la sala de espera", async () => {
    const created = await vet.post("/veterinaria/visits", {
      clientId,
      petId,
      veterinarianId,
      serviceId: service.id,
      triage: "URGENCIA",
      reason: "Vómito desde ayer",
    });
    expectStatus(created.status, 201, "alta de consulta");
    visitId = created.data.id;
    expectEqual(created.data.status, "EN_ESPERA", "estado inicial");

    const detail = await vet.get(`/veterinaria/visits/${visitId}`);
    expectStatus(detail.status, 200, "detalle");
    expectEqual(detail.data.reservation.businessUnit, "VETERINARY", "unidad de la reserva");
    expectEqual(detail.data.charges.length, 1, "cargo inicial del servicio");
    expectEqual(detail.data.charges[0].unitPrice, service.basePrice, "precio del catálogo");
  });

  await test("La consulta aparece en la agenda del día y en Operaciones", async () => {
    const today = new Date().toISOString();
    const agenda = await vet.get(`/veterinaria/visits?date=${encodeURIComponent(today)}`);
    expectStatus(agenda.status, 200, "agenda");
    if (!agenda.data.some((v: { id: string }) => v.id === visitId)) {
      throw new Error("la consulta no está en la agenda de hoy");
    }
    const paged = await vet.get(`/veterinaria/visits?petId=${petId}&page=1&pageSize=5`);
    expectEqual(paged.data.total, 1, "total paginado");

    // Visits are reservations, so the shared calendar sees them.
    const reservations = await vet.get("/reservations");
    expectStatus(reservations.status, 200, "GET /reservations como veterinary");
  });

  await test("Registro clínico: estado, signos vitales, diagnóstico y cargos", async () => {
    const path = `/veterinaria/visits/${visitId}`;
    expectStatus(
      (await vet.patch(`${path}/status`, { status: "EN_CONSULTA" })).status,
      200,
      "pasar a consulta",
    );
    expectStatus(
      (await vet.patch(`${path}/status`, { status: "CERRADA" })).status,
      400,
      "cerrar por estado no está permitido",
    );

    const vitals = await vet.post(`${path}/vitals`, {
      weightKg: 12.4,
      temperatureC: 39.1,
      heartRate: 110,
      bodyCondition: 5,
    });
    expectStatus(vitals.status, 201, "signos vitales");
    expectStatus(
      (await vet.post(`${path}/vitals`, { temperatureC: 80 })).status,
      400,
      "temperatura imposible",
    );
    const pet = await vet.get(`/pets/${petId}`);
    expectEqual(pet.data.weight, 12.4, "peso reflejado en la ficha");

    expectStatus(
      (
        await vet.post(`${path}/diagnoses`, {
          description: "Gastroenteritis aguda",
          kind: "PRESUNTIVO",
        })
      ).status,
      201,
      "diagnóstico",
    );
    expectStatus(
      (
        await vet.patch(path, {
          anamnesis: "Come basura en el parque",
          physicalExam: "Abdomen sensible",
          assessment: "Cuadro digestivo leve",
          plan: "Dieta blanda 3 días",
          followUpDate: new Date(Date.now() + 3 * 86_400_000).toISOString(),
        })
      ).status,
      200,
      "SOAP",
    );

    const extra = await vet.post(`${path}/charges`, {
      description: "Antiemético inyectable",
      quantity: 2,
      unitPrice: 6.5,
    });
    expectStatus(extra.status, 201, "cargo manual");
    expectStatus(
      (await vet.post(`${path}/charges`, { quantity: 1 })).status,
      400,
      "cargo sin descripción ni servicio",
    );
    const dropped = await vet.post(`${path}/charges`, { description: "Error", unitPrice: 99 });
    expectStatus(
      (await vet.delete(`${path}/charges/${dropped.data.id}`)).status,
      200,
      "quitar cargo",
    );
  });

  await test("Cerrar la consulta calcula el total y registra el cobro en Veterinaria", async () => {
    const path = `/veterinaria/visits/${visitId}`;
    const before = await vet.get(path);
    const base = service.basePrice + 13;
    const vatPercent: number = before.data.reservation.vatPercent;
    total = Math.round(base * (1 + vatPercent / 100) * 100) / 100;

    expectStatus(
      (await vet.post(`${path}/close`, { amountPaid: total + 1 })).status,
      400,
      "cobrar más que el total",
    );

    const closed = await vet.post(`${path}/close`, { paymentMethod: "TARJETA", amountPaid: 10 });
    expectStatus(closed.status, 200, "cierre");
    expectEqual(closed.data.status, "CERRADA", "estado");
    const reservation = closed.data.reservation;
    expectEqual(reservation.status, "COMPLETADA", "estado de la reserva");
    if (!near(reservation.basePrice, base)) throw new Error(`subtotal ${reservation.basePrice}`);
    if (!near(reservation.totalAmount, total)) throw new Error(`total ${reservation.totalAmount}`);
    if (!near(reservation.pendingAmount, total - 10)) {
      throw new Error(`saldo ${reservation.pendingAmount}`);
    }
    expectEqual(reservation.incomes.length, 1, "un cobro");
    expectEqual(reservation.incomes[0].businessUnit, "VETERINARY", "unidad contable del cobro");
    expectEqual(reservation.incomes[0].type, "VETERINARIA", "tipo de cobro");
  });

  await test("Una consulta cerrada queda congelada y no se cobra dos veces", async () => {
    const path = `/veterinaria/visits/${visitId}`;
    expectStatus((await vet.post(`${path}/close`, {})).status, 409, "segundo cierre");
    expectStatus((await vet.patch(path, { plan: "Otro" })).status, 409, "editar SOAP");
    expectStatus((await vet.post(`${path}/vitals`, { weightKg: 1 })).status, 409, "vitales");
    expectStatus(
      (await vet.post(`${path}/charges`, { description: "X", unitPrice: 1 })).status,
      409,
      "cargo",
    );
    expectStatus(
      (await vet.patch(`${path}/status`, { status: "EN_ESPERA" })).status,
      409,
      "reabrir",
    );
    expectStatus((await vet.delete(path)).status, 409, "eliminar");
  });

  await test("El saldo pendiente se abona hasta quedar en cero, y no más", async () => {
    const path = `/veterinaria/visits/${visitId}/payments`;
    expectStatus((await vet.post(path, { amount: total })).status, 400, "abono mayor al saldo");
    const paid = await vet.post(path, { amount: Math.round((total - 10) * 100) / 100 });
    expectStatus(paid.status, 201, "abono");
    if (!near(paid.data.reservation.pendingAmount, 0)) {
      throw new Error(`saldo tras el abono: ${paid.data.reservation.pendingAmount}`);
    }
    expectEqual(paid.data.reservation.incomes.length, 2, "dos cobros");
    const collected = paid.data.reservation.incomes.reduce(
      (sum: number, income: { total: number }) => sum + income.total,
      0,
    );
    if (!near(collected, total)) throw new Error(`cobrado ${collected}, total ${total}`);
    expectStatus((await vet.post(path, { amount: 1 })).status, 400, "abono sin saldo");
  });

  await test("La historia clínica reúne consultas, diagnósticos y signos vitales", async () => {
    const history = await vet.get(`/veterinaria/patients/${petId}/history`);
    expectStatus(history.status, 200, "historia");
    expectEqual(history.data.visits.length, 1, "consultas");
    expectEqual(history.data.visits[0].diagnoses.length, 1, "diagnósticos");
    expectEqual(history.data.vitals.length, 1, "tomas de signos vitales");

    const patient = await vet.patch(`/veterinaria/patients/${petId}`, {
      bloodType: "DEA 1.1+",
      chronicConditions: "Dermatitis atópica",
    });
    expectStatus(patient.status, 200, "datos clínicos del paciente");
    expectEqual(patient.data.bloodType, "DEA 1.1+", "grupo sanguíneo");
  });

  await test("Vacunas y preventivos quedan en la historia con lote y próxima dosis", async () => {
    const visit = await vet.post("/veterinaria/visits", { clientId, petId, triage: "URGENCIA" });
    expectStatus(visit.status, 201, "consulta de farmacia");
    pharmacyVisitId = visit.data.id;
    cleanupVisitIds.push(pharmacyVisitId);
    const path = `/veterinaria/visits/${pharmacyVisitId}`;
    const nextYear = new Date(Date.now() + 365 * 86_400_000).toISOString();

    const vaccine = await vet.post(`${path}/vaccinations`, {
      name: "Antirrábica",
      lotNumber: "RAB-2291",
      manufacturer: "Zoovet",
      nextDue: nextYear,
    });
    expectStatus(vaccine.status, 201, "vacuna");
    expectEqual(vaccine.data.lotNumber, "RAB-2291", "lote de la vacuna");
    expectStatus((await vet.post(`${path}/vaccinations`, {})).status, 400, "vacuna sin nombre");

    expectStatus(
      (
        await vet.post(`${path}/preventives`, {
          kind: "DESPARASITACION_INTERNA",
          product: "Praziquantel",
          weightKg: 12.4,
          nextDue: nextYear,
        })
      ).status,
      201,
      "desparasitación en consulta",
    );
    const external = await vet.post(`/veterinaria/patients/${petId}/preventives`, {
      kind: "DESPARASITACION_EXTERNA",
      product: "Pipeta",
    });
    expectStatus(external.status, 201, "preventivo sin consulta");

    const history = await vet.get(`/veterinaria/patients/${petId}/history`);
    expectEqual(history.data.preventives.length, 2, "preventivos en la historia");
    const recorded = history.data.pet.vaccinations.find(
      (v: { lotNumber?: string }) => v.lotNumber === "RAB-2291",
    );
    if (!recorded?.vetVisitId) throw new Error("la vacuna no quedó ligada a su consulta");

    expectStatus(
      (await vet.delete(`/veterinaria/patients/${petId}/preventives/${external.data.id}`)).status,
      200,
      "quitar preventivo",
    );
  });

  await test("Una receta se dispensa una sola vez, descuenta stock y puede cobrarse", async () => {
    const path = `/veterinaria/visits/${pharmacyVisitId}`;
    const item = await vet.post("/inventory/items", {
      name: `Tramadol E2E ${Date.now()}`,
      category: "Medicamentos",
      unit: "tableta",
      currentStock: 5,
      isControlled: true,
    });
    expectStatus(item.status, 201, "alta de artículo");
    stockItemId = item.data.id;
    expectEqual(item.data.businessUnit, "VETERINARY", "unidad del artículo");

    const entry = await vet.post(`/inventory/items/${stockItemId}/movements`, {
      type: "ENTRADA",
      quantity: 3,
      lotNumber: "TR-77",
      expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
    expectStatus(entry.status, 201, "entrada con lote y caducidad");

    expectStatus(
      (await vet.post(`${path}/prescriptions`, { items: [] })).status,
      400,
      "receta vacía",
    );
    const prescription = await vet.post(`${path}/prescriptions`, {
      notes: "Dar con comida",
      items: [
        {
          drug: "Tramadol 50 mg",
          dose: "1 tableta",
          frequency: "cada 12 horas",
          durationDays: 5,
          inventoryItemId: stockItemId,
        },
        { drug: "Omeprazol 10 mg", dose: "1 cápsula", frequency: "cada 24 horas" },
      ],
    });
    expectStatus(prescription.status, 201, "receta");
    const [stocked, external] = prescription.data.items;

    const queue = await vet.get("/veterinaria/pharmacy/queue");
    expectStatus(queue.status, 200, "cola de farmacia");
    if (!queue.data.some((line: { id: string }) => line.id === stocked.id)) {
      throw new Error("la receta no está en la cola de farmacia");
    }

    const dispensePath = (id: string) => `/veterinaria/prescription-items/${id}/dispense`;
    expectStatus(
      (await vet.post(dispensePath(external.id), { quantity: 1 })).status,
      400,
      "dispensar sin artículo de inventario",
    );
    expectStatus(
      (await vet.post(dispensePath(stocked.id), { quantity: 100 })).status,
      409,
      "dispensar más que el stock",
    );
    const dispensed = await vet.post(dispensePath(stocked.id), {
      quantity: 2,
      lotNumber: "TR-77",
      unitPrice: 4,
    });
    expectStatus(dispensed.status, 200, "dispensación");
    expectEqual(dispensed.data.quantityDispensed, 2, "cantidad dispensada");
    expectStatus(
      (await vet.post(dispensePath(stocked.id), { quantity: 1 })).status,
      409,
      "segunda dispensación",
    );

    const stock = await vet.get("/veterinaria/pharmacy/items");
    const after = stock.data.find((i: { id: string }) => i.id === stockItemId);
    // 5 inicial + 3 de la entrada - 2 dispensadas; el intento rechazado no descontó nada.
    expectEqual(after?.currentStock, 6, "stock tras dispensar");

    const visit = await vet.get(path);
    const billed = visit.data.charges.find(
      (c: { inventoryItemId?: string }) => c.inventoryItemId === stockItemId,
    );
    if (!billed || billed.quantity !== 2 || billed.unitPrice !== 4) {
      throw new Error("la dispensación no generó su cargo en la consulta");
    }

    expectStatus(
      (await vet.delete(`${path}/prescriptions/${prescription.data.id}`)).status,
      409,
      "eliminar una receta ya dispensada",
    );

    const printable = await vet.get(`/veterinaria/prescriptions/${prescription.data.id}`);
    expectStatus(printable.status, 200, "receta imprimible");
    expectEqual(printable.data.pet.client.lastName, "Tester", "tutor en la receta");

    const log = await vet.get("/veterinaria/pharmacy/controlled-log");
    const entryInLog = log.data.find((line: { id: string }) => line.id === stocked.id);
    if (!entryInLog || entryInLog.lotNumber !== "TR-77") {
      throw new Error("la dispensación de un controlado no figura en el libro");
    }
    const expiring = await vet.get("/veterinaria/pharmacy/expiring");
    if (!expiring.data.some((lot: { lotNumber: string }) => lot.lotNumber === "TR-77")) {
      throw new Error("el lote por caducar no aparece");
    }
  });

  await test("Un veterinario o una sala no se reservan dos veces, salvo una urgencia", async () => {
    // Far enough ahead, and offset per run, that it cannot collide with other data.
    const start = new Date(Date.now() + (40 + Math.floor(Math.random() * 300)) * 86_400_000);
    start.setHours(10, 0, 0, 0);
    const base = { clientId, petId, startTime: start.toISOString(), durationMinutes: 30 };

    const first = await vet.post("/veterinaria/visits", { ...base, veterinarianId, roomId });
    expectStatus(first.status, 201, "primera cita");
    cleanupVisitIds.push(first.data.id);
    expectEqual(first.data.status, "PROGRAMADA", "una cita con hora queda programada");

    expectStatus(
      (await vet.post("/veterinaria/visits", { ...base, veterinarianId })).status,
      409,
      "veterinario ocupado",
    );
    expectStatus(
      (await vet.post("/veterinaria/visits", { ...base, roomId })).status,
      409,
      "sala ocupada",
    );

    const urgent = await vet.post("/veterinaria/visits", {
      ...base,
      veterinarianId,
      triage: "URGENCIA",
    });
    expectStatus(urgent.status, 201, "una urgencia se atiende igual");
    cleanupVisitIds.push(urgent.data.id);

    // Cancelling releases the slot.
    for (const id of cleanupVisitIds) {
      await vet.patch(`/veterinaria/visits/${id}/status`, { status: "CANCELADA" });
    }
    const again = await vet.post("/veterinaria/visits", { ...base, veterinarianId, roomId });
    expectStatus(again.status, 201, "el hueco cancelado vuelve a estar libre");
    cleanupVisitIds.push(again.data.id);
  });

  await test("Los demás roles y unidades no alcanzan la clínica", async () => {
    const denied = await grooming.get("/veterinaria/visits");
    expectStatus(denied.status, 403, "rol grooming");
    if (denied.data?.code === "MODULE_DISABLED") {
      throw new Error("un rechazo por rol no debe presentarse como módulo deshabilitado");
    }
    expectStatus(
      (await grooming.get(`/veterinaria/patients/${petId}/history`)).status,
      403,
      "historia clínica como grooming",
    );

    const wrongUnit = await clientFor(adminToken, "GROOMING").get("/veterinaria/visits");
    expectStatus(wrongUnit.status, 403, "admin acotado a Peluquería");
    expectEqual(wrongUnit.data?.code, "WRONG_BUSINESS_UNIT", "código");

    // And the reverse: the clinic role does not reach the other units' modules.
    expectStatus((await vet.get("/peluqueria/appointments")).status, 403, "vet en peluquería");
    expectStatus((await vet.get("/guarderia/occupancy")).status, 403, "vet en guardería");
    expectStatus((await vet.get("/recurring-plans")).status, 403, "vet en planes recurrentes");
  });

  // Unclosed visits are removed. The closed one stays: it is clinical history, and the API
  // refuses to delete it by design.
  for (const id of cleanupVisitIds) await vet.delete(`/veterinaria/visits/${id}`);
  if (stockItemId) await vet.delete(`/inventory/items/${stockItemId}`);

  const passed = results.filter((r) => r.passed).length;
  console.log("\n" + "=".repeat(60));
  console.log("📊 Resumen de la clínica veterinaria:");
  console.log(`   Pasadas: ${passed}/${results.length}`);
  console.log(`   Fallidas: ${results.length - passed}/${results.length}`);
  console.log("=".repeat(60));
  if (passed !== results.length) process.exit(1);
}

run();
