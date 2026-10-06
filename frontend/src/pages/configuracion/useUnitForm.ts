import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { errorMessage } from "./types";
import type { FieldErrors, UnitSetting } from "./types";

interface Status {
  saving?: boolean;
  saved?: boolean;
  error?: string | null;
  /** A save was refused by validation, so the field errors are now shown. */
  attempted?: boolean;
}

export interface UnitFormState<D> {
  draft: D;
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
  errors: FieldErrors<D>;
}

export interface UnitForm<D> {
  state: (unit: UnitSetting) => UnitFormState<D>;
  patch: (unit: UnitSetting, patch: Partial<D>) => void;
  reset: (unit: UnitSetting) => void;
  /** Resolves to the first invalid field when validation stopped the save, otherwise null. */
  save: (unit: UnitSetting) => Promise<keyof D | null>;
  /** Saves every edited unit, or none of them when one is invalid: that one is returned. */
  saveAll: () => Promise<{ unit: UnitSetting; field: keyof D } | null>;
  anyDirty: boolean;
}

interface Options<D> {
  toDraft: (unit: UnitSetting) => D;
  validate: (draft: D) => FieldErrors<D>;
  toPayload: (draft: D) => object;
  onSaved: (unit: UnitSetting) => void;
}

/**
 * One half of the per-unit settings (general, or reminders) as an editable form per unit.
 *
 * Only what was edited is held: a unit with no entry shows what the server has, so a save just
 * drops the entry and the stored value becomes the baseline again.
 */
export function useUnitForm<D extends object>(
  units: readonly UnitSetting[],
  { toDraft, validate, toPayload, onSaved }: Options<D>,
): UnitForm<D> {
  const [edits, setEdits] = useState<Record<string, D>>({});
  const [status, setStatus] = useState<Record<string, Status>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const pending = timers.current;
    return () => Object.values(pending).forEach(clearTimeout);
  }, []);

  const mark = useCallback((key: string, next: Status) => {
    setStatus((current) => ({ ...current, [key]: { ...current[key], ...next } }));
  }, []);

  const draftOf = (unit: UnitSetting): D => edits[unit.businessUnit] ?? toDraft(unit);
  const isDirty = (unit: UnitSetting): boolean =>
    unit.businessUnit in edits &&
    JSON.stringify(edits[unit.businessUnit]) !== JSON.stringify(toDraft(unit));

  function state(unit: UnitSetting): UnitFormState<D> {
    const current = status[unit.businessUnit] ?? {};
    const draft = draftOf(unit);
    return {
      draft,
      dirty: isDirty(unit),
      saving: Boolean(current.saving),
      saved: Boolean(current.saved),
      error: current.error ?? null,
      errors: current.attempted ? validate(draft) : {},
    };
  }

  function patch(unit: UnitSetting, change: Partial<D>) {
    setEdits((current) => ({
      ...current,
      [unit.businessUnit]: { ...(current[unit.businessUnit] ?? toDraft(unit)), ...change },
    }));
    mark(unit.businessUnit, { saved: false, error: null });
  }

  function reset(unit: UnitSetting) {
    setEdits((current) => {
      const next = { ...current };
      delete next[unit.businessUnit];
      return next;
    });
    mark(unit.businessUnit, { saved: false, error: null, attempted: false });
  }

  async function save(unit: UnitSetting): Promise<keyof D | null> {
    const key = unit.businessUnit;
    const draft = draftOf(unit);
    const invalid = Object.keys(validate(draft))[0] as keyof D | undefined;
    if (invalid) {
      mark(key, { attempted: true, error: null });
      return invalid;
    }
    mark(key, { saving: true, saved: false, error: null, attempted: false });
    try {
      const updated = await api.put<UnitSetting>(`/settings/${key}`, toPayload(draft));
      onSaved(updated);
      setEdits((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      mark(key, { saving: false, saved: true });
      clearTimeout(timers.current[key]);
      timers.current[key] = setTimeout(() => mark(key, { saved: false }), 2500);
    } catch (err) {
      // The server names what it refused (an unrecognised timezone, say); show its words.
      mark(key, {
        saving: false,
        error: errorMessage(err, "No pudimos guardar los cambios. Inténtalo de nuevo."),
      });
    }
    return null;
  }

  async function saveAll(): Promise<{ unit: UnitSetting; field: keyof D } | null> {
    const edited = units.filter(isDirty);
    let first: { unit: UnitSetting; field: keyof D } | null = null;
    for (const unit of edited) {
      const field = Object.keys(validate(draftOf(unit)))[0] as keyof D | undefined;
      if (!field) continue;
      mark(unit.businessUnit, { attempted: true, error: null });
      first ??= { unit, field };
    }
    if (first) return first;
    await Promise.all(edited.map(save));
    return null;
  }

  return { state, patch, reset, save, saveAll, anyDirty: units.some(isDirty) };
}
