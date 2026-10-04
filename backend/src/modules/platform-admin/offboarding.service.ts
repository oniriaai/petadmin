import ExcelJS from "exceljs";

import { prisma } from "../../db";
import { AuthzError } from "../../middleware/auth";
import { deleteDaycarePrefix, type PrefixDeletionResult } from "../../core/storage/bulk-delete";
import { invalidate } from "../../platform/module-access";
import { invalidatePrincipalsForDaycare } from "../../core/tenancy/principal";
import { invalidateUnitSettings } from "../../core/tenancy/unit-settings";

/**
 * Offboarding a client daycare: hand its data back, then remove it.
 *
 * A tenant could be deactivated but never actually left. `isActive: false` keeps every row and
 * every file, which is the right default — but it is not an answer to "we are leaving, give us
 * our data and delete it". Both halves live here because they belong together: the export is
 * what makes the deletion defensible.
 */

/** Everything one daycare owns, as one workbook. */
export async function buildDaycareExport(daycareId: string): Promise<ExcelJS.Workbook> {
  const daycare = await prisma.daycare.findUnique({ where: { id: daycareId } });
  if (!daycare) throw new AuthzError(404, "Guardería no encontrada");

  const [users, clients, pets, rooms, reservations, incomes, payables, inventory, contracts] =
    await Promise.all([
      prisma.user.findMany({
        where: { daycareId },
        select: {
          username: true,
          name: true,
          role: true,
          businessUnit: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { username: "asc" },
      }),
      prisma.client.findMany({
        where: { daycareId },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      }),
      prisma.pet.findMany({
        where: { daycareId },
        include: { client: { select: { firstName: true, lastName: true } }, vaccinations: true },
        orderBy: { name: "asc" },
      }),
      prisma.room.findMany({ where: { daycareId }, orderBy: { name: "asc" } }),
      prisma.reservation.findMany({
        where: { daycareId },
        include: {
          client: { select: { firstName: true, lastName: true } },
          pets: { include: { pet: { select: { name: true } } } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.income.findMany({ where: { daycareId }, orderBy: { date: "asc" } }),
      prisma.payable.findMany({
        where: { daycareId },
        include: { provider: { select: { name: true } }, payments: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.inventoryItem.findMany({ where: { daycareId }, orderBy: { name: "asc" } }),
      prisma.contract.findMany({
        where: { daycareId },
        include: { client: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Pethijos Admin";
  wb.created = new Date();

  const sheet = (name: string, headers: string[]) => {
    const ws = wb.addWorksheet(name);
    ws.addRow(headers);
    ws.getRow(1).font = { bold: true };
    return ws;
  };

  const info = sheet("Guardería", ["Campo", "Valor"]);
  for (const [field, value] of [
    ["Identificador", daycare.slug],
    ["Nombre", daycare.name],
    ["Razón social", daycare.legalName ?? ""],
    ["Zona horaria", daycare.timezone],
    ["Unidades", daycare.units],
    ["Activa", daycare.isActive ? "Sí" : "No"],
    ["Creada", daycare.createdAt.toISOString()],
    ["Exportada", new Date().toISOString()],
  ]) {
    info.addRow([field, value]);
  }

  // Passwords are not in here, by design: a hash is not data the customer needs, and handing
  // one over is handing over something to crack offline.
  const us = sheet("Usuarios", ["Usuario", "Nombre", "Rol", "Unidad", "Activo", "Creado"]);
  users.forEach((u) =>
    us.addRow([u.username, u.name, u.role, u.businessUnit, u.isActive ? "Sí" : "No", u.createdAt]),
  );

  const cs = sheet("Tutores", [
    "Apellido",
    "Nombre",
    "Cédula",
    "Teléfono",
    "WhatsApp",
    "Email",
    "Dirección",
    "Ciudad",
    "Provincia",
    "Activo",
    "Notas",
  ]);
  clients.forEach((c) =>
    cs.addRow([
      c.lastName,
      c.firstName,
      c.idNumber,
      c.phone,
      c.whatsapp,
      c.email,
      c.address,
      c.city,
      c.province,
      c.isActive ? "Sí" : "No",
      c.notes,
    ]),
  );

  const ps = sheet("Perrhijos", [
    "Nombre",
    "Tutor",
    "Especie",
    "Raza",
    "Sexo",
    "Nacimiento",
    "Peso",
    "Microchip",
    "Alergias",
    "Activo",
    "Vacunas",
  ]);
  pets.forEach((p) =>
    ps.addRow([
      p.name,
      `${p.client.firstName} ${p.client.lastName}`,
      p.species,
      p.breed,
      p.sex,
      p.birthdate,
      p.weight,
      p.microchip,
      p.allergies,
      p.isActive ? "Sí" : "No",
      p.vaccinations.map((v) => `${v.name} (${v.date.toISOString().slice(0, 10)})`).join("; "),
    ]),
  );

  const rs = sheet("Salas", ["Nombre", "Unidad", "Capacidad", "Tipo", "Activa"]);
  rooms.forEach((r) =>
    rs.addRow([r.name, r.businessUnit, r.capacity, r.type, r.isActive ? "Sí" : "No"]),
  );

  const vs = sheet("Reservas", [
    "Unidad",
    "Servicio",
    "Estado",
    "Tutor",
    "Perrhijos",
    "Entrada",
    "Salida",
    "Base",
    "IVA",
    "Total",
    "Pendiente",
  ]);
  reservations.forEach((r) =>
    vs.addRow([
      r.businessUnit,
      r.service,
      r.status,
      `${r.client.firstName} ${r.client.lastName}`,
      r.pets.map((rp) => rp.pet.name).join(", "),
      r.checkIn,
      r.checkOut,
      r.basePrice,
      r.vatAmount,
      r.totalAmount,
      r.pendingAmount,
    ]),
  );

  const is = sheet("Cobros", [
    "Fecha",
    "Unidad",
    "Tipo",
    "Concepto",
    "Monto",
    "IVA",
    "Total",
    "Método",
    "Factura",
    "Estado",
  ]);
  incomes.forEach((i) =>
    is.addRow([
      i.date,
      i.businessUnit,
      i.type,
      i.concept,
      i.amount,
      i.vatAmount,
      i.total,
      i.paymentMethod,
      i.invoiceNumber,
      i.invoiceStatus,
    ]),
  );

  const pys = sheet("Cuentas por pagar", [
    "Unidad",
    "Tipo",
    "Categoría",
    "Descripción",
    "Proveedor",
    "Subtotal",
    "IVA",
    "Total",
    "Pagado",
    "Saldo",
    "Estado",
    "Pagos",
  ]);
  payables.forEach((p) =>
    pys.addRow([
      p.businessUnit,
      p.type,
      p.category,
      p.description,
      p.provider?.name,
      p.subtotal,
      p.vatAmount,
      p.total,
      p.paid,
      p.balance,
      p.status,
      p.payments.length,
    ]),
  );

  const invs = sheet("Inventario", [
    "Nombre",
    "Unidad",
    "Categoría",
    "Medida",
    "Stock",
    "Mínimo",
    "Costo",
  ]);
  inventory.forEach((i) =>
    invs.addRow([
      i.name,
      i.businessUnit,
      i.category,
      i.unit,
      i.currentStock,
      i.minStock,
      i.unitCost,
    ]),
  );

  const cts = sheet("Contratos", ["Nombre", "Tutor", "Estado", "Inicio", "Fin"]);
  contracts.forEach((c) =>
    cts.addRow([
      c.name,
      `${c.client.firstName} ${c.client.lastName}`,
      c.status,
      c.startDate,
      c.endDate,
    ]),
  );

  return wb;
}

export interface DeletionSummary {
  slug: string;
  name: string;
  rows: Record<string, number>;
  storage: PrefixDeletionResult;
}

/**
 * Permanently removes a daycare.
 *
 * Two safeguards, because this is the one irreversible action in the console:
 *   - the caller must repeat the daycare's slug, so an id pasted into the wrong row cannot do
 *     it;
 *   - the daycare must already be deactivated, which makes "stop their access" and "destroy
 *     their data" two separate decisions taken at two separate times.
 *
 * Order matters. Several of these tables reference each other (`check_in_outs` points at
 * reservations, pets, clients, rooms and users; `incomes` at reservations; `payables` at
 * providers), and `users.daycareId` is onDelete: Restrict, so the daycare row cannot go until
 * its users have. One transaction, so a failure half-way leaves the tenant intact.
 *
 * The audit entry survives: `PlatformAuditLog.daycareId` is a plain column with no foreign key,
 * precisely so the record of a deletion outlives what it deleted.
 */
export async function deleteDaycare(
  daycareId: string,
  confirmSlug: string,
): Promise<DeletionSummary> {
  const daycare = await prisma.daycare.findUnique({
    where: { id: daycareId },
    select: { id: true, slug: true, name: true, isActive: true },
  });
  if (!daycare) throw new AuthzError(404, "Guardería no encontrada");

  if (confirmSlug.trim().toLowerCase() !== daycare.slug) {
    throw new AuthzError(
      400,
      `Para eliminar esta guardería repite su identificador exacto ("${daycare.slug}") en el campo de confirmación.`,
    );
  }
  if (daycare.isActive) {
    throw new AuthzError(
      409,
      "Desactiva la guardería antes de eliminarla: son dos decisiones distintas y conviene que lo sigan siendo.",
    );
  }

  const rows: Record<string, number> = {};
  const count = (key: string, result: { count: number }) => {
    rows[key] = result.count;
  };

  await prisma.$transaction(async (tx) => {
    // Children that inherit tenancy through a parent, first.
    count(
      "inventoryMovements",
      await tx.inventoryMovement.deleteMany({ where: { item: { daycareId } } }),
    );
    count("payments", await tx.payment.deleteMany({ where: { payable: { daycareId } } }));
    count("petVaccinations", await tx.petVaccination.deleteMany({ where: { pet: { daycareId } } }));
    count("petDocuments", await tx.petDocument.deleteMany({ where: { pet: { daycareId } } }));
    count(
      "reservationPets",
      await tx.reservationPet.deleteMany({ where: { reservation: { daycareId } } }),
    );

    // Then the rows that reference the operational core.
    count("checkInOuts", await tx.checkInOut.deleteMany({ where: { daycareId } }));
    count("incomes", await tx.income.deleteMany({ where: { daycareId } }));
    count("alerts", await tx.alert.deleteMany({ where: { daycareId } }));
    count("contracts", await tx.contract.deleteMany({ where: { daycareId } }));

    // Reservations before the plans they belong to, which they reference.
    count("reservations", await tx.reservation.deleteMany({ where: { daycareId } }));
    count("recurringPlans", await tx.recurringPlan.deleteMany({ where: { daycareId } }));

    count("payables", await tx.payable.deleteMany({ where: { daycareId } }));
    count("inventoryItems", await tx.inventoryItem.deleteMany({ where: { daycareId } }));
    count("pets", await tx.pet.deleteMany({ where: { daycareId } }));
    count("clients", await tx.client.deleteMany({ where: { daycareId } }));
    count("providers", await tx.provider.deleteMany({ where: { daycareId } }));
    count("rooms", await tx.room.deleteMany({ where: { daycareId } }));
    count("veterinarians", await tx.veterinarian.deleteMany({ where: { daycareId } }));
    count("unitSettings", await tx.businessUnitSetting.deleteMany({ where: { daycareId } }));
    count("modules", await tx.daycareModule.deleteMany({ where: { daycareId } }));

    // users.daycareId is onDelete: Restrict, so these must go before the daycare itself.
    count("users", await tx.user.deleteMany({ where: { daycareId } }));
    count("daycare", await tx.daycare.deleteMany({ where: { id: daycareId } }));
  });

  // In-process caches keyed by this tenant would otherwise answer for a tenant that no longer
  // exists until their TTL ran out.
  invalidate(daycareId);
  invalidatePrincipalsForDaycare(daycareId);
  invalidateUnitSettings(daycareId);

  /**
   * Files last, and deliberately outside the transaction.
   *
   * Object storage cannot join a database transaction, so one of the two has to go first. The
   * database goes first because the prefix is derived from the daycare id (`daycares/{id}/`),
   * which the caller still has: a storage failure is retryable and is reported rather than
   * swallowed. The other order would risk destroying the files of a tenant that still exists.
   */
  const storage = await deleteDaycarePrefix(daycareId);

  return { slug: daycare.slug, name: daycare.name, rows, storage };
}
