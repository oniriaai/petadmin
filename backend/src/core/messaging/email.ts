import nodemailer, { type Transporter } from "nodemailer";

import { DeliveryError, type DeliveryResult } from "./types";

/**
 * Email over SMTP, from the Argos Suite sending domain.
 *
 * SMTP rather than one provider's API on purpose: every transactional mail service speaks it, so
 * changing provider is a change of `SMTP_URL` and not of code.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  /** The same message for a client that does not render HTML. */
  text: string;
  /** Where a reply goes: the business, since nobody reads the sending address. */
  replyTo?: string | null;
}

let transporter: Transporter | null = null;

function config() {
  const url = process.env.SMTP_URL?.trim();
  const from = process.env.MAIL_FROM?.trim();
  if (!url || !from) return null;
  return { url, from };
}

export function isEmailConfigured(): boolean {
  return config() !== null;
}

export async function sendEmail(message: EmailMessage): Promise<DeliveryResult> {
  const settings = config();
  if (!settings) throw new DeliveryError("El correo no está configurado en la plataforma");
  transporter ??= nodemailer.createTransport(settings.url);

  try {
    const info = await transporter.sendMail({
      from: settings.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: message.replyTo ?? undefined,
    });
    return { transport: "smtp", providerMessageId: info.messageId ?? null };
  } catch (error) {
    // Three different things to fix, so three different sentences: the address of the server,
    // the key, or the message itself.
    const { code, responseCode } = (error ?? {}) as { code?: string; responseCode?: number };
    if (code === "EAUTH") {
      throw new DeliveryError("El servidor de correo rechazó las credenciales");
    }
    if (code && ["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNREFUSED"].includes(code)) {
      throw new DeliveryError("No se pudo conectar con el servidor de correo");
    }
    throw new DeliveryError(
      `El servidor de correo rechazó el mensaje${responseCode ? ` (${responseCode})` : ""}`,
    );
  }
}
