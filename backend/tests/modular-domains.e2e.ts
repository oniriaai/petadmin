import axios from "axios";

const BASE_URL = "http://localhost:3001/api/v1";

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
    results.push({
      name,
      passed: false,
      error: message,
      duration: Date.now() - startTime,
    });
    console.error(`✗ ${name}: ${message}`);
  }
}

async function loginAs(
  username: string,
  password: string,
  businessUnit?: "DAYCARE" | "GROOMING",
): Promise<string> {
  const client = axios.create({ baseURL: BASE_URL });
  const response = await client.post("/auth/login", {
    username,
    password,
    ...(businessUnit ? { businessUnit } : {}),
  });
  return response.data.token;
}

async function run() {
  console.log("🚀 Iniciando pruebas modulares de Guardería y Peluquería\n");

  let groomingToken: string;
  let daycareToken: string;
  let adminToken: string;
  let testClientId: string;
  let testPetId: string;
  let testRoomId: string;
  let createdAppointmentId: string;
  let createdCheckInOutId: string;

  // 1. Auth
  await test("Autenticación por roles (Peluquería, Guardería, Admin)", async () => {
    groomingToken = await loginAs("peluqueria_admin", "peluqueria123", "GROOMING");
    daycareToken = await loginAs("guarderia_admin", "guarderia123", "DAYCARE");
    adminToken = await loginAs("admin_global", "admin123");
    if (!groomingToken || !daycareToken || !adminToken) throw new Error("Fallo en tokens");
  });

  // 2. Setup client and pet
  await test("Preparar cliente y mascota compartida en Core", async () => {
    const client = axios.create({
      baseURL: BASE_URL,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const cRes = await client.post("/clients", {
      firstName: "Modular",
      lastName: "Tester",
      phone: "0999999999",
      email: `modular_${Date.now()}@example.com`,
    });
    testClientId = cRes.data.id;

    const pRes = await client.post("/pets", {
      clientId: testClientId,
      name: "Toby Modular",
      species: "dog",
      breed: "Golden Retriever",
      sex: "M",
    });
    testPetId = pRes.data.id;

    // Crear sala con capacidad para pruebas de guardería
    const kdClient = axios.create({
      baseURL: BASE_URL,
      headers: { Authorization: `Bearer ${daycareToken}` },
    });
    const newRoom = await kdClient.post("/rooms", {
      name: `Sala Test Modular ${Date.now()}`,
      capacity: 50,
      type: "daycare",
      businessUnit: "DAYCARE",
    });
    testRoomId = newRoom.data.id;
  });

  // 3. Peluquería Tests
  await test("Peluquería: Consultar catálogo de servicios con duraciones", async () => {
    const client = axios.create({
      baseURL: BASE_URL,
      headers: { Authorization: `Bearer ${groomingToken}` },
    });
    const res = await client.get("/peluqueria/services");
    if (!Array.isArray(res.data) || res.data.length === 0) throw new Error("Catálogo vacío");
    if (!res.data[0].durationMinutes || !res.data[0].basePrice)
      throw new Error("Falta duración o precio base");
  });

  await test("Peluquería: Agendar cita por fecha, servicio y duración", async () => {
    const client = axios.create({
      baseURL: BASE_URL,
      headers: { Authorization: `Bearer ${groomingToken}` },
    });
    const startTime = new Date();
    startTime.setHours(startTime.getHours() + 2);

    const res = await client.post("/peluqueria/appointments", {
      clientId: testClientId,
      petIds: [testPetId],
      serviceName: "Baño Básico & Secado",
      startTime: startTime.toISOString(),
      durationMinutes: 45,
      notes: "Cuidado con las orejas",
      basePrice: 18,
      advanceAmount: 5,
      paymentMethod: "TRANSFERENCIA",
    });

    if (!res.data.id) throw new Error("ID de cita no retornado");
    createdAppointmentId = res.data.id;
    if (res.data.businessUnit !== "GROOMING")
      throw new Error("Unidad de negocio debe ser GROOMING");
  });

  await test("Peluquería: Transición de estados de cita (Recepcionada -> En Proceso -> Listo)", async () => {
    const client = axios.create({
      baseURL: BASE_URL,
      headers: { Authorization: `Bearer ${groomingToken}` },
    });

    // Recepcionada
    let res = await client.patch(`/peluqueria/appointments/${createdAppointmentId}/status`, {
      status: "RECEPCIONADA",
      notes: "Llegó a tiempo",
    });
    if (res.data.status !== "RECEPCIONADA") throw new Error("Estado no actualizado a RECEPCIONADA");

    // En proceso
    res = await client.patch(`/peluqueria/appointments/${createdAppointmentId}/status`, {
      status: "EN_PROCESO",
    });
    if (res.data.status !== "EN_PROCESO") throw new Error("Estado no actualizado a EN_PROCESO");

    // Listo
    res = await client.patch(`/peluqueria/appointments/${createdAppointmentId}/status`, {
      status: "LISTO",
    });
    if (res.data.status !== "LISTO") throw new Error("Estado no actualizado a LISTO");
  });

  await test("Peluquería: Completar y registrar cobro independiente", async () => {
    const client = axios.create({
      baseURL: BASE_URL,
      headers: { Authorization: `Bearer ${groomingToken}` },
    });
    const res = await client.post(`/peluqueria/appointments/${createdAppointmentId}/complete`, {
      paymentMethod: "EFECTIVO",
      amount: 15.7, // Saldo
      notes: "Cobro en mostrador de peluquería",
    });

    if (res.data.status !== "COMPLETADA") throw new Error("Estado no es COMPLETADA");
    if (!res.data.incomes || res.data.incomes.length === 0)
      throw new Error("Ingreso no registrado");
    const lastIncome = res.data.incomes[res.data.incomes.length - 1];
    if (lastIncome.businessUnit !== "GROOMING") throw new Error("Ingreso no pertenece a GROOMING");
  });

  await test("Peluquería: Aislamiento - Rol daycare no puede acceder a Peluquería", async () => {
    const client = axios.create({
      baseURL: BASE_URL,
      headers: { Authorization: `Bearer ${daycareToken}` },
    });
    try {
      await client.get("/peluqueria/appointments");
      throw new Error("Guardería no debería tener acceso a peluquería");
    } catch (err: any) {
      if (err.response?.status !== 403)
        throw new Error(`Esperado 403, recibido ${err.response?.status}`);
    }
  });

  // 4. Guardería Tests
  await test("Guardería: Consultar ocupación en vivo y semáforo de salas", async () => {
    const client = axios.create({
      baseURL: BASE_URL,
      headers: { Authorization: `Bearer ${daycareToken}` },
    });
    const res = await client.get("/guarderia/occupancy");
    if (!Array.isArray(res.data) || res.data.length === 0) throw new Error("Salas no retornadas");
    const room = res.data.find((r: any) => r.id === testRoomId);
    if (!room) throw new Error("Sala de prueba no encontrada");
    if (typeof room.currentOccupancy !== "number" || typeof room.availableSlots !== "number") {
      throw new Error("Campos de ocupación inválidos");
    }
  });

  await test("Guardería: Registrar check-in con validación de capacidad de sala", async () => {
    const client = axios.create({
      baseURL: BASE_URL,
      headers: { Authorization: `Bearer ${daycareToken}` },
    });
    const res = await client.post("/guarderia/attendance/check-in", {
      petId: testPetId,
      clientId: testClientId,
      roomId: testRoomId,
      notes: "Llegó alegre",
    });

    if (!res.data.id) throw new Error("ID de check-in no retornado");
    createdCheckInOutId = res.data.id;
    if (res.data.businessUnit !== "DAYCARE") throw new Error("Unidad debe ser DAYCARE");

    // Verificar que la ocupación aumentó
    const occRes = await client.get("/guarderia/occupancy");
    const room = occRes.data.find((r: any) => r.id === testRoomId);
    const petFound = room.currentPets.some((p: any) => p.petId === testPetId);
    if (!petFound) throw new Error("Mascota no aparece en la sala ocupada");
  });

  await test("Guardería: Registrar check-out con cobro independiente", async () => {
    const client = axios.create({
      baseURL: BASE_URL,
      headers: { Authorization: `Bearer ${daycareToken}` },
    });
    const res = await client.post("/guarderia/attendance/check-out", {
      checkInOutId: createdCheckInOutId,
      createIncome: true,
      amount: 20,
      paymentMethod: "EFECTIVO",
      notes: "Día completo guardería",
    });

    if (!res.data.checkOutTime) throw new Error("checkOutTime no registrado");

    // Verificar que el ingreso de guardería quedó en la unidad de guardería
    // Read as the admin: the charge is recorded whoever closes the stay, but reading the
    // income list takes `finanzas.read`.
    const incClient = axios.create({
      baseURL: BASE_URL,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const incRes = await incClient.get("/incomes");
    const foundIncome = incRes.data.find((inc: any) => inc.concept?.includes("Toby Modular"));
    if (!foundIncome || foundIncome.businessUnit !== "DAYCARE") {
      throw new Error("Ingreso de guardería no registrado con businessUnit DAYCARE");
    }
  });

  await test("Guardería: Aislamiento - Rol grooming no puede acceder a Guardería", async () => {
    const client = axios.create({
      baseURL: BASE_URL,
      headers: { Authorization: `Bearer ${groomingToken}` },
    });
    try {
      await client.get("/guarderia/occupancy");
      throw new Error("Peluquería no debería tener acceso a guardería");
    } catch (err: any) {
      if (err.response?.status !== 403)
        throw new Error(`Esperado 403, recibido ${err.response?.status}`);
    }
  });

  // Report
  console.log("\n============================================================");
  console.log("📊 Resumen de Pruebas de Módulos:");
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`   Pasadas: ${passed}/${results.length}`);
  console.log(`   Fallidas: ${failed}/${results.length}`);
  console.log("============================================================\n");

  if (failed > 0) process.exit(1);
}

run().catch(console.error);
