import { useState } from "react";
import { Link } from "react-router-dom";
import { Send } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { cls } from "../../lib/utils";
import { unitTheme } from "../../lib/unit-theme";
import { SectionCard } from "../../components/ui/SectionCard";
import { businessUnitLabel } from "../../modules/shared/contracts";
import type { BusinessUnit } from "../../modules/shared/contracts";
import { CHANNEL_LABELS } from "../recordatorios/api";
import type { ChannelAvailability, ReminderChannel } from "../recordatorios/api";
import { Field, focusField } from "./Field";
import { SaveBar } from "./SaveBar";
import { REMINDER_CHANNELS } from "./types";
import type { RemindersDraft, SettingsResponse } from "./types";
import type { UnitForm } from "./useUnitForm";

export function RecordatoriosTab({
  settings,
  form,
  channels,
}: {
  settings: SettingsResponse;
  form: UnitForm<RemindersDraft>;
  /** Which channels the platform can send on at all. Null until known. */
  channels: ChannelAvailability | null;
}) {
  const { activeBusinessUnit } = useAuth();
  const { units } = settings;
  const several = units.length > 1;
  const [selected, setSelected] = useState<BusinessUnit | null>(null);
  // One unit at a time: the form is the same for each, so three of them in a column only made
  // the page long. It opens on the unit the admin is working in.
  const shown =
    units.find((unit) => unit.businessUnit === selected) ??
    units.find((unit) => unit.businessUnit === activeBusinessUnit) ??
    units[0];

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        Cada unidad avisa a sus tutores a su manera. Lo que quieras enviar a mano sale desde{" "}
        <Link to="/avisos" className="font-medium text-action hover:underline">
          Avisos a tutores
        </Link>
        .
      </p>

      {(shown ? [shown] : []).map((unit) => {
        const key = unit.businessUnit;
        const { draft, errors, ...status } = form.state(unit);
        const toggleChannel = (channel: ReminderChannel, on: boolean) => {
          const next = REMINDER_CHANNELS.filter((candidate) =>
            candidate === channel ? on : draft.channels.includes(candidate),
          );
          // At least one channel stays on, and the default is always one of them.
          if (next.length === 0) return;
          form.patch(unit, {
            channels: next,
            defaultChannel: next.includes(draft.defaultChannel) ? draft.defaultChannel : next[0],
          });
        };
        return (
          <SectionCard
            key={key}
            // With several units the picker names the unit, so the title does not repeat it.
            title={several ? "Recordatorios" : businessUnitLabel(key)}
            icon={
              several ? (
                <Send size={16} aria-hidden />
              ) : (
                <span
                  className={cls("h-2 w-2 shrink-0 rounded-full", unitTheme(key).fill)}
                  aria-hidden
                />
              )
            }
            action={
              several && (
                <>
                  <label htmlFor="reminders-unit" className="text-muted">
                    Unidad
                  </label>
                  <select
                    id="reminders-unit"
                    className="input w-auto py-1.5"
                    value={key}
                    onChange={(event) => setSelected(event.target.value as BusinessUnit)}
                  >
                    {units.map((option) => (
                      <option key={option.businessUnit} value={option.businessUnit}>
                        {businessUnitLabel(option.businessUnit)}
                        {form.state(option).dirty ? " · sin guardar" : ""}
                      </option>
                    ))}
                  </select>
                </>
              )
            }
          >
            <form
              noValidate
              aria-label={`Recordatorios de ${businessUnitLabel(key)}`}
              onSubmit={(event) => {
                event.preventDefault();
                void form.save(unit).then((field) => focusField(field, key));
              }}
            >
              <div className="space-y-5 px-4 py-4 sm:px-5">
                <label className="flex items-start gap-3 rounded-lg bg-sunken p-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={draft.auto}
                    onChange={(event) => form.patch(unit, { auto: event.target.checked })}
                  />
                  <span>
                    <span className="font-medium text-ink">Enviar automáticamente</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      Las citas se recuerdan el día anterior; vacunas, preventivos y controles, con
                      los días de aviso de abajo. Apagado, solo sale lo que envíes a mano.
                    </span>
                  </span>
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <fieldset>
                    <legend className="label">Canales que usa esta unidad</legend>
                    <div className="space-y-2">
                      {REMINDER_CHANNELS.map((channel) => {
                        const active = draft.channels.includes(channel);
                        const unavailable = channels !== null && channels[channel] === null;
                        const onlyOne = active && draft.channels.length === 1;
                        return (
                          <label key={channel} className="flex items-start gap-2 text-sm text-ink">
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={active}
                              disabled={unavailable || onlyOne}
                              onChange={(event) => toggleChannel(channel, event.target.checked)}
                            />
                            <span>
                              {CHANNEL_LABELS[channel]}
                              {unavailable ? (
                                <span className="block text-xs text-muted">
                                  Aún no está conectado. Escríbenos y lo activamos.
                                </span>
                              ) : (
                                onlyOne && (
                                  <span className="block text-xs text-muted">
                                    Es el único activo: al menos uno tiene que quedar.
                                  </span>
                                )
                              )}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  {draft.channels.length > 1 && (
                    <Field
                      id={`defaultChannel-${key}`}
                      label="Canal por defecto"
                      help="Para los tutores que no eligieron uno en su ficha."
                    >
                      {(control) => (
                        <select
                          {...control}
                          className="input"
                          value={draft.defaultChannel}
                          onChange={(event) =>
                            form.patch(unit, {
                              defaultChannel: event.target.value as ReminderChannel,
                            })
                          }
                        >
                          {draft.channels.map((channel) => (
                            <option key={channel} value={channel}>
                              {CHANNEL_LABELS[channel]}
                            </option>
                          ))}
                        </select>
                      )}
                    </Field>
                  )}

                  <Field
                    id={`leadDays-${key}`}
                    label="Días de aviso"
                    help="Antelación para vacunas, preventivos y controles."
                    error={errors.leadDays}
                    className="sm:col-start-1"
                  >
                    {(control) => (
                      <input
                        {...control}
                        className="input tabular-nums"
                        type="number"
                        inputMode="numeric"
                        min="1"
                        max="30"
                        value={draft.leadDays}
                        onChange={(event) => form.patch(unit, { leadDays: event.target.value })}
                      />
                    )}
                  </Field>
                </div>

                <div className="grid gap-4 border-t border-line-subtle pt-4 sm:grid-cols-2">
                  <Field
                    id={`contactPhone-${key}`}
                    label="Teléfono de contacto"
                    help="El mensaje le dice al tutor que te escriba a este número."
                  >
                    {(control) => (
                      <input
                        {...control}
                        className="input"
                        type="tel"
                        autoComplete="tel"
                        value={draft.contactPhone}
                        onChange={(event) => form.patch(unit, { contactPhone: event.target.value })}
                      />
                    )}
                  </Field>
                  <Field
                    id={`contactEmail-${key}`}
                    label="Correo de contacto"
                    help="Las respuestas a un recordatorio por correo llegan aquí."
                    error={errors.contactEmail}
                  >
                    {(control) => (
                      <input
                        {...control}
                        className="input"
                        type="email"
                        autoComplete="email"
                        value={draft.contactEmail}
                        onChange={(event) => form.patch(unit, { contactEmail: event.target.value })}
                      />
                    )}
                  </Field>
                </div>
              </div>
              <SaveBar {...status} onDiscard={() => form.reset(unit)} />
            </form>
          </SectionCard>
        );
      })}
    </div>
  );
}
