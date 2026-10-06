import "dotenv/config";

import { prisma } from "../db";
import { runBillingCycle } from "../modules/suscripciones";

/**
 * Subscription billing as a one-shot process, for the same reasons the reminders are one: a
 * timer inside the web process runs once per replica and is reset by every deploy.
 *
 * Meant to run hourly. It renews what is due, retries declined cards, warns trials that are
 * ending and suspends what stayed unpaid. Every charge and every notice is claimed in the
 * database first, so running it more often, or twice at once, charges nobody twice.
 *
 * Exits non-zero when a tenant could not be processed so a cron or orchestrator can see it.
 */
async function main(): Promise<void> {
  const startedAt = Date.now();
  const { failures, ...stats } = await runBillingCycle();
  console.log("[billing] ejecución", { ...stats, durationMs: Date.now() - startedAt });

  if (failures.length > 0) {
    console.error(`[billing] ${failures.length} suscripciones fallaron`, failures);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("[billing] la ejecución falló", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
