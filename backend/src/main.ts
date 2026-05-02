import "dotenv/config";
import cors from "cors";
import express from "express";

import { authRouter } from "./routes/auth";
import { dashboardRouter } from "./routes/dashboard";
import { clientsRouter } from "./routes/clients";
import { petsRouter } from "./routes/pets";
import { reservationsRouter } from "./routes/reservations";
import { recurringPlansRouter } from "./routes/recurring-plans";
import { providersRouter } from "./routes/providers";
import { roomsRouter } from "./routes/rooms";
import { payablesRouter } from "./routes/payables";
import { incomesRouter } from "./routes/incomes";
import { inventoryRouter } from "./routes/inventory";
import { reportsRouter } from "./routes/reports";
import { alertsRouter } from "./routes/alerts";
import { contractsRouter } from "./routes/contracts";
import { exportRouter } from "./routes/export";
import { checkInOutRouter } from "./routes/check-in-out";

import { storageRouter } from "./routes/storage";

import { prisma } from "./db";

const app = express();
const port = Number(process.env.BACKEND_PORT ?? 3001);

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/api/v1/health", async (_req, res) => {
  try {
    // Ping database
    await prisma.$queryRaw`SELECT 1`;
    res.json({ 
      ok: true, 
      db: true,
      service: "pethijos-backend", 
      ts: new Date().toISOString() 
    });
  } catch (error) {
    res.status(500).json({ 
      ok: false, 
      db: false,
      error: error instanceof Error ? error.message : "Database connection failed",
      service: "pethijos-backend", 
      ts: new Date().toISOString() 
    });
  }
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/dashboard", dashboardRouter);
app.use("/api/v1/clients", clientsRouter);
app.use("/api/v1/pets", petsRouter);
app.use("/api/v1/storage", storageRouter);
app.use("/api/v1/reservations", reservationsRouter);
app.use("/api/v1/recurring-plans", recurringPlansRouter);
app.use("/api/v1/check-in-out", checkInOutRouter);
app.use("/api/v1/providers", providersRouter);
app.use("/api/v1/rooms", roomsRouter);
app.use("/api/v1/payables", payablesRouter);
app.use("/api/v1/incomes", incomesRouter);
app.use("/api/v1/inventory", inventoryRouter);
app.use("/api/v1/reports", reportsRouter);
app.use("/api/v1/alerts", alertsRouter);
app.use("/api/v1/contracts", contractsRouter);
app.use("/api/v1/export", exportRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ message: "Error interno del servidor" });
});

app.listen(port, () => {
  console.log(`Pethijos backend running on http://localhost:${port}/api/v1`);
});
