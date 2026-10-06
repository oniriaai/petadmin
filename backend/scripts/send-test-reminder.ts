import "dotenv/config";

import { isEmailConfigured, sendEmail } from "../src/core/messaging/email";
import { toEmailAddress } from "../src/core/messaging/phone";
import { renderEmailHtml, renderEmailText } from "../src/modules/recordatorios/email-layout";
import { renderReminder } from "../src/modules/recordatorios/templates";

/**
 * Sends one sample reminder to an address you name, through the configured mail provider.
 *
 * This is the check that `SMTP_URL` and `MAIL_FROM` work and that the message arrives looking
 * right, before any tutor is written to. It reads no database and touches no tenant: the
 * business, the pet and the appointment in it are made up.
 *
 *   SMTP_URL=... MAIL_FROM=... npm run mail:test -- you@example.com
 */
async function main(): Promise<void> {
  const to = toEmailAddress(process.argv[2]);
  if (!to) {
    console.error("Uso: npm run mail:test -- destinatario@dominio.com");
    process.exitCode = 1;
    return;
  }
  if (!isEmailConfigured()) {
    console.error("Faltan SMTP_URL y MAIL_FROM. Sin las dos, el correo no está configurado.");
    process.exitCode = 1;
    return;
  }

  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  tomorrow.setUTCHours(15, 0, 0, 0);
  const rendered = renderReminder(
    {
      kind: "CITA",
      businessUnit: "GROOMING",
      tutor: "Ana",
      business: "Peluquería de Prueba",
      pets: "Max",
      subject: "",
      dueAt: tomorrow,
      timezone: "America/Guayaquil",
      hasClinic: false,
      contactPhone: "099 123 4567",
      contactEmail: null,
    },
    "EMAIL",
  );
  const layout = {
    headline: rendered.headline,
    body: rendered.text,
    business: "Peluquería de Prueba",
    pets: "Max",
    contactEmail: null,
  };

  const result = await sendEmail({
    to,
    subject: `[Prueba] ${rendered.subject}`,
    html: renderEmailHtml(layout),
    text: renderEmailText(layout),
  });
  console.log(`✓ Enviado a ${to} desde ${process.env.MAIL_FROM}`);
  console.log(`  id del proveedor: ${result.providerMessageId ?? "(ninguno)"}`);
  if (!process.env.PUBLIC_SITE_URL) {
    console.log(
      "  PUBLIC_SITE_URL no está definida: el correo lleva el nombre en texto, sin logo.",
    );
  }
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
