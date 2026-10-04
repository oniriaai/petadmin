/**
 * The recurring-plans scheduler must be idempotent.
 *
 * It runs on boot and every 24h over a rolling 30-day horizon, so the overwhelming majority of
 * occurrences it evaluates on any given run already exist. Reporting those as failures made the
 * log useless: a healthy run and a broken one both printed a large `failed` count.
 */

import { generateRecurringReservations } from "../src/modules/reservas/recurring-plans.service";
import { prisma } from "../src/db";

async function main(): Promise<void> {
  console.log("\n🔁 Idempotencia del generador de planes recurrentes\n" + "=".repeat(60));

  const planCount = await prisma.recurringPlan.count({ where: { isActive: true } });
  if (planCount === 0) {
    console.error("✗ No hay planes recurrentes activos sembrados: la prueba no probaría nada");
    process.exit(1);
  }

  // First run: may create, may skip, depending on what earlier runs left behind.
  const first = await generateRecurringReservations();
  console.log("  primera ejecución:", JSON.stringify(first));

  // Second run over the same horizon: everything the first run touched now exists.
  const second = await generateRecurringReservations();
  console.log("  segunda ejecución:", JSON.stringify(second));

  let failed = 0;
  const check = (name: string, condition: boolean, detail = "") => {
    if (condition) {
      console.log(`✓ ${name}`);
    } else {
      console.error(`✗ ${name}${detail ? `: ${detail}` : ""}`);
      failed += 1;
    }
  };

  check(
    "La segunda ejecución no crea nada nuevo",
    second.createdReservations === 0,
    `creó ${second.createdReservations}`,
  );

  check(
    "La segunda ejecución no reporta fallos",
    second.failed === 0,
    `${second.failed} fallo(s): ${JSON.stringify(second.failures)}`,
  );

  check(
    "Las ocurrencias existentes se cuentan como omitidas",
    second.skippedExisting + second.skippedDeceased === second.evaluatedOccurrences,
    `omitidas ${second.skippedExisting + second.skippedDeceased} de ${second.evaluatedOccurrences} evaluadas`,
  );

  check(
    "Se evaluaron ocurrencias reales",
    second.evaluatedOccurrences > 0,
    "no se evaluó ninguna ocurrencia, la prueba sería vacía",
  );

  // A clean run must leave the breakdown empty; a dirty one must explain itself.
  check(
    "El desglose de fallos está vacío en una ejecución limpia",
    Object.keys(second.failures).length === 0,
    JSON.stringify(second.failures),
  );

  // A plan whose pet has since died is not a failure: it used to fail on every run, for every
  // occurrence, until someone edited the plan. Built on a seeded plan and removed afterwards.
  const template = await prisma.recurringPlan.findFirst({ where: { isActive: true } });
  if (template) {
    const pet = await prisma.pet.create({
      data: {
        daycareId: template.daycareId,
        clientId: template.clientId,
        name: "Idempotencia",
        sex: "M",
        deceasedAt: new Date(),
      },
    });
    const { id: _id, createdAt: _createdAt, ...planData } = template;
    const plan = await prisma.recurringPlan.create({ data: { ...planData, petIds: pet.id } });
    try {
      const run = await generateRecurringReservations();
      console.log("  con un plan de mascota fallecida:", JSON.stringify(run));
      check(
        "Un plan con una mascota fallecida se omite sin contarse como fallo",
        run.skippedDeceased > 0 && run.failed === 0 && run.createdReservations === 0,
        JSON.stringify(run),
      );
      const written = await prisma.reservation.count({ where: { recurringPlanId: plan.id } });
      check("El plan de la mascota fallecida no genera reservas", written === 0, `${written}`);
    } finally {
      await prisma.recurringPlan.delete({ where: { id: plan.id } });
      await prisma.pet.delete({ where: { id: pet.id } });
    }
  }

  // No duplicates: the unique key is what the early existence check is built on.
  const duplicates = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count FROM (
      SELECT "recurringPlanId", "checkIn"
      FROM reservations
      WHERE "recurringPlanId" IS NOT NULL
      GROUP BY "recurringPlanId", "checkIn"
      HAVING COUNT(*) > 1
    ) d`;
  check(
    "No hay ocurrencias duplicadas para un mismo plan",
    Number(duplicates[0]?.count ?? 0) === 0,
    `${duplicates[0]?.count} combinación(es) duplicada(s)`,
  );

  console.log("=".repeat(60));
  console.log(`📊 Idempotencia:\n   Fallidas: ${failed}`);
  console.log("=".repeat(60));

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
