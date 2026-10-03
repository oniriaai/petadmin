import "dotenv/config";

import { prisma } from "../db";
import { generateRecurringReservations } from "../modules/reservas/recurring-plans.service";

/**
 * The recurring-plan generation as a one-shot process.
 *
 * It used to run only as a `setInterval(24h)` inside the web process, which fails in two
 * directions: N web replicas run it N times concurrently, and — more likely in practice — a
 * service that is redeployed more often than once a day resets the timer and never runs it at
 * all. Generation itself is unchanged and already idempotent on the
 * `(recurringPlanId, checkIn)` unique key, so this only moves the trigger out to a scheduler
 * that runs it exactly once.
 *
 * Exits non-zero on failure so a cron or orchestrator can see it.
 */
async function main(): Promise<void> {
  const startedAt = Date.now();
  const stats = await generateRecurringReservations();
  console.log("[recurring-plans] generation", { ...stats, durationMs: Date.now() - startedAt });

  // A clean run reports no failures. Surface a partial run as a non-zero exit rather than
  // letting a silent success hide 400 occurrences that did not generate.
  if (stats.failed > 0) {
    console.error(`[recurring-plans] ${stats.failed} ocurrencias fallaron`, stats.failures);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("[recurring-plans] generation failed", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
