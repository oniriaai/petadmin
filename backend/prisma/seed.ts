import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { TOGGLEABLE_PRODUCT_MODULES } from "../src/platform/product-modules";

const prisma = new PrismaClient();

const BU = {
  DAYCARE: "DAYCARE",
  GROOMING: "GROOMING",
  VETERINARY: "VETERINARY",
} as const;

/**
 * Literal tenant ids, matching 20260903000000_add_daycare_tenancy so the migration, this seed,
 * the platform console fixtures and the e2e suites all refer to the same daycares.
 */
const PETHIJOS_ID = "daycare_pethijos";
const DEMO_ID = "daycare_demo";

/**
 * Whether to create the demo tenants and their sample data.
 *
 * The `pethijos` and `demo` tenants carry well-known passwords (`admin123`, `demo123`) and
 * exist for development and for the isolation suites. They must never reach a customer-facing
 * database, so outside development this is off unless asked for explicitly. With it off the
 * seed still provisions the platform superadmin, which is what a fresh production database
 * actually needs.
 */
const SEED_DEMO_DATA = process.env.SEED_DEMO_DATA
  ? process.env.SEED_DEMO_DATA.toLowerCase() === "true"
  : process.env.NODE_ENV !== "production";

/** Stamps the default tenant onto a batch of seed rows. */
const tenant = <T extends object>(rows: readonly T[]): (T & { daycareId: string })[] =>
  rows.map((row) => ({ ...row, daycareId: PETHIJOS_ID }));

const SERVICES = {
  DAYCARE: "GUARDERIA",
  GROOMING_CANINE: "PELUQUERIA_CANINA",
  GROOMING_FELINE: "PELUQUERIA_FELINA",
  TRANSPORT: "TRANSPORTE",
  OTHER: "OTRO",
} as const;

const RES_STATUS = {
  PENDING: "PENDIENTE",
  CONFIRMED: "CONFIRMADA",
  ACTIVE: "ACTIVA",
  CANCELED: "CANCELADA",
} as const;

const PAY_STATUS = {
  PENDING: "PENDIENTE",
  PARTIAL: "PARCIAL",
  PAID: "PAGADO",
} as const;

type SeedPetPhoto = {
  petName: string;
  key: string;
  publicUrl: string;
};

function withTime(base: Date, h: number, m = 0) {
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

function money(subtotal: number, vatPercent = 0, paid = 0) {
  const vatAmount = Number(((subtotal * vatPercent) / 100).toFixed(2));
  const total = Number((subtotal + vatAmount).toFixed(2));
  const balance = Number((total - paid).toFixed(2));
  return {
    subtotal,
    vatPercent,
    vatAmount,
    total,
    paid,
    balance,
    pendingAmount: balance,
  };
}

/**
 * The platform (vendor) account. Provisioned from the environment and upserted OUTSIDE the
 * "already seeded" guard below, so an existing database can still acquire a superadmin.
 * Its password is never downgraded once set.
 */
async function ensureSuperadmin() {
  const username = process.env.SUPERADMIN_USERNAME || "superadmin";
  const name = process.env.SUPERADMIN_NAME || "Plataforma";
  let password = process.env.SUPERADMIN_PASSWORD;

  if (!password) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SUPERADMIN_PASSWORD es obligatorio fuera de desarrollo");
    }
    password = "superadmin123";
    console.warn(
      `[seed] SUPERADMIN_PASSWORD no definido: usando la contraseña de desarrollo por defecto ` +
        `para '${username}'. No usar en producción.`,
    );
  }

  // Platform accounts have no daycare, so they are matched on that rather than by a
  // globally unique username, which no longer exists.
  const existing = await prisma.user.findFirst({ where: { username, daycareId: null } });
  if (existing) {
    console.log(`[seed] superadmin '${username}' ya existe (contraseña sin cambios)`);
    return;
  }

  // daycareId stays null: that is what makes this a platform account, and the
  // users_superadmin_untenanted CHECK constraint enforces it.
  await prisma.user.create({
    data: {
      username,
      name,
      passwordHash: bcrypt.hashSync(password, 10),
      role: "superadmin",
      businessUnit: "GLOBAL",
      daycareId: null,
    },
  });
  console.log(`[seed] superadmin '${username}' creado`);
}

/** The two tenants: the real operating business, plus a restricted one for isolation tests. */
async function ensureDaycares() {
  await prisma.daycare.upsert({
    where: { id: PETHIJOS_ID },
    update: {},
    create: {
      id: PETHIJOS_ID,
      slug: "pethijos",
      name: "Pethijos",
      timezone: "America/Guayaquil",
      units: `${BU.DAYCARE},${BU.GROOMING},${BU.VETERINARY}`,
    },
  });

  // A second tenant is not decoration: tenant-isolation tests and the console's module matrix
  // both need a real second row, and a one-tenant database hides cross-tenant bugs.
  await prisma.daycare.upsert({
    where: { id: DEMO_ID },
    update: {},
    create: {
      id: DEMO_ID,
      slug: "demo",
      name: "Demo Peluquería",
      timezone: "America/Bogota",
      units: BU.GROOMING,
    },
  });

  // Entitlements. The existing business gets every sellable module, derived from the catalog
  // rather than listed here: a module added later must not end up silently off for it.
  const DEMO_ENABLED = new Set(["reservas", "peluqueria"]);
  const entitlements: Array<{ daycareId: string; moduleId: string; isEnabled: boolean }> = [
    ...TOGGLEABLE_PRODUCT_MODULES.map((m) => ({
      daycareId: PETHIJOS_ID,
      moduleId: m.id,
      isEnabled: true,
    })),
    // The demo tenant is deliberately restricted and IS listed explicitly, because which
    // modules are off is the point of it.
    ...TOGGLEABLE_PRODUCT_MODULES.map((m) => ({
      daycareId: DEMO_ID,
      moduleId: m.id,
      isEnabled: DEMO_ENABLED.has(m.id),
    })),
  ];

  for (const entitlement of entitlements) {
    await prisma.daycareModule.upsert({
      where: {
        daycareId_moduleId: { daycareId: entitlement.daycareId, moduleId: entitlement.moduleId },
      },
      update: { isEnabled: entitlement.isEnabled },
      create: entitlement,
    });
  }

  await prisma.businessUnitSetting.upsert({
    where: { daycareId_businessUnit: { daycareId: DEMO_ID, businessUnit: BU.GROOMING } },
    update: {},
    create: { daycareId: DEMO_ID, businessUnit: BU.GROOMING, timezone: "America/Bogota" },
  });

  const demoAdmin = await prisma.user.findFirst({
    where: { username: "demo_admin", daycareId: DEMO_ID },
  });
  if (!demoAdmin) {
    await prisma.user.create({
      data: {
        username: "demo_admin",
        name: "Admin Demo",
        passwordHash: bcrypt.hashSync("demo123", 10),
        role: "admin",
        businessUnit: BU.GROOMING,
        daycareId: DEMO_ID,
      },
    });
  }
}

/**
 * The clinic unit of the main tenant: its slot, a `veterinary` login, rooms, a staff
 * veterinarian and a priced catalogue. Idempotent, and separate from the one-shot demo data
 * below so a database seeded before the clinic existed picks it up on the next start.
 *
 * The demo tenant deliberately gets none of this: it stays grooming-only.
 */
async function ensureVeterinaryClinic() {
  const daycare = await prisma.daycare.findUnique({
    where: { id: PETHIJOS_ID },
    select: { units: true },
  });
  if (!daycare) return;
  if (!daycare.units.split(",").includes(BU.VETERINARY)) {
    await prisma.daycare.update({
      where: { id: PETHIJOS_ID },
      data: { units: `${daycare.units},${BU.VETERINARY}` },
    });
  }

  await prisma.businessUnitSetting.upsert({
    where: { daycareId_businessUnit: { daycareId: PETHIJOS_ID, businessUnit: BU.VETERINARY } },
    update: {},
    create: { daycareId: PETHIJOS_ID, businessUnit: BU.VETERINARY, timezone: "America/Guayaquil" },
  });

  const vetUser = await prisma.user.upsert({
    where: { daycareId_username: { daycareId: PETHIJOS_ID, username: "vet_admin" } },
    update: {},
    create: {
      daycareId: PETHIJOS_ID,
      username: "vet_admin",
      name: "Dra. Camila Rivas",
      passwordHash: bcrypt.hashSync("vet12345", 10),
      role: "veterinary",
      businessUnit: BU.VETERINARY,
    },
  });

  const clinicRooms = await prisma.room.count({
    where: { daycareId: PETHIJOS_ID, businessUnit: BU.VETERINARY },
  });
  if (clinicRooms === 0) {
    await prisma.room.createMany({
      data: [
        { name: "Consultorio 1", capacity: 1, type: "consultorio" },
        { name: "Consultorio 2", capacity: 1, type: "consultorio" },
        { name: "Quirófano", capacity: 1, type: "quirofano" },
        { name: "Hospitalización", capacity: 6, type: "hospital" },
      ].map((room) => ({ ...room, daycareId: PETHIJOS_ID, businessUnit: BU.VETERINARY })),
    });
  }

  const staff = await prisma.veterinarian.count({
    where: { daycareId: PETHIJOS_ID, isExternal: false, userId: vetUser.id },
  });
  if (staff === 0) {
    await prisma.veterinarian.create({
      data: {
        daycareId: PETHIJOS_ID,
        name: "Dra. Camila Rivas",
        licenseNumber: "MVZ-1042",
        specialty: "Medicina general",
        userId: vetUser.id,
      },
    });
  }

  const services = await prisma.vetService.count({ where: { daycareId: PETHIJOS_ID } });
  if (services === 0) {
    await prisma.vetService.createMany({
      data: [
        { name: "Consulta general", category: "CONSULTA", durationMinutes: 30, basePrice: 25 },
        { name: "Control", category: "CONSULTA", durationMinutes: 20, basePrice: 15 },
        { name: "Consulta de urgencia", category: "CONSULTA", durationMinutes: 45, basePrice: 45 },
        { name: "Vacuna múltiple", category: "VACUNACION", durationMinutes: 15, basePrice: 28 },
        { name: "Vacuna antirrábica", category: "VACUNACION", durationMinutes: 15, basePrice: 18 },
        { name: "Desparasitación", category: "PROCEDIMIENTO", durationMinutes: 15, basePrice: 12 },
        { name: "Hemograma", category: "LABORATORIO", durationMinutes: 20, basePrice: 22 },
        { name: "Radiografía", category: "IMAGEN", durationMinutes: 30, basePrice: 40 },
        { name: "Esterilización", category: "CIRUGIA", durationMinutes: 120, basePrice: 140 },
        {
          name: "Profilaxis dental",
          category: "PROCEDIMIENTO",
          durationMinutes: 60,
          basePrice: 70,
        },
      ].map((service) => ({ ...service, daycareId: PETHIJOS_ID })),
    });
  }
}

async function main() {
  // Always first, and independent of the demo data: a production database needs exactly this.
  await ensureSuperadmin();

  if (!SEED_DEMO_DATA) {
    console.log(
      "[seed] SEED_DEMO_DATA no está activo: solo se provisionó la cuenta de plataforma. " +
        "Las guarderías de demostración (pethijos, demo) NO se crearon.",
    );
    return;
  }

  await ensureDaycares();

  const existing = await prisma.user.count({ where: { daycareId: PETHIJOS_ID } });
  if (existing > 0) {
    // A database seeded before the clinic existed still gets it.
    await ensureVeterinaryClinic();
    console.log("DB already seeded, skipping.");
    return;
  }

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const daysFromNow = (n: number) => {
    const d = new Date(todayStart);
    d.setDate(d.getDate() + n);
    return d;
  };

  const hash = (pw: string) => bcrypt.hashSync(pw, 10);
  const seedPhotoEntries = JSON.parse(
    readFileSync(path.resolve(__dirname, "./seed-pet-photos.json"), "utf8"),
  ) as SeedPetPhoto[];
  const photoByPetName = new Map(
    seedPhotoEntries.map((entry) => [entry.petName.toLowerCase(), entry.publicUrl]),
  );
  const requiredPetNames = ["max", "nina", "buddy", "luna", "rocky", "mora", "coco", "kiara"];
  const missingPetPhotos = requiredPetNames.filter((name) => !photoByPetName.has(name));
  if (missingPetPhotos.length > 0) {
    throw new Error(`Missing seed photo mapping for pets: ${missingPetPhotos.join(", ")}`);
  }

  const users = await prisma.user.createMany({
    data: tenant([
      {
        username: "admin_global",
        passwordHash: hash("admin123"),
        name: "Admin Global",
        businessUnit: "GLOBAL",
        role: "admin",
      },
      {
        username: "kinderdog_admin",
        passwordHash: hash("kinderdog123"),
        name: "Admin Kinderdog",
        businessUnit: BU.DAYCARE,
        role: "daycare",
      },
      {
        username: "pethijos_admin",
        passwordHash: hash("pethijos123"),
        name: "Admin Pethijos",
        businessUnit: BU.GROOMING,
        role: "grooming",
      },
    ]),
  });

  const buSettings = await prisma.businessUnitSetting.createMany({
    data: tenant([
      { businessUnit: BU.DAYCARE, timezone: "America/Guayaquil" },
      { businessUnit: BU.GROOMING, timezone: "America/Bogota" },
    ]),
  });

  const roomData = [
    { name: "Recepción Guardería", businessUnit: BU.DAYCARE, capacity: 2, type: "reception" },
    { name: "Patio Principal Guardería", businessUnit: BU.DAYCARE, capacity: 24, type: "daycare" },
    { name: "Zona Cachorros Guardería", businessUnit: BU.DAYCARE, capacity: 10, type: "daycare" },
    { name: "Sala Grooming Guardería", businessUnit: BU.DAYCARE, capacity: 3, type: "grooming" },
    { name: "Transporte Guardería", businessUnit: BU.DAYCARE, capacity: 2, type: "transport" },
    { name: "Recepción Peluquería", businessUnit: BU.GROOMING, capacity: 2, type: "reception" },
    { name: "Estancia Peluquería", businessUnit: BU.GROOMING, capacity: 16, type: "daycare" },
    { name: "Sala Peluquería Canina", businessUnit: BU.GROOMING, capacity: 4, type: "grooming" },
    { name: "Sala Peluquería Felina", businessUnit: BU.GROOMING, capacity: 2, type: "grooming" },
  ];
  await prisma.room.createMany({ data: tenant(roomData) });
  const rooms = await prisma.room.findMany({ where: { daycareId: PETHIJOS_ID } });
  const getRoom = (businessUnit: string, type: string) =>
    rooms.find((r) => r.businessUnit === businessUnit && r.type === type)!;

  const providers = await prisma.provider.createMany({
    data: tenant([
      {
        name: "NutriPet Andina",
        product: "Alimentos",
        city: "Quito",
        province: "Pichincha",
        phone: "022345600",
        isActive: true,
      },
      {
        name: "VetSupply Norte",
        product: "Medicinas",
        city: "Quito",
        province: "Pichincha",
        isActive: true,
      },
      {
        name: "LimpioMascotas",
        product: "Higiene",
        city: "Guayaquil",
        province: "Guayas",
        isActive: true,
      },
      {
        name: "TransInsumos PH",
        product: "Transporte",
        city: "Bogotá",
        province: "Cundinamarca",
        isActive: false,
      },
    ]),
  });

  const veterinarians = await prisma.veterinarian.createMany({
    data: tenant([
      {
        name: "Dra. Verónica Mena",
        phone: "0995550001",
        clinic: "Clínica Animal Norte",
        isExternal: true,
        isActive: true,
      },
      {
        name: "Dr. Pablo Cedeño",
        phone: "0995550002",
        clinic: "VetCenter Sur",
        isExternal: true,
        isActive: true,
      },
      {
        name: "Dra. Lina Forero",
        phone: "3001112211",
        clinic: "Pets Care PH",
        isExternal: true,
        isActive: false,
      },
    ]),
  });

  const clients = await prisma.client.createManyAndReturn({
    data: tenant([
      {
        firstName: "María",
        lastName: "González",
        phone: "0991234567",
        email: "maria.gonzalez@email.com",
        city: "Quito",
        province: "Pichincha",
        firstServiceDate: daysFromNow(-30),
        notes: "Cliente frecuente guardería",
      },
      {
        firstName: "Juan",
        lastName: "Pérez",
        phone: "0987654321",
        whatsapp: "0987654321",
        city: "Quito",
        province: "Pichincha",
        firstServiceDate: daysFromNow(-20),
      },
      {
        firstName: "Camila",
        lastName: "Rosero",
        email: "camila.rosero@email.com",
        address: "La Carolina",
        city: "Quito",
        firstServiceDate: daysFromNow(-10),
      },
      {
        firstName: "Santiago",
        lastName: "Mejía",
        phone: "3001230001",
        email: "santiago.mejia@email.com",
        city: "Bogotá",
        province: "Cundinamarca",
        firstServiceDate: daysFromNow(-18),
      },
      {
        firstName: "Valentina",
        lastName: "Ruiz",
        phone: "3001230002",
        address: "Usaquén",
        city: "Bogotá",
        firstServiceDate: daysFromNow(-8),
      },
      {
        firstName: "Andrés",
        lastName: "Salas",
        email: "andres.salas@email.com",
        city: "Bogotá",
        province: "Cundinamarca",
        firstServiceDate: daysFromNow(-5),
      },
    ]),
  });

  const c = {
    maria: clients[0],
    juan: clients[1],
    camila: clients[2],
    santiago: clients[3],
    valentina: clients[4],
    andres: clients[5],
  };

  const pets = await prisma.pet.createManyAndReturn({
    data: tenant([
      {
        clientId: c.maria.id,
        name: "Max",
        species: "dog",
        breed: "Labrador",
        sex: "M",
        color: "Negro",
        weight: 25,
        isNeutered: true,
        photoUrl: photoByPetName.get("max"),
      },
      {
        clientId: c.maria.id,
        name: "Nina",
        species: "dog",
        breed: "Beagle",
        sex: "F",
        color: "Tricolor",
        weight: 12,
        isNeutered: false,
        photoUrl: photoByPetName.get("nina"),
      },
      {
        clientId: c.juan.id,
        name: "Buddy",
        species: "dog",
        breed: "Golden Retriever",
        sex: "M",
        color: "Dorado",
        weight: 28.5,
        isNeutered: true,
        photoUrl: photoByPetName.get("buddy"),
      },
      {
        clientId: c.camila.id,
        name: "Luna",
        species: "cat",
        breed: "Mestizo",
        sex: "F",
        color: "Blanco",
        weight: 4.2,
        isNeutered: true,
        photoUrl: photoByPetName.get("luna"),
      },
      {
        clientId: c.santiago.id,
        name: "Rocky",
        species: "dog",
        breed: "Border Collie",
        sex: "M",
        color: "Negro/Blanco",
        weight: 20,
        isNeutered: true,
        photoUrl: photoByPetName.get("rocky"),
      },
      {
        clientId: c.santiago.id,
        name: "Mora",
        species: "cat",
        breed: "Siamés",
        sex: "F",
        color: "Crema",
        weight: 3.8,
        isNeutered: true,
        photoUrl: photoByPetName.get("mora"),
      },
      {
        clientId: c.valentina.id,
        name: "Coco",
        species: "dog",
        breed: "Poodle",
        sex: "M",
        color: "Blanco",
        weight: 7.4,
        isNeutered: false,
        photoUrl: photoByPetName.get("coco"),
      },
      {
        clientId: c.andres.id,
        name: "Kiara",
        species: "dog",
        breed: "Pastor Alemán",
        sex: "F",
        color: "Café",
        weight: 24,
        isNeutered: true,
        photoUrl: photoByPetName.get("kiara"),
      },
    ]),
  });

  const p = Object.fromEntries(pets.map((pet) => [pet.name.toLowerCase(), pet])) as Record<
    string,
    (typeof pets)[number]
  >;

  await prisma.petVaccination.createMany({
    data: [
      {
        petId: p.max.id,
        name: "Rabia",
        date: daysFromNow(-200),
        nextDue: daysFromNow(165),
        notes: "Refuerzo anual",
      },
      {
        petId: p.luna.id,
        name: "Triple Felina",
        date: daysFromNow(-150),
        nextDue: daysFromNow(215),
      },
      {
        petId: p.rocky.id,
        name: "Múltiple Canina",
        date: daysFromNow(-120),
        nextDue: daysFromNow(245),
      },
    ],
  });

  await prisma.petDocument.createMany({
    data: [
      { petId: p.max.id, type: "VACUNACION", name: "Carnet Max", filePath: "docs/max-carnet.pdf" },
      {
        petId: p.coco.id,
        type: "IDENTIFICACION",
        name: "Registro Coco",
        filePath: "docs/coco-registro.pdf",
      },
    ],
  });

  const createReservation = async (data: {
    businessUnit: string;
    clientId: string;
    petIds: string[];
    service: string;
    status: string;
    dayOffset: number;
    inHour: number;
    outHour: number;
    roomId: string;
    basePrice: number;
    vatPercent: number;
    paymentMethod: string;
    concept: string;
    needsTransport?: boolean;
    transportType?: string;
    notes?: string;
    recurringPlanId?: string;
  }) => {
    const checkIn = withTime(daysFromNow(data.dayOffset), data.inHour);
    const checkOut = withTime(daysFromNow(data.dayOffset), data.outHour);
    const totals = money(data.basePrice, data.vatPercent);

    const reservation = await prisma.reservation.create({
      data: {
        daycareId: PETHIJOS_ID,
        businessUnit: data.businessUnit,
        clientId: data.clientId,
        roomId: data.roomId,
        recurringPlanId: data.recurringPlanId,
        service: data.service,
        status: data.status,
        checkIn,
        checkOut,
        basePrice: data.basePrice,
        vatPercent: data.vatPercent,
        vatAmount: totals.vatAmount,
        totalAmount: totals.total,
        pendingAmount: totals.pendingAmount,
        paymentMethod: data.paymentMethod,
        concept: data.concept,
        needsTransport: data.needsTransport ?? false,
        transportType: data.transportType,
        notes: data.notes,
      },
    });

    await prisma.reservationPet.createMany({
      data: data.petIds.map((petId) => ({ reservationId: reservation.id, petId })),
    });

    return reservation;
  };

  const kdDaycare = getRoom(BU.DAYCARE, "daycare");
  // The second daycare room, by name: getRoom returns the first match, and one seeded
  // occurrence below has to live somewhere other than the room its plan generates into.
  const kdPuppies = rooms.find((r) => r.name === "Zona Cachorros Guardería")!;
  const kdGroom = getRoom(BU.DAYCARE, "grooming");
  const kdTransport = getRoom(BU.DAYCARE, "transport");
  const phDaycare = getRoom(BU.GROOMING, "daycare");
  const phGroom = getRoom(BU.GROOMING, "grooming");

  const recurringPlans = await prisma.recurringPlan.createManyAndReturn({
    data: tenant([
      {
        businessUnit: BU.DAYCARE,
        clientId: c.maria.id,
        startDate: daysFromNow(-14),
        endDate: daysFromNow(45),
        startTime: "08:30",
        endTime: "17:30",
        daysOfWeek: "1,3,5",
        petIds: `${p.max.id},${p.nina.id}`,
        service: SERVICES.DAYCARE,
        roomId: kdDaycare.id,
        notes: "Plan entre semana KD",
        isActive: true,
      },
      {
        businessUnit: BU.GROOMING,
        clientId: c.santiago.id,
        startDate: daysFromNow(-7),
        endDate: daysFromNow(30),
        startTime: "09:00",
        endTime: "16:00",
        daysOfWeek: "2,4",
        petIds: `${p.rocky.id}`,
        service: SERVICES.DAYCARE,
        roomId: phDaycare.id,
        notes: "Plan parcial PH",
        isActive: true,
      },
      {
        businessUnit: BU.GROOMING,
        clientId: c.valentina.id,
        startDate: daysFromNow(-40),
        endDate: daysFromNow(-3),
        startTime: "10:00",
        endTime: "14:00",
        daysOfWeek: "6",
        petIds: `${p.coco.id}`,
        service: SERVICES.GROOMING_CANINE,
        roomId: phGroom.id,
        notes: "Plan inactivo histórico",
        isActive: false,
      },
    ]),
  });

  const rpKd = recurringPlans[0];
  const rpPh = recurringPlans[1];

  const reservations = await Promise.all([
    createReservation({
      businessUnit: BU.DAYCARE,
      clientId: c.maria.id,
      petIds: [p.max.id, p.nina.id],
      service: SERVICES.DAYCARE,
      status: RES_STATUS.CONFIRMED,
      dayOffset: 1,
      inHour: 8,
      outHour: 18,
      // Not kdDaycare: rpKd generates into that room on Mon/Wed/Fri from 08:30 to 17:30, and
      // this occurrence runs 08:00-18:00. The times do not match, so the generator's
      // (recurringPlanId, checkIn) existence check does not recognise it -- it then finds the
      // room occupied and reports a scheduling conflict. dayOffset is a fixed number of days
      // while the plan fires on fixed weekdays, so that happened on three days out of seven,
      // which made test:scheduler fail depending on the date it ran. Standing this occurrence
      // in the puppy zone keeps the fixture (a plan-linked reservation exists) and leaves the
      // plan's own room free.
      roomId: kdPuppies.id,
      basePrice: 40,
      vatPercent: 15,
      paymentMethod: "EFECTIVO",
      concept: "Guardería doble - María",
      recurringPlanId: rpKd.id,
    }),
    createReservation({
      businessUnit: BU.DAYCARE,
      clientId: c.juan.id,
      petIds: [p.buddy.id],
      service: SERVICES.DAYCARE,
      status: RES_STATUS.PENDING,
      dayOffset: 2,
      inHour: 9,
      outHour: 17,
      roomId: kdDaycare.id,
      basePrice: 25,
      vatPercent: 15,
      paymentMethod: "TRANSFERENCIA",
      concept: "Guardería - Buddy",
    }),
    // Peluquería felina cancelada (Luna es gata)
    createReservation({
      businessUnit: BU.DAYCARE,
      clientId: c.camila.id,
      petIds: [p.luna.id],
      service: SERVICES.GROOMING_FELINE,
      status: RES_STATUS.CANCELED,
      dayOffset: -1,
      inHour: 11,
      outHour: 13,
      roomId: kdGroom.id,
      basePrice: 18,
      vatPercent: 0,
      paymentMethod: "EFECTIVO",
      concept: "Peluquería felina - Luna",
      notes: "Cancelada por cliente",
    }),
    createReservation({
      businessUnit: BU.DAYCARE,
      clientId: c.juan.id,
      petIds: [p.buddy.id],
      service: SERVICES.TRANSPORT,
      status: RES_STATUS.ACTIVE,
      dayOffset: 0,
      inHour: 7,
      outHour: 10,
      roomId: kdTransport.id,
      basePrice: 15,
      vatPercent: 0,
      paymentMethod: "EFECTIVO",
      concept: "Transporte ida - Buddy",
      needsTransport: true,
      transportType: "pickup",
    }),
    createReservation({
      businessUnit: BU.GROOMING,
      clientId: c.santiago.id,
      petIds: [p.rocky.id],
      service: SERVICES.DAYCARE,
      status: RES_STATUS.CONFIRMED,
      dayOffset: 3,
      inHour: 8,
      outHour: 16,
      roomId: phDaycare.id,
      basePrice: 30,
      vatPercent: 15,
      paymentMethod: "TARJETA",
      concept: "Guardería - Rocky",
      recurringPlanId: rpPh.id,
    }),
    // Peluquería canina en proceso (Coco es perro) – status grooming para poblar el Kanban
    createReservation({
      businessUnit: BU.GROOMING,
      clientId: c.valentina.id,
      petIds: [p.coco.id],
      service: SERVICES.GROOMING_CANINE,
      status: "EN_PROCESO",
      dayOffset: 0,
      inHour: 10,
      outHour: 12,
      roomId: phGroom.id,
      basePrice: 22,
      vatPercent: 15,
      paymentMethod: "EFECTIVO",
      concept: "Baño y corte - Coco",
    }),
    createReservation({
      businessUnit: BU.GROOMING,
      clientId: c.andres.id,
      petIds: [p.kiara.id],
      service: SERVICES.OTHER,
      status: RES_STATUS.PENDING,
      dayOffset: -2,
      inHour: 9,
      outHour: 11,
      roomId: phDaycare.id,
      basePrice: 12,
      vatPercent: 0,
      paymentMethod: "TRANSFERENCIA",
      concept: "Sesión evaluación - Kiara",
    }),
    // Peluquería felina cancelada (Mora es gata)
    createReservation({
      businessUnit: BU.GROOMING,
      clientId: c.santiago.id,
      petIds: [p.mora.id],
      service: SERVICES.GROOMING_FELINE,
      status: RES_STATUS.CANCELED,
      dayOffset: 4,
      inHour: 13,
      outHour: 15,
      roomId: phGroom.id,
      basePrice: 19,
      vatPercent: 15,
      paymentMethod: "EFECTIVO",
      concept: "Peluquería felina - Mora",
    }),
  ]);

  const [kdFutureMulti, , kdCanceledPast, kdActiveToday, phFuture, phActiveToday, phPastPending] =
    reservations;

  const adminKd = await prisma.user.findUniqueOrThrow({
    where: { daycareId_username: { daycareId: PETHIJOS_ID, username: "kinderdog_admin" } },
  });
  const adminPh = await prisma.user.findUniqueOrThrow({
    where: { daycareId_username: { daycareId: PETHIJOS_ID, username: "pethijos_admin" } },
  });

  await prisma.checkInOut.createMany({
    data: tenant([
      {
        businessUnit: BU.DAYCARE,
        petId: p.buddy.id,
        clientId: c.juan.id,
        roomId: kdTransport.id,
        reservationId: kdActiveToday.id,
        checkInTime: withTime(daysFromNow(0), 7, 10),
        isActive: true,
        performedByUserId: adminKd.id,
        notes: "Recogido en domicilio",
      },
      {
        businessUnit: BU.GROOMING,
        petId: p.coco.id,
        clientId: c.valentina.id,
        roomId: phGroom.id,
        reservationId: phActiveToday.id,
        checkInTime: withTime(daysFromNow(0), 10, 5),
        isActive: true,
        performedByUserId: adminPh.id,
      },
      {
        businessUnit: BU.DAYCARE,
        petId: p.luna.id,
        clientId: c.camila.id,
        roomId: kdGroom.id,
        reservationId: kdCanceledPast.id,
        checkInTime: withTime(daysFromNow(-3), 9, 0),
        checkOutTime: withTime(daysFromNow(-3), 12, 0),
        isActive: false,
        performedByUserId: adminKd.id,
      },
      {
        businessUnit: BU.GROOMING,
        petId: p.kiara.id,
        clientId: c.andres.id,
        roomId: phDaycare.id,
        reservationId: phPastPending.id,
        checkInTime: withTime(daysFromNow(-2), 9, 5),
        checkOutTime: withTime(daysFromNow(-2), 10, 45),
        isActive: false,
        performedByUserId: adminPh.id,
      },
    ]),
  });

  const incomes = await prisma.income.createMany({
    data: tenant([
      {
        businessUnit: BU.DAYCARE,
        reservationId: kdFutureMulti.id,
        type: "RESERVA",
        concept: "Abono guardería María",
        amount: 20,
        vatPercent: 0,
        vatAmount: 0,
        total: 20,
        paymentMethod: "TRANSFERENCIA",
        invoiceStatus: "EMITIDA",
        date: daysFromNow(-1),
      },
      {
        businessUnit: BU.DAYCARE,
        reservationId: kdActiveToday.id,
        type: "RESERVA",
        concept: "Servicio transporte Buddy",
        amount: 15,
        vatPercent: 0,
        vatAmount: 0,
        total: 15,
        paymentMethod: "EFECTIVO",
        invoiceStatus: "PENDIENTE",
        date: daysFromNow(0),
      },
      {
        businessUnit: BU.GROOMING,
        reservationId: phFuture.id,
        type: "RESERVA",
        concept: "Reserva Rocky con IVA",
        amount: 30,
        vatPercent: 15,
        vatAmount: 4.5,
        total: 34.5,
        paymentMethod: "TARJETA",
        invoiceStatus: "EMITIDA",
        date: daysFromNow(0),
      },
      {
        businessUnit: BU.GROOMING,
        type: "OTRO",
        concept: "Venta de snacks",
        amount: 8,
        vatPercent: 0,
        vatAmount: 0,
        total: 8,
        paymentMethod: "EFECTIVO",
        invoiceStatus: "PENDIENTE",
        date: daysFromNow(-4),
      },
    ]),
  });

  const allProviders = await prisma.provider.findMany({ orderBy: { createdAt: "asc" } });
  const [prov1, prov2, prov3] = allProviders;

  const payable1M = money(120, 15, 0);
  const payable2M = money(500, 0, 250);
  const payable3M = money(90, 15, 103.5);

  const payable1 = await prisma.payable.create({
    data: {
      daycareId: PETHIJOS_ID,
      businessUnit: BU.DAYCARE,
      providerId: prov1?.id,
      type: "GASTO",
      category: "ALIMENTOS",
      description: "Compra concentrado semanal",
      invoiceNumber: "KD-1001",
      invoiceDate: daysFromNow(-5),
      subtotal: payable1M.subtotal,
      vatPercent: payable1M.vatPercent,
      vatAmount: payable1M.vatAmount,
      total: payable1M.total,
      paid: payable1M.paid,
      balance: payable1M.balance,
      status: PAY_STATUS.PENDING,
      dueDate: daysFromNow(5),
    },
  });

  const payable2 = await prisma.payable.create({
    data: {
      daycareId: PETHIJOS_ID,
      businessUnit: BU.GROOMING,
      providerId: prov2?.id,
      type: "GASTO",
      category: "SERVICIOS",
      description: "Mantenimiento equipos grooming",
      invoiceNumber: "PH-2003",
      invoiceDate: daysFromNow(-10),
      subtotal: payable2M.subtotal,
      vatPercent: payable2M.vatPercent,
      vatAmount: payable2M.vatAmount,
      total: payable2M.total,
      paid: payable2M.paid,
      balance: payable2M.balance,
      status: PAY_STATUS.PARTIAL,
      dueDate: daysFromNow(10),
      nextPayment: daysFromNow(3),
    },
  });

  const payable3 = await prisma.payable.create({
    data: {
      daycareId: PETHIJOS_ID,
      businessUnit: BU.DAYCARE,
      providerId: prov3?.id,
      type: "GASTO",
      category: "HIGIENE",
      description: "Insumos limpieza mensual",
      invoiceNumber: "KD-1012",
      invoiceDate: daysFromNow(-15),
      subtotal: payable3M.subtotal,
      vatPercent: payable3M.vatPercent,
      vatAmount: payable3M.vatAmount,
      total: payable3M.total,
      paid: payable3M.paid,
      balance: payable3M.balance,
      status: PAY_STATUS.PAID,
      dueDate: daysFromNow(-1),
    },
  });

  await prisma.payment.createMany({
    data: [
      {
        payableId: payable2.id,
        amount: 150,
        date: daysFromNow(-6),
        method: "TRANSFERENCIA",
        reference: "TRX-9001",
        notes: "Primer abono",
      },
      {
        payableId: payable2.id,
        amount: 100,
        date: daysFromNow(-2),
        method: "EFECTIVO",
        notes: "Segundo abono",
      },
      {
        payableId: payable3.id,
        amount: 50,
        date: daysFromNow(-14),
        method: "TARJETA",
        notes: "Pago parcial inicial",
      },
      {
        payableId: payable3.id,
        amount: 53.5,
        date: daysFromNow(-7),
        method: "TRANSFERENCIA",
        notes: "Pago final",
      },
    ],
  });

  const inventoryItems = await prisma.inventoryItem.createManyAndReturn({
    data: tenant([
      {
        businessUnit: BU.DAYCARE,
        name: "Concentrado Premium",
        category: "alimentos",
        unit: "kg",
        minStock: 8,
        currentStock: 25,
        unitCost: 4.5,
      },
      {
        businessUnit: BU.DAYCARE,
        name: "Shampoo Canino",
        category: "higiene",
        unit: "lt",
        minStock: 3,
        currentStock: 8,
        unitCost: 8,
      },
      {
        businessUnit: BU.GROOMING,
        name: "Tijeras de corte",
        category: "herramientas",
        unit: "unidad",
        minStock: 2,
        currentStock: 5,
        unitCost: 35,
      },
      {
        businessUnit: BU.GROOMING,
        name: "Arena sanitaria",
        category: "higiene",
        unit: "kg",
        minStock: 4,
        currentStock: 12,
        unitCost: 2.5,
      },
    ]),
  });

  const itemByName = Object.fromEntries(inventoryItems.map((i) => [i.name, i])) as Record<
    string,
    (typeof inventoryItems)[number]
  >;

  await prisma.inventoryMovement.createMany({
    data: [
      {
        itemId: itemByName["Concentrado Premium"].id,
        type: "IN",
        quantity: 10,
        cost: 45,
        reason: "Compra proveedor",
        date: daysFromNow(-7),
      },
      {
        itemId: itemByName["Concentrado Premium"].id,
        type: "OUT",
        quantity: 3,
        reason: "Consumo diario",
        date: daysFromNow(-1),
      },
      {
        itemId: itemByName["Shampoo Canino"].id,
        type: "OUT",
        quantity: 1,
        reason: "Servicio grooming",
        date: daysFromNow(0),
      },
      {
        itemId: itemByName["Tijeras de corte"].id,
        type: "IN",
        quantity: 2,
        cost: 70,
        reason: "Reposición",
        date: daysFromNow(-12),
      },
      {
        itemId: itemByName["Arena sanitaria"].id,
        type: "OUT",
        quantity: 2,
        reason: "Limpieza diaria",
        date: daysFromNow(-2),
      },
    ],
  });

  await prisma.inventoryItem.update({
    where: { id: itemByName["Concentrado Premium"].id },
    data: { currentStock: 32 },
  });
  await prisma.inventoryItem.update({
    where: { id: itemByName["Shampoo Canino"].id },
    data: { currentStock: 7 },
  });
  await prisma.inventoryItem.update({
    where: { id: itemByName["Tijeras de corte"].id },
    data: { currentStock: 7 },
  });
  await prisma.inventoryItem.update({
    where: { id: itemByName["Arena sanitaria"].id },
    data: { currentStock: 10 },
  });

  await prisma.alert.createMany({
    data: tenant([
      {
        businessUnit: BU.DAYCARE,
        petId: p.nina.id,
        type: "SALUD",
        severity: "ALTA",
        title: "Alergia alimentaria",
        description: "Evitar snacks con pollo.",
        isResolved: false,
      },
      {
        businessUnit: BU.GROOMING,
        petId: p.rocky.id,
        type: "COMPORTAMIENTO",
        severity: "MEDIA",
        title: "Ansiedad en secado",
        description: "Usar secado gradual.",
        isResolved: true,
        resolvedAt: daysFromNow(-3),
      },
    ]),
  });

  await prisma.contract.createMany({
    data: tenant([
      {
        businessUnit: BU.DAYCARE,
        clientId: c.maria.id,
        petId: p.max.id,
        name: "Contrato guardería anual Max",
        status: "ACTIVO",
        startDate: daysFromNow(-60),
        endDate: daysFromNow(305),
      },
      {
        businessUnit: BU.GROOMING,
        clientId: c.santiago.id,
        petId: p.rocky.id,
        name: "Consentimiento grooming Rocky",
        status: "PENDIENTE_FIRMA",
        startDate: daysFromNow(-1),
      },
      {
        businessUnit: BU.GROOMING,
        clientId: c.valentina.id,
        petId: p.coco.id,
        name: "Contrato transporte Coco",
        status: "FINALIZADO",
        startDate: daysFromNow(-120),
        endDate: daysFromNow(-5),
      },
    ]),
  });

  const [
    usersCount,
    buCount,
    roomCount,
    providerCount,
    vetCount,
    clientCount,
    petCount,
    reservationCount,
    checkCount,
    recurringCount,
    incomeCount,
    payableCount,
    paymentCount,
    inventoryCount,
    movementCount,
    alertCount,
    contractCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.businessUnitSetting.count(),
    prisma.room.count(),
    prisma.provider.count(),
    prisma.veterinarian.count(),
    prisma.client.count(),
    prisma.pet.count(),
    prisma.reservation.count(),
    prisma.checkInOut.count(),
    prisma.recurringPlan.count(),
    prisma.income.count(),
    prisma.payable.count(),
    prisma.payment.count(),
    prisma.inventoryItem.count(),
    prisma.inventoryMovement.count(),
    prisma.alert.count(),
    prisma.contract.count(),
  ]);

  console.log("Seed completed successfully.");
  console.log({
    users: usersCount,
    businessUnitSettings: buCount,
    rooms: roomCount,
    providers: providerCount,
    veterinarians: vetCount,
    clients: clientCount,
    pets: petCount,
    reservations: reservationCount,
    checkInOuts: checkCount,
    recurringPlans: recurringCount,
    incomes: incomeCount,
    payables: payableCount,
    payments: paymentCount,
    inventoryItems: inventoryCount,
    inventoryMovements: movementCount,
    alerts: alertCount,
    contracts: contractCount,
  });

  await ensureVeterinaryClinic();

  void users;
  void buSettings;
  void providers;
  void veterinarians;
  void incomes;
  void payable1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
