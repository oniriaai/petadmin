import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Check, Clock, Copy } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { cls } from "../../lib/utils";
import { unitTheme } from "../../lib/unit-theme";
import { SectionCard } from "../../components/ui/SectionCard";
import { UnitBadge } from "../../components/ui/UnitBadge";
import { businessUnitLabel } from "../../modules/shared/contracts";
import { Field, focusField } from "./Field";
import { SaveBar } from "./SaveBar";
import type { GeneralDraft, SettingsResponse } from "./types";
import type { UnitForm } from "./useUnitForm";

/** The two zones the product's customers are in, named the way they would say them. */
const ECUADOR_ZONES: readonly (readonly [string, string])[] = [
  ["America/Guayaquil", "Ecuador continental (Quito, Guayaquil)"],
  ["Pacific/Galapagos", "Galápagos"],
];

/** Every zone the browser knows, or none where it cannot say: the field is then typed. */
function supportedZones(): string[] {
  try {
    const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
    return intl.supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
}

const OTHER_ZONES = supportedZones().filter(
  (zone) => !ECUADOR_ZONES.some(([known]) => known === zone),
);

/** One unit per line: its name, its VAT, its zone. Stacked on a phone. */
const ROW = "gap-x-4 gap-y-3 sm:grid-cols-[9rem_9rem_minmax(0,1fr)] sm:items-start";

function clockIn(timezone: string, now: Date): string | null {
  try {
    return new Intl.DateTimeFormat("es-EC", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
  } catch {
    return null;
  }
}

export function NegocioTab({
  settings,
  form,
}: {
  settings: SettingsResponse;
  form: UnitForm<GeneralDraft>;
}) {
  const { subscription } = useAuth();
  const { daycare, units } = settings;
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const states = units.map((unit) => form.state(unit));
  // With several units, a refusal says which one it is about.
  const failures = units.flatMap((unit, index) => {
    const { error } = states[index];
    if (!error) return [];
    return [units.length > 1 ? `${businessUnitLabel(unit.businessUnit)}: ${error}` : error];
  });

  async function copySlug() {
    try {
      await navigator.clipboard.writeText(daycare.slug);
      setCopied(true);
    } catch {
      // No clipboard access: the identifier is on screen to be read.
    }
  }

  return (
    <div className="space-y-5">
      <SectionCard title="Tu negocio" icon={<Building2 size={16} aria-hidden />}>
        <dl className="grid gap-x-6 gap-y-4 px-4 py-4 text-sm sm:grid-cols-2 sm:px-5">
          <div>
            <dt className="text-xs text-muted">Nombre</dt>
            <dd className="mt-0.5 font-medium text-ink">{daycare.name}</dd>
          </div>
          {daycare.legalName && (
            <div>
              <dt className="text-xs text-muted">Razón social</dt>
              <dd className="mt-0.5 font-medium text-ink">{daycare.legalName}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted">Unidades</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {units.map((unit) => (
                <UnitBadge key={unit.businessUnit} unit={unit.businessUnit} />
              ))}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Identificador</dt>
            <dd className="mt-0.5 flex items-center gap-1">
              <span className="font-mono text-sm text-ink">{daycare.slug}</span>
              <button
                type="button"
                className="btn-ghost btn-sm px-2"
                onClick={() => void copySlug()}
              >
                {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
                <span role="status">{copied ? "Copiado" : "Copiar"}</span>
                <span className="sr-only"> el identificador</span>
              </button>
            </dd>
            <dd className="mt-0.5 text-xs text-muted">
              Tu equipo lo escribe al iniciar sesión si se lo pedimos.
            </dd>
          </div>
        </dl>
        {/* Identity is the vendor's to change, not the tenant's. Saying so beats offering
            fields that would be refused. */}
        <p className="border-t border-line-subtle px-4 py-3 text-xs text-muted sm:px-5">
          {subscription ? (
            <>
              Estos datos los cambiamos nosotros: escríbenos si hay algo que corregir. Tu plan y tus
              unidades están en{" "}
              <Link to="/suscripcion" className="font-medium text-action hover:underline">
                Suscripción
              </Link>
              .
            </>
          ) : (
            "Estos datos y las unidades contratadas los gestionamos nosotros. Escríbenos si necesitas cambiar alguno."
          )}
        </p>
      </SectionCard>

      <SectionCard title="Impuestos y horario" icon={<Clock size={16} aria-hidden />}>
        <form
          noValidate
          aria-label="Impuestos y horario"
          onSubmit={(event) => {
            event.preventDefault();
            void form
              .saveAll()
              .then((invalid) => focusField(invalid?.field ?? null, invalid?.unit.businessUnit));
          }}
        >
          <div className="px-4 sm:px-5">
            <div
              className={cls(ROW, "hidden pb-1 pt-4 text-xs font-medium text-muted sm:grid")}
              aria-hidden
            >
              <span>Unidad</span>
              <span>IVA por defecto (%)</span>
              <span>Zona horaria</span>
            </div>
            <ul className="divide-y divide-line-subtle">
              {units.map((unit, index) => {
                const key = unit.businessUnit;
                const { draft, errors } = states[index];
                const clock = clockIn(draft.timezone, now);
                const known =
                  ECUADOR_ZONES.some(([zone]) => zone === draft.timezone) ||
                  OTHER_ZONES.includes(draft.timezone);
                const of = <span className="sr-only"> de {businessUnitLabel(key)}</span>;
                return (
                  <li key={key} className={cls(ROW, "grid py-4 sm:py-3")}>
                    <p className="flex items-center gap-2 text-sm font-medium text-ink sm:h-[38px]">
                      <span
                        className={cls("h-2 w-2 shrink-0 rounded-full", unitTheme(key).fill)}
                        aria-hidden
                      />
                      {businessUnitLabel(key)}
                    </p>
                    <Field
                      id={`vatPercent-${key}`}
                      label={<>IVA por defecto (%){of}</>}
                      labelClassName="label sm:sr-only"
                      error={errors.vatPercent}
                    >
                      {(control) => (
                        <input
                          {...control}
                          className="input tabular-nums"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          max="100"
                          step="0.1"
                          value={draft.vatPercent}
                          onChange={(event) => form.patch(unit, { vatPercent: event.target.value })}
                        />
                      )}
                    </Field>
                    <Field
                      id={`timezone-${key}`}
                      label={<>Zona horaria{of}</>}
                      labelClassName="label sm:sr-only"
                      help={clock && <span className="tabular-nums">Allí son las {clock}.</span>}
                      error={errors.timezone}
                    >
                      {(control) =>
                        OTHER_ZONES.length > 0 ? (
                          <select
                            {...control}
                            className="input"
                            value={draft.timezone}
                            onChange={(event) => form.patch(unit, { timezone: event.target.value })}
                          >
                            {!known && <option value={draft.timezone}>{draft.timezone}</option>}
                            <optgroup label="Ecuador">
                              {ECUADOR_ZONES.map(([zone, label]) => (
                                <option key={zone} value={zone}>
                                  {label}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="Otras zonas">
                              {OTHER_ZONES.map((zone) => (
                                <option key={zone} value={zone}>
                                  {zone.replace(/_/g, " ")}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        ) : (
                          <input
                            {...control}
                            className="input"
                            value={draft.timezone}
                            onChange={(event) => form.patch(unit, { timezone: event.target.value })}
                          />
                        )
                      }
                    </Field>
                  </li>
                );
              })}
            </ul>
            <p className="max-w-prose pb-4 pt-1 text-xs text-muted">
              El IVA se aplica a las reservas y citas nuevas que no indiquen otro. La zona horaria
              define qué es «hoy» para la unidad y las horas de sus planes recurrentes.
            </p>
          </div>
          <SaveBar
            dirty={form.anyDirty}
            saving={states.some((state) => state.saving)}
            saved={states.some((state) => state.saved)}
            error={failures.length > 0 ? failures.join(" ") : null}
            onDiscard={() => units.forEach((unit) => form.reset(unit))}
          />
        </form>
      </SectionCard>
    </div>
  );
}
