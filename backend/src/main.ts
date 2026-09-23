import "dotenv/config";
import cors from "cors";
import express from "express";

import { prisma } from "./db";
import { startRecurringPlansScheduler } from "./modules/reservas";
import { registerBackendModules } from "./platform/module-registry";

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

registerBackendModules(app);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ message: "Error interno del servidor" });
});

app.listen(port, () => {
  console.log(`Pethijos backend running on http://localhost:${port}/api/v1`);
  startRecurringPlansScheduler();
});
