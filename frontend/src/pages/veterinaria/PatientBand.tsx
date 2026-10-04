import { Children, type ReactNode } from "react";

export interface PatientFact {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}

/**
 * The patient at a glance, above a consultation or a clinical history.
 *
 * The Olivo edge is the page's one unit mark. Facts are written plainly; anything that changes
 * how the patient is handled (allergies, chronic conditions) goes in `children` as a notice.
 */
export function PatientBand({ facts, children }: { facts: PatientFact[]; children?: ReactNode }) {
  return (
    <section
      className="card overflow-hidden border-l-4 border-l-veterinary-600 text-sm"
      aria-label="Datos del paciente"
    >
      <dl className="grid gap-px bg-line-subtle sm:grid-cols-2 lg:grid-cols-4">
        {facts.map(({ label, value, detail }) => (
          <div key={label} className="bg-surface px-4 py-3">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="font-medium text-ink">{value}</dd>
            {detail && <dd className="text-muted">{detail}</dd>}
          </div>
        ))}
      </dl>
      {Children.toArray(children).length > 0 && (
        <div className="space-y-2 border-t border-line-subtle bg-surface p-3">{children}</div>
      )}
    </section>
  );
}
