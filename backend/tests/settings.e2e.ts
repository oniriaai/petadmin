/**
 * Per-daycare settings.
 *
 * The settings screen used to be a fake — `vatPercent` lived in `useState` and "Guardar" flashed a
 * confirmation without calling anything. The point of these assertions is that the values are now
 * persisted AND consumed: the last test creates a reservation and checks it picked up the
 * configured rate, because a setting that saves but changes nothing is the same fake with a
 * database behind it.
 */
import axios, { type AxiosInstance } from "axios";

const BASE_URL = process.env.API_URL ?? "http://localhost:3001/api/v1";

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

function clientFor(token: string): AxiosInstance {
  return axios.create({
    baseURL: BASE_URL,
    validateStatus: () => true,
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function login(username: string, password: string, businessUnit?: string): Promise<string> {
  const res = await axios.post(`${BASE_URL}/auth/login`, { username, password, businessUnit });
  return res.data.token;
}

async function main(): Promise<void> {
  console.log("\n⚙️  Configuración por guardería\n" + "=".repeat(60));

  const admin = clientFor(await login("admin_global", "admin123"));
  const operator = clientFor(await login("kinderdog_admin", "kinderdog123", "DAYCARE"));
  const demo = clientFor(await login("demo_admin", "demo123", "GROOMING"));

  await test("Devuelve la guardería y una entrada por unidad contratada", async () => {
    const res = await admin.get("/settings");
    expectStatus(res.status, 200, "GET /settings");
    if (res.data.daycare?.slug !== "pethijos") throw new Error("guardería inesperada");
    const units = res.data.units.map((u: { businessUnit: string }) => u.businessUnit).sort();
    if (units.join(",") !== "DAYCARE,GROOMING") throw new Error(`unidades: ${units.join(",")}`);
    // A missing row means defaults, not "unconfigurable".
    for (const unit of res.data.units) {
      if (typeof unit.vatPercent !== "number") throw new Error("falta vatPercent");
      if (!unit.timezone) throw new Error("falta timezone");
    }
  });

  await test("Una guardería solo ve y configura las unidades que compró", async () => {
    const res = await demo.get("/settings");
    expectStatus(res.status, 200, "GET /settings (demo)");
    const units = res.data.units.map((u: { businessUnit: string }) => u.businessUnit);
    if (units.join(",") !== "GROOMING") throw new Error(`la guardería demo solo tiene GROOMING, vio: ${units}`);

    // 404, not 403: the unit does not exist for this tenant.
    expectStatus((await demo.put("/settings/DAYCARE", { vatPercent: 10 })).status, 404, "unidad ajena");
  });

  await test("Solo un administrador puede leer o escribir la configuración", async () => {
    expectStatus((await operator.get("/settings")).status, 403, "rol daycare");
    expectStatus((await operator.put("/settings/DAYCARE", { vatPercent: 10 })).status, 403, "rol daycare");
  });

  await test("Los valores inválidos se rechazan con un mensaje útil", async () => {
    // A bad zone would silently shift every occurrence the scheduler generates, so it is
    // validated against the runtime rather than stored and hoped for.
    const badZone = await admin.put("/settings/DAYCARE", { timezone: "Mars/Olympus" });
    expectStatus(badZone.status, 400, "zona horaria inexistente");
    if (!String(badZone.data.message).includes("Mars/Olympus")) {
      throw new Error("el mensaje debe nombrar la zona rechazada");
    }
    expectStatus((await admin.put("/settings/DAYCARE", { vatPercent: 150 })).status, 400, "IVA fuera de rango");
    expectStatus((await admin.put("/settings/DAYCARE", { vatPercent: -1 })).status, 400, "IVA negativo");
    expectStatus((await admin.put("/settings/NO_EXISTE", { vatPercent: 10 })).status, 400, "unidad inválida");
  });

  await test("El IVA configurado se aplica a una reserva nueva que no indica otro", async () => {
    const original = await admin.get("/settings");
    const before = original.data.units.find((u: { businessUnit: string }) => u.businessUnit === "DAYCARE").vatPercent;

    try {
      const saved = await admin.put("/settings/DAYCARE", { vatPercent: 12 });
      expectStatus(saved.status, 200, "guardar IVA");
      if (saved.data.vatPercent !== 12) throw new Error("el valor guardado no coincide");

      const clients = await admin.get("/clients");
      const client = clients.data[0];
      const detail = await admin.get(`/clients/${client.id}`);
      const pet = detail.data.pets[0];
      const rooms = await admin.get("/rooms");
      const room = rooms.data.find((r: { businessUnit: string }) => r.businessUnit === "DAYCARE");
      if (!pet || !room) throw new Error("faltan datos sembrados para esta prueba");

      const created = await admin.post("/reservations", {
        businessUnit: "DAYCARE",
        clientId: client.id,
        petIds: [pet.id],
        roomId: room.id,
        service: "GUARDERIA",
        // Far future, so it cannot collide with seeded reservations.
        checkIn: "2027-03-01T13:00:00.000Z",
        checkOut: "2027-03-01T21:00:00.000Z",
        basePrice: 100,
      });
      expectStatus(created.status, 201, "crear reserva");

      // This is the assertion that separates a real setting from a stored one.
      if (created.data.vatPercent !== 12) {
        throw new Error(`la reserva usó ${created.data.vatPercent}% en vez del 12% configurado`);
      }
      if (created.data.vatAmount !== 12) {
        throw new Error(`IVA calculado ${created.data.vatAmount}, esperado 12 sobre una base de 100`);
      }

      // An explicit rate still wins over the default.
      const explicit = await admin.post("/reservations", {
        businessUnit: "DAYCARE",
        clientId: client.id,
        petIds: [pet.id],
        roomId: room.id,
        service: "GUARDERIA",
        checkIn: "2027-03-02T13:00:00.000Z",
        checkOut: "2027-03-02T21:00:00.000Z",
        basePrice: 100,
        vatPercent: 0,
      });
      expectStatus(explicit.status, 201, "crear reserva con IVA explícito");
      if (explicit.data.vatPercent !== 0) throw new Error("el valor explícito debe prevalecer");

      await admin.delete(`/reservations/${created.data.id}`);
      await admin.delete(`/reservations/${explicit.data.id}`);
    } finally {
      // Always put the seeded value back, whatever happened above.
      await admin.put("/settings/DAYCARE", { vatPercent: before });
    }
  });

  console.log("=".repeat(60));
  console.log(`📊 Configuración:\n   Pasadas: ${passed}/${passed + failed}\n   Fallidas: ${failed}/${passed + failed}`);
  console.log("=".repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
