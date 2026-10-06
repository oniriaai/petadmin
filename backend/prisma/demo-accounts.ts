import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";

/**
 * The seeded demo logins and where each gets its password.
 *
 * In development and CI they keep the well-known passwords the e2e suites and the README use.
 * Those are in a public repository, so they are no protection at all, and a seeded stack that
 * anyone can reach must not carry them: with `NODE_ENV=production` each account's password has
 * to come from the environment, and the seed refuses to run without it.
 */
export const DEMO_ACCOUNTS = {
  admin_global: { env: "DEMO_PASSWORD_ADMIN_GLOBAL", development: "admin123" },
  guarderia_admin: { env: "DEMO_PASSWORD_GUARDERIA_ADMIN", development: "guarderia123" },
  peluqueria_admin: { env: "DEMO_PASSWORD_PELUQUERIA_ADMIN", development: "peluqueria123" },
  vet_admin: { env: "DEMO_PASSWORD_VET_ADMIN", development: "vet12345" },
  demo_admin: { env: "DEMO_PASSWORD_DEMO_ADMIN", development: "demo123" },
} as const;

export type DemoUsername = keyof typeof DEMO_ACCOUNTS;

/** The password one demo account should have in this environment. */
export function demoPassword(
  username: DemoUsername,
  env: Record<string, string | undefined> = process.env,
): string {
  const account = DEMO_ACCOUNTS[username];
  const configured = env[account.env]?.trim();
  if (configured) return configured;
  if (env.NODE_ENV === "production") {
    throw new Error(
      `${account.env} es obligatorio para sembrar la cuenta de demostración '${username}' ` +
        `fuera de desarrollo: su contraseña por defecto es pública.`,
    );
  }
  return account.development;
}

export function hashDemoPassword(username: DemoUsername): string {
  return bcrypt.hashSync(demoPassword(username), 10);
}

/** Fails before anything is written when a password this environment needs is missing. */
export function assertDemoPasswords(env: Record<string, string | undefined> = process.env): void {
  for (const username of Object.keys(DEMO_ACCOUNTS) as DemoUsername[]) demoPassword(username, env);
}

/**
 * Brings existing demo accounts in line with the passwords the environment sets.
 *
 * The accounts are only created once, so without this a stack seeded with the public passwords
 * would keep them after the variables were added, and the restricted `demo` tenant, which is
 * never rebuilt, would keep them for good. Only accounts whose variable is set are touched: in
 * development nothing is, and a password changed by hand there survives a restart.
 */
export async function syncDemoPasswords(
  prisma: PrismaClient,
  tenants: Record<DemoUsername, string>,
): Promise<void> {
  for (const username of Object.keys(DEMO_ACCOUNTS) as DemoUsername[]) {
    const configured = process.env[DEMO_ACCOUNTS[username].env]?.trim();
    if (!configured) continue;
    const user = await prisma.user.findFirst({
      where: { username, daycareId: tenants[username] },
      select: { id: true, passwordHash: true },
    });
    if (!user || bcrypt.compareSync(configured, user.passwordHash)) continue;
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: bcrypt.hashSync(configured, 10) },
    });
    console.log(`[seed] contraseña de la cuenta de demostración '${username}' actualizada`);
  }
}
