import "dotenv/config";
import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { prisma } from "./db";
import {
  errorHandler,
  initErrorReporting,
  logger,
  requestLogger,
} from "./middleware/observability";
import { tenantGuardContext } from "./core/tenancy/guard";
import { assertSecureConfig, corsOptions, globalLimiter } from "./middleware/security";
import { startRecurringPlansScheduler } from "./modules/reservas";
import { startRemindersScheduler } from "./modules/recordatorios";
import { startBillingScheduler } from "./modules/suscripciones";
import { registerBackendModules } from "./platform/module-registry";

// Before anything is mounted: a production process with a default signing secret must not
// start at all, rather than start and quietly accept forged tokens.
assertSecureConfig();
initErrorReporting();

const app = express();
const port = Number(process.env.BACKEND_PORT ?? 3001);

// Behind a reverse proxy, req.ip is the proxy unless Express is told otherwise, which would
// make every IP-keyed rate limit share one bucket. Opt in explicitly: trusting the header
// when nothing strips it lets a caller spoof its own address.
if (process.env.TRUST_PROXY) {
  const value = process.env.TRUST_PROXY;
  app.set("trust proxy", /^\d+$/.test(value) ? Number(value) : value);
}

app.disable("x-powered-by");
app.use(requestLogger);
app.use(helmet());
// Nothing in front of the API compresses for it, and the list endpoints answer with large JSON.
app.use(compression());
app.use(cors(corsOptions()));
app.use(express.json({ limit: "10mb" }));
app.use(globalLimiter);
// Establishes the per-request context the tenant-scope guard in db.ts reads. Must wrap the
// routers, so it is mounted before them and after the body parser.
app.use(tenantGuardContext);

/**
 * Liveness and schema state.
 *
 * The database ping alone answered "can I reach Postgres", which is not the same as "can I
 * serve": a process running against a schema it has not migrated will fail on real routes
 * while reporting itself healthy. `_prisma_migrations` is read directly because that is the
 * record `migrate deploy` writes.
 */
app.get("/api/v1/health", async (_req, res) => {
  try {
    const [migrations] = await prisma.$queryRaw<Array<{ applied: bigint; pending: bigint }>>`
      SELECT
        count(*) FILTER (WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL) AS applied,
        count(*) FILTER (WHERE "finished_at" IS NULL OR "rolled_back_at" IS NOT NULL) AS pending
      FROM "_prisma_migrations"
    `;

    const pending = Number(migrations?.pending ?? 0);
    res.status(pending > 0 ? 503 : 200).json({
      ok: pending === 0,
      db: true,
      migrations: { applied: Number(migrations?.applied ?? 0), pending },
      service: "argos-backend",
      // Set by the host on Render; the demo's deploy workflow polls it to know when the commit
      // it asked for is the one answering. Null anywhere else.
      commit: process.env.RENDER_GIT_COMMIT ?? null,
      ts: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      db: false,
      error: error instanceof Error ? error.message : "Database connection failed",
      service: "argos-backend",
      ts: new Date().toISOString(),
    });
  }
});

/**
 * Readiness for an orchestrator: cheap, unauthenticated, and it says nothing about the
 * deployment beyond whether this process can take traffic.
 */
app.get("/api/v1/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ready: true });
  } catch {
    res.status(503).json({ ready: false });
  }
});

registerBackendModules(app);

app.use(errorHandler);

/**
 * Whether this process also runs the scheduled work: the daily recurring-plan generation, the
 * hourly reminders and the hourly subscription billing.
 *
 * In development it does, so `docker compose up` behaves as it always has. In production it
 * must not: N replicas would each run it, and a redeploy resets the timer so it may never
 * fire at all. There each is a scheduled one-shot instead (`dist/jobs/run-recurring-plans.js`,
 * `dist/jobs/run-reminders.js` and `dist/jobs/run-billing.js`, the `scheduler`, `reminders` and
 * `billing` services in docker-compose.prod.yml).
 */
const runSchedulerInProcess = process.env.RUN_SCHEDULER_IN_PROCESS
  ? process.env.RUN_SCHEDULER_IN_PROCESS.toLowerCase() === "true"
  : process.env.NODE_ENV !== "production";

app.listen(port, () => {
  logger.info(`Argos Suite backend escuchando en http://localhost:${port}/api/v1`);
  if (runSchedulerInProcess) {
    startRecurringPlansScheduler();
    startRemindersScheduler();
    startBillingScheduler();
  } else {
    logger.info(
      "[recurring-plans] [reminders] [billing] schedulers en proceso desactivados; ejecútalos como jobs programados",
    );
  }
});
