import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Spinner } from "../../components/ui/Spinner";

/**
 * The foot of a settings card: save, discard, and where the form stands. Sits inside the
 * card's `<form>`, so the save button submits it and a refusal is read next to what caused it.
 */
export function SaveBar({
  dirty,
  saving,
  saved,
  error,
  onDiscard,
  hint,
}: {
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
  onDiscard: () => void;
  /** What to say while there is nothing to save. */
  hint?: ReactNode;
}) {
  return (
    <div className="space-y-3 border-t border-line-subtle px-4 py-3 sm:px-5">
      {error && (
        <div className="notice notice-danger" role="alert">
          {error}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="submit" className="btn-primary" disabled={!dirty || saving}>
          {saving && <Spinner size={14} />}
          Guardar cambios
        </button>
        {dirty && !saving && (
          <button type="button" className="btn-ghost" onClick={onDiscard}>
            Descartar
          </button>
        )}
        <p role="status" className="text-xs text-muted">
          {saved ? (
            <span className="inline-flex items-center gap-1 font-medium text-success-ink">
              <Check size={14} aria-hidden /> Guardado
            </span>
          ) : dirty ? (
            "Tienes cambios sin guardar"
          ) : (
            hint
          )}
        </p>
      </div>
    </div>
  );
}
