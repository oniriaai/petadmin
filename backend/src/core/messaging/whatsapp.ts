import axios from "axios";

import { DeliveryError, type DeliveryResult } from "./types";

/**
 * WhatsApp through Meta's Cloud API, from the one Argos Suite number.
 *
 * A business may only open a conversation with an approved template; free text is accepted only
 * inside the 24 hours after the person last wrote. Reminders are always the first message, so
 * everything sent here is a template with positional parameters. The template texts to register
 * are in `docs/recordatorios.md`.
 */

const GRAPH_URL = "https://graph.facebook.com";
const TIMEOUT_MS = 15_000;

export interface WhatsAppTemplateMessage {
  /** International format, digits only. */
  to: string;
  template: string;
  /** Positional body parameters, {{1}} first. */
  params: readonly string[];
  language?: string;
}

function config() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  if (!phoneNumberId || !accessToken) return null;
  return { phoneNumberId, accessToken, version: process.env.WHATSAPP_API_VERSION || "v23.0" };
}

export function isWhatsAppConfigured(): boolean {
  return config() !== null;
}

/** Meta rejects a parameter with a line break, a tab or a run of more than four spaces. */
export function sanitizeTemplateParam(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export async function sendWhatsAppTemplate(
  message: WhatsAppTemplateMessage,
): Promise<DeliveryResult> {
  const settings = config();
  if (!settings) throw new DeliveryError("WhatsApp no está configurado en la plataforma");

  try {
    const response = await axios.post(
      `${GRAPH_URL}/${settings.version}/${settings.phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to: message.to,
        type: "template",
        template: {
          name: message.template,
          language: { code: message.language ?? "es" },
          components: [
            {
              type: "body",
              parameters: message.params.map((text) => ({
                type: "text",
                text: sanitizeTemplateParam(text),
              })),
            },
          ],
        },
      },
      { headers: { Authorization: `Bearer ${settings.accessToken}` }, timeout: TIMEOUT_MS },
    );
    const id = (response.data as { messages?: Array<{ id?: string }> })?.messages?.[0]?.id;
    return { transport: "meta", providerMessageId: id ?? null };
  } catch (error) {
    // Meta explains a refusal in the body (unknown template, number not on WhatsApp, ...). That
    // is what the log should say; the token in the request headers must never reach it.
    if (axios.isAxiosError(error)) {
      const detail = (error.response?.data as { error?: { message?: string; code?: number } })
        ?.error;
      throw new DeliveryError(
        detail?.message
          ? `WhatsApp rechazó el mensaje: ${detail.message}`
          : `No se pudo contactar con WhatsApp (${error.code ?? error.response?.status ?? "red"})`,
      );
    }
    throw new DeliveryError("No se pudo enviar el mensaje de WhatsApp");
  }
}
