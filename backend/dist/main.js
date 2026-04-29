"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const zod_1 = require("zod");
const app = (0, express_1.default)();
const port = Number(process.env.BACKEND_PORT ?? 3001);
const jwtSecret = process.env.JWT_SECRET ?? "change_me";
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const loginSchema = zod_1.z.object({
    businessUnit: zod_1.z.enum(["KINDERDOG", "PETHIJOS"]),
    username: zod_1.z.string().min(1),
    password: zod_1.z.string().min(1),
});
const seededUsers = {
    KINDERDOG: { username: "kinderdog_admin", password: "kinderdog123" },
    PETHIJOS: { username: "pethijos_admin", password: "pethijos123" },
};
app.get("/api/v1/health", (_req, res) => {
    res.json({ ok: true, service: "pethijos-backend" });
});
app.post("/api/v1/auth/login", (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Payload invalido" });
        return;
    }
    const { businessUnit, username, password } = parsed.data;
    const user = seededUsers[businessUnit];
    if (username !== user.username || password !== user.password) {
        res.status(401).json({ message: "Credenciales incorrectas" });
        return;
    }
    const token = jsonwebtoken_1.default.sign({ businessUnit, username }, jwtSecret, { expiresIn: "12h" });
    res.json({
        token,
        user: { businessUnit, username, role: "owner" },
    });
});
app.get("/api/v1/dashboard/summary", (_req, res) => {
    res.json({
        reservasHoy: 0,
        entradasHoy: 0,
        salidasHoy: 0,
        ocupacionPorcentaje: 0,
        ingresosDelDia: 0,
        alertas: [],
    });
});
app.get("/api/v1/reservations", (_req, res) => {
    res.json([]);
});
app.listen(port, () => {
    console.log(`Pethijos backend running on http://localhost:${port}/api/v1`);
});
