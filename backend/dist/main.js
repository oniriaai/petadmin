"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const db_1 = require("./db");
const reservas_1 = require("./modules/reservas");
const module_registry_1 = require("./platform/module-registry");
const app = (0, express_1.default)();
const port = Number(process.env.BACKEND_PORT ?? 3001);
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: "10mb" }));
app.get("/api/v1/health", async (_req, res) => {
    try {
        // Ping database
        await db_1.prisma.$queryRaw `SELECT 1`;
        res.json({
            ok: true,
            db: true,
            service: "pethijos-backend",
            ts: new Date().toISOString()
        });
    }
    catch (error) {
        res.status(500).json({
            ok: false,
            db: false,
            error: error instanceof Error ? error.message : "Database connection failed",
            service: "pethijos-backend",
            ts: new Date().toISOString()
        });
    }
});
(0, module_registry_1.registerBackendModules)(app);
app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ message: "Error interno del servidor" });
});
app.listen(port, () => {
    console.log(`Pethijos backend running on http://localhost:${port}/api/v1`);
    (0, reservas_1.startRecurringPlansScheduler)();
});
