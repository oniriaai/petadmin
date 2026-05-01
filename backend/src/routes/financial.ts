import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";

export const financialRouter = Router();
financialRouter.use(requireAuth);

// Zod schemas
const IncomeSchema = z.object({
  businessUnit: z.string().min(1),
  reservationId: z.string().optional(),
  type: z.enum(["RESERVA", "OTRO"]).default("RESERVA"),
  concept: z.string().min(1),
  amount: z.number().positive("Amount must be positive"),
  vatPercent: z.number().min(0).max(100).default(0),
  vatAmount: z.number().min(0).default(0),
  paymentMethod: z.enum(["EFECTIVO", "TARJETA", "TRANSFERENCIA"]).default("EFECTIVO"),
  invoiceNumber: z.string().optional(),
  invoiceStatus: z.enum(["PENDIENTE", "PAGADO"]).default("PENDIENTE"),
  date: z.coerce.date().default(() => new Date()),
  notes: z.string().optional(),
});

const ExpenseSchema = z.object({
  businessUnit: z.string().min(1),
  category: z.enum(["SUMINISTROS", "SERVICIOS", "PERSONAL", "UTILIDADES", "MANTENIMIENTO", "OTRO"]),
  description: z.string().min(1),
  amount: z.number().positive("Amount must be positive"),
  provider: z.string().min(1),
  date: z.coerce.date().default(() => new Date()),
  notes: z.string().optional(),
});

const PurchaseSchema = z.object({
  businessUnit: z.string().min(1),
  description: z.string().min(1),
  quantity: z.number().positive("Quantity must be positive").default(1),
  unitPrice: z.number().positive("Unit price must be positive"),
  provider: z.string().min(1),
  date: z.coerce.date().default(() => new Date()),
  notes: z.string().optional(),
});

// ==================== INCOME ENDPOINTS ====================

// GET /incomes - List all incomes with optional filters
financialRouter.get("/incomes", async (req, res) => {
  try {
    const { businessUnit, startDate, endDate, type } = req.query;
    
    const filters: any = {};
    if (businessUnit) filters.businessUnit = businessUnit as string;
    if (type) filters.type = type as string;

    let query = prisma.income.findMany({
      where: filters,
      include: { reservation: true },
      orderBy: { date: "desc" },
    });

    // Add date filters if provided
    if (startDate || endDate) {
      const dateRange: any = {};
      if (startDate) dateRange.gte = new Date(startDate as string);
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        dateRange.lte = end;
      }
      query = prisma.income.findMany({
        where: { ...filters, date: dateRange },
        include: { reservation: true },
        orderBy: { date: "desc" },
      });
    }

    const incomes = await query;
    res.json(incomes);
  } catch (error) {
    console.error("Error fetching incomes:", error);
    res.status(500).json({ error: "Failed to fetch incomes" });
  }
});

// GET /incomes/:id - Get single income
financialRouter.get("/incomes/:id", async (req, res) => {
  try {
    const income = await prisma.income.findUnique({
      where: { id: req.params.id },
      include: { reservation: true },
    });
    if (!income) return res.status(404).json({ error: "Income not found" });
    res.json(income);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch income" });
  }
});

// POST /incomes - Create new income
financialRouter.post("/incomes", async (req, res) => {
  try {
    const data = IncomeSchema.parse(req.body);
    
    // Verify businessUnit matches user's authorization
    if (data.businessUnit !== req.user?.businessUnit && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Calculate VAT if not provided
    const total = data.amount + data.vatAmount;

    const income = await prisma.income.create({
      data: {
        ...data,
        total,
      },
      include: { reservation: true },
    });

    res.status(201).json(income);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Error creating income:", error);
    res.status(500).json({ error: "Failed to create income" });
  }
});

// PUT /incomes/:id - Update income
financialRouter.put("/incomes/:id", async (req, res) => {
  try {
    const data = IncomeSchema.partial().parse(req.body);

    const existing = await prisma.income.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Income not found" });

    // Verify authorization
    if (existing.businessUnit !== req.user?.businessUnit && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Prevent status update if income is paid
    if (existing.invoiceStatus === "PAGADO" && data.amount && data.amount !== existing.amount) {
      return res.status(400).json({ error: "Cannot modify amount of paid income" });
    }

    const updated = await prisma.income.update({
      where: { id: req.params.id },
      data,
      include: { reservation: true },
    });

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: "Failed to update income" });
  }
});

// DELETE /incomes/:id - Soft delete income
financialRouter.delete("/incomes/:id", async (req, res) => {
  try {
    const income = await prisma.income.findUnique({ where: { id: req.params.id } });
    if (!income) return res.status(404).json({ error: "Income not found" });

    // Verify authorization
    if (income.businessUnit !== req.user?.businessUnit && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const deleted = await prisma.income.update({
      where: { id: req.params.id },
      data: { isActive: false },
      include: { reservation: true },
    });

    res.json(deleted);
  } catch (error) {
    res.status(500).json({ error: "Failed to delete income" });
  }
});

// ==================== EXPENSE ENDPOINTS ====================

// GET /expenses - List all expenses with optional filters
financialRouter.get("/expenses", async (req, res) => {
  try {
    const { businessUnit, startDate, endDate, category } = req.query;
    
    const filters: any = { isActive: true };
    if (businessUnit) filters.businessUnit = businessUnit as string;
    if (category) filters.category = category as string;

    const dateRange: any = {};
    if (startDate) dateRange.gte = new Date(startDate as string);
    if (endDate) {
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      dateRange.lte = end;
    }
    if (Object.keys(dateRange).length > 0) filters.date = dateRange;

    const expenses = await prisma.expense.findMany({
      where: filters,
      orderBy: { date: "desc" },
    });

    res.json(expenses);
  } catch (error) {
    console.error("Error fetching expenses:", error);
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
});

// GET /expenses/:id - Get single expense
financialRouter.get("/expenses/:id", async (req, res) => {
  try {
    const expense = await prisma.expense.findUnique({
      where: { id: req.params.id },
    });
    if (!expense) return res.status(404).json({ error: "Expense not found" });
    res.json(expense);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch expense" });
  }
});

// POST /expenses - Create new expense
financialRouter.post("/expenses", async (req, res) => {
  try {
    const data = ExpenseSchema.parse(req.body);

    // Verify businessUnit authorization
    if (data.businessUnit !== req.user?.businessUnit && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const expense = await prisma.expense.create({
      data,
    });

    res.status(201).json(expense);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Error creating expense:", error);
    res.status(500).json({ error: "Failed to create expense" });
  }
});

// PUT /expenses/:id - Update expense
financialRouter.put("/expenses/:id", async (req, res) => {
  try {
    const data = ExpenseSchema.partial().parse(req.body);

    const existing = await prisma.expense.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Expense not found" });

    // Verify authorization
    if (existing.businessUnit !== req.user?.businessUnit && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const updated = await prisma.expense.update({
      where: { id: req.params.id },
      data,
    });

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: "Failed to update expense" });
  }
});

// DELETE /expenses/:id - Soft delete expense
financialRouter.delete("/expenses/:id", async (req, res) => {
  try {
    const expense = await prisma.expense.findUnique({ where: { id: req.params.id } });
    if (!expense) return res.status(404).json({ error: "Expense not found" });

    // Verify authorization
    if (expense.businessUnit !== req.user?.businessUnit && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const deleted = await prisma.expense.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    res.json(deleted);
  } catch (error) {
    res.status(500).json({ error: "Failed to delete expense" });
  }
});

// ==================== PURCHASE ENDPOINTS ====================

// GET /purchases - List all purchases with optional filters
financialRouter.get("/purchases", async (req, res) => {
  try {
    const { businessUnit, startDate, endDate } = req.query;
    
    const filters: any = { isActive: true };
    if (businessUnit) filters.businessUnit = businessUnit as string;

    const dateRange: any = {};
    if (startDate) dateRange.gte = new Date(startDate as string);
    if (endDate) {
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      dateRange.lte = end;
    }
    if (Object.keys(dateRange).length > 0) filters.date = dateRange;

    const purchases = await prisma.purchase.findMany({
      where: filters,
      orderBy: { date: "desc" },
    });

    res.json(purchases);
  } catch (error) {
    console.error("Error fetching purchases:", error);
    res.status(500).json({ error: "Failed to fetch purchases" });
  }
});

// GET /purchases/:id - Get single purchase
financialRouter.get("/purchases/:id", async (req, res) => {
  try {
    const purchase = await prisma.purchase.findUnique({
      where: { id: req.params.id },
    });
    if (!purchase) return res.status(404).json({ error: "Purchase not found" });
    res.json(purchase);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch purchase" });
  }
});

// POST /purchases - Create new purchase
financialRouter.post("/purchases", async (req, res) => {
  try {
    const data = PurchaseSchema.parse(req.body);

    // Verify businessUnit authorization
    if (data.businessUnit !== req.user?.businessUnit && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Calculate total price
    const totalPrice = data.quantity * data.unitPrice;

    const purchase = await prisma.purchase.create({
      data: {
        ...data,
        totalPrice,
      },
    });

    res.status(201).json(purchase);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Error creating purchase:", error);
    res.status(500).json({ error: "Failed to create purchase" });
  }
});

// PUT /purchases/:id - Update purchase
financialRouter.put("/purchases/:id", async (req, res) => {
  try {
    const data = PurchaseSchema.partial().parse(req.body);

    const existing = await prisma.purchase.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Purchase not found" });

    // Verify authorization
    if (existing.businessUnit !== req.user?.businessUnit && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Recalculate total if quantity or unitPrice changed
    let totalPrice = existing.totalPrice;
    if (data.quantity || data.unitPrice) {
      const qty = data.quantity ?? existing.quantity;
      const price = data.unitPrice ?? existing.unitPrice;
      totalPrice = qty * price;
    }

    const updated = await prisma.purchase.update({
      where: { id: req.params.id },
      data: {
        ...data,
        totalPrice,
      },
    });

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: "Failed to update purchase" });
  }
});

// DELETE /purchases/:id - Soft delete purchase
financialRouter.delete("/purchases/:id", async (req, res) => {
  try {
    const purchase = await prisma.purchase.findUnique({ where: { id: req.params.id } });
    if (!purchase) return res.status(404).json({ error: "Purchase not found" });

    // Verify authorization
    if (purchase.businessUnit !== req.user?.businessUnit && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const deleted = await prisma.purchase.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    res.json(deleted);
  } catch (error) {
    res.status(500).json({ error: "Failed to delete purchase" });
  }
});


