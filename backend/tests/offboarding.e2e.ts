import axios from "axios";

/**
 * Offboarding a client daycare: export its data, then delete it.
 *
 * A tenant could be deactivated but never actually leave — every row and every file stayed,
 * which is the right default but is not an answer to "we are leaving, give us our data and
 * remove it". Most of what is asserted here is the refusals, because this is the only
 * irreversible action in the console.
 *
 * The suite builds a daycare with real operational data so the deletion has referential work
 * to do: a tenant with only a user row would not exercise the ordering that the foreign keys
 * between reservations, pets, clients and rooms demand.
 */

const BASE_URL = process.env.API_URL ?? "http://localhost:3001/api/v1";
const SLUG_PREFIX = "e2e-offb";

interface TestResult { name: string; passed: boolean; error?: string }
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

function expectStatus(actual: number, expected: number, what: string) {
  if (actual !== expected) throw new Error(`${what}: esperaba ${expected}, recibió ${actual}`);
}

const SUFFIX = Date.now().toString(36);
const SLUG = `${SLUG_PREFIX}-${SUFFIX}`;
const ADMIN = `offb_admin_${SUFFIX}`;
const PASSWORD = "offboarding123";

async function run() {
  console.log("🚀 Pruebas de baja de una guardería\n");

  const superRes = await axios.post(
    `${BASE_URL}/auth/login`,
    { username: "superadmin", password: process.env.SUPERADMIN_PASSWORD || "superadmin123" },
    { validateStatus: () => true } as any,
  );
  if (superRes.status !== 200) {
    console.error(`No se pudo autenticar al superadmin: ${superRes.status}`);
    process.exit(1);
  }
  const consoleApi = clientFor(superRes.data.token);

  let daycareId = "";
  let clientId = "";

  await test("Alta de una guardería con datos operativos reales", async () => {
    const created = await consoleApi.post("/platform/daycares", {
      slug: SLUG,
      name: `Baja ${SUFFIX}`,
      units: ["DAYCARE"],
      modules: ["reservas", "guarderia", "finanzas", "inventario", "informes"],
      admin: { username: ADMIN, password: PASSWORD, name: "Admin Baja" },
    });
    expectStatus(created.status, 201, "Alta de guardería");
    daycareId = created.data.daycare.id;

    const session = await axios.post(
      `${BASE_URL}/auth/login`,
      { daycare: SLUG, username: ADMIN, password: PASSWORD, businessUnit: "DAYCARE" },
      { validateStatus: () => true } as any,
    );
    expectStatus(session.status, 200, "Login del admin");
    const api = clientFor(session.data.token, "DAYCARE");

    const client = await api.post("/clients", { firstName: "Tutor", lastName: "Baja", phone: "0988888888" });
    expectStatus(client.status, 201, "Alta de tutor");
    clientId = client.data.id;

    const pet = await api.post("/pets", { clientId, name: "Perro Baja", species: "dog", sex: "M" });
    expectStatus(pet.status, 201, "Alta de perrhijo");

    // `type` is required by the rooms schema; `businessUnit` is derived from the request, not
    // accepted from the body.
    const room = await api.post("/rooms", { name: "Sala Baja", capacity: 5, type: "daycare" });
    expectStatus(room.status, 201, "Alta de sala");

    const reservation = await api.post("/reservations", {
      clientId,
      petIds: [pet.data.id],
      roomId: room.data.id,
      service: "GUARDERIA",
      checkIn: new Date(Date.now() + 86_400_000).toISOString(),
      checkOut: new Date(Date.now() + 90_000_000).toISOString(),
      basePrice: 25,
    });
    expectStatus(reservation.status, 201, "Alta de reserva");

    const income = await api.post("/incomes", {
      businessUnit: "DAYCARE",
      concept: "Cobro de prueba",
      amount: 25,
      type: "RESERVA",
    });
    expectStatus(income.status, 201, "Alta de cobro");
  });

  await test("La exportación entrega un libro con los datos del inquilino", async () => {
    const res = await consoleApi.get(`/platform/daycares/${daycareId}/export`, {
      responseType: "arraybuffer",
    } as any);
    expectStatus(res.status, 200, "GET export");

    const body = Buffer.from(res.data);
    // A real xlsx is a zip; "PK" is its magic number.
    if (body.subarray(0, 2).toString() !== "PK") {
      throw new Error("La respuesta no es un libro de Excel");
    }
    if (body.length < 3000) throw new Error(`El libro parece vacío (${body.length} bytes)`);

    const disposition = String(res.headers["content-disposition"] ?? "");
    if (!disposition.includes(`${SLUG}-datos.xlsx`)) {
      throw new Error(`Content-Disposition inesperado: ${disposition}`);
    }
  });

  await test("La exportación queda registrada en la auditoría", async () => {
    const audit = await consoleApi.get(`/platform/audit?daycareId=${daycareId}`);
    expectStatus(audit.status, 200, "GET audit");
    if (!audit.data.some((row: any) => row.action === "daycare.export")) {
      throw new Error("No se registró daycare.export");
    }
  });

  await test("No se elimina sin repetir el identificador", async () => {
    const noConfirm = await consoleApi.delete(`/platform/daycares/${daycareId}`, { data: {} } as any);
    expectStatus(noConfirm.status, 400, "Sin confirmación");

    const wrongConfirm = await consoleApi.delete(`/platform/daycares/${daycareId}`, {
      data: { confirm: "otra-guarderia" },
    } as any);
    expectStatus(wrongConfirm.status, 400, "Confirmación equivocada");
  });

  await test("No se elimina una guardería que sigue activa", async () => {
    const denied = await consoleApi.delete(`/platform/daycares/${daycareId}`, {
      data: { confirm: SLUG },
    } as any);
    expectStatus(denied.status, 409, "Eliminar una guardería activa");

    // And it is still there.
    const still = await consoleApi.get(`/platform/daycares/${daycareId}`);
    expectStatus(still.status, 200, "La guardería debería seguir existiendo");
  });

  await test("Una guardería desactivada se elimina con todas sus filas", async () => {
    expectStatus(
      (await consoleApi.patch(`/platform/daycares/${daycareId}`, { isActive: false })).status,
      200,
      "Desactivación",
    );

    const deleted = await consoleApi.delete(`/platform/daycares/${daycareId}`, {
      data: { confirm: SLUG },
    } as any);
    expectStatus(deleted.status, 200, "Eliminación");

    const rows = deleted.data.rows;
    // The operational data must actually have been counted, not silently skipped.
    for (const table of ["clients", "pets", "rooms", "reservations", "reservationPets", "incomes", "users", "daycare"]) {
      if (!(table in rows)) throw new Error(`El resumen no informa de ${table}`);
    }
    if (rows.daycare !== 1) throw new Error(`Esperaba borrar 1 guardería, informa ${rows.daycare}`);
    if (rows.clients < 1 || rows.reservations < 1 || rows.incomes < 1) {
      throw new Error(`El resumen no refleja los datos creados: ${JSON.stringify(rows)}`);
    }

    const gone = await consoleApi.get(`/platform/daycares/${daycareId}`);
    expectStatus(gone.status, 404, "La guardería debería haber desaparecido");
  });

  await test("Nada del inquilino sobrevive en la base de datos", async () => {
    const { prisma } = await import("../src/db");
    try {
      const counts = await Promise.all([
        prisma.client.count({ where: { daycareId } }),
        prisma.pet.count({ where: { daycareId } }),
        prisma.reservation.count({ where: { daycareId } }),
        prisma.income.count({ where: { daycareId } }),
        prisma.room.count({ where: { daycareId } }),
        prisma.user.count({ where: { daycareId } }),
        prisma.daycareModule.count({ where: { daycareId } }),
        prisma.businessUnitSetting.count({ where: { daycareId } }),
      ]);
      if (counts.some((n) => n !== 0)) {
        throw new Error(`Quedaron filas del inquilino: ${JSON.stringify(counts)}`);
      }
      // Children that inherit tenancy through a parent must be gone too.
      const orphanPets = await prisma.reservationPet.count({ where: { pet: { daycareId } } });
      if (orphanPets !== 0) throw new Error("Quedaron reservation_pets huérfanas");
    } finally {
      await prisma.$disconnect();
    }
  });

  await test("La auditoría de la eliminación sobrevive al inquilino", async () => {
    // PlatformAuditLog.daycareId has no foreign key precisely so this record outlives what it
    // describes. Deleting the trail along with the tenant would make the console unable to
    // say that the deletion ever happened.
    const audit = await consoleApi.get(`/platform/audit?daycareId=${daycareId}`);
    expectStatus(audit.status, 200, "GET audit");
    const row = audit.data.find((r: any) => r.action === "daycare.delete");
    if (!row) throw new Error("No se registró daycare.delete");
    if (row.detail?.slug !== SLUG) throw new Error("La auditoría no nombra la guardería eliminada");
    if (!row.detail?.rows) throw new Error("La auditoría no guarda el recuento de filas");
  });

  await test("Eliminar una guardería inexistente es 404, no un 500", async () => {
    const missing = await consoleApi.delete(`/platform/daycares/${daycareId}`, {
      data: { confirm: SLUG },
    } as any);
    expectStatus(missing.status, 404, "Eliminar lo ya eliminado");
  });

  await cleanup();

  const passed = results.filter((r) => r.passed).length;
  console.log("\n" + "=".repeat(60));
  console.log("📊 Resumen de baja de guardería:");
  console.log(`   Pasadas: ${passed}/${results.length}`);
  console.log(`   Fallidas: ${results.length - passed}/${results.length}`);
  console.log("=".repeat(60));
  if (passed !== results.length) process.exit(1);
}

/** Whatever an interrupted earlier run left behind. The happy path deletes its own tenant. */
async function cleanup(): Promise<void> {
  const { prisma } = await import("../src/db");
  try {
    const stale = await prisma.daycare.findMany({
      where: { slug: { startsWith: SLUG_PREFIX } },
      select: { id: true },
    });
    for (const { id } of stale) {
      await prisma.inventoryMovement.deleteMany({ where: { item: { daycareId: id } } });
      await prisma.payment.deleteMany({ where: { payable: { daycareId: id } } });
      await prisma.petVaccination.deleteMany({ where: { pet: { daycareId: id } } });
      await prisma.petDocument.deleteMany({ where: { pet: { daycareId: id } } });
      await prisma.reservationPet.deleteMany({ where: { reservation: { daycareId: id } } });
      await prisma.checkInOut.deleteMany({ where: { daycareId: id } });
      await prisma.income.deleteMany({ where: { daycareId: id } });
      await prisma.alert.deleteMany({ where: { daycareId: id } });
      await prisma.contract.deleteMany({ where: { daycareId: id } });
      await prisma.reservation.deleteMany({ where: { daycareId: id } });
      await prisma.recurringPlan.deleteMany({ where: { daycareId: id } });
      await prisma.payable.deleteMany({ where: { daycareId: id } });
      await prisma.inventoryItem.deleteMany({ where: { daycareId: id } });
      await prisma.pet.deleteMany({ where: { daycareId: id } });
      await prisma.client.deleteMany({ where: { daycareId: id } });
      await prisma.provider.deleteMany({ where: { daycareId: id } });
      await prisma.room.deleteMany({ where: { daycareId: id } });
      await prisma.veterinarian.deleteMany({ where: { daycareId: id } });
      await prisma.businessUnitSetting.deleteMany({ where: { daycareId: id } });
      await prisma.daycareModule.deleteMany({ where: { daycareId: id } });
      await prisma.user.deleteMany({ where: { daycareId: id } });
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
