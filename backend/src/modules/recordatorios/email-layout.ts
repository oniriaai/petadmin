import { SIGNATURE } from "./templates";

/**
 * The reminder as an email, in Argos Suite's look (BRAND.md): warm marble canvas, a white card,
 * ink text, a Marcellus headline and the lockup. One accent, the terracotta of the mark, and no
 * unit color: the same layout goes out for the daycare, the salon and the clinic.
 *
 * Mail clients ignore stylesheets and most of CSS, so this is tables and inline styles, and the
 * web fonts fall back to the stacks the brand names (Georgia for Marcellus, the system sans for
 * Inter).
 */

const COLORS = {
  marmol: "#faf8f5",
  surface: "#ffffff",
  tinta: "#1c1917",
  piedra: "#57534e",
  piedraSutil: "#e7e5e4",
  terracota: "#ea580c",
  azulEgeo: "#1d4ed8",
} as const;

const SERIF = "Marcellus, Georgia, 'Times New Roman', serif";
const SANS = "Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** The lockup served by the frontend, when this deployment knows its public address. */
export function logoUrl(): string | null {
  const site = process.env.PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  return site ? `${site}/brand/argos-suite-lockup.png` : null;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface EmailLayout {
  headline: string;
  /** The message itself, already worded. */
  body: string;
  business: string;
  pets: string;
  contactEmail: string | null;
}

export function renderEmailHtml(layout: EmailLayout): string {
  const logo = logoUrl();
  // Without a public address there is no image to point at. The name set in capitals stands in;
  // the Greek lambda belongs to the drawn logo only, so this is a plain A.
  const brand = logo
    ? `<img src="${escapeHtml(logo)}" width="168" alt="Argos Suite" style="display:block;border:0;width:168px;height:auto;">`
    : `<span style="font-family:Cinzel,'Times New Roman',serif;font-size:20px;font-weight:700;letter-spacing:0.1em;color:${COLORS.tinta};">ARGOS SUITE</span>`;
  const reply = layout.contactEmail
    ? ` Puedes responder a este correo y le llegará a <a href="mailto:${escapeHtml(layout.contactEmail)}" style="color:${COLORS.azulEgeo};">${escapeHtml(layout.business)}</a>.`
    : "";

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(layout.headline)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.marmol};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.marmol};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 4px 20px 4px;">${brand}</td></tr>
<tr><td style="background-color:${COLORS.surface};border:1px solid ${COLORS.piedraSutil};border-top:3px solid ${COLORS.terracota};border-radius:12px;padding:32px 28px;">
<p style="margin:0 0 8px 0;font-family:${SANS};font-size:12px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:${COLORS.piedra};">${escapeHtml(layout.business)}</p>
<h1 style="margin:0 0 20px 0;font-family:${SERIF};font-size:24px;font-weight:400;line-height:1.2;color:${COLORS.tinta};">${escapeHtml(layout.headline)}</h1>
<p style="margin:0;font-family:${SANS};font-size:16px;line-height:1.5;color:${COLORS.tinta};">${escapeHtml(layout.body)}</p>
</td></tr>
<tr><td style="padding:20px 4px 0 4px;font-family:${SANS};font-size:13px;line-height:1.5;color:${COLORS.piedra};">
<p style="margin:0 0 8px 0;">Recibes este mensaje porque ${escapeHtml(layout.business)} tiene registrada tu dirección como contacto de ${escapeHtml(layout.pets)}. Si prefieres no recibir recordatorios, avísales y lo cambian en tu ficha.${reply}</p>
<p style="margin:0;">${SIGNATURE}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** The same message for a mail client that shows plain text. */
export function renderEmailText(layout: EmailLayout): string {
  return `${layout.body}\n\n${layout.business}\n${SIGNATURE}`;
}
