import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../lib/auth-context";
import { cls } from "../../lib/utils";
import { formatLongDate } from "../../lib/billing";

const DAY_MS = 86_400_000;
/** A trial says nothing until it is this close to ending: before that it is just the product. */
const TRIAL_NOTICE_DAYS = 7;

/**
 * Tells the daycare's administrator, on every screen, that the subscription needs them: a trial
 * about to end, or a renewal that was not paid.
 *
 * Only the admin sees it. The rest of the staff cannot pay and should not be made to worry
 * about an invoice in the middle of a shift.
 */
export function SubscriptionBanner() {
  const { user, subscription } = useAuth();
  const location = useLocation();

  if (user?.role !== "admin" || !subscription || location.pathname === "/suscripcion") return null;

  let message: string | null = null;
  let action = "Ver suscripción";
  let urgent = false;

  if (subscription.status === "TRIALING" && subscription.trialEndsAt) {
    const daysLeft = Math.ceil(
      (new Date(subscription.trialEndsAt).getTime() - Date.now()) / DAY_MS,
    );
    if (daysLeft > TRIAL_NOTICE_DAYS) return null;
    message =
      daysLeft <= 0
        ? "Tu prueba gratuita termina hoy."
        : daysLeft === 1
          ? "Tu prueba gratuita termina mañana."
          : `Tu prueba gratuita termina en ${daysLeft} días.`;
    action = "Elegir un plan";
    urgent = daysLeft <= 1;
  } else if (subscription.status === "PAST_DUE") {
    message = subscription.suspendsAt
      ? `El pago de tu plan está pendiente. El acceso se suspende el ${formatLongDate(subscription.suspendsAt)}.`
      : "El pago de tu plan está pendiente.";
    action = "Pagar ahora";
    urgent = true;
  } else {
    return null;
  }

  return (
    <div
      role="status"
      className={cls(
        "flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-4 py-2 text-sm print:hidden",
        urgent
          ? "border-warning-line bg-warning-soft text-warning-ink"
          : "border-info-line bg-info-soft text-info-ink",
      )}
    >
      <span>{message}</span>
      <Link to="/suscripcion" className="ml-auto font-medium underline underline-offset-2">
        {action}
      </Link>
    </div>
  );
}
