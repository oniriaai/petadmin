import "dotenv/config";

import { prisma } from "../db";
import { runAutomaticReminders } from "../modules/recordatorios";

/**
 * The automatic reminders as a one-shot process, for the same reasons the recurring-plan
 * generation is one: a timer inside the web process runs once per replica and is reset by every
 * deploy.
 *
 * Meant to run hourly. Each unit is only sent for during its own daytime, and every send is
 * claimed in the database first, so running it more often, or twice at once, sends nothing
 * twice.
 *
 * Exits non-zero when a send failed so a cron or orchestrator can see it.
 */
async function main(): Promise<void> {
  const startedAt = Date.now();
  const { failures, ...stats } = await runAutomaticReminders();
  console.log("[reminders] ejecución", { ...stats, durationMs: Date.now() - startedAt });

  if (stats.failed > 0) {
    console.error(`[reminders] ${stats.failed} recordatorios fallaron`, failures);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("[reminders] la ejecución falló", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
