import { useState } from "react";
import { PERIOD_PRESETS, presetPeriod, type Period, type PeriodPreset } from "./finance";

/** The period every tab of Finanzas reads: a preset, or two dates. */
export function PeriodFilter({
  value,
  onChange,
}: {
  value: Period;
  onChange: (period: Period) => void;
}) {
  const [preset, setPreset] = useState<PeriodPreset>("month");

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="label text-xs" htmlFor="fin-periodo">
          Periodo
        </label>
        <select
          id="fin-periodo"
          className="input w-auto"
          value={preset}
          onChange={(e) => {
            const next = e.target.value as PeriodPreset;
            setPreset(next);
            // "Personalizado" starts from the dates on screen instead of emptying them.
            if (next !== "custom") onChange(presetPeriod(next));
          }}
        >
          {PERIOD_PRESETS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {preset === "custom" && (
        <>
          <div>
            <label className="label text-xs" htmlFor="fin-desde">
              Desde
            </label>
            <input
              id="fin-desde"
              type="date"
              className="input w-auto"
              value={value.from}
              max={value.to}
              onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })}
            />
          </div>
          <div>
            <label className="label text-xs" htmlFor="fin-hasta">
              Hasta
            </label>
            <input
              id="fin-hasta"
              type="date"
              className="input w-auto"
              value={value.to}
              min={value.from}
              onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })}
            />
          </div>
        </>
      )}
    </div>
  );
}
