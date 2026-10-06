import {
  EMAIL_COLORS as COLORS,
  EMAIL_SANS as SANS,
  escapeHtml,
  renderEmailShell,
} from "../../core/messaging";
import { SIGNATURE } from "./templates";

/**
 * The reminder as an email, in the frame every platform email shares
 * (`core/messaging/email-shell.ts`). No unit color: the same layout goes out for the daycare,
 * the salon and the clinic.
 */

export interface EmailLayout {
  headline: string;
  /** The message itself, already worded. */
  body: string;
  business: string;
  pets: string;
  contactEmail: string | null;
}

export function renderEmailHtml(layout: EmailLayout): string {
  const reply = layout.contactEmail
    ? ` Puedes responder a este correo y le llegará a <a href="mailto:${escapeHtml(layout.contactEmail)}" style="color:${COLORS.azulEgeo};">${escapeHtml(layout.business)}</a>.`
    : "";

  return renderEmailShell({
    headline: layout.headline,
    eyebrow: layout.business,
    bodyHtml: `<p style="margin:0;font-family:${SANS};font-size:16px;line-height:1.5;color:${COLORS.tinta};">${escapeHtml(layout.body)}</p>`,
    footerHtml:
      `<p style="margin:0 0 8px 0;">Recibes este mensaje porque ${escapeHtml(layout.business)} tiene registrada tu dirección como contacto de ${escapeHtml(layout.pets)}. Si prefieres no recibir recordatorios, avísales y lo cambian en tu ficha.${reply}</p>\n` +
      `<p style="margin:0;">${SIGNATURE}</p>`,
  });
}

/** The same message for a mail client that shows plain text. */
export function renderEmailText(layout: EmailLayout): string {
  return `${layout.body}\n\n${layout.business}\n${SIGNATURE}`;
}
