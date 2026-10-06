import type { ReactNode } from "react";

interface ControlProps {
  id: string;
  "aria-invalid": boolean | undefined;
  "aria-describedby": string | undefined;
}

/** A labelled control with its help line, which gives way to the error when there is one. */
export function Field({
  id,
  label,
  help,
  error,
  className,
  labelClassName = "label",
  children,
}: {
  id: string;
  label: ReactNode;
  help?: ReactNode;
  error?: string;
  className?: string;
  /** Replaces `label`, for a field whose label a column heading already shows. */
  labelClassName?: string;
  children: (control: ControlProps) => ReactNode;
}) {
  const noteId = `${id}-note`;
  return (
    <div className={className}>
      <label className={labelClassName} htmlFor={id}>
        {label}
      </label>
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": error || help ? noteId : undefined,
      })}
      {error ? (
        <p id={noteId} className="mt-1 text-xs font-medium text-danger-ink">
          {error}
        </p>
      ) : (
        help && (
          <p id={noteId} className="mt-1 text-xs text-muted">
            {help}
          </p>
        )
      )}
    </div>
  );
}

/** Moves the focus to the field a refused save points at. Ids are `${field}-${unit}`. */
export function focusField(field: PropertyKey | null, unit: string | undefined) {
  if (field && unit) document.getElementById(`${String(field)}-${unit}`)?.focus();
}
