import { randomUUID } from "node:crypto";

import { logger } from "../../middleware/observability";
import { isEmailConfigured, sendEmail, type EmailMessage } from "./email";
import { DeliveryError, type Channel, type DeliveryResult } from "./types";
import {
  isWhatsAppConfigured,
  sendWhatsAppTemplate,
  type WhatsAppTemplateMessage,
} from "./whatsapp";

export { DEFAULT_COUNTRY_CODE, toE164, toEmailAddress } from "./phone";
export { CHANNELS, DeliveryError, isChannel } from "./types";
export type { Channel, DeliveryResult } from "./types";
export type { EmailMessage } from "./email";
export type { WhatsAppTemplateMessage } from "./whatsapp";
export { sanitizeTemplateParam } from "./whatsapp";
export {
  EMAIL_COLORS,
  EMAIL_SANS,
  EMAIL_SERIF,
  escapeHtml,
  logoUrl,
  publicSiteUrl,
  renderEmailShell,
} from "./email-shell";
export type { EmailShell } from "./email-shell";

/**
 * Outbound messages to people outside the product: the platform's WhatsApp number and its mail
 * domain. This is transport only. What a message says, and whether it should be sent at all,
 * belongs to the module that sends it.
 */

/** How a channel is delivered in this process, or null when it cannot be used at all. */
export type ChannelMode = "live" | "simulated" | null;

/**
 * Outside production a channel with no credentials is simulated: the message is written to the
 * log and reported as sent. That is what lets the dev stack, CI and the public demo exercise
 * the whole flow without a provider account, and without a seeded tutor's made-up number ever
 * receiving anything. In production an unconfigured channel is simply unavailable.
 */
export function channelMode(channel: Channel): ChannelMode {
  const configured = channel === "WHATSAPP" ? isWhatsAppConfigured() : isEmailConfigured();
  if (configured) return "live";
  return process.env.NODE_ENV === "production" ? null : "simulated";
}

export function availableChannels(): Record<Channel, ChannelMode> {
  return { WHATSAPP: channelMode("WHATSAPP"), EMAIL: channelMode("EMAIL") };
}

export type OutboundMessage =
  | { channel: "WHATSAPP"; whatsapp: WhatsAppTemplateMessage; preview: string }
  | { channel: "EMAIL"; email: EmailMessage };

export async function deliver(message: OutboundMessage): Promise<DeliveryResult> {
  const mode = channelMode(message.channel);
  if (!mode) {
    throw new DeliveryError(
      message.channel === "WHATSAPP"
        ? "WhatsApp no está configurado en la plataforma"
        : "El correo no está configurado en la plataforma",
    );
  }

  if (mode === "simulated") {
    logger.info(
      message.channel === "WHATSAPP"
        ? {
            channel: message.channel,
            to: message.whatsapp.to,
            template: message.whatsapp.template,
            text: message.preview,
          }
        : {
            channel: message.channel,
            to: message.email.to,
            subject: message.email.subject,
            text: message.email.text,
          },
      "[messaging] envío simulado: no hay proveedor configurado",
    );
    return { transport: "log", providerMessageId: `log-${randomUUID()}` };
  }

  return message.channel === "WHATSAPP"
    ? sendWhatsAppTemplate(message.whatsapp)
    : sendEmail(message.email);
}
