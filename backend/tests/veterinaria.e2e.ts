import axios from "axios";

import { prisma } from "../src/db";

/**
 * The veterinary clinic: a visit from the waiting room to the till, and who may reach it.
 *
 * Runs against the seeded main tenant, which has the VETERINARY unit, the `veterinaria` module, a
 * `veterinary` login, clinic rooms, a staff veterinarian and a priced catalogue. Cross-tenant
 * behaviour is covered in `tenant-isolation.e2e.ts`.
 */

const BASE_URL = process.env.API_URL || "http://localhost:3001/api/v1";
const DAYCARE_ID = "daycare_pethijos";

/**
 * Removes what this suite writes into the seeded tenant.
 *
 * Straight to the database, because the API refuses by design: a closed visit is clinical
 * history, a signed consent stays, and catalogue and stock rows are only ever deactivated.
 * Matched by the names this suite uses rather than by this run's ids, so a run that died
 * half-way is cleaned up by the next one.
 */
async function purgeSuiteData(): Promise<void> {
  const clients = await prisma.client.findMany({
    where: {
      daycareId: DAYCARE_ID,
      firstName: "Clínica",
      lastName: "Tester",
      email: { startsWith: "clinica_", endsWith: "@example.com" },
    },
    select: { id: true, pets: { select: { id: true } } },
  });
  const clientId = { in: clients.map((client) => client.id) };
  const petId = { in: clients.flatMap((client) => client.pets.map((pet) => pet.id)) };

  await prisma.$transaction([
    prisma.income.deleteMany({ where: { daycareId: DAYCARE_ID, reservation: { clientId } } }),
    prisma.vetConsent.deleteMany({ where: { daycareId: DAYCARE_ID, clientId } }),
    // Takes each visit with it, and through the visit everything recorded during it.
    prisma.reservation.deleteMany({ where: { daycareId: DAYCARE_ID, clientId } }),
    // Recorded against the patient outside a visit.
    prisma.vetPreventive.deleteMany({ where: { daycareId: DAYCARE_ID, petId } }),
    prisma.vetVitals.deleteMany({ where: { daycareId: DAYCARE_ID, petId } }),
    prisma.pet.deleteMany({ where: { daycareId: DAYCARE_ID, id: petId } }),
    prisma.client.deleteMany({ where: { daycareId: DAYCARE_ID, id: clientId } }),
    prisma.inventoryItem.deleteMany({
      where: { daycareId: DAYCARE_ID, name: { startsWith: "Tramadol E2E " } },
    }),
    prisma.vetService.deleteMany({
      where: { daycareId: DAYCARE_ID, name: { startsWith: "Servicio E2E " } },
    }),
  ]);
}

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

  await test("Hospitalización: ingreso, hoja de tratamiento, alta y cobro de la estancia", async () => {
    const wards = await vet.get("/veterinaria/hospitalizations/wards");
    expectStatus(wards.status, 200, "salas de hospitalización");
    const ward = wards.data[0];
    if (!ward) throw new Error("no hay sala de hospitalización sembrada");

    const visit = await vet.post("/veterinaria/visits", {
      clientId,
      petId,
      type: "HOSPITALIZACION",
      triage: "URGENCIA",
      reason: "Deshidratación",
    });
    expectStatus(visit.status, 201, "consulta de ingreso");
    const path = `/veterinaria/visits/${visit.data.id}`;

    expectStatus(
      (await vet.post(`${path}/hospitalizations`, { roomId, reason: "X" })).status,
      400,
      "un consultorio no es sala de hospitalización",
    );
    const admittedAt = new Date(Date.now() - 36 * 3_600_000).toISOString();
    const stay = await vet.post(`${path}/hospitalizations`, {
      roomId: ward.id,
      reason: "Fluidoterapia y observación",
      dailyRate: 20,
      admittedAt,
    });
    expectStatus(stay.status, 201, "ingreso");
    expectEqual(stay.data.status, "INGRESADO", "estado del ingreso");
    const stayPath = `/veterinaria/hospitalizations/${stay.data.id}`;

    expectStatus(
      (await vet.post(`${path}/hospitalizations`, { roomId: ward.id, reason: "Otra vez" })).status,
      409,
      "un paciente no se ingresa dos veces",
    );
    const after = (await vet.get("/veterinaria/hospitalizations/wards")).data.find(
      (w: { id: string }) => w.id === ward.id,
    );
    expectEqual(after.occupied, ward.occupied + 1, "ocupación de la sala");

    // The visit carries the stay's bill, so it cannot be closed or cancelled under the patient.
    expectStatus(
      (await vet.post(`${path}/close`, {})).status,
      409,
      "cerrar con paciente ingresado",
    );
    expectStatus(
      (await vet.patch(`${path}/status`, { status: "CANCELADA" })).status,
      409,
      "cancelar con paciente ingresado",
    );

    const startAt = new Date(Date.now() - 3_600_000).toISOString();
    const order = await vet.post(`${stayPath}/orders`, {
      description: "Ringer lactato IV",
      everyHours: 8,
      startAt,
    });
    expectStatus(order.status, 201, "indicación");
    const dosePath = `/veterinaria/treatment-orders/${order.data.id}/doses`;

    const board = await vet.get("/veterinaria/hospitalizations");
    expectStatus(board.status, 200, "tablero de hospitalización");
    const onBoard = board.data.find((h: { id: string }) => h.id === stay.data.id);
    if (!onBoard) throw new Error("el ingreso no aparece en el tablero");
    expectEqual(onBoard.orders[0].nextDueAt, startAt, "la primera dosis vence al inicio");

    const dose = await vet.post(dosePath, {});
    expectStatus(dose.status, 201, "dosis administrada");
    if (!dose.data.administeredAt) throw new Error("la dosis no quedó firmada");
    expectStatus(
      (await vet.post(dosePath, { scheduledAt: startAt })).status,
      409,
      "la misma dosis no se firma dos veces",
    );
    const next = (await vet.get(stayPath)).data.orders[0].nextDueAt;
    expectEqual(
      new Date(next).getTime(),
      new Date(startAt).getTime() + 8 * 3_600_000,
      "la siguiente dosis vence ocho horas después",
    );
    const skipped = await vet.post(dosePath, { skippedReason: "Paciente en ayunas" });
    expectStatus(skipped.status, 201, "dosis omitida");
    expectEqual(skipped.data.administeredAt, null, "una dosis omitida no figura como dada");

    const vitals = await vet.post(`${stayPath}/vitals`, { temperatureC: 38.6 });
    expectStatus(vitals.status, 201, "signos vitales en sala");
    expectEqual(vitals.data.hospitalizationId, stay.data.id, "signos ligados al ingreso");

    expectStatus((await vet.post(`${stayPath}/discharge`, {})).status, 400, "alta sin resumen");
    const discharged = await vet.post(`${stayPath}/discharge`, {
      dischargeSummary: "Evolución favorable",
      homeCareInstructions: "Dieta blanda tres días",
    });
    expectStatus(discharged.status, 200, "alta");
    expectEqual(discharged.data.status, "ALTA", "estado tras el alta");
    expectStatus(
      (await vet.post(`${stayPath}/discharge`, { dischargeSummary: "Otra" })).status,
      409,
      "el alta no se registra dos veces",
    );
    expectStatus((await vet.post(dosePath, {})).status, 409, "dosis tras el alta");

    // 36 hours is two started days.
    const detail = await vet.get(path);
    const charge = detail.data.charges.find((c: { description: string }) =>
      c.description.startsWith("Hospitalización"),
    );
    if (!charge) throw new Error("el alta no generó el cargo de la estancia");
    expectEqual(charge.quantity, 2, "días de estancia");
    expectEqual(charge.unitPrice, 20, "tarifa diaria");

    expectStatus((await vet.post(`${path}/close`, {})).status, 200, "cerrar tras el alta");
  });

  await test("Una cirugía exige consentimiento firmado; el laboratorio registra resultados", async () => {
    const visit = await vet.post("/veterinaria/visits", {
      clientId,
      petId,
      type: "CIRUGIA",
      triage: "URGENCIA",
    });
    expectStatus(visit.status, 201, "consulta quirúrgica");
    cleanupVisitIds.push(visit.data.id);
    const path = `/veterinaria/visits/${visit.data.id}`;

    const procedure = await vet.post(`${path}/procedures`, {
      name: "Ovariohisterectomía",
      kind: "CIRUGIA",
      asaRisk: 2,
    });
    expectStatus(procedure.status, 201, "procedimiento");
    expectEqual(procedure.data.status, "PROGRAMADO", "estado inicial");
    const procedurePath = `/veterinaria/procedures/${procedure.data.id}`;

    expectStatus((await vet.post(`${procedurePath}/start`)).status, 409, "sin consentimiento");
    const consent = await vet.post(`${path}/consents`, {
      type: "CIRUGIA",
      text: "Autorizo la cirugía y la anestesia.",
    });
    expectStatus(consent.status, 201, "consentimiento");
    expectEqual(consent.data.signedAt, null, "queda pendiente de firma");
    expectStatus(
      (await vet.post(`${procedurePath}/start`)).status,
      409,
      "consentimiento sin firmar",
    );

    const consentPath = `/veterinaria/consents/${consent.data.id}`;
    expectStatus(
      (await vet.post(`${consentPath}/sign`, { signedByName: "Clínica Tester" })).status,
      200,
      "firma",
    );
    expectStatus(
      (await vet.post(`${consentPath}/sign`, { signedByName: "Otro" })).status,
      404,
      "un consentimiento no se firma dos veces",
    );
    expectStatus(
      (await vet.delete(`${path}/consents/${consent.data.id}`)).status,
      404,
      "un consentimiento firmado no se elimina",
    );
    expectEqual((await vet.get(consentPath)).data.pet.id, petId, "consentimiento imprimible");

    const started = await vet.post(`${procedurePath}/start`);
    expectStatus(started.status, 200, "inicio");
    expectEqual(started.data.status, "EN_CURSO", "estado en curso");
    expectStatus((await vet.post(`${procedurePath}/start`)).status, 409, "iniciar dos veces");
    expectStatus((await vet.post(`${path}/close`, {})).status, 409, "cerrar a media cirugía");

    const finished = await vet.post(`${procedurePath}/finish`, { findings: "Sin hallazgos" });
    expectStatus(finished.status, 200, "fin");
    expectEqual(finished.data.status, "FINALIZADO", "estado final");
    expectStatus(
      (await vet.delete(`${path}/procedures/${procedure.data.id}`)).status,
      404,
      "un procedimiento realizado no se elimina",
    );

    const lab = await vet.post(`${path}/lab-orders`, { kind: "LABORATORIO", test: "Hemograma" });
    expectStatus(lab.status, 201, "orden de laboratorio");
    const labPath = `/veterinaria/lab-orders/${lab.data.id}`;
    const pendingQuery = `/veterinaria/lab-orders?status=PENDIENTE&petId=${petId}`;
    if (!(await vet.get(pendingQuery)).data.some((o: { id: string }) => o.id === lab.data.id)) {
      throw new Error("la orden no aparece como pendiente");
    }
    expectStatus((await vet.post(`${labPath}/result`, {})).status, 400, "resultado vacío");
    const result = await vet.post(`${labPath}/result`, {
      resultSummary: "Leve anemia",
      values: [
        { analyte: "Hematocrito", value: "32", unit: "%", referenceRange: "37-55", flag: "BAJO" },
        { analyte: "Leucocitos", value: "9.1", unit: "x10³/µL" },
      ],
    });
    expectStatus(result.status, 200, "resultado");
    expectEqual(result.data.status, "RESULTADO", "estado con resultado");
    expectEqual(result.data.values.length, 2, "valores registrados");
    expectStatus(
      (await vet.patch(`${labPath}/status`, { status: "EN_PROCESO" })).status,
      404,
      "una orden con resultado no vuelve atrás",
    );
    if ((await vet.get(pendingQuery)).data.some((o: { id: string }) => o.id === lab.data.id)) {
      throw new Error("la orden con resultado sigue como pendiente");
    }

    const history = await vet.get(`/veterinaria/patients/${petId}/history`);
    for (const key of ["hospitalizations", "procedures", "labOrders", "consents"]) {
      if (!history.data[key]?.length) throw new Error(`la historia clínica no incluye ${key}`);
    }
  });

  await test("Una eutanasia registra el fallecimiento y el paciente ya no admite reservas", async () => {
    const pet = await vet.post("/pets", {
      clientId,
      name: "Paciente Final E2E",
      species: "dog",
      sex: "F",
    });
    expectStatus(pet.status, 201, "alta de paciente");
    const visit = await vet.post("/veterinaria/visits", {
      clientId,
      petId: pet.data.id,
      triage: "URGENCIA",
    });
    expectStatus(visit.status, 201, "consulta");
    cleanupVisitIds.push(visit.data.id);
    const path = `/veterinaria/visits/${visit.data.id}`;

    const procedure = await vet.post(`${path}/procedures`, {
      name: "Eutanasia",
      kind: "EUTANASIA",
    });
    expectStatus(procedure.status, 201, "procedimiento");
    const procedurePath = `/veterinaria/procedures/${procedure.data.id}`;
    // A surgery consent does not authorise a euthanasia.
    await vet.post(`${path}/consents`, { type: "CIRUGIA", text: "X", signedByName: "Tutor" });
    expectStatus(
      (await vet.post(`${procedurePath}/start`)).status,
      409,
      "consentimiento de otro tipo",
    );
    const consent = await vet.post(`${path}/consents`, {
      type: "EUTANASIA",
      text: "Autorizo la eutanasia humanitaria.",
      signedByName: "Clínica Tester",
    });
    expectStatus(consent.status, 201, "consentimiento firmado al crearlo");
    if (!consent.data.signedAt) throw new Error("el consentimiento no quedó firmado");

    expectStatus((await vet.post(`${procedurePath}/start`)).status, 200, "inicio");
    expectStatus((await vet.post(`${procedurePath}/finish`, {})).status, 200, "fin");

    const history = await vet.get(`/veterinaria/patients/${pet.data.id}/history`);
    if (!history.data.pet.deceasedAt) throw new Error("no se registró el fallecimiento");
    expectEqual(history.data.pet.deathCause, "Eutanasia", "causa");

    expectStatus(
      (await vet.post("/veterinaria/visits", { clientId, petId: pet.data.id })).status,
      409,
      "nueva consulta de un paciente fallecido",
    );
    const start = new Date(Date.now() + 5 * 86_400_000);
    expectStatus(
      (
        await vet.post("/reservations", {
          clientId,
          petIds: [pet.data.id],
          service: "Consulta",
          checkIn: start.toISOString(),
          checkOut: new Date(start.getTime() + 1_800_000).toISOString(),
        })
      ).status,
      409,
      "reserva de un paciente fallecido",
    );

    // The same refusal on the two ways around a new booking: editing an existing one to bring
    // the patient in, and an ad-hoc check-in.
    const living = await vet.post("/veterinaria/visits", { clientId, petId, triage: "URGENCIA" });
    expectStatus(living.status, 201, "consulta de un paciente vivo");
    cleanupVisitIds.push(living.data.id);
    const reservationId: string = living.data.reservation.id;
    expectStatus(
      (await vet.put(`/reservations/${reservationId}`, { petIds: [pet.data.id] })).status,
      409,
      "cambiar las mascotas de una reserva a un paciente fallecido",
    );
    expectStatus(
      (await vet.put(`/reservations/${reservationId}`, { clientId, petIds: [pet.data.id] })).status,
      409,
      "cambiar tutor y mascotas de una reserva a un paciente fallecido",
    );
    expectStatus(
      (await vet.post("/check-in-out", { clientId, petIds: [pet.data.id], roomId })).status,
      409,
      "check-in de un paciente fallecido",
    );
  });

  await test("Los recordatorios se calculan de vacunas, controles y exámenes pendientes", async () => {
    const visit = await vet.post("/veterinaria/visits", { clientId, petId, triage: "URGENCIA" });
    expectStatus(visit.status, 201, "consulta");
    cleanupVisitIds.push(visit.data.id);
    const path = `/veterinaria/visits/${visit.data.id}`;
    const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
    const vaccine = `Rabia E2E ${Date.now()}`;
    const mine = async (kind: string) =>
      ((await vet.get(`/veterinaria/reminders?kind=${kind}&days=30`)).data as any[]).filter(
        (r) => r.pet.id === petId,
      );

    expectStatus((await vet.get("/veterinaria/reminders?kind=HACK")).status, 400, "tipo inválido");

    const first = await vet.post(`${path}/vaccinations`, { name: vaccine, nextDue: inDays(10) });
    expectStatus(first.status, 201, "vacuna con refuerzo próximo");
    const due = (await mine("VACUNA")).find((r) => r.label.includes(vaccine));
    if (!due) throw new Error("el refuerzo próximo no aparece como recordatorio");
    expectEqual(due.overdue, false, "un refuerzo futuro no está vencido");
    expectEqual(due.client.id, clientId, "tutor del recordatorio");

    // A newer dose of the same vaccine settles the older reminder.
    await vet.post(`${path}/vaccinations`, {
      name: vaccine,
      date: inDays(0),
      nextDue: inDays(400),
    });
    if ((await mine("VACUNA")).some((r) => r.label.includes(vaccine))) {
      throw new Error("una dosis posterior no retiró el recordatorio anterior");
    }

    expectStatus(
      (await vet.patch(path, { followUpDate: inDays(-2) })).status,
      200,
      "control ya vencido",
    );
    const followUp = (await mine("CONTROL")).find((r) => r.visitId === visit.data.id);
    if (!followUp) throw new Error("el control pendiente no aparece");
    expectEqual(followUp.overdue, true, "un control pasado está vencido");

    const lab = await vet.post(`${path}/lab-orders`, { test: "Perfil renal" });
    expectStatus(lab.status, 201, "orden de laboratorio");
    if (!(await mine("LABORATORIO")).some((r) => r.id === `LABORATORIO:${lab.data.id}`)) {
      throw new Error("el examen pendiente no aparece");
    }
    await vet.post(`/veterinaria/lab-orders/${lab.data.id}/result`, { resultSummary: "Normal" });
    if ((await mine("LABORATORIO")).some((r) => r.id === `LABORATORIO:${lab.data.id}`)) {
      throw new Error("un examen con resultado sigue como pendiente");
    }
  });

  await test("El informe de la clínica resume el periodo y es solo para administradores", async () => {
    expectStatus((await vet.get("/veterinaria/reports/summary")).status, 403, "rol veterinary");

    const summary = await admin.get("/veterinaria/reports/summary");
    expectStatus(summary.status, 200, "informe como admin");
    const { visits, revenue, topDiagnoses, hospital } = summary.data;
    if (visits.total < 1 || visits.byType.length < 1 || visits.byVeterinarian.length < 1) {
      throw new Error("el informe no cuenta las consultas del periodo");
    }
    if (!(revenue.collected >= total)) {
      throw new Error(
        `lo cobrado (${revenue.collected}) no incluye la consulta cerrada (${total})`,
      );
    }
    const billed = revenue.byCategory.reduce(
      (sum: number, c: { amount: number }) => sum + c.amount,
      0,
    );
    if (!near(billed, revenue.billed) || revenue.billed <= 0) {
      throw new Error("las categorías no suman lo facturado");
    }
    if (topDiagnoses.length < 1) throw new Error("faltan los diagnósticos más frecuentes");
    if (hospital.discharges < 1 || hospital.wards.length < 1) {
      throw new Error("faltan las cifras de hospitalización");
    }

    expectStatus(
      (await admin.get("/veterinaria/reports/summary?from=2030-01-01&to=2029-01-01")).status,
      400,
      "rango invertido",
    );
    const empty = await admin.get(
      "/veterinaria/reports/summary?from=2001-01-01T00:00:00Z&to=2001-01-31T00:00:00Z",
    );
    expectEqual(empty.data.visits.total, 0, "un periodo sin actividad");
    expectEqual(empty.data.revenue.collected, 0, "cobros de un periodo sin actividad");
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

  await test("Dos reservas simultáneas del mismo hueco no pasan las dos", async () => {
    // Sent at once, not one after another: the check and the insert used to be separate
    // statements with nothing held between them, so both requests could find the slot free.
    const start = new Date(Date.now() + (400 + Math.floor(Math.random() * 300)) * 86_400_000);
    start.setHours(11, 0, 0, 0);
    const base = { clientId, petId, startTime: start.toISOString(), durationMinutes: 30 };

    for (const [what, slot] of [
      ["veterinario", { veterinarianId }],
      ["sala", { roomId }],
    ] as const) {
      const responses = await Promise.all(
        Array.from({ length: 5 }, () => vet.post("/veterinaria/visits", { ...base, ...slot })),
      );
      const created = responses.filter((response) => response.status === 201);
      for (const response of created) cleanupVisitIds.push(response.data.id);
      expectEqual(created.length, 1, `reservas aceptadas para el mismo ${what}`);
      expectEqual(
        responses.filter((response) => response.status === 409).length,
        4,
        `reservas rechazadas para el mismo ${what}`,
      );
      // Free the slot for the next round, which reuses the hour.
      await vet.patch(`/veterinaria/visits/${created[0].data.id}/status`, { status: "CANCELADA" });
    }
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

  // Unclosed visits go through the API, which is itself under test. The rest cannot: see
  // purgeSuiteData.
  for (const id of cleanupVisitIds) await vet.delete(`/veterinaria/visits/${id}`);
  if (stockItemId) await vet.delete(`/inventory/items/${stockItemId}`);
  try {
    await purgeSuiteData();
  } catch (error) {
    results.push({ name: "Limpieza", passed: false, error: String(error) });
    console.error("✗ La suite no pudo retirar sus datos de la guardería sembrada:", error);
  } finally {
    await prisma.$disconnect();
  }

  const passed = results.filter((r) => r.passed).length;
  console.log("\n" + "=".repeat(60));
  console.log("📊 Resumen de la clínica veterinaria:");
  console.log(`   Pasadas: ${passed}/${results.length}`);
  console.log(`   Fallidas: ${results.length - passed}/${results.length}`);
  console.log("=".repeat(60));
  if (passed !== results.length) process.exit(1);
}

run();
