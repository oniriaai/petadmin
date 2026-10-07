import { Response, Router } from "express";
import ExcelJS from "exceljs";
import { handleAuthzError } from "../middleware/auth";
import { prisma } from "../db";
import { buildDaycareWhere, buildScopeWhere } from "../core/tenancy/scope";

export const exportRouter = Router();

/** Rows read from the database, and held in memory, at a time. */
const EXPORT_BATCH_SIZE = 500;

/**
 * Writes one worksheet to the response as it is read, a batch at a time.
 *
 * These exports used to read the tenant's whole table, build the workbook in memory and only
 * then send it, so one customer's accumulated history decided how much memory the process
 * needed, for every tenant sharing it. Nothing is truncated: an export that silently stopped at
 * a cap would be believed. The rows are paged by cursor instead, and each is flushed to the
 * response once written.
 *
 * `fetchBatch` receives the id of the last row already written. The first batch is read before
 * any header goes out, so a query that fails still answers with a proper status.
 */
async function streamSheet<T extends { id: string }>(
  res: Response,
  options: {
    filename: string;
    sheet: string;
    headers: string[];
    fetchBatch: (cursor: string | undefined) => Promise<T[]>;
    toRow: (record: T) => unknown[];
  },
) {
  let batch = await options.fetchBatch(undefined);

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename="${options.filename}"`);
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
  const ws = wb.addWorksheet(options.sheet);
  const header = ws.addRow(options.headers);
  header.font = { bold: true };
  header.commit();

  while (batch.length > 0) {
    for (const record of batch) ws.addRow(options.toRow(record)).commit();
    if (batch.length < EXPORT_BATCH_SIZE) break;
    batch = await options.fetchBatch(batch[batch.length - 1].id);
  }
  ws.commit();
  await wb.commit();
}

/** The `cursor`/`skip`/`take` of one batch, for a `findMany` ordered with `id` as tiebreak. */
function batchArgs(cursor: string | undefined) {
  return {
    take: EXPORT_BATCH_SIZE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  };
}

/**
 * Once the file has started there is no status left to change: the only honest signal that an
 * export broke halfway is a download that fails, not a truncated workbook that opens.
 */
function failExport(res: Response, error: unknown) {
  if (res.headersSent) {
    console.error(error);
    res.destroy();
    return;
  }
  if (handleAuthzError(res, error)) return;
  console.error(error);
  res.status(500).json({ message: "Error interno del servidor" });
}

exportRouter.get("/clients", async (req, res) => {
  try {
    // This query had NO tenant filter: any user of any daycare that bought Informes exported
    // every other daycare's tutors, with their phone, email and address. The three exports
    // below were scoped; this one was missed, and no e2e test reached /export, so nothing
    // caught it until the tenant-scope guard did. `Client` has no businessUnit, so the daycare
    // filter alone is the right one, as in clients.router.ts.
    const where = buildDaycareWhere(req);
    await streamSheet(res, {
      filename: "clientes.xlsx",
      sheet: "Clientes",
      headers: [
        "Apellido",
        "Nombre",
        "Cédula",
        "Teléfono",
        "WhatsApp",
        "Email",
        "Ciudad",
        "Provincia",
        "Estado",
        "Mascotas",
      ],
      fetchBatch: (cursor) =>
        prisma.client.findMany({
          where,
          include: { pets: { where: { isActive: true } } },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
          ...batchArgs(cursor),
        }),
      toRow: (c) => [
        c.lastName,
        c.firstName,
        c.idNumber,
        c.phone,
        c.whatsapp,
        c.email,
        c.city,
        c.province,
        c.isActive ? "Activo" : "Inactivo",
        c.pets.map((p) => p.name).join(", "),
      ],
    });
  } catch (error) {
    // It also had no catch. Express 4 does not handle a rejected async handler, so anything
    // thrown in here became an unhandled rejection and took the process down with it.
    failExport(res, error);
  }
});

exportRouter.get("/reservations", async (req, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const where: Record<string, unknown> = buildScopeWhere(req);
    if (from || to) {
      where.checkIn = {};
      if (from) (where.checkIn as Record<string, unknown>).gte = new Date(from);
      if (to) (where.checkIn as Record<string, unknown>).lte = new Date(to);
    }
    await streamSheet(res, {
      filename: "reservas.xlsx",
      sheet: "Reservas",
      headers: [
        "ID",
        "Cliente",
        "Mascotas",
        "Servicio",
        "Sala",
        "Entrada",
        "Salida",
        "Estado",
        "Total",
        "Pendiente",
        "Forma de Pago",
      ],
      fetchBatch: (cursor) =>
        prisma.reservation.findMany({
          where,
          include: {
            client: { select: { firstName: true, lastName: true } },
            pets: { include: { pet: { select: { name: true } } } },
            room: { select: { name: true } },
          },
          orderBy: [{ checkIn: "asc" }, { id: "asc" }],
          ...batchArgs(cursor),
        }),
      toRow: (r) => [
        r.id.slice(-8),
        `${r.client.lastName}, ${r.client.firstName}`,
        r.pets.map((p) => p.pet.name).join(", "),
        r.service,
        r.room?.name,
        r.checkIn?.toLocaleDateString("es-EC"),
        r.checkOut?.toLocaleDateString("es-EC"),
        r.status,
        r.totalAmount,
        r.pendingAmount,
        r.paymentMethod,
      ],
    });
  } catch (error) {
    failExport(res, error);
  }
});

exportRouter.get("/incomes", async (req, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const where: Record<string, unknown> = buildScopeWhere(req);
    if (from || to) {
      where.date = {};
      if (from) (where.date as Record<string, unknown>).gte = new Date(from);
      if (to) (where.date as Record<string, unknown>).lte = new Date(to);
    }
    await streamSheet(res, {
      filename: "ingresos.xlsx",
      sheet: "Ingresos",
      headers: [
        "Fecha",
        "Tipo",
        "Concepto",
        "Monto",
        "IVA %",
        "IVA",
        "Total",
        "Forma de Pago",
        "No. Factura",
        "Estado Factura",
      ],
      fetchBatch: (cursor) =>
        prisma.income.findMany({
          where,
          orderBy: [{ date: "desc" }, { id: "desc" }],
          ...batchArgs(cursor),
        }),
      toRow: (i) => [
        i.date.toLocaleDateString("es-EC"),
        i.type,
        i.concept,
        i.amount,
        i.vatPercent,
        i.vatAmount,
        i.total,
        i.paymentMethod,
        i.invoiceNumber,
        i.invoiceStatus,
      ],
    });
  } catch (error) {
    failExport(res, error);
  }
});

exportRouter.get("/expenses", async (req, res) => {
  try {
    const where = buildScopeWhere(req);
    await streamSheet(res, {
      filename: "gastos-compras.xlsx",
      sheet: "Gastos y Compras",
      headers: [
        "Tipo",
        "Categoría",
        "Descripción",
        "Proveedor",
        "No. Factura",
        "Subtotal",
        "IVA %",
        "IVA",
        "Total",
        "Pagado",
        "Saldo",
        "Estado",
        "Vence",
      ],
      fetchBatch: (cursor) =>
        prisma.payable.findMany({
          where,
          include: { provider: { select: { name: true } } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          ...batchArgs(cursor),
        }),
      toRow: (p) => [
        p.type,
        p.category,
        p.description,
        p.provider?.name,
        p.invoiceNumber,
        p.subtotal,
        p.vatPercent,
        p.vatAmount,
        p.total,
        p.paid,
        p.balance,
        p.status,
        p.dueDate?.toLocaleDateString("es-EC"),
      ],
    });
  } catch (error) {
    failExport(res, error);
  }
});
