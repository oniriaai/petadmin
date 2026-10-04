import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

/** A failed load, said in place, with a way to try again. */
export function InlineError({
  children = "No pudimos cargar esta información. Revisa tu conexión e inténtalo de nuevo.",
  onRetry,
}: {
  children?: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="notice notice-danger m-4 items-center sm:m-6">
      <CircleAlert size={16} className="shrink-0" aria-hidden="true" />
      <span className="flex-1">{children}</span>
      {onRetry && (
        <button type="button" className="btn-secondary btn-sm" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  );
}
