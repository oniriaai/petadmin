import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { localDatePartsInTimezone } from "../src/core/tenancy/local-time";
import { deleteDaycare } from "../src/modules/platform-admin/offboarding.service";
import { TOGGLEABLE_PRODUCT_MODULES } from "../src/platform/product-modules";
import { seedShowcaseTenant } from "./seed-showcase";

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

/**
 * Whether to rebuild the main demo tenant once its data is a day old.
 *
 * Everything in the demo is dated relative to the day it was seeded, so a hosted demo left
 * alone shows an empty "today" from the second day on, and keeps whatever a visitor changed.
 * With `SEED_DEMO_RESET=daily` the tenant is deleted and seeded again the first time the seed
 * runs on a later local day.
 *
 * NEVER SET THIS ON A DATABASE THAT HOLDS A CUSTOMER'S DATA. Some installations run their real
 * business under the `daycare_pethijos` id this seed uses (see the comment on
 * 20260905000000_drop_unused_backfill_tenant), and this deletes every row that tenant owns. It
 * is ignored unless SEED_DEMO_DATA is also on.
 */
const SEED_DEMO_RESET = process.env.SEED_DEMO_RESET?.toLowerCase() === "daily";

const MAIN_TIMEZONE = "America/Guayaquil";

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

/** The two tenants: the showcase business, plus a restricted one for isolation tests. */
async function ensureDaycares() {
  await prisma.daycare.upsert({
    where: { id: PETHIJOS_ID },
    update: {},
    create: {
      id: PETHIJOS_ID,
      slug: "pethijos",
      name: "Huellas Felices",
      legalName: "Huellas Felices Centro Canino S.A.S.",
      timezone: MAIN_TIMEZONE,
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
    create: { daycareId: PETHIJOS_ID, businessUnit: BU.VETERINARY, timezone: MAIN_TIMEZONE },
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

/**
 * Deletes the main demo tenant when it was seeded on an earlier local day, so the caller seeds
 * it afresh. Stored files are left alone: the bucket may be shared with something that matters,
 * and a demo visitor's upload is not worth the risk of a prefix deletion in the wrong place.
 */
async function resetStaleDemoTenant(): Promise<void> {
  const daycare = await prisma.daycare.findUnique({
    where: { id: PETHIJOS_ID },
    select: { slug: true, createdAt: true },
  });
  if (!daycare) return;

  const localDay = (date: Date) => {
    const { year, month, day } = localDatePartsInTimezone(date, MAIN_TIMEZONE);
    return year * 10000 + month * 100 + day;
  };
  if (localDay(daycare.createdAt) >= localDay(new Date())) return;

  // Deleting requires a deactivated tenant: the same two-step the console enforces.
  await prisma.daycare.update({ where: { id: PETHIJOS_ID }, data: { isActive: false } });
  const summary = await deleteDaycare(PETHIJOS_ID, daycare.slug, { purgeStorage: false });
  const rows = Object.values(summary.rows).reduce((sum, count) => sum + count, 0);
  console.log(
    `[seed] SEED_DEMO_RESET: datos de demostración de un día anterior eliminados (${rows} filas)`,
  );
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

  if (SEED_DEMO_RESET) await resetStaleDemoTenant();

  await ensureDaycares();

  const existing = await prisma.user.count({ where: { daycareId: PETHIJOS_ID } });
  if (existing > 0) {
    // A database seeded before the clinic existed still gets it.
    await ensureVeterinaryClinic();
    console.log("DB already seeded, skipping.");
    return;
  }

  const summary = await seedShowcaseTenant(prisma, {
    daycareId: PETHIJOS_ID,
    timezone: MAIN_TIMEZONE,
    ensureClinic: ensureVeterinaryClinic,
  });

  console.log("Seed completed successfully.");
  console.log(summary);
}

// Exits explicitly. The reset path loads the application's own Prisma client and storage
// client, and a handle left open by either would keep this process alive -- which, in a start
// command of the form `seed && server`, means the server never starts.
main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
