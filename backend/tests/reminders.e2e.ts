import axios from "axios";

import { prisma } from "../src/db";
import { localDayBoundsUtc } from "../src/core/tenancy/local-time";
import { runAutomaticReminders } from "../src/modules/recordatorios";

/**
 * Reminders to tutors: what is due, sending one by hand, the tutor's channel, and the scheduled
 * pass that must never send the same thing twice.
 *
 * Runs against the seeded main tenant, which has the `recordatorios` module, on the simulated
 * transport: with no provider configured outside production a "send" is a log line. The suite
 * refuses to run against a backend with a live channel, since it would message real numbers.
 * Cross-tenant behaviour is covered in `tenant-isolation.e2e.ts`.
 */

const BASE_URL = process.env.API_URL || "http://localhost:3001/api/v1";
const DAYCARE_ID = "daycare_principal";
const UNIT = "GROOMING";
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

const startedAt = new Date();

/**
 * Removes what this suite writes into the seeded tenant, matched by the names it uses so a run
 * that died half-way is cleaned up by the next one. Straight to the database: the API only ever
 * deactivates a tutor, and the reminder log has no delete at all.
 */
async function purgeSuiteData(): Promise<void> {
  const clients = await prisma.client.findMany({
    where: { daycareId: DAYCARE_ID, firstName: "Recordatorio", lastName: "Tester" },
    select: { id: true, pets: { select: { id: true } } },
  });
  const clientId = { in: clients.map((client) => client.id) };
  const petId = { in: clients.flatMap((client) => client.pets.map((pet) => pet.id)) };

  await prisma.$transaction([
    // The scheduled pass also sends for the seeded tutors' own appointments; those rows go too.
    prisma.reminderMessage.deleteMany({
      where: { daycareId: DAYCARE_ID, OR: [{ clientId }, { createdAt: { gte: startedAt } }] },
    }),
    prisma.reservation.deleteMany({ where: { daycareId: DAYCARE_ID, clientId } }),
    prisma.pet.deleteMany({ where: { daycareId: DAYCARE_ID, id: petId } }),
    prisma.client.deleteMany({ where: { daycareId: DAYCARE_ID, id: clientId } }),
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

interface DueItem {
  sourceKey: string;
  kind: string;
  channel: string | null;
  recipient: string | null;
  skipReason: string | null;
  message: string;
  lastSend: { status: string; channel: string | null; trigger: string } | null;
}

async function run() {
  console.log("🔔 Pruebas de recordatorios\n");

  let admin = clientFor("");
  let daycareStaff = clientFor("");
  let clinic = clientFor("");
  let clientId = "";
  let petId = "";
  let reservationId = "";
  let sourceKey = "";
  let originalSettings: Record<string, unknown> | null = null;

  const dueFor = async (api = admin, query = "days=3"): Promise<DueItem | undefined> => {
    const response = await api.get(`/reminders/due?${query}`);
    expectStatus(response.status, 200, "GET /reminders/due");
    return (response.data as DueItem[]).find((item) => item.sourceKey === sourceKey);
  };
  const automaticRows = () =>
    prisma.reminderMessage.findMany({
      where: { daycareId: DAYCARE_ID, sourceKey, trigger: "AUTO" },
      select: { status: true, channel: true, attempts: true },
    });
  const setChannel = async (reminderChannel: string | null) =>
    expectStatus(
      (await admin.put(`/clients/${clientId}`, { reminderChannel })).status,
      200,
      `canal del tutor a ${reminderChannel}`,
    );

  await purgeSuiteData();

  await test("Autenticación y módulo contratado", async () => {
    const token = await loginAs("admin_global", "admin123");
    admin = clientFor(token, UNIT);
    clinic = clientFor(token, "VETERINARY");
    daycareStaff = clientFor(await loginAs("guarderia_admin", "guarderia123"));
    const me = await admin.get("/auth/me");
    if (!me.data.enabledModules.includes("recordatorios")) {
      throw new Error("la guardería principal debería tener el módulo recordatorios");
    }
  });

  await test("Sin proveedor configurado los canales son simulados", async () => {
    const channels = await admin.get("/reminders/channels");
    expectStatus(channels.status, 200, "GET /reminders/channels");
    if (channels.data.WHATSAPP === "live" || channels.data.EMAIL === "live") {
      console.error(
        "\n✗ Este backend tiene un canal real configurado. La suite no se ejecuta contra él: enviaría mensajes de verdad.",
      );
      process.exit(1);
    }
    expectEqual(channels.data.WHATSAPP, "simulated", "WhatsApp");
    expectEqual(channels.data.EMAIL, "simulated", "correo");
  });

  await test("Una cita de mañana aparece como recordatorio, con canal y mensaje", async () => {
    const settings = await admin.get("/settings");
    expectStatus(settings.status, 200, "GET /settings");
    const unit = (settings.data.units as any[]).find((u) => u.businessUnit === UNIT);
    originalSettings = unit.reminders;
    expectEqual(unit.reminders.auto, false, "el envío automático nace apagado");

    const client = await admin.post("/clients", {
      firstName: "Recordatorio",
      lastName: "Tester",
      phone: "099 123 4567",
      email: `recordatorio_${Date.now()}@example.com`,
    });
    expectStatus(client.status, 201, "Alta del tutor");
    clientId = client.data.id;
    expectEqual(client.data.reminderChannel, null, "sin preferencia propia al nacer");
    const pet = await admin.post("/pets", { clientId, name: "Recordada", sex: "F" });
    expectStatus(pet.status, 201, "Alta de la mascota");
    petId = pet.data.id;

    // Noon of the unit's own tomorrow, which is the day the scheduled pass sends for.
    const tomorrow = localDayBoundsUtc(new Date(Date.now() + DAY_MS), unit.timezone)!;
    const reservation = await prisma.reservation.create({
      data: {
        daycareId: DAYCARE_ID,
        businessUnit: UNIT,
        clientId,
        service: "Baño y corte",
        status: "PENDIENTE",
        checkIn: new Date(tomorrow.start.getTime() + 12 * HOUR_MS),
        pets: { create: { petId } },
      },
    });
    reservationId = reservation.id;
    sourceKey = `CITA:${reservationId}`;

    const item = await dueFor();
    if (!item) throw new Error("la cita de mañana no aparece entre los recordatorios");
    expectEqual(item.kind, "CITA", "tipo");
    expectEqual(item.channel, "WHATSAPP", "canal por defecto de la unidad");
    expectEqual(item.recipient, "593991234567", "número con código de país");
    expectEqual(item.lastSend, null, "todavía no se envió nada");
    for (const part of ["Hola Recordatorio", "cita de peluquería de Recordada", "a las 12:00"]) {
      if (!item.message.includes(part))
        throw new Error(`el mensaje no dice "${part}": ${item.message}`);
    }
    if ("dedupeKey" in item) throw new Error("la respuesta expone la clave interna del job");
  });

  await test("Enviar a mano deja constancia, y se puede elegir el canal", async () => {
    const sent = await admin.post("/reminders/send", { sourceKey });
    expectStatus(sent.status, 201, "POST /reminders/send");
    expectEqual(sent.data.outcome, "sent", "resultado");
    expectEqual(sent.data.channel, "WHATSAPP", "canal");

    const byEmail = await admin.post("/reminders/send", { sourceKey, channel: "EMAIL" });
    expectStatus(byEmail.status, 201, "envío por correo");
    expectEqual(byEmail.data.channel, "EMAIL", "canal elegido a mano");
    if (!String(byEmail.data.recipient).endsWith("@example.com")) {
      throw new Error(`destinatario inesperado: ${byEmail.data.recipient}`);
    }

    expectEqual((await dueFor())?.lastSend?.status, "ENVIADO", "último envío en la lista");

    const log = await admin.get("/reminders/log?page=1&pageSize=50");
    expectStatus(log.status, 200, "GET /reminders/log");
    const mine = (log.data.items as any[]).filter((row) => row.sourceKey === sourceKey);
    expectEqual(mine.length, 2, "envíos registrados");
    if (!mine.every((row) => row.status === "ENVIADO" && row.trigger === "MANUAL")) {
      throw new Error(`registro inesperado: ${JSON.stringify(mine)}`);
    }
    expectEqual(mine[0].client.id, clientId, "tutor en el registro");
    expectEqual(mine[0].pet.name, "Recordada", "mascota en el registro");
  });

  await test("La preferencia del tutor decide el canal, y su negativa se respeta", async () => {
    await setChannel("EMAIL");
    expectEqual((await dueFor())?.channel, "EMAIL", "prefiere correo");

    await setChannel("NONE");
    const optedOut = await dueFor();
    expectEqual(optedOut?.channel ?? null, null, "pidió no recibir");
    if (!optedOut?.skipReason) throw new Error("falta el motivo por el que no se envía");
    const refused = await admin.post("/reminders/send", { sourceKey });
    expectStatus(refused.status, 409, "enviar a quien pidió no recibir");
    const forced = await admin.post("/reminders/send", { sourceKey, channel: "WHATSAPP" });
    expectStatus(forced.status, 409, "ni eligiendo el canal a mano");

    expectStatus(
      (await admin.put(`/clients/${clientId}`, { reminderChannel: "SMS" })).status,
      400,
      "canal desconocido en la ficha",
    );
    await setChannel(null);
  });

  await test("Peticiones inválidas y fuera de alcance", async () => {
    expectStatus(
      (await admin.post("/reminders/send", { sourceKey: "CITA:no-existe" })).status,
      404,
      "recordatorio inexistente",
    );
    expectStatus(
      (await admin.post("/reminders/send", { sourceKey: "HACK:1" })).status,
      404,
      "tipo desconocido",
    );
    expectStatus(
      (await admin.post("/reminders/send", { sourceKey, channel: "SMS" })).status,
      400,
      "canal desconocido",
    );
    expectStatus((await admin.post("/reminders/send", {})).status, 400, "sin clave");
    expectStatus((await admin.get("/reminders/due?kind=HACK")).status, 400, "tipo inválido");

    // The grooming appointment belongs to another unit than the daycare account's.
    expectEqual(
      await dueFor(daycareStaff),
      undefined,
      "la cita de peluquería vista desde guardería",
    );
    expectStatus(
      (await daycareStaff.post("/reminders/send", { sourceKey })).status,
      404,
      "enviar la cita de otra unidad",
    );
    const theirLog = await daycareStaff.get("/reminders/log");
    expectStatus(theirLog.status, 200, "registro de guardería");
    if ((theirLog.data as any[]).some((row) => row.businessUnit !== "DAYCARE")) {
      throw new Error("el registro de guardería muestra envíos de otra unidad");
    }
  });

  await test("Una cita cancelada deja de recordarse", async () => {
    await prisma.reservation.update({
      where: { id: reservationId },
      data: { status: "CANCELADA" },
    });
    expectEqual(await dueFor(), undefined, "cita cancelada en la lista");
    expectStatus((await admin.post("/reminders/send", { sourceKey })).status, 404, "enviarla");
    await prisma.reservation.update({
      where: { id: reservationId },
      data: { status: "PENDIENTE" },
    });
  });

  await test("La configuración de la unidad se guarda y se valida", async () => {
    const invalid = await admin.put(`/settings/${UNIT}`, {
      reminders: { ...originalSettings, channels: ["EMAIL"], defaultChannel: "WHATSAPP" },
    });
    expectStatus(invalid.status, 400, "canal por defecto que no está activo");
    expectStatus(
      (await admin.put(`/settings/${UNIT}`, { reminders: { ...originalSettings, leadDays: 0 } }))
        .status,
      400,
      "días de aviso fuera de rango",
    );

    const saved = await admin.put(`/settings/${UNIT}`, {
      reminders: {
        auto: true,
        channels: ["WHATSAPP", "EMAIL"],
        defaultChannel: "EMAIL",
        leadDays: 5,
        contactPhone: "02 234 5678",
        contactEmail: "",
      },
    });
    expectStatus(saved.status, 200, "PUT /settings");
    expectEqual(saved.data.reminders.auto, true, "automático");
    expectEqual(saved.data.reminders.defaultChannel, "EMAIL", "canal por defecto");
    expectEqual(saved.data.reminders.contactEmail, null, "un correo vacío se guarda como ninguno");

    const item = await dueFor();
    expectEqual(item?.channel, "EMAIL", "el canal por defecto nuevo se aplica");
    if (!item?.message.includes("02 234 5678") && !item?.message.includes("respondiendo")) {
      throw new Error(`el mensaje no dice cómo contactar al negocio: ${item?.message}`);
    }
  });

  await test("El envío automático no repite, y reintenta lo que antes no se pudo", async () => {
    await prisma.reminderMessage.deleteMany({ where: { daycareId: DAYCARE_ID, sourceKey } });
    const options = { daycareId: DAYCARE_ID, ignoreSendWindow: true };

    // A tutor who opted out is recorded as skipped, not sent and not failed.
    await setChannel("NONE");
    const skipped = await runAutomaticReminders(options);
    expectEqual(skipped.failed, 0, `fallos: ${JSON.stringify(skipped.failures)}`);
    let rows = await automaticRows();
    expectEqual(rows.length, 1, "filas tras la primera pasada");
    expectEqual(rows[0].status, "OMITIDO", "estado del tutor que pidió no recibir");

    // Once there is somewhere to send to, the same row is taken over rather than duplicated.
    await setChannel(null);
    const first = await runAutomaticReminders(options);
    console.log("  primera ejecución:", JSON.stringify({ ...first, failures: undefined }));
    expectEqual(first.failed, 0, `fallos: ${JSON.stringify(first.failures)}`);
    if (first.sent < 1) throw new Error("la primera ejecución no envió nada");
    rows = await automaticRows();
    expectEqual(rows.length, 1, "filas tras reintentar");
    expectEqual(rows[0].status, "ENVIADO", "estado tras reintentar");
    expectEqual(rows[0].attempts, 2, "intentos");

    const second = await runAutomaticReminders(options);
    console.log("  segunda ejecución:", JSON.stringify({ ...second, failures: undefined }));
    expectEqual(second.sent, 0, "la segunda ejecución no envía nada");
    expectEqual(second.failed, 0, "ni falla");
    expectEqual(second.duplicates, second.evaluated, "todo lo evaluado ya estaba enviado");
    expectEqual((await automaticRows()).length, 1, "filas tras la segunda ejecución");

    // Two passes at once: the unique key lets exactly one of them send.
    await prisma.reminderMessage.deleteMany({ where: { daycareId: DAYCARE_ID, sourceKey } });
    const [a, b] = await Promise.all([
      runAutomaticReminders(options),
      runAutomaticReminders(options),
    ]);
    expectEqual(a.failed + b.failed, 0, "fallos con dos ejecuciones simultáneas");
    rows = await automaticRows();
    expectEqual(rows.length, 1, "filas con dos ejecuciones simultáneas");
    expectEqual(rows[0].status, "ENVIADO", "estado con dos ejecuciones simultáneas");

    // Moved to another day, the visit is a different reminder and goes out again.
    const current = await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } });
    await prisma.reservation.update({
      where: { id: reservationId },
      data: { checkIn: new Date(current.checkIn!.getTime() + HOUR_MS) },
    });
    const moved = await runAutomaticReminders(options);
    expectEqual(moved.sent, 1, "la cita reprogramada se recuerda de nuevo");
  });

  await test("Con el envío automático apagado, la pasada no toca la unidad", async () => {
    expectStatus(
      (await admin.put(`/settings/${UNIT}`, { reminders: originalSettings })).status,
      200,
      "restaurar la configuración",
    );
    await prisma.reminderMessage.deleteMany({ where: { daycareId: DAYCARE_ID, sourceKey } });
    await runAutomaticReminders({ daycareId: DAYCARE_ID, ignoreSendWindow: true });
    expectEqual((await automaticRows()).length, 0, "envíos con el automático apagado");
  });

  await test("Una vacuna por vencer la recuerda la clínica, no la peluquería", async () => {
    const vaccination = await prisma.petVaccination.create({
      data: {
        petId,
        name: "Antirrábica E2E",
        date: new Date(Date.now() - 360 * DAY_MS),
        nextDue: new Date(Date.now() + 5 * DAY_MS),
      },
    });
    const key = `VACUNA:${vaccination.id}`;
    const find = async (api: typeof admin) =>
      ((await api.get("/reminders/due?kind=VACUNA&days=10")).data as DueItem[]).find(
        (item) => item.sourceKey === key,
      );

    const fromClinic = await find(clinic);
    if (!fromClinic) throw new Error("la vacuna no aparece en la clínica");
    if (!fromClinic.message.includes("refuerzo de Antirrábica E2E")) {
      throw new Error(`mensaje inesperado: ${fromClinic.message}`);
    }
    expectEqual(await find(admin), undefined, "la misma vacuna vista desde peluquería");
    expectStatus(
      (await admin.post("/reminders/send", { sourceKey: key })).status,
      404,
      "desde peluquería",
    );
    expectStatus(
      (await clinic.post("/reminders/send", { sourceKey: key })).status,
      201,
      "desde la clínica",
    );
  });

  // Whatever happened above, the seeded tenant goes back to how it was.
  if (originalSettings) {
    await admin.put(`/settings/${UNIT}`, { reminders: originalSettings }).catch(() => undefined);
  }
  await purgeSuiteData().catch((error) => console.error("✗ Limpieza:", error));
  await prisma.$disconnect();

  const failed = results.filter((result) => !result.passed);
  console.log(`\n${results.length - failed.length}/${results.length} pruebas superadas`);
  if (failed.length > 0) process.exit(1);
}

run().catch(async (error) => {
  console.error(error);
  await purgeSuiteData().catch(() => undefined);
  await prisma.$disconnect();
  process.exit(1);
});
