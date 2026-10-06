import {
  EMAIL_COLORS as COLORS,
  EMAIL_SANS as SANS,
  channelMode,
  deliver,
  escapeHtml,
  publicSiteUrl,
  renderEmailShell,
} from "../../core/messaging";
import { logger } from "../../middleware/observability";

/**
 * What the platform writes to its own customers about their account: the welcome, the address
 * to verify, receipts and what is owed. Reminders to tutors are `modules/recordatorios`; these
 * go to the business.
 *
 * Every one of them is a courtesy on top of something already done in the database. A send
 * that fails is logged and never undoes it.
 */

/** Where links in an email lead. The Vite dev server when the deployment does not say. */
export function siteUrl(): string {
  return publicSiteUrl() ?? `http://localhost:${process.env.FRONTEND_PORT ?? 5174}`;
}

/** Whether an email can leave this process at all. A trial cannot start without one. */
export function canSendEmail(): boolean {
  return channelMode("EMAIL") !== null;
}

export function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("es-EC", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Guayaquil",
  }).format(date);
}

interface AccountEmail {
  to: string;
  subject: string;
  headline: string;
  business: string;
  /** Plain-text paragraphs. */
  paragraphs: string[];
  action?: { label: string; url: string };
}

const SIGNATURE = "Argos Suite";

function render(email: AccountEmail): { html: string; text: string } {
  const paragraph = (value: string) =>
    `<p style="margin:0 0 16px 0;font-family:${SANS};font-size:16px;line-height:1.5;color:${COLORS.tinta};">${escapeHtml(value)}</p>`;
  const button = email.action
    ? `<p style="margin:8px 0 0 0;"><a href="${escapeHtml(email.action.url)}" style="display:inline-block;background-color:${COLORS.tinta};color:#ffffff;font-family:${SANS};font-size:15px;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:8px;">${escapeHtml(email.action.label)}</a></p>`
    : "";
  const fallback = email.action
    ? `<p style="margin:0 0 8px 0;">Si el botón no abre, copia esta dirección en el navegador: ${escapeHtml(email.action.url)}</p>\n`
    : "";

  const html = renderEmailShell({
    headline: email.headline,
    eyebrow: email.business,
    bodyHtml: email.paragraphs.map(paragraph).join("\n") + button,
    footerHtml: `${fallback}<p style="margin:0;">${SIGNATURE}</p>`,
  });
  const text = [
    ...email.paragraphs,
    ...(email.action ? [`${email.action.label}: ${email.action.url}`] : []),
    SIGNATURE,
  ].join("\n\n");
  return { html, text };
}

async function send(email: AccountEmail): Promise<void> {
  try {
    const { html, text } = render(email);
    await deliver({
      channel: "EMAIL",
      email: { to: email.to, subject: email.subject, html, text },
    });
  } catch (error) {
    logger.error({ err: error, subject: email.subject }, "[billing] no se pudo enviar el correo");
  }
}

interface Account {
  to: string;
  business: string;
}

export function sendVerificationEmail(account: Account, token: string): Promise<void> {
  return send({
    ...account,
    subject: "Confirma tu correo para empezar la prueba de Argos Suite",
    headline: "Confirma tu correo",
    paragraphs: [
      "Con este paso creamos tu espacio de trabajo y empiezan tus 30 días de prueba. No necesitas tarjeta.",
      "El enlace vale 48 horas. Si no pediste esta prueba, ignora este mensaje.",
    ],
    action: {
      label: "Confirmar y entrar",
      url: `${siteUrl()}/registro/verificar?token=${encodeURIComponent(token)}`,
    },
  });
}

export function sendWelcomeEmail(
  account: Account & { slug: string; username: string; plan: string },
  access: { trialEndsAt: Date } | { paidUntil: Date; totalCents: number },
): Promise<void> {
  return send({
    ...account,
    subject: "Tu espacio en Argos Suite está listo",
    headline: "Tu espacio está listo",
    paragraphs: [
      "trialEndsAt" in access
        ? `Tu prueba gratuita va hasta el ${formatDate(access.trialEndsAt)}, con todas las unidades y módulos. Durante la prueba los recordatorios salen solo por correo.`
        : `Recibimos tu pago de ${formatMoney(access.totalCents)} por el plan ${account.plan}. Está pagado hasta el ${formatDate(access.paidUntil)}.`,
      `Para entrar usa el usuario ${account.username} y la contraseña que elegiste. Si te pide el identificador del negocio, es ${account.slug}.`,
    ],
    action: { label: "Entrar a Argos Suite", url: `${siteUrl()}/login` },
  });
}

export function sendReceiptEmail(
  account: Account & { plan: string },
  payment: { totalCents: number; paidUntil: Date; automatic: boolean },
): Promise<void> {
  return send({
    ...account,
    subject: "Recibimos tu pago de Argos Suite",
    headline: "Pago recibido",
    paragraphs: [
      payment.automatic
        ? `Cobramos ${formatMoney(payment.totalCents)} a tu tarjeta guardada por la renovación del plan ${account.plan}.`
        : `Recibimos tu pago de ${formatMoney(payment.totalCents)} por el plan ${account.plan}.`,
      `Tu suscripción está pagada hasta el ${formatDate(payment.paidUntil)}.`,
    ],
    action: { label: "Ver mi suscripción", url: `${siteUrl()}/suscripcion` },
  });
}

export function sendTrialEndingEmail(
  account: Account,
  trial: { endsAt: Date; daysLeft: number },
): Promise<void> {
  return send({
    ...account,
    subject:
      trial.daysLeft <= 1
        ? "Tu prueba de Argos Suite termina mañana"
        : `Tu prueba de Argos Suite termina en ${trial.daysLeft} días`,
    headline: "Tu prueba está por terminar",
    paragraphs: [
      `La prueba gratuita termina el ${formatDate(trial.endsAt)}. Elige un plan antes de esa fecha y sigues trabajando sin interrupción, con todos tus datos.`,
      "Si no eliges uno, el acceso se suspende ese día. Tus datos se conservan.",
    ],
    action: { label: "Elegir un plan", url: `${siteUrl()}/suscripcion` },
  });
}

export function sendRenewalDueEmail(
  account: Account & { plan: string },
  renewal: { dueAt: Date; totalCents: number },
): Promise<void> {
  return send({
    ...account,
    subject: "Tu plan de Argos Suite se renueva pronto",
    headline: "Es momento de renovar",
    paragraphs: [
      `Tu plan ${account.plan} está pagado hasta el ${formatDate(renewal.dueAt)}. La renovación es de ${formatMoney(renewal.totalCents)}, IVA incluido.`,
      "No tenemos una tarjeta guardada para cobrarla, así que el pago se hace desde tu cuenta.",
    ],
    action: { label: "Renovar ahora", url: `${siteUrl()}/suscripcion` },
  });
}

export function sendPaymentFailedEmail(
  account: Account & { plan: string },
  failure: { totalCents: number; suspendsAt: Date; hadCard: boolean },
): Promise<void> {
  return send({
    ...account,
    subject: "No pudimos cobrar tu plan de Argos Suite",
    headline: "Tu pago está pendiente",
    paragraphs: [
      failure.hadCard
        ? `Tu tarjeta rechazó el cobro de ${formatMoney(failure.totalCents)} por la renovación del plan ${account.plan}. Lo intentaremos de nuevo en los próximos días.`
        : `La renovación del plan ${account.plan}, de ${formatMoney(failure.totalCents)}, está pendiente de pago.`,
      `Puedes pagar ahora desde tu cuenta. Si el pago no llega, el acceso se suspende el ${formatDate(failure.suspendsAt)}. Tus datos se conservan.`,
    ],
    action: { label: "Pagar ahora", url: `${siteUrl()}/suscripcion` },
  });
}

export function sendSuspendedEmail(account: Account, reason: "trial" | "unpaid"): Promise<void> {
  return send({
    ...account,
    subject: "Tu acceso a Argos Suite está suspendido",
    headline: "Acceso suspendido",
    paragraphs: [
      reason === "trial"
        ? "Tu prueba gratuita terminó y aún no elegiste un plan."
        : "No recibimos el pago de la renovación de tu plan.",
      "Tus datos siguen guardados. El acceso vuelve en cuanto se registra el pago; la persona administradora puede hacerlo desde su cuenta.",
    ],
    action: { label: "Reactivar mi cuenta", url: `${siteUrl()}/suscripcion` },
  });
}
