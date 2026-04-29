import { Router } from "express";
import ExcelJS from "exceljs";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db";

export const exportRouter = Router();
exportRouter.use(requireAuth);

async function sendWorkbook(res: Parameters<typeof exportRouter.get>[1] extends (req: unknown, res: infer R) => unknown ? R : never, wb: ExcelJS.Workbook, filename: string) {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await wb.xlsx.write(res as unknown as NodeJS.WritableStream);
}

exportRouter.get("/clients", async (req, res) => {
  const clients = await prisma.client.findMany({
    include: { pets: { where: { isActive: true } } },
    orderBy: { lastName: "asc" },
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Clientes");
  ws.addRow(["Apellido", "Nombre", "Cédula", "Teléfono", "WhatsApp", "Email", "Ciudad", "Provincia", "Estado", "Mascotas"]);
  ws.getRow(1).font = { bold: true };
  clients.forEach(c => {
    ws.addRow([c.lastName, c.firstName, c.idNumber, c.phone, c.whatsapp, c.email, c.city, c.province, c.isActive ? "Activo" : "Inactivo", c.pets.map(p => p.name).join(", ")]);
  });
  await sendWorkbook(res as never, wb, "clientes.xlsx");
});

exportRouter.get("/reservations", async (req, res) => {
  const bu = req.user!.businessUnit;
  const { from, to } = req.query as Record<string, string>;
  const where: Record<string, unknown> = { businessUnit: bu };
  if (from || to) {
    where.checkIn = {};
    if (from) (where.checkIn as Record<string, unknown>).gte = new Date(from);
    if (to) (where.checkIn as Record<string, unknown>).lte = new Date(to);
  }
  const reservations = await prisma.reservation.findMany({
    where,
    include: { client: true, pets: { include: { pet: { select: { name: true } } } }, room: { select: { name: true } } },
    orderBy: { checkIn: "asc" },
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Reservas");
  ws.addRow(["ID", "Cliente", "Mascotas", "Servicio", "Sala", "Entrada", "Salida", "Estado", "Total", "Pendiente", "Forma de Pago"]);
  ws.getRow(1).font = { bold: true };
  reservations.forEach(r => {
    ws.addRow([r.id.slice(-8), `${r.client.lastName}, ${r.client.firstName}`, r.pets.map(p => p.pet.name).join(", "), r.service, r.room?.name, r.checkIn?.toLocaleDateString("es-EC"), r.checkOut?.toLocaleDateString("es-EC"), r.status, r.totalAmount, r.pendingAmount, r.paymentMethod]);
  });
  await sendWorkbook(res as never, wb, "reservas.xlsx");
});

exportRouter.get("/incomes", async (req, res) => {
  const bu = req.user!.businessUnit;
  const { from, to } = req.query as Record<string, string>;
  const where: Record<string, unknown> = { businessUnit: bu };
  if (from || to) {
    where.date = {};
    if (from) (where.date as Record<string, unknown>).gte = new Date(from);
    if (to) (where.date as Record<string, unknown>).lte = new Date(to);
  }
  const incomes = await prisma.income.findMany({ where, orderBy: { date: "desc" } });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Ingresos");
  ws.addRow(["Fecha", "Tipo", "Concepto", "Monto", "IVA %", "IVA", "Total", "Forma de Pago", "No. Factura", "Estado Factura"]);
  ws.getRow(1).font = { bold: true };
  incomes.forEach(i => {
    ws.addRow([i.date.toLocaleDateString("es-EC"), i.type, i.concept, i.amount, i.vatPercent, i.vatAmount, i.total, i.paymentMethod, i.invoiceNumber, i.invoiceStatus]);
  });
  await sendWorkbook(res as never, wb, "ingresos.xlsx");
});

exportRouter.get("/expenses", async (req, res) => {
  const bu = req.user!.businessUnit;
  const payables = await prisma.payable.findMany({
    where: { businessUnit: bu },
    include: { provider: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Gastos y Compras");
  ws.addRow(["Tipo", "Categoría", "Descripción", "Proveedor", "No. Factura", "Subtotal", "IVA %", "IVA", "Total", "Pagado", "Saldo", "Estado", "Vence"]);
  ws.getRow(1).font = { bold: true };
  payables.forEach(p => {
    ws.addRow([p.type, p.category, p.description, p.provider?.name, p.invoiceNumber, p.subtotal, p.vatPercent, p.vatAmount, p.total, p.paid, p.balance, p.status, p.dueDate?.toLocaleDateString("es-EC")]);
  });
  await sendWorkbook(res as never, wb, "gastos-compras.xlsx");
});
