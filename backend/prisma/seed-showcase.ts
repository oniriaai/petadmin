import type { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { localDatePartsInTimezone, localDateTimeToUtc } from "../src/core/tenancy/local-time";
import { DEFAULT_STAFF_PERMISSIONS } from "../src/core/tenancy/permissions";
import { DEFAULT_GROOMING_SERVICES } from "../src/modules/peluqueria";
import { hashDemoPassword } from "./demo-accounts";

/**
 * The main demo tenant's data: a small Quito business running all three units, with about a
 * month of history behind a busy "today".
 *
 * It doubles as the e2e fixture, so a few things here are load-bearing rather than cosmetic:
 *   - the usernames and passwords, which the suites log in with;
 *   - every reservation dated today or later stays out of a room a recurring plan generates
 *     into. The generator treats any overlapping reservation in the plan's room as a conflict
 *     and reports it as a failure, which is what `test:scheduler` asserts never happens. A
 *     plan's own occurrences are the exception: seeded with the plan's exact times, the
 *     generator recognises them by (recurringPlanId, checkIn) and skips;
 *   - the first daycare room by name ("Adaptación") and "Consultorio 1" carry nothing dated
 *     today or later, and Dra. Camila Rivas has no open visit, because `test:checkin` and
 *     `test:veterinaria` book the first room and the first staff veterinarian at "now".
 *
 * Every date is relative to the tenant's local today, not the server's: the host runs in UTC.
 */

const BU = { DAYCARE: "DAYCARE", GROOMING: "GROOMING", VETERINARY: "VETERINARY" } as const;
type Unit = (typeof BU)[keyof typeof BU];

const VAT = 15;

/** Booking and attendance never happen on a Sunday: the business is closed. */
const SUNDAY = 7;
const SATURDAY = 6;
const HISTORY_DAYS = 28;

const round2 = (value: number) => Number(value.toFixed(2));
const id = () => randomUUID();

/** A small deterministic generator, so two seeds of the same day produce the same history. */
function createRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
    sample: <T>(items: readonly T[], count: number): T[] => {
      const pool = [...items];
      const taken: T[] = [];
      while (taken.length < count && pool.length > 0) {
        taken.push(pool.splice(Math.floor(next() * pool.length), 1)[0]);
      }
      return taken;
    },
  };
}

type SeedPetPhoto = { petName: string; publicUrl: string };

/**
 * The photo mapping sits next to this file in the source tree. The production image runs the
 * compiled seed from `dist-seed/prisma/`, where the JSON is not emitted, so fall back to the
 * `prisma/` directory the image copies in.
 */
function loadPetPhotos(): Map<string, string> {
  const candidates = [
    path.resolve(__dirname, "./seed-pet-photos.json"),
    path.resolve(process.cwd(), "prisma/seed-pet-photos.json"),
  ];
  const file = candidates.find((candidate) => existsSync(candidate));
  if (!file) return new Map();
  const entries = JSON.parse(readFileSync(file, "utf8")) as SeedPetPhoto[];
  return new Map(entries.map((entry) => [entry.petName.toLowerCase(), entry.publicUrl]));
}

const CLIENTS = [
  ["María", "González", "1712304587", "0991234567", "La Carolina"],
  ["Juan", "Pérez", "1708845213", "0987654321", "Cumbayá"],
  ["Camila", "Rosero", "1715567802", "0984412230", "La Floresta"],
  ["Santiago", "Mejía", "1719023344", "0998830011", "González Suárez"],
  ["Valentina", "Ruiz", "1710456698", "0995567123", "El Batán"],
  ["Andrés", "Salas", "1713378851", "0983345566", "Iñaquito"],
  ["Gabriela", "Cevallos", "1716690024", "0992210457", "Tumbaco"],
  ["Diego", "Almeida", "1709912276", "0986674410", "Quito Tenis"],
  ["Paola", "Villacís", "1714485530", "0997781203", "El Inca"],
  ["Esteban", "Carrillo", "1711127769", "0981156672", "La Mariscal"],
  ["Carolina", "Espinosa", "1718834415", "0993349985", "Bellavista"],
  ["Fernanda", "Jácome", "1707760038", "0985523301", "Nayón"],
  ["Ricardo", "Benítez", "1712291147", "0996618874", "Monteserrín"],
  ["Isabel", "Naranjo", "1715503926", "0982247759", "La Pradera"],
] as const;

interface PetSpec {
  name: string;
  owner: string;
  species: "dog" | "cat";
  breed: string;
  sex: "M" | "F";
  color: string;
  weight: number;
  ageMonths: number;
  neutered: boolean;
  allergies?: string;
  chronic?: string;
  notes?: string;
}

const PETS: PetSpec[] = [
  {
    name: "Max",
    owner: "González",
    species: "dog",
    breed: "Labrador",
    sex: "M",
    color: "Negro",
    weight: 29,
    ageMonths: 52,
    neutered: true,
  },
  {
    name: "Nina",
    owner: "González",
    species: "dog",
    breed: "Beagle",
    sex: "F",
    color: "Tricolor",
    weight: 11.5,
    ageMonths: 30,
    neutered: false,
    allergies: "Pollo",
  },
  {
    name: "Buddy",
    owner: "Pérez",
    species: "dog",
    breed: "Golden Retriever",
    sex: "M",
    color: "Dorado",
    weight: 31,
    ageMonths: 64,
    neutered: true,
  },
  {
    name: "Luna",
    owner: "Rosero",
    species: "cat",
    breed: "Mestizo",
    sex: "F",
    color: "Blanco",
    weight: 4.2,
    ageMonths: 40,
    neutered: true,
  },
  {
    name: "Rocky",
    owner: "Mejía",
    species: "dog",
    breed: "Border Collie",
    sex: "M",
    color: "Negro y blanco",
    weight: 19.5,
    ageMonths: 36,
    neutered: true,
    notes: "Se pone nervioso con el secador; usar secado gradual.",
  },
  {
    name: "Mora",
    owner: "Mejía",
    species: "cat",
    breed: "Siamés",
    sex: "F",
    color: "Crema",
    weight: 3.8,
    ageMonths: 58,
    neutered: true,
  },
  {
    name: "Coco",
    owner: "Ruiz",
    species: "dog",
    breed: "Poodle",
    sex: "M",
    color: "Blanco",
    weight: 7.4,
    ageMonths: 44,
    neutered: false,
  },
  {
    name: "Kiara",
    owner: "Salas",
    species: "dog",
    breed: "Pastor Alemán",
    sex: "F",
    color: "Café y negro",
    weight: 27,
    ageMonths: 70,
    neutered: true,
  },
  {
    name: "Toby",
    owner: "Cevallos",
    species: "dog",
    breed: "Schnauzer Miniatura",
    sex: "M",
    color: "Sal y pimienta",
    weight: 4.6,
    ageMonths: 5,
    neutered: false,
    notes: "Cachorro en proceso de socialización.",
  },
  {
    name: "Simón",
    owner: "Almeida",
    species: "dog",
    breed: "Bulldog Francés",
    sex: "M",
    color: "Atigrado",
    weight: 12.3,
    ageMonths: 27,
    neutered: true,
    notes: "Braquicéfalo: evitar ejercicio intenso al mediodía.",
  },
  {
    name: "Lola",
    owner: "Almeida",
    species: "dog",
    breed: "Shih Tzu",
    sex: "F",
    color: "Blanco y dorado",
    weight: 6.1,
    ageMonths: 20,
    neutered: true,
  },
  {
    name: "Bruno",
    owner: "Villacís",
    species: "dog",
    breed: "Bóxer",
    sex: "M",
    color: "Leonado",
    weight: 30.5,
    ageMonths: 48,
    neutered: true,
  },
  {
    name: "Canela",
    owner: "Carrillo",
    species: "dog",
    breed: "Cocker Spaniel",
    sex: "F",
    color: "Canela",
    weight: 13.2,
    ageMonths: 62,
    neutered: true,
    chronic: "Otitis externa recurrente",
  },
  {
    name: "Thor",
    owner: "Espinosa",
    species: "dog",
    breed: "Husky Siberiano",
    sex: "M",
    color: "Gris y blanco",
    weight: 24.8,
    ageMonths: 33,
    neutered: false,
  },
  {
    name: "Mía",
    owner: "Jácome",
    species: "dog",
    breed: "Yorkshire Terrier",
    sex: "F",
    color: "Acero y fuego",
    weight: 3.1,
    ageMonths: 75,
    neutered: true,
  },
  {
    name: "Milo",
    owner: "Jácome",
    species: "cat",
    breed: "Común Europeo",
    sex: "M",
    color: "Atigrado gris",
    weight: 5.4,
    ageMonths: 46,
    neutered: true,
  },
  {
    name: "Zeus",
    owner: "Benítez",
    species: "dog",
    breed: "Rottweiler",
    sex: "M",
    color: "Negro y fuego",
    weight: 42,
    ageMonths: 96,
    neutered: true,
    chronic: "Displasia de cadera leve",
    notes: "Dieta hipoalergénica que trae el tutor.",
  },
  {
    name: "Frida",
    owner: "Naranjo",
    species: "dog",
    breed: "Mestizo",
    sex: "F",
    color: "Café claro",
    weight: 16.4,
    ageMonths: 38,
    neutered: true,
  },
  {
    name: "Pelusa",
    owner: "Naranjo",
    species: "cat",
    breed: "Persa",
    sex: "F",
    color: "Gris humo",
    weight: 4.7,
    ageMonths: 84,
    neutered: true,
  },
  {
    name: "Oreo",
    owner: "Naranjo",
    species: "dog",
    breed: "French Poodle",
    sex: "M",
    color: "Negro y blanco",
    weight: 8.2,
    ageMonths: 18,
    neutered: false,
  },
];

interface ClinicCase {
  type: "CONSULTA" | "CONTROL" | "VACUNACION";
  reason: string;
  anamnesis: string;
  physicalExam: string;
  assessment: string;
  plan: string;
  diagnosis: { description: string; kind: "PRESUNTIVO" | "DEFINITIVO"; chronic?: boolean };
  services: string[];
  vaccine?: string;
  preventive?: { kind: string; product: string; dose: string; everyDays: number };
  prescription?: { drug: string; dose: string; frequency: string; days: number; route: string };
}

/** Routine caseload the history draws from. Service names match the seeded clinic catalogue. */
const CLINIC_CASES: ClinicCase[] = [
  {
    type: "CONSULTA",
    reason: "Vómito y decaimiento desde ayer",
    anamnesis: "Tres episodios de vómito en 24 h. Come poco, toma agua. Sin diarrea.",
    physicalExam: "Alerta, hidratación 5 %. Abdomen blando, leve molestia epigástrica.",
    assessment: "Cuadro compatible con gastroenteritis aguda no complicada.",
    plan: "Dieta blanda 5 días, antiemético y control si persiste el vómito.",
    diagnosis: { description: "Gastroenteritis aguda", kind: "PRESUNTIVO" },
    services: ["Consulta general"],
    prescription: {
      drug: "Maropitant",
      dose: "1 mg/kg",
      frequency: "Cada 24 h",
      days: 3,
      route: "Oral",
    },
  },
  {
    type: "CONSULTA",
    reason: "Se rasca mucho y tiene la piel enrojecida",
    anamnesis: "Prurito de dos semanas, peor por la noche. Sin cambios de dieta recientes.",
    physicalExam: "Eritema en axilas e ingles, sin pulgas visibles. Otoscopia normal.",
    assessment: "Dermatitis alérgica; se descarta sarna por raspado negativo.",
    plan: "Baño medicado semanal, antihistamínico y revisión en 15 días.",
    diagnosis: { description: "Dermatitis alérgica", kind: "DEFINITIVO", chronic: true },
    services: ["Consulta general"],
    prescription: {
      drug: "Oclacitinib",
      dose: "0,5 mg/kg",
      frequency: "Cada 12 h",
      days: 14,
      route: "Oral",
    },
  },
  {
    type: "CONSULTA",
    reason: "Sacude la cabeza y el oído huele mal",
    anamnesis: "Molestia en oído derecho desde hace cuatro días, tras un baño.",
    physicalExam: "Conducto auditivo derecho eritematoso con cerumen oscuro abundante.",
    assessment: "Otitis externa unilateral.",
    plan: "Limpieza ótica en consulta, gotas óticas 10 días y control.",
    diagnosis: { description: "Otitis externa", kind: "DEFINITIVO" },
    services: ["Consulta general"],
    prescription: {
      drug: "Gotas óticas (gentamicina + betametasona)",
      dose: "5 gotas",
      frequency: "Cada 12 h",
      days: 10,
      route: "Ótica",
    },
  },
  {
    type: "CONSULTA",
    reason: "Cojea de la pata trasera",
    anamnesis: "Cojera aguda tras jugar en el parque. Apoya con cuidado.",
    physicalExam: "Dolor a la extensión de la rodilla izquierda, sin inestabilidad.",
    assessment: "Esguince leve; radiografía sin lesión ósea.",
    plan: "Reposo relativo 10 días, antiinflamatorio y control.",
    diagnosis: { description: "Esguince de rodilla", kind: "DEFINITIVO" },
    services: ["Consulta general", "Radiografía"],
    prescription: {
      drug: "Meloxicam",
      dose: "0,1 mg/kg",
      frequency: "Cada 24 h",
      days: 5,
      route: "Oral",
    },
  },
  {
    type: "CONTROL",
    reason: "Control posterior al tratamiento",
    anamnesis: "Terminó la medicación sin efectos adversos. Come y juega con normalidad.",
    physicalExam: "Sin hallazgos. Constantes dentro de rango.",
    assessment: "Evolución favorable.",
    plan: "Alta del cuadro. Próximo control con la vacunación anual.",
    diagnosis: { description: "Paciente recuperado", kind: "DEFINITIVO" },
    services: ["Control"],
  },
  {
    type: "VACUNACION",
    reason: "Refuerzo anual de vacunas",
    anamnesis: "Sin enfermedades recientes. Desparasitado hace tres meses.",
    physicalExam: "Apto para vacunar. Condición corporal adecuada.",
    assessment: "Paciente sano.",
    plan: "Se aplica refuerzo. Observar 24 h por posibles reacciones.",
    diagnosis: { description: "Paciente sano", kind: "DEFINITIVO" },
    services: ["Vacuna múltiple"],
    vaccine: "Múltiple",
  },
  {
    type: "VACUNACION",
    reason: "Vacuna antirrábica",
    anamnesis: "Sin antecedentes de reacciones vacunales.",
    physicalExam: "Apto para vacunar.",
    assessment: "Paciente sano.",
    plan: "Se aplica antirrábica. Próxima dosis en un año.",
    diagnosis: { description: "Paciente sano", kind: "DEFINITIVO" },
    services: ["Vacuna antirrábica"],
    vaccine: "Rabia",
  },
  {
    type: "CONSULTA",
    reason: "Revisión general y desparasitación",
    anamnesis: "Chequeo semestral. Convive con otra mascota.",
    physicalExam: "Sin hallazgos relevantes. Sarro leve.",
    assessment: "Paciente sano; se recomienda profilaxis dental en los próximos meses.",
    plan: "Desparasitación interna hoy. Repetir en tres meses.",
    diagnosis: { description: "Enfermedad periodontal leve", kind: "PRESUNTIVO" },
    services: ["Consulta general", "Desparasitación"],
    preventive: {
      kind: "DESPARASITACION_INTERNA",
      product: "Praziquantel + pirantel",
      dose: "1 tableta / 10 kg",
      everyDays: 90,
    },
  },
];

export interface ShowcaseOptions {
  daycareId: string;
  timezone: string;
  /** Provisions the clinic unit (rooms, staff vet, catalogue) once the core rows exist. */
  ensureClinic: () => Promise<void>;
}

export async function seedShowcaseTenant(prisma: PrismaClient, options: ShowcaseOptions) {
  const { daycareId, timezone } = options;
  const random = createRandom(20260903);
  const photos = loadPetPhotos();

  // ---- Local time -------------------------------------------------------------------------
  const now = new Date();
  const today = localDatePartsInTimezone(now, timezone);
  /** A wall-clock time on the tenant's day `offset` days from today. */
  const at = (offset: number, hour: number, minute = 0) =>
    localDateTimeToUtc({ ...today, day: today.day + offset, hour, minute }, timezone);
  /** A date-only value: local noon, so it shows as the same day in any nearby timezone. */
  const day = (offset: number) => at(offset, 12);
  /** 1 (Monday) to 7 (Sunday), the convention recurring plans use. */
  const weekday = (offset: number) => {
    const jsDay = new Date(Date.UTC(today.year, today.month - 1, today.day + offset)).getUTCDay();
    return jsDay === 0 ? 7 : jsDay;
  };
  const minutesAfter = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60000);

  // ---- Staff ------------------------------------------------------------------------------
  // The unit accounts start where any new staff user does, so the demo shows the boundary: the
  // admin grants finance, export and delete from Configuración.
  const STAFF_PERMISSIONS = [...DEFAULT_STAFF_PERMISSIONS];
  await prisma.user.createMany({
    data: [
      {
        username: "admin_global",
        passwordHash: hashDemoPassword("admin_global"),
        name: "Daniela Paredes",
        businessUnit: "GLOBAL",
        role: "admin",
      },
      {
        username: "guarderia_admin",
        passwordHash: hashDemoPassword("guarderia_admin"),
        name: "Andrés Molina",
        businessUnit: BU.DAYCARE,
        role: "daycare",
        permissions: STAFF_PERMISSIONS,
      },
      {
        username: "peluqueria_admin",
        passwordHash: hashDemoPassword("peluqueria_admin"),
        name: "Sofía Lara",
        businessUnit: BU.GROOMING,
        role: "grooming",
        permissions: STAFF_PERMISSIONS,
      },
    ].map((user) => ({ ...user, daycareId })),
  });
  const staffUsers = await prisma.user.findMany({ where: { daycareId } });
  const daycareLead = staffUsers.find((user) => user.username === "guarderia_admin")!;

  await prisma.businessUnitSetting.createMany({
    data: [BU.DAYCARE, BU.GROOMING].map((businessUnit) => ({ daycareId, businessUnit, timezone })),
  });

  // ---- Rooms ------------------------------------------------------------------------------
  const roomSpecs: Array<[string, Unit, number, string]> = [
    ["Adaptación", BU.DAYCARE, 6, "daycare"],
    ["Patio principal", BU.DAYCARE, 24, "daycare"],
    ["Patio norte", BU.DAYCARE, 12, "daycare"],
    ["Zona cachorros", BU.DAYCARE, 10, "daycare"],
    ["Recepción", BU.DAYCARE, 2, "reception"],
    ["Transporte", BU.DAYCARE, 4, "transport"],
    ["Recepción del salón", BU.GROOMING, 2, "reception"],
    ["Sala canina", BU.GROOMING, 4, "grooming"],
    ["Sala felina", BU.GROOMING, 2, "grooming"],
    ["Zona de espera", BU.GROOMING, 8, "daycare"],
  ];
  await prisma.room.createMany({
    data: roomSpecs.map(([name, businessUnit, capacity, type]) => ({
      daycareId,
      name,
      businessUnit,
      capacity,
      type,
    })),
  });

  // ---- Suppliers and referring vets -------------------------------------------------------
  await prisma.provider.createMany({
    data: [
      ["NutriPet Andina", "Alimentos", "022345600", true],
      ["VetSupply Ecuador", "Medicinas y vacunas", "022987411", true],
      ["LimpioMascotas", "Higiene y limpieza", "023301275", true],
      ["Estética Canina Import", "Insumos de peluquería", "022456098", true],
      ["Inmobiliaria Los Shyris", "Arriendo del local", "022260011", true],
      ["Transportes Mitad del Mundo", "Transporte", "022118834", false],
    ].map(([name, product, phone, isActive]) => ({
      daycareId,
      name: name as string,
      product: product as string,
      phone: phone as string,
      city: "Quito",
      province: "Pichincha",
      isActive: isActive as boolean,
    })),
  });
  const providers = await prisma.provider.findMany({ where: { daycareId } });
  const provider = (name: string) => providers.find((p) => p.name === name)!.id;

  await prisma.veterinarian.createMany({
    data: [
      ["Dra. Verónica Mena", "0995550001", "Clínica Animal Norte", true],
      ["Dr. Pablo Cedeño", "0995550002", "VetCenter Sur", true],
      ["Dra. Lina Forero", "0995550003", "Hospital Veterinario del Valle", false],
    ].map(([name, phone, clinic, isActive]) => ({
      daycareId,
      name: name as string,
      phone: phone as string,
      clinic: clinic as string,
      isExternal: true,
      isActive: isActive as boolean,
    })),
  });

  // ---- Tutors and pets --------------------------------------------------------------------
  const clients = await prisma.client.createManyAndReturn({
    data: CLIENTS.map(([firstName, lastName, idNumber, phone, address], index) => ({
      daycareId,
      firstName,
      lastName,
      idNumber,
      phone,
      whatsapp: phone,
      // Resend's test inbox, with the tutor as a label. The hosted demo sends real reminder
      // emails, and its logins are public: an invented address would hard-bounce and cost the
      // sending domain its reputation, where this one accepts the message and discards it.
      email: `delivered+${firstName}.${lastName}@resend.dev`
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, ""),
      address,
      city: "Quito",
      province: "Pichincha",
      firstServiceDate: day(-(40 + index * 23)),
    })),
  });
  const clientByLastName = new Map(clients.map((client) => [client.lastName, client]));

  const monthsAgo = (months: number) =>
    localDateTimeToUtc({ ...today, month: today.month - months, hour: 12, minute: 0 }, timezone);

  const pets = await prisma.pet.createManyAndReturn({
    data: PETS.map((pet, index) => ({
      daycareId,
      clientId: clientByLastName.get(pet.owner)!.id,
      name: pet.name,
      species: pet.species,
      breed: pet.breed,
      sex: pet.sex,
      color: pet.color,
      weight: pet.weight,
      birthdate: monthsAgo(pet.ageMonths),
      isNeutered: pet.neutered,
      allergies: pet.allergies,
      chronicConditions: pet.chronic,
      notes: pet.notes,
      microchip: index % 3 === 0 ? `98514100${String(4410237 + index * 7919)}` : undefined,
      photoUrl: photos.get(pet.name.toLowerCase()),
    })),
  });
  const petByName = new Map(pets.map((pet) => [pet.name, pet]));
  const pet = (name: string) => petByName.get(name)!;
  const spec = (name: string) => PETS.find((p) => p.name === name)!;

  // The clinic unit needs the tenant's users to exist first; from here on its rooms, staff
  // veterinarian and catalogue are available.
  await options.ensureClinic();
  await prisma.veterinarian.create({
    data: {
      daycareId,
      name: "Dra. Paula Jaramillo",
      licenseNumber: "MVZ-2217",
      specialty: "Cirugía de tejidos blandos",
    },
  });

  const rooms = await prisma.room.findMany({ where: { daycareId } });
  const room = (name: string) => rooms.find((r) => r.name === name)!.id;
  const staffVets = await prisma.veterinarian.findMany({ where: { daycareId, isExternal: false } });
  const camila = staffVets.find((vet) => vet.name === "Dra. Camila Rivas")!;
  const paula = staffVets.find((vet) => vet.name === "Dra. Paula Jaramillo")!;
  const vetUserId = camila.userId;
  const vetServices = await prisma.vetService.findMany({ where: { daycareId } });
  const vetService = (name: string) => vetServices.find((service) => service.name === name)!;

  // ---- Row buffers ------------------------------------------------------------------------
  // Built in memory with their ids and written with createMany: a month of history is a few
  // hundred rows, and one round trip per row is slow against a remote database.
  const reservations: Prisma.ReservationCreateManyInput[] = [];
  const reservationPets: Prisma.ReservationPetCreateManyInput[] = [];
  const checkIns: Prisma.CheckInOutCreateManyInput[] = [];
  const incomes: Prisma.IncomeCreateManyInput[] = [];
  const visits: Prisma.VetVisitCreateManyInput[] = [];
  const vitals: Prisma.VetVitalsCreateManyInput[] = [];
  const diagnoses: Prisma.VetDiagnosisCreateManyInput[] = [];
  const charges: Prisma.VetVisitChargeCreateManyInput[] = [];
  const vaccinations: Prisma.PetVaccinationCreateManyInput[] = [];
  const preventives: Prisma.VetPreventiveCreateManyInput[] = [];
  const prescriptions: Prisma.VetPrescriptionCreateManyInput[] = [];
  const prescriptionItems: Prisma.VetPrescriptionItemCreateManyInput[] = [];

  const INCOME_TYPE: Record<Unit, string> = {
    DAYCARE: "GUARDERIA",
    GROOMING: "PELUQUERIA",
    VETERINARY: "VETERINARIA",
  };
  const paymentMethods = ["EFECTIVO", "TARJETA", "TRANSFERENCIA", "TARJETA"] as const;

  interface Booking {
    unit: Unit;
    petNames: string[];
    service: string;
    status: string;
    checkIn: Date;
    checkOut: Date;
    basePrice: number;
    /** Collected in full when true; an income is recorded on the day the service ended. */
    paid?: boolean;
    roomId?: string;
    recurringPlanId?: string;
    concept?: string;
    notes?: string;
    needsTransport?: boolean;
    transportType?: string;
    transportAddress?: string;
  }

  /** Buffers a reservation with its pets and, when paid, the income that settles it. */
  function book(booking: Booking): string {
    const reservationId = id();
    const owner = pet(booking.petNames[0]);
    const vatAmount = round2((booking.basePrice * VAT) / 100);
    const total = round2(booking.basePrice + vatAmount);
    const paymentMethod = random.pick(paymentMethods);
    const concept = booking.concept ?? `${booking.service} - ${booking.petNames.join(", ")}`;

    reservations.push({
      id: reservationId,
      daycareId,
      businessUnit: booking.unit,
      clientId: owner.clientId,
      roomId: booking.roomId,
      recurringPlanId: booking.recurringPlanId,
      service: booking.service,
      status: booking.status,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      basePrice: booking.basePrice,
      vatPercent: VAT,
      vatAmount,
      totalAmount: total,
      advanceAmount: booking.paid ? total : 0,
      pendingAmount: booking.paid ? 0 : total,
      paymentMethod,
      concept,
      notes: booking.notes,
      needsTransport: booking.needsTransport ?? false,
      transportType: booking.transportType,
      transportAddress: booking.transportAddress,
      createdAt: minutesAfter(booking.checkIn, -random.int(1, 6) * 1440),
    });
    for (const name of booking.petNames) {
      reservationPets.push({ reservationId, petId: pet(name).id });
    }
    if (booking.paid) {
      incomes.push({
        daycareId,
        businessUnit: booking.unit,
        reservationId,
        type: INCOME_TYPE[booking.unit],
        concept,
        amount: booking.basePrice,
        vatPercent: VAT,
        vatAmount,
        total,
        paymentMethod,
        invoiceStatus: "PAGADO",
        date: booking.checkOut,
        createdAt: booking.checkOut,
      });
    }
    return reservationId;
  }

  /** Buffers the attendance record of each pet on a daycare stay. */
  function attend(
    reservationId: string | undefined,
    petNames: string[],
    roomId: string,
    checkInTime: Date,
    checkOutTime?: Date,
    notes?: string,
  ) {
    for (const name of petNames) {
      checkIns.push({
        daycareId,
        businessUnit: BU.DAYCARE,
        petId: pet(name).id,
        clientId: pet(name).clientId,
        roomId,
        reservationId,
        checkInTime,
        checkOutTime,
        isActive: !checkOutTime,
        performedByUserId: daycareLead.id,
        notes,
        createdAt: checkInTime,
      });
    }
  }

  // ---- Recurring plans --------------------------------------------------------------------
  const planSpecs = [
    {
      unit: BU.DAYCARE,
      petNames: ["Max", "Nina"],
      days: [1, 3, 5],
      start: [8, 30],
      end: [17, 30],
      service: "GUARDERIA",
      roomName: "Patio principal",
      price: 32,
      notes: "Lunes, miércoles y viernes. Tarifa de hermanos.",
      active: true,
    },
    {
      unit: BU.DAYCARE,
      petNames: ["Buddy"],
      days: [2, 4],
      start: [8, 0],
      end: [17, 0],
      service: "GUARDERIA",
      roomName: "Patio principal",
      price: 18,
      notes: "Martes y jueves.",
      active: true,
    },
    {
      unit: BU.GROOMING,
      petNames: ["Coco"],
      days: [6],
      start: [10, 0],
      end: [11, 30],
      service: "PELUQUERIA_CANINA",
      roomName: "Sala canina",
      price: 20,
      notes: "Baño y arreglo de cada sábado.",
      active: true,
    },
    {
      unit: BU.DAYCARE,
      petNames: ["Kiara"],
      days: [6],
      start: [9, 0],
      end: [14, 0],
      service: "GUARDERIA",
      roomName: "Patio norte",
      price: 12,
      notes: "Sábados por la mañana. Finalizado a pedido del tutor.",
      active: false,
    },
  ] as const;

  const hhmm = ([hour, minute]: readonly [number, number]) =>
    `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  const plans = await prisma.recurringPlan.createManyAndReturn({
    data: planSpecs.map((plan) => ({
      daycareId,
      businessUnit: plan.unit,
      clientId: pet(plan.petNames[0]).clientId,
      startDate: at(plan.active ? -HISTORY_DAYS : -70, 0),
      endDate: at(plan.active ? 60 : -5, 23, 59),
      startTime: hhmm(plan.start),
      endTime: hhmm(plan.end),
      daysOfWeek: plan.days.join(","),
      petIds: plan.petNames.map((name) => pet(name).id).join(","),
      service: plan.service,
      roomId: room(plan.roomName),
      notes: plan.notes,
      isActive: plan.active,
    })),
  });

  // Past occurrences, and today's when today is one of the plan's days. They carry the plan's
  // exact times so the generator finds them by (recurringPlanId, checkIn) and leaves them be.
  planSpecs.forEach((plan, index) => {
    if (!plan.active) return;
    for (let offset = -HISTORY_DAYS; offset <= 0; offset += 1) {
      if (!(plan.days as readonly number[]).includes(weekday(offset))) continue;
      const checkIn = at(offset, plan.start[0], plan.start[1]);
      const checkOut = at(offset, plan.end[0], plan.end[1]);
      const isToday = offset === 0;
      const isDaycare = plan.unit === BU.DAYCARE;
      const reservationId = book({
        unit: plan.unit,
        petNames: [...plan.petNames],
        service: plan.service,
        status: isToday ? (isDaycare ? "ACTIVA" : "PENDIENTE") : "COMPLETADA",
        checkIn,
        checkOut,
        basePrice: plan.price,
        paid: !isToday,
        roomId: room(plan.roomName),
        recurringPlanId: plans[index].id,
        concept: `${isDaycare ? "Guardería" : "Baño y arreglo"} - ${plan.petNames.join(", ")}`,
      });
      if (isDaycare) {
        attend(
          reservationId,
          [...plan.petNames],
          room(plan.roomName),
          minutesAfter(checkIn, random.int(0, 12)),
          isToday ? undefined : minutesAfter(checkOut, -random.int(0, 20)),
        );
      }
    }
  });

  // ---- A month of history -----------------------------------------------------------------
  const daycareRegulars = ["Toby", "Simón", "Lola", "Bruno", "Canela", "Thor", "Zeus", "Frida"];
  const groomingClients = PETS.map((p) => p.name).filter((name) => name !== "Coco");
  const felineServices = DEFAULT_GROOMING_SERVICES.filter((s) => s.category === "BANO");
  const clinicPatients = PETS.map((p) => p.name).filter((name) => name !== "Milo");

  /** Bruno spent these days on the ward (see the hospitalisation below). */
  const brunoAdmittedOffset = -10;
  const brunoDischargedOffset = -8;
  /** Lola's sterilisation, and the days she rested at home afterwards. */
  const lolaSurgeryOffset = -13;

  for (let offset = -HISTORY_DAYS; offset < 0; offset += 1) {
    const dayOfWeek = weekday(offset);
    if (dayOfWeek === SUNDAY) continue;
    const isSaturday = dayOfWeek === SATURDAY;

    // Daycare stays, outside the room the plans generate into.
    const available = daycareRegulars.filter(
      (name) =>
        !(name === "Bruno" && offset >= brunoAdmittedOffset && offset <= brunoDischargedOffset) &&
        !(name === "Lola" && offset >= lolaSurgeryOffset && offset <= lolaSurgeryOffset + 7),
    );
    for (const name of random.sample(available, isSaturday ? 2 : random.int(3, 5))) {
      const halfDay = random.next() < 0.25;
      const checkIn = at(offset, 8, random.pick([0, 15, 30]));
      const checkOut = halfDay ? at(offset, 13) : at(offset, 17, random.pick([0, 30]));
      const roomId = room(name === "Toby" ? "Zona cachorros" : "Patio norte");
      const reservationId = book({
        unit: BU.DAYCARE,
        petNames: [name],
        service: "GUARDERIA",
        status: "COMPLETADA",
        checkIn,
        checkOut,
        basePrice: halfDay ? 12 : 18,
        paid: true,
        roomId,
        concept: `Guardería ${halfDay ? "medio día" : "día completo"} - ${name}`,
      });
      attend(
        reservationId,
        [name],
        roomId,
        minutesAfter(checkIn, random.int(0, 10)),
        minutesAfter(checkOut, -random.int(0, 15)),
      );
    }

    // Salon appointments, back to back from 09:00.
    const groomed = random.sample(groomingClients, isSaturday ? 5 : random.int(3, 5));
    groomed.forEach((name, slot) => {
      const isCat = spec(name).species === "cat";
      const service = random.pick(isCat ? felineServices : DEFAULT_GROOMING_SERVICES);
      const checkIn = at(offset, 9, slot * 75);
      const cancelled = random.next() < 0.06;
      book({
        unit: BU.GROOMING,
        petNames: [name],
        service: service.name,
        status: cancelled ? "CANCELADA" : "COMPLETADA",
        checkIn,
        checkOut: minutesAfter(checkIn, service.durationMinutes),
        basePrice: service.basePrice,
        paid: !cancelled,
        notes: cancelled ? "Cancelada por el tutor" : undefined,
      });
    });

    // Clinic visits, alternating consulting rooms and veterinarians.
    const seen = random.sample(clinicPatients, isSaturday ? 1 : random.int(2, 3));
    seen.forEach((name, slot) => {
      const start = at(offset, 9, 30 + slot * 60);
      closedVisit({
        petName: name,
        clinicCase: random.pick(CLINIC_CASES),
        start,
        veterinarianId: slot % 2 === 0 ? camila.id : paula.id,
        roomId: room(slot % 2 === 0 ? "Consultorio 1" : "Consultorio 2"),
      });
    });
  }

  /**
   * Buffers a closed clinic visit the way closing one leaves it: charges that add up to the
   * reservation's base price, and an income for the total.
   */
  function closedVisit(input: {
    petName: string;
    clinicCase: ClinicCase;
    start: Date;
    veterinarianId: string;
    roomId: string;
    extraCharges?: Array<{ description: string; quantity: number; unitPrice: number }>;
    type?: string;
    end?: Date;
  }): { visitId: string; reservationId: string } {
    const { petName, clinicCase, start, veterinarianId, roomId } = input;
    const patient = pet(petName);
    const services = clinicCase.services.map(vetService);
    const end = input.end ?? minutesAfter(start, services[0].durationMinutes);
    const lines = [
      ...services.map((service) => ({
        vetServiceId: service.id as string | undefined,
        description: service.name,
        quantity: 1,
        unitPrice: service.basePrice,
      })),
      ...(input.extraCharges ?? []).map((charge) => ({ vetServiceId: undefined, ...charge })),
    ];
    const basePrice = round2(lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0));

    const visitType = input.type ?? clinicCase.type;
    const reservationId = book({
      unit: BU.VETERINARY,
      petNames: [petName],
      service: services[0].name,
      status: "COMPLETADA",
      checkIn: start,
      checkOut: end,
      basePrice,
      paid: true,
      roomId,
      concept: `${services[0].name} - ${petName}`,
    });

    const visitId = id();
    visits.push({
      id: visitId,
      daycareId,
      reservationId,
      petId: patient.id,
      clientId: patient.clientId,
      veterinarianId,
      type: visitType,
      status: "CERRADA",
      reason: clinicCase.reason,
      anamnesis: clinicCase.anamnesis,
      physicalExam: clinicCase.physicalExam,
      assessment: clinicCase.assessment,
      plan: clinicCase.plan,
      closedAt: end,
      closedByUserId: vetUserId,
      createdAt: start,
    });
    vitals.push({
      daycareId,
      petId: patient.id,
      visitId,
      takenAt: minutesAfter(start, 5),
      weightKg: round2(spec(petName).weight + (random.next() - 0.5)),
      temperatureC: round2(38.2 + random.next() * 0.9),
      heartRate: random.int(spec(petName).species === "cat" ? 150 : 80, 190 - spec(petName).weight),
      respiratoryRate: random.int(18, 30),
      mucousMembranes: "Rosadas",
      capillaryRefill: "< 2 s",
      bodyCondition: random.int(4, 6),
      painScore: random.int(0, 2),
    });
    diagnoses.push({
      daycareId,
      visitId,
      petId: patient.id,
      description: clinicCase.diagnosis.description,
      kind: clinicCase.diagnosis.kind,
      isChronic: clinicCase.diagnosis.chronic ?? false,
      createdAt: end,
    });
    for (const line of lines) {
      charges.push({ daycareId, visitId, ...line, createdAt: start });
    }
    if (clinicCase.vaccine) {
      vaccinations.push({
        petId: patient.id,
        name: clinicCase.vaccine,
        date: start,
        nextDue: minutesAfter(start, 365 * 1440),
        lotNumber: `L${random.int(24000, 26999)}`,
        manufacturer: random.pick(["Zoetis", "MSD Animal Health", "Virbac"]),
        veterinarianId,
        vetVisitId: visitId,
      });
    }
    if (clinicCase.preventive) {
      preventives.push({
        daycareId,
        petId: patient.id,
        visitId,
        kind: clinicCase.preventive.kind,
        product: clinicCase.preventive.product,
        dose: clinicCase.preventive.dose,
        weightKg: spec(petName).weight,
        date: start,
        nextDue: minutesAfter(start, clinicCase.preventive.everyDays * 1440),
      });
    }
    if (clinicCase.prescription) {
      const prescriptionId = id();
      prescriptions.push({
        id: prescriptionId,
        daycareId,
        visitId,
        petId: patient.id,
        veterinarianId,
        issuedAt: end,
      });
      prescriptionItems.push({
        daycareId,
        prescriptionId,
        drug: clinicCase.prescription.drug,
        dose: clinicCase.prescription.dose,
        route: clinicCase.prescription.route,
        frequency: clinicCase.prescription.frequency,
        durationDays: clinicCase.prescription.days,
      });
    }
    return { visitId, reservationId };
  }

  // ---- Clinic set pieces ------------------------------------------------------------------
  // A sterilisation with its signed consent.
  const surgeryStart = at(lolaSurgeryOffset, 8, 30);
  const surgery = closedVisit({
    petName: "Lola",
    type: "CIRUGIA",
    clinicCase: {
      type: "CONSULTA",
      reason: "Esterilización programada",
      anamnesis: "Ayuno de 10 h confirmado por el tutor. Prequirúrgicos sin alteraciones.",
      physicalExam: "Apta para cirugía. ASA I.",
      assessment: "Ovariohisterectomía electiva sin complicaciones.",
      plan: "Collar isabelino 10 días, analgesia 3 días y retiro de puntos en 10 días.",
      diagnosis: { description: "Ovariohisterectomía electiva", kind: "DEFINITIVO" },
      services: ["Esterilización", "Hemograma"],
      prescription: {
        drug: "Meloxicam",
        dose: "0,1 mg/kg",
        frequency: "Cada 24 h",
        days: 3,
        route: "Oral",
      },
    },
    start: surgeryStart,
    end: minutesAfter(surgeryStart, 150),
    veterinarianId: paula.id,
    roomId: room("Quirófano"),
  });

  // A two-night admission, discharged.
  const brunoAdmitted = at(brunoAdmittedOffset, 11);
  const brunoDischarged = at(brunoDischargedOffset, 16);
  const brunoStay = closedVisit({
    petName: "Bruno",
    type: "HOSPITALIZACION",
    clinicCase: {
      type: "CONSULTA",
      reason: "Vómito y diarrea con sangre",
      anamnesis: "Ingirió restos de comida de la basura hace dos días. Decaído, no come.",
      physicalExam: "Deshidratación 8 %, dolor abdominal difuso, temperatura 39,6 °C.",
      assessment: "Gastroenteritis hemorrágica. Responde bien a la fluidoterapia.",
      plan: "Alta con dieta gastrointestinal 7 días y control en 5 días.",
      diagnosis: { description: "Gastroenteritis hemorrágica", kind: "DEFINITIVO" },
      services: ["Consulta de urgencia", "Hemograma"],
    },
    extraCharges: [{ description: "Hospitalización", quantity: 2, unitPrice: 35 }],
    start: brunoAdmitted,
    end: brunoDischarged,
    veterinarianId: camila.id,
    roomId: room("Consultorio 1"),
  });

  // Blood work with a full result, and one still out at the laboratory.
  const zeusCheckup = closedVisit({
    petName: "Zeus",
    clinicCase: {
      type: "CONSULTA",
      reason: "Chequeo geriátrico",
      anamnesis: "Ocho años. Se levanta con más lentitud por las mañanas.",
      physicalExam: "Dolor leve a la extensión de cadera. Resto sin alteraciones.",
      assessment: "Displasia de cadera estable; función renal a vigilar.",
      plan: "Condroprotector diario, control de peso y perfil renal en seis meses.",
      diagnosis: { description: "Displasia de cadera", kind: "DEFINITIVO", chronic: true },
      services: ["Consulta general", "Hemograma", "Radiografía"],
    },
    start: at(-6, 15),
    veterinarianId: camila.id,
    roomId: room("Consultorio 1"),
  });
  const canelaVisit = closedVisit({
    petName: "Canela",
    clinicCase: CLINIC_CASES[2],
    start: at(-1, 16),
    veterinarianId: paula.id,
    roomId: room("Consultorio 2"),
  });

  // Two visits closed this morning by Dra. Rivas, in the second consulting room.
  closedVisit({
    petName: "Mora",
    clinicCase: CLINIC_CASES[4],
    start: at(0, 8, 30),
    veterinarianId: camila.id,
    roomId: room("Consultorio 2"),
  });
  closedVisit({
    petName: "Mía",
    clinicCase: CLINIC_CASES[6],
    start: at(0, 9, 15),
    veterinarianId: camila.id,
    roomId: room("Consultorio 2"),
  });

  // ---- Today ------------------------------------------------------------------------------
  // Daycare: three stays in progress, one already collected, two still to arrive, and a dog
  // admitted without a booking.
  const stay = (
    petNames: string[],
    roomName: string,
    status: string,
    from: [number, number],
    to: [number, number],
    extra: Partial<Booking> = {},
  ) =>
    book({
      unit: BU.DAYCARE,
      petNames,
      service: "GUARDERIA",
      status,
      checkIn: at(0, from[0], from[1]),
      checkOut: at(0, to[0], to[1]),
      basePrice: 18 * petNames.length,
      roomId: room(roomName),
      concept: `Guardería - ${petNames.join(", ")}`,
      ...extra,
    });

  attend(
    stay(["Simón", "Lola"], "Patio norte", "ACTIVA", [7, 45], [17, 30]),
    ["Simón", "Lola"],
    room("Patio norte"),
    at(0, 7, 52),
  );
  attend(
    stay(["Toby"], "Zona cachorros", "ACTIVA", [8, 0], [16, 0]),
    ["Toby"],
    room("Zona cachorros"),
    at(0, 8, 9),
    undefined,
    "Trae su propia comida",
  );
  attend(
    stay(["Thor"], "Patio norte", "ACTIVA", [8, 30], [18, 0], {
      needsTransport: true,
      transportType: "AMBAS",
      transportAddress: "Bellavista, calle Bosmediano N14-22",
    }),
    ["Thor"],
    room("Patio norte"),
    at(0, 9, 4),
    undefined,
    "Recogido en domicilio",
  );
  attend(
    stay(["Canela"], "Patio norte", "COMPLETADA", [7, 30], [12, 0], {
      basePrice: 12,
      paid: true,
      concept: "Guardería medio día - Canela",
    }),
    ["Canela"],
    room("Patio norte"),
    at(0, 7, 36),
    at(0, 11, 55),
  );
  stay(["Bruno"], "Patio norte", "CONFIRMADA", [10, 30], [18, 0]);
  stay(["Zeus"], "Patio norte", "PENDIENTE", [13, 0], [18, 0], {
    basePrice: 12,
    concept: "Guardería medio día - Zeus",
  });
  attend(
    undefined,
    ["Frida"],
    room("Patio principal"),
    at(0, 8, 41),
    undefined,
    "Ingreso sin reserva",
  );

  // The salon board, one card or more in every column.
  const groomingService = (serviceId: string) =>
    DEFAULT_GROOMING_SERVICES.find((service) => service.id === serviceId)!;
  const appointment = (
    offset: number,
    petName: string,
    serviceId: string,
    status: string,
    time: [number, number],
    extra: Partial<Booking> = {},
  ) => {
    const service = groomingService(serviceId);
    const checkIn = at(offset, time[0], time[1]);
    return book({
      unit: BU.GROOMING,
      petNames: [petName],
      service: service.name,
      status,
      checkIn,
      checkOut: minutesAfter(checkIn, service.durationMinutes),
      basePrice: service.basePrice,
      ...extra,
    });
  };
  appointment(0, "Mía", "bano_basico", "COMPLETADA", [8, 30], { paid: true });
  appointment(0, "Kiara", "deslanado_profundo", "LISTO", [9, 15]);
  appointment(0, "Luna", "bano_corte_higienico", "EN_PROCESO", [10, 0]);
  appointment(0, "Oreo", "peluqueria_completa", "EN_PROCESO", [10, 30]);
  appointment(0, "Rocky", "bano_basico", "RECEPCIONADA", [11, 30], {
    notes: "Secado gradual: se pone nervioso con el secador.",
  });
  appointment(0, "Mora", "bano_basico", "CANCELADA", [12, 0], {
    notes: "Cancelada por el tutor",
  });
  appointment(0, "Canela", "peluqueria_completa", "PENDIENTE", [14, 0]);
  appointment(0, "Zeus", "corte_unas_spa", "PENDIENTE", [15, 0]);
  appointment(0, "Frida", "bano_medicado", "PENDIENTE", [16, 0]);

  // ---- The week ahead ---------------------------------------------------------------------
  const upcomingStays: Array<[number, string[], string, string]> = [
    [1, ["Bruno"], "Patio norte", "CONFIRMADA"],
    [1, ["Toby"], "Zona cachorros", "CONFIRMADA"],
    [2, ["Thor"], "Patio norte", "PENDIENTE"],
    [2, ["Simón", "Lola"], "Patio norte", "CONFIRMADA"],
    [2, ["Frida"], "Patio norte", "CANCELADA"],
    [3, ["Zeus"], "Patio norte", "PENDIENTE"],
    [4, ["Canela"], "Patio norte", "CONFIRMADA"],
    [5, ["Toby"], "Zona cachorros", "CONFIRMADA"],
    [6, ["Bruno"], "Patio norte", "PENDIENTE"],
  ];
  for (const [offset, petNames, roomName, status] of upcomingStays) {
    if (weekday(offset) === SUNDAY) continue;
    book({
      unit: BU.DAYCARE,
      petNames,
      service: "GUARDERIA",
      status,
      checkIn: at(offset, 8),
      checkOut: at(offset, 17, 30),
      basePrice: 18 * petNames.length,
      roomId: room(roomName),
      concept: `Guardería - ${petNames.join(", ")}`,
      notes: status === "CANCELADA" ? "Cancelada por el tutor" : undefined,
    });
  }
  const upcomingAppointments: Array<[number, string, string, [number, number]]> = [
    [1, "Max", "deslanado_profundo", [9, 0]],
    [1, "Pelusa", "bano_corte_higienico", [10, 30]],
    [1, "Lola", "peluqueria_completa", [14, 0]],
    [2, "Buddy", "bano_basico", [9, 30]],
    [2, "Nina", "corte_unas_spa", [11, 0]],
    [3, "Thor", "deslanado_profundo", [9, 0]],
    [3, "Mía", "peluqueria_completa", [15, 0]],
    [4, "Simón", "bano_medicado", [10, 0]],
    [5, "Oreo", "bano_corte_higienico", [11, 30]],
  ];
  for (const [offset, petName, serviceId, time] of upcomingAppointments) {
    if (weekday(offset) === SUNDAY) continue;
    appointment(offset, petName, serviceId, "PENDIENTE", time);
  }

  // ---- Write the buffered core rows -------------------------------------------------------
  await prisma.reservation.createMany({ data: reservations });
  await prisma.reservationPet.createMany({ data: reservationPets });
  await prisma.checkInOut.createMany({ data: checkIns });
  await prisma.vetVisit.createMany({ data: visits });
  await prisma.vetVitals.createMany({ data: vitals });
  await prisma.vetDiagnosis.createMany({ data: diagnoses });
  await prisma.vetVisitCharge.createMany({ data: charges });
  await prisma.vetPrescription.createMany({ data: prescriptions });
  await prisma.vetPrescriptionItem.createMany({ data: prescriptionItems });
  await prisma.vetPreventive.createMany({ data: preventives });

  // ---- Clinic records attached to the set pieces ------------------------------------------
  const lola = pet("Lola");
  await prisma.vetConsent.create({
    data: {
      daycareId,
      petId: lola.id,
      clientId: lola.clientId,
      visitId: surgery.visitId,
      type: "CIRUGIA",
      text:
        "Autorizo la realización de la ovariohisterectomía y la anestesia general necesaria. " +
        "Se me han explicado los riesgos del procedimiento y los cuidados posteriores.",
      signedByName: "Diego Almeida",
      signedAt: minutesAfter(surgeryStart, -20),
      createdAt: minutesAfter(surgeryStart, -30),
    },
  });
  await prisma.vetProcedure.create({
    data: {
      daycareId,
      visitId: surgery.visitId,
      petId: lola.id,
      veterinarianId: paula.id,
      name: "Ovariohisterectomía",
      kind: "CIRUGIA",
      status: "FINALIZADO",
      asaRisk: 1,
      anesthesiaProtocol:
        "Premedicación con acepromacina y tramadol. Inducción con propofol, mantenimiento con isoflurano.",
      startAt: minutesAfter(surgeryStart, 30),
      endAt: minutesAfter(surgeryStart, 85),
      findings: "Útero y ovarios de aspecto normal. Hemostasia correcta.",
      createdAt: surgeryStart,
    },
  });

  const bruno = pet("Bruno");
  const wardId = room("Hospitalización");
  const brunoHospitalization = await prisma.vetHospitalization.create({
    data: {
      daycareId,
      visitId: brunoStay.visitId,
      petId: bruno.id,
      roomId: wardId,
      status: "ALTA",
      reason: "Gastroenteritis hemorrágica con deshidratación",
      dailyRate: 35,
      admittedAt: brunoAdmitted,
      dischargedAt: brunoDischarged,
      dischargeSummary:
        "Ingresó deshidratado y con vómito. Fluidoterapia y antiemético durante 48 h. " +
        "Sin vómito desde el segundo día; come dieta blanda con apetito.",
      homeCareInstructions:
        "Dieta gastrointestinal en cuatro tomas diarias por 7 días. Agua a libre disposición. " +
        "Volver si reaparece el vómito o la diarrea con sangre.",
      createdAt: brunoAdmitted,
    },
  });
  const brunoOrder = await prisma.vetTreatmentOrder.create({
    data: {
      daycareId,
      hospitalizationId: brunoHospitalization.id,
      description: "Antiemético",
      drug: "Maropitant",
      dose: "1 mg/kg",
      route: "SC",
      everyHours: 24,
      startAt: minutesAfter(brunoAdmitted, 30),
      endAt: brunoDischarged,
      isActive: false,
    },
  });
  await prisma.vetTreatmentAdministration.createMany({
    data: [0, 1, 2].map((dose) => {
      const scheduledAt = minutesAfter(brunoAdmitted, 30 + dose * 24 * 60);
      return {
        daycareId,
        orderId: brunoOrder.id,
        hospitalizationId: brunoHospitalization.id,
        scheduledAt,
        administeredAt: minutesAfter(scheduledAt, 6),
        administeredByUserId: vetUserId,
      };
    }),
  });

  // The cat on the ward right now: admitted yesterday afternoon, doses signed up to this
  // morning and the next one coming up.
  const milo = pet("Milo");
  const miloAdmitted = at(-1, 14);
  const miloReservation = await prisma.reservation.create({
    data: {
      daycareId,
      businessUnit: BU.VETERINARY,
      clientId: milo.clientId,
      service: "Hospitalización",
      status: "PENDIENTE",
      checkIn: miloAdmitted,
      checkOut: minutesAfter(miloAdmitted, 45),
      concept: "Hospitalización - Milo",
      vatPercent: VAT,
      pets: { create: [{ petId: milo.id }] },
    },
  });
  const miloVisit = await prisma.vetVisit.create({
    data: {
      daycareId,
      reservationId: miloReservation.id,
      petId: milo.id,
      clientId: milo.clientId,
      veterinarianId: paula.id,
      type: "HOSPITALIZACION",
      triage: "URGENCIA",
      status: "EN_CONSULTA",
      reason: "No orina desde anoche y maúlla en el arenero",
      anamnesis: "Macho castrado, come alimento seco. Intentos repetidos de orinar sin resultado.",
      physicalExam: "Vejiga distendida y dolorosa a la palpación. Deshidratación 6 %.",
      assessment: "Obstrucción uretral. Se sonda bajo sedación y se ingresa para fluidoterapia.",
      createdAt: miloAdmitted,
      charges: {
        create: [
          {
            daycareId,
            vetServiceId: vetService("Consulta de urgencia").id,
            description: "Consulta de urgencia",
            quantity: 1,
            unitPrice: vetService("Consulta de urgencia").basePrice,
          },
          { daycareId, description: "Sondaje uretral bajo sedación", quantity: 1, unitPrice: 60 },
        ],
      },
      diagnoses: {
        create: [
          {
            daycareId,
            petId: milo.id,
            description: "Obstrucción uretral felina",
            kind: "DEFINITIVO",
          },
        ],
      },
    },
  });
  const miloHospitalization = await prisma.vetHospitalization.create({
    data: {
      daycareId,
      visitId: miloVisit.id,
      petId: milo.id,
      roomId: wardId,
      status: "INGRESADO",
      reason: "Obstrucción uretral: fluidoterapia y control de diuresis",
      dailyRate: 35,
      admittedAt: miloAdmitted,
      createdAt: miloAdmitted,
    },
  });
  await prisma.vetConsent.create({
    data: {
      daycareId,
      petId: milo.id,
      clientId: milo.clientId,
      visitId: miloVisit.id,
      type: "HOSPITALIZACION",
      text:
        "Autorizo el ingreso hospitalario, la sedación para el sondaje uretral y los " +
        "tratamientos que el equipo veterinario considere necesarios durante la estancia.",
      signedByName: "Fernanda Jácome",
      signedAt: minutesAfter(miloAdmitted, 15),
      createdAt: minutesAfter(miloAdmitted, 10),
    },
  });
  const miloOrders: Array<[string, string | undefined, string | undefined, string, number]> = [
    ["Fluidoterapia de mantenimiento", "Lactato de Ringer", "12 ml/h", "IV", 8],
    ["Analgesia", "Buprenorfina", "0,02 mg/kg", "IV", 8],
    ["Control de diuresis y lavado de sonda", undefined, undefined, "—", 6],
  ];
  for (const [description, drug, dose, route, everyHours] of miloOrders) {
    const startAt = minutesAfter(miloAdmitted, 60);
    const order = await prisma.vetTreatmentOrder.create({
      data: {
        daycareId,
        hospitalizationId: miloHospitalization.id,
        description,
        drug,
        dose,
        route,
        everyHours,
        startAt,
      },
    });
    // Every slot that has already come due is signed for, so the next one is the open dose.
    const given: Prisma.VetTreatmentAdministrationCreateManyInput[] = [];
    for (
      let scheduledAt = startAt;
      scheduledAt < now;
      scheduledAt = minutesAfter(scheduledAt, everyHours * 60)
    ) {
      given.push({
        daycareId,
        orderId: order.id,
        hospitalizationId: miloHospitalization.id,
        scheduledAt,
        administeredAt: minutesAfter(scheduledAt, 4),
        administeredByUserId: vetUserId,
      });
    }
    if (given.length > 0) await prisma.vetTreatmentAdministration.createMany({ data: given });
  }
  await prisma.vetVitals.createMany({
    data: [
      { takenAt: minutesAfter(miloAdmitted, 20), temperatureC: 37.6, heartRate: 204, painScore: 6 },
      { takenAt: at(0, 7, 30), temperatureC: 38.4, heartRate: 176, painScore: 2 },
    ].map((reading) => ({
      daycareId,
      petId: milo.id,
      hospitalizationId: miloHospitalization.id,
      weightKg: 5.4,
      respiratoryRate: 28,
      mucousMembranes: "Rosadas",
      capillaryRefill: "< 2 s",
      ...reading,
    })),
  });

  // Laboratory: a reported panel, and an ear culture still out.
  const zeus = pet("Zeus");
  const zeusPanel = await prisma.vetLabOrder.create({
    data: {
      daycareId,
      visitId: zeusCheckup.visitId,
      petId: zeus.id,
      kind: "LABORATORIO",
      test: "Hemograma y perfil renal",
      externalLab: "Laboratorio Veterinario Andino",
      status: "RESULTADO",
      requestedAt: at(-6, 15, 20),
      resultAt: at(-5, 11),
      resultSummary: "Hemograma dentro de rango. Creatinina en el límite superior.",
    },
  });
  await prisma.vetLabResultValue.createMany({
    data: [
      ["Hematocrito", "44", "%", "37 - 55", "NORMAL"],
      ["Leucocitos", "9,8", "x10³/µL", "6,0 - 17,0", "NORMAL"],
      ["Plaquetas", "286", "x10³/µL", "200 - 500", "NORMAL"],
      ["Urea", "52", "mg/dL", "15 - 55", "NORMAL"],
      ["Creatinina", "1,6", "mg/dL", "0,5 - 1,5", "ALTO"],
    ].map(([analyte, value, unit, referenceRange, flag]) => ({
      daycareId,
      orderId: zeusPanel.id,
      analyte,
      value,
      unit,
      referenceRange,
      flag,
    })),
  });
  await prisma.vetLabOrder.create({
    data: {
      daycareId,
      visitId: canelaVisit.visitId,
      petId: pet("Canela").id,
      kind: "LABORATORIO",
      test: "Cultivo y antibiograma de exudado ótico",
      externalLab: "Laboratorio Veterinario Andino",
      status: "EN_PROCESO",
      requestedAt: at(-1, 16, 25),
      notes: "Otitis recurrente: tercer episodio en el año.",
    },
  });

  // ---- Today's clinic agenda --------------------------------------------------------------
  // Everything open sits with Dra. Jaramillo in Consultorio 2, or has no room at all: the
  // first consulting room and the first staff vet stay free for bookings made at "now".
  const openVisit = async (input: {
    petName: string;
    type: string;
    status: string;
    reason: string;
    start: Date;
    serviceName: string;
    triage?: string;
    veterinarianId?: string;
    roomId?: string;
  }) => {
    const patient = pet(input.petName);
    const service = vetService(input.serviceName);
    const reservation = await prisma.reservation.create({
      data: {
        daycareId,
        businessUnit: BU.VETERINARY,
        clientId: patient.clientId,
        roomId: input.roomId,
        service: service.name,
        status: "PENDIENTE",
        checkIn: input.start,
        checkOut: minutesAfter(input.start, service.durationMinutes),
        concept: `${service.name} - ${input.petName}`,
        vatPercent: VAT,
        pets: { create: [{ petId: patient.id }] },
      },
    });
    return prisma.vetVisit.create({
      data: {
        daycareId,
        reservationId: reservation.id,
        petId: patient.id,
        clientId: patient.clientId,
        veterinarianId: input.veterinarianId,
        type: input.type,
        triage: input.triage ?? "NORMAL",
        status: input.status,
        reason: input.reason,
        createdAt: input.start,
        charges: {
          create: [
            {
              daycareId,
              vetServiceId: service.id,
              description: service.name,
              quantity: 1,
              unitPrice: service.basePrice,
            },
          ],
        },
      },
    });
  };

  const consultingRoom = room("Consultorio 2");
  await openVisit({
    petName: "Coco",
    type: "CONSULTA",
    status: "EN_ESPERA",
    reason: "Se rasca la oreja izquierda desde el fin de semana",
    start: minutesAfter(now, -25),
    serviceName: "Consulta general",
  });
  await openVisit({
    petName: "Nina",
    type: "URGENCIA",
    status: "EN_ESPERA",
    triage: "PRIORITARIA",
    reason: "Corte en la almohadilla jugando en el patio",
    start: minutesAfter(now, -10),
    serviceName: "Consulta de urgencia",
  });
  const inConsult = await openVisit({
    petName: "Pelusa",
    type: "CONSULTA",
    status: "EN_CONSULTA",
    reason: "Vómito intermitente con bolas de pelo",
    start: at(0, 10, 30),
    serviceName: "Consulta general",
    veterinarianId: paula.id,
    roomId: consultingRoom,
  });
  await prisma.vetVitals.create({
    data: {
      daycareId,
      petId: pet("Pelusa").id,
      visitId: inConsult.id,
      takenAt: at(0, 10, 36),
      weightKg: 4.6,
      temperatureC: 38.7,
      heartRate: 168,
      respiratoryRate: 26,
      mucousMembranes: "Rosadas",
      capillaryRefill: "< 2 s",
      bodyCondition: 5,
      painScore: 1,
    },
  });
  const scheduled: Array<[number, [number, number], string, string, string, string]> = [
    [0, [15, 0], "Luna", "CONTROL", "Control de peso tras cambio de dieta", "Control"],
    [0, [16, 0], "Kiara", "VACUNACION", "Refuerzo anual", "Vacuna múltiple"],
    [1, [10, 0], "Zeus", "CONTROL", "Seguimiento de la función renal", "Control"],
    [1, [11, 30], "Frida", "CONSULTA", "Revisión general", "Consulta general"],
  ];
  for (const [offset, time, petName, type, reason, serviceName] of scheduled) {
    await openVisit({
      petName,
      type,
      status: "PROGRAMADA",
      reason,
      start: at(offset, time[0], time[1]),
      serviceName,
      veterinarianId: paula.id,
      roomId: consultingRoom,
    });
  }

  // ---- Vaccination cards and what is coming due -------------------------------------------
  // Transcribed cards for every pet, spread through the year so nothing else is due.
  PETS.forEach((p, index) => {
    const given = -(60 + ((index * 37) % 240));
    vaccinations.push({
      petId: pet(p.name).id,
      name: p.species === "cat" ? "Triple Felina" : "Múltiple",
      date: day(given),
      nextDue: day(given + 365),
      notes: "Transcrita del carné",
    });
  });
  // What the reminders list shows: two coming up, one overdue.
  vaccinations.push(
    {
      petId: pet("Max").id,
      name: "Rabia",
      date: day(-359),
      nextDue: day(6),
      notes: "Refuerzo anual",
    },
    { petId: pet("Luna").id, name: "Rabia", date: day(-353), nextDue: day(12) },
    { petId: pet("Rocky").id, name: "Rabia", date: day(-374), nextDue: day(-9) },
  );
  await prisma.petVaccination.createMany({ data: vaccinations });
  await prisma.vetPreventive.createMany({
    data: [
      {
        petId: pet("Buddy").id,
        kind: "DESPARASITACION_INTERNA",
        product: "Praziquantel + pirantel",
        dose: "3 tabletas",
        weightKg: 31,
        date: day(-87),
        nextDue: day(3),
      },
      {
        petId: pet("Kiara").id,
        kind: "DESPARASITACION_EXTERNA",
        product: "Fluralaner",
        dose: "1 comprimido 20-40 kg",
        weightKg: 27,
        date: day(-88),
        nextDue: day(-4),
      },
      {
        petId: pet("Thor").id,
        kind: "DESPARASITACION_EXTERNA",
        product: "Afoxolaner",
        dose: "1 comprimido 10-25 kg",
        weightKg: 24.8,
        date: day(-21),
        nextDue: day(9),
      },
    ].map((row) => ({ daycareId, ...row })),
  });

  // ---- Income outside reservations, and all of it written ---------------------------------
  const counterSales: Array<[number, Unit, string, number]> = [
    [-24, BU.DAYCARE, "Venta de snacks dentales", 9],
    [-19, BU.GROOMING, "Venta de perfume canino", 14],
    [-15, BU.DAYCARE, "Venta de arnés talla M", 22],
    [-11, BU.GROOMING, "Venta de cepillo deslanador", 12],
    [-7, BU.VETERINARY, "Venta de collar isabelino", 8],
    [-3, BU.DAYCARE, "Venta de snacks dentales", 9],
    [-1, BU.GROOMING, "Venta de shampoo hipoalergénico 250 ml", 11],
  ];
  for (const [offset, unit, concept, amount] of counterSales) {
    const vatAmount = round2((amount * VAT) / 100);
    incomes.push({
      daycareId,
      businessUnit: unit,
      type: "OTRO",
      concept,
      amount,
      vatPercent: VAT,
      vatAmount,
      total: round2(amount + vatAmount),
      paymentMethod: "EFECTIVO",
      invoiceStatus: "PAGADO",
      date: at(offset, 12, 30),
      createdAt: at(offset, 12, 30),
    });
  }
  await prisma.income.createMany({ data: incomes });

  // ---- Payables ---------------------------------------------------------------------------
  interface PayableSpec {
    unit: Unit;
    providerName: string;
    type: "GASTO" | "COMPRA";
    category: string;
    description: string;
    invoiceNumber: string;
    invoiced: number;
    due: number;
    subtotal: number;
    payments: Array<[number, number, string]>;
    isRecurring?: boolean;
  }
  const payableSpecs: PayableSpec[] = [
    {
      unit: BU.DAYCARE,
      providerName: "Inmobiliaria Los Shyris",
      type: "GASTO",
      category: "renta",
      description: "Arriendo del local, mes en curso",
      invoiceNumber: "001-002-0004518",
      invoiced: -4,
      due: 5,
      subtotal: 1200,
      payments: [],
      isRecurring: true,
    },
    {
      unit: BU.DAYCARE,
      providerName: "NutriPet Andina",
      type: "COMPRA",
      category: "alimentos",
      description: "Concentrado premium adulto, 6 sacos de 20 kg",
      invoiceNumber: "001-001-0021874",
      invoiced: -18,
      due: -3,
      subtotal: 318,
      payments: [[-12, 365.7, "TRANSFERENCIA"]],
    },
    {
      unit: BU.GROOMING,
      providerName: "Estética Canina Import",
      type: "COMPRA",
      category: "peluqueria",
      description: "Shampoo, acondicionador y cuchillas",
      invoiceNumber: "002-001-0007733",
      invoiced: -14,
      due: 6,
      subtotal: 246,
      payments: [[-9, 140, "TRANSFERENCIA"]],
    },
    {
      unit: BU.VETERINARY,
      providerName: "VetSupply Ecuador",
      type: "COMPRA",
      category: "veterinario",
      description: "Vacunas, antibióticos y material descartable",
      invoiceNumber: "001-003-0015290",
      invoiced: -10,
      due: 10,
      subtotal: 540,
      payments: [[-6, 300, "TARJETA"]],
    },
    {
      unit: BU.DAYCARE,
      providerName: "LimpioMascotas",
      type: "COMPRA",
      category: "limpieza",
      description: "Desinfectante y bolsas biodegradables",
      invoiceNumber: "001-001-0009046",
      invoiced: -25,
      due: -5,
      subtotal: 96,
      payments: [],
    },
    {
      unit: BU.GROOMING,
      providerName: "Estética Canina Import",
      type: "GASTO",
      category: "mantenimiento",
      description: "Mantenimiento de secadoras y afilado de tijeras",
      invoiceNumber: "002-001-0007702",
      invoiced: -22,
      due: -8,
      subtotal: 85,
      payments: [[-16, 97.75, "EFECTIVO"]],
    },
  ];
  for (const payable of payableSpecs) {
    const vatAmount = round2((payable.subtotal * VAT) / 100);
    const total = round2(payable.subtotal + vatAmount);
    const paid = round2(payable.payments.reduce((sum, [, amount]) => sum + amount, 0));
    const balance = round2(total - paid);
    await prisma.payable.create({
      data: {
        daycareId,
        businessUnit: payable.unit,
        providerId: provider(payable.providerName),
        type: payable.type,
        category: payable.category,
        description: payable.description,
        invoiceNumber: payable.invoiceNumber,
        invoiceDate: day(payable.invoiced),
        subtotal: payable.subtotal,
        vatPercent: VAT,
        vatAmount,
        total,
        paid,
        balance,
        status: balance === 0 ? "PAGADO" : paid > 0 ? "PARCIAL" : "PENDIENTE",
        dueDate: day(payable.due),
        nextPayment: balance > 0 && paid > 0 ? day(payable.due) : undefined,
        isRecurring: payable.isRecurring ?? false,
        createdAt: day(payable.invoiced),
        payments: {
          create: payable.payments.map(([offset, amount, method]) => ({
            amount,
            method,
            date: day(offset),
            reference: method === "TRANSFERENCIA" ? `TRX-${random.int(100000, 999999)}` : undefined,
          })),
        },
      },
    });
  }

  // ---- Inventory --------------------------------------------------------------------------
  interface StockSpec {
    unit: Unit;
    name: string;
    category: string;
    measure: string;
    minStock: number;
    unitCost: number;
    received: number;
    used: Array<[number, number, string]>;
    controlled?: boolean;
    expiresInDays?: number;
  }
  const stock: StockSpec[] = [
    {
      unit: BU.DAYCARE,
      name: "Concentrado premium adulto",
      category: "alimentos",
      measure: "kg",
      minStock: 30,
      unitCost: 2.65,
      received: 120,
      used: [
        [-14, 28, "Consumo semanal"],
        [-7, 31, "Consumo semanal"],
        [-1, 9, "Consumo diario"],
      ],
    },
    {
      unit: BU.DAYCARE,
      name: "Concentrado cachorro",
      category: "alimentos",
      measure: "kg",
      minStock: 10,
      unitCost: 3.1,
      received: 40,
      used: [[-6, 12, "Consumo semanal"]],
    },
    {
      unit: BU.DAYCARE,
      name: "Snacks dentales",
      category: "alimentos",
      measure: "unidad",
      minStock: 20,
      unitCost: 0.45,
      received: 100,
      used: [
        [-24, 6, "Venta en mostrador"],
        [-3, 6, "Venta en mostrador"],
      ],
    },
    {
      unit: BU.DAYCARE,
      name: "Desinfectante amonio cuaternario",
      category: "higiene",
      measure: "lt",
      minStock: 8,
      unitCost: 6.5,
      received: 20,
      used: [
        [-12, 7, "Limpieza de patios"],
        [-4, 8, "Limpieza de patios"],
      ],
    },
    {
      unit: BU.DAYCARE,
      name: "Bolsas biodegradables",
      category: "higiene",
      measure: "rollo",
      minStock: 15,
      unitCost: 1.2,
      received: 60,
      used: [[-8, 18, "Uso diario"]],
    },
    {
      unit: BU.GROOMING,
      name: "Shampoo hipoalergénico",
      category: "higiene",
      measure: "lt",
      minStock: 6,
      unitCost: 9.8,
      received: 24,
      used: [
        [-13, 5, "Servicios de la semana"],
        [-6, 6, "Servicios de la semana"],
      ],
    },
    {
      unit: BU.GROOMING,
      name: "Shampoo medicado clorhexidina",
      category: "higiene",
      measure: "lt",
      minStock: 4,
      unitCost: 14.5,
      received: 8,
      used: [
        [-10, 3, "Baños medicados"],
        [-2, 2.5, "Baños medicados"],
      ],
    },
    {
      unit: BU.GROOMING,
      name: "Cuchillas n.º 10",
      category: "herramientas",
      measure: "unidad",
      minStock: 3,
      unitCost: 28,
      received: 8,
      used: [[-20, 2, "Reposición por desgaste"]],
    },
    {
      unit: BU.GROOMING,
      name: "Perfume canino",
      category: "higiene",
      measure: "unidad",
      minStock: 5,
      unitCost: 6,
      received: 18,
      used: [[-19, 1, "Venta en mostrador"]],
    },
    {
      unit: BU.VETERINARY,
      name: "Vacuna múltiple canina",
      category: "vacunas",
      measure: "dosis",
      minStock: 10,
      unitCost: 11,
      received: 40,
      used: [[-9, 12, "Aplicadas en consulta"]],
      expiresInDays: 210,
    },
    {
      unit: BU.VETERINARY,
      name: "Vacuna antirrábica",
      category: "vacunas",
      measure: "dosis",
      minStock: 10,
      unitCost: 6.5,
      received: 30,
      used: [[-9, 9, "Aplicadas en consulta"]],
      expiresInDays: 180,
    },
    {
      unit: BU.VETERINARY,
      name: "Amoxicilina + ácido clavulánico 250 mg",
      category: "medicinas",
      measure: "tableta",
      minStock: 40,
      unitCost: 0.6,
      received: 200,
      used: [[-5, 56, "Dispensado con receta"]],
      expiresInDays: 400,
    },
    {
      unit: BU.VETERINARY,
      name: "Meloxicam 1 mg",
      category: "medicinas",
      measure: "tableta",
      minStock: 30,
      unitCost: 0.35,
      received: 120,
      used: [[-11, 24, "Dispensado con receta"]],
      expiresInDays: 320,
    },
    {
      unit: BU.VETERINARY,
      name: "Tramadol 50 mg",
      category: "medicinas",
      measure: "tableta",
      minStock: 20,
      unitCost: 0.5,
      received: 60,
      used: [[-13, 6, "Dispensado con receta"]],
      controlled: true,
      expiresInDays: 260,
    },
  ];
  const items = await prisma.inventoryItem.createManyAndReturn({
    data: stock.map((item) => ({
      daycareId,
      businessUnit: item.unit,
      name: item.name,
      category: item.category,
      unit: item.measure,
      minStock: item.minStock,
      unitCost: item.unitCost,
      isControlled: item.controlled ?? false,
      currentStock: round2(item.received - item.used.reduce((sum, [, qty]) => sum + qty, 0)),
    })),
  });
  await prisma.inventoryMovement.createMany({
    data: stock.flatMap((item, index) => {
      const lotNumber = item.expiresInDays ? `LT-${2400 + index * 13}` : undefined;
      return [
        {
          itemId: items[index].id,
          type: "IN",
          quantity: item.received,
          cost: round2(item.received * item.unitCost),
          reason: "Compra a proveedor",
          date: day(-26),
          lotNumber,
          expiresAt: item.expiresInDays ? day(item.expiresInDays) : undefined,
        },
        ...item.used.map(([offset, quantity, reason]) => ({
          itemId: items[index].id,
          type: "OUT",
          quantity,
          reason,
          date: day(offset),
          lotNumber,
        })),
      ];
    }),
  });

  // ---- Alerts -----------------------------------------------------------------------------
  await prisma.alert.createMany({
    data: [
      {
        businessUnit: BU.DAYCARE,
        petId: pet("Nina").id,
        type: "SALUD",
        severity: "ALTA",
        title: "Alergia al pollo",
        description: "No dar snacks ni concentrado con pollo. Tiene su propia comida.",
      },
      {
        businessUnit: BU.DAYCARE,
        petId: pet("Thor").id,
        type: "SOCIAL",
        severity: "MEDIA",
        title: "Grupos reducidos",
        description: "No juntar con machos enteros de talla grande en el patio.",
      },
      {
        businessUnit: BU.DAYCARE,
        petId: pet("Toby").id,
        type: "SALUD",
        severity: "MEDIA",
        title: "Esquema de vacunas en curso",
        description: "Le falta el último refuerzo: solo zona de cachorros hasta completarlo.",
      },
      {
        businessUnit: BU.DAYCARE,
        petId: pet("Zeus").id,
        type: "ALIMENTACION",
        severity: "BAJA",
        title: "Dieta propia",
        description: "Come únicamente la dieta hipoalergénica que trae el tutor.",
      },
      {
        businessUnit: BU.GROOMING,
        petId: pet("Rocky").id,
        type: "COMPORTAMIENTO",
        severity: "MEDIA",
        title: "Ansiedad con el secador",
        description: "Secado gradual y a baja potencia. Mejoró en las últimas dos visitas.",
        isResolved: true,
        resolvedAt: day(-3),
      },
    ].map((alert) => ({ daycareId, ...alert })),
  });

  return {
    clients: clients.length,
    pets: pets.length,
    reservations: await prisma.reservation.count({ where: { daycareId } }),
    checkInOuts: checkIns.length,
    incomes: incomes.length,
    vetVisits: await prisma.vetVisit.count({ where: { daycareId } }),
  };
}
