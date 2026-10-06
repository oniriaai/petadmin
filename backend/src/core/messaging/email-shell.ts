/**
 * The frame every email the platform sends is set in, in Argos Suite's look (BRAND.md): warm
 * marble canvas, a white card, ink text, a Marcellus headline and the lockup. One accent, the
 * terracotta of the mark.
 *
 * Mail clients ignore stylesheets and most of CSS, so this is tables and inline styles, and the
 * web fonts fall back to the stacks the brand names (Georgia for Marcellus, the system sans for
 * Inter).
 */

export const EMAIL_COLORS = {
  marmol: "#faf8f5",
  surface: "#ffffff",
  tinta: "#1c1917",
  piedra: "#57534e",
  piedraSutil: "#e7e5e4",
  terracota: "#ea580c",
  azulEgeo: "#1d4ed8",
} as const;

export const EMAIL_SERIF = "Marcellus, Georgia, 'Times New Roman', serif";
export const EMAIL_SANS = "Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** The deployment's public address, without a trailing slash, when it knows it. */
export function publicSiteUrl(): string | null {
  return process.env.PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") || null;
}

/** The lockup served by the frontend, when this deployment knows its public address. */
export function logoUrl(): string | null {
  const site = publicSiteUrl();
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

export interface EmailShell {
  /** Plain text: the document title and the headline. */
  headline: string;
  /** Plain text: the small line above the headline. */
  eyebrow: string;
  /** HTML, already escaped by the caller: what goes in the card under the headline. */
  bodyHtml: string;
  /** HTML, already escaped by the caller: the small print under the card. */
  footerHtml: string;
}

export function renderEmailShell(shell: EmailShell): string {
  const logo = logoUrl();
  // Without a public address there is no image to point at. The name set in capitals stands in;
  // the Greek lambda belongs to the drawn logo only, so this is a plain A.
  const brand = logo
    ? `<img src="${escapeHtml(logo)}" width="168" alt="Argos Suite" style="display:block;border:0;width:168px;height:auto;">`
    : `<span style="font-family:Cinzel,'Times New Roman',serif;font-size:20px;font-weight:700;letter-spacing:0.1em;color:${EMAIL_COLORS.tinta};">ARGOS SUITE</span>`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(shell.headline)}</title>
</head>
<body style="margin:0;padding:0;background-color:${EMAIL_COLORS.marmol};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${EMAIL_COLORS.marmol};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 4px 20px 4px;">${brand}</td></tr>
<tr><td style="background-color:${EMAIL_COLORS.surface};border:1px solid ${EMAIL_COLORS.piedraSutil};border-top:3px solid ${EMAIL_COLORS.terracota};border-radius:12px;padding:32px 28px;">
<p style="margin:0 0 8px 0;font-family:${EMAIL_SANS};font-size:12px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:${EMAIL_COLORS.piedra};">${escapeHtml(shell.eyebrow)}</p>
<h1 style="margin:0 0 20px 0;font-family:${EMAIL_SERIF};font-size:24px;font-weight:400;line-height:1.2;color:${EMAIL_COLORS.tinta};">${escapeHtml(shell.headline)}</h1>
${shell.bodyHtml}
</td></tr>
<tr><td style="padding:20px 4px 0 4px;font-family:${EMAIL_SANS};font-size:13px;line-height:1.5;color:${EMAIL_COLORS.piedra};">
${shell.footerHtml}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
