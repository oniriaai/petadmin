import { PERMISSIONS, togglePermission } from "../../modules/shared/contracts";
import type { PermissionId } from "../../modules/shared/contracts";

/**
 * The permission catalog as a checklist. Shared by the daycare's own staff screen and the vendor
 * console, so both assign from the same list with the same rules.
 *
 * An admin holds every permission whatever its row says, so for one the list is shown ticked
 * and locked: letting someone untick a box that does nothing would be a lie.
 */
export function PermissionChecklist({
  idPrefix,
  value,
  onChange,
  isAdmin = false,
  disabled = false,
}: {
  /** Makes the input ids unique when several checklists are on screen. */
  idPrefix: string;
  value: readonly PermissionId[];
  onChange: (next: PermissionId[]) => void;
  isAdmin?: boolean;
  disabled?: boolean;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="label">Permisos</legend>
      {isAdmin && (
        <p className="text-xs text-muted">
          Un administrador tiene todos los permisos. Para limitarlos, cámbiale el rol.
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {PERMISSIONS.map((permission) => {
          const id = `${idPrefix}-${permission.id}`;
          return (
            <label key={permission.id} htmlFor={id} className="flex items-start gap-2.5 text-sm">
              <input
                id={id}
                type="checkbox"
                className="mt-0.5"
                checked={isAdmin || value.includes(permission.id)}
                disabled={isAdmin || disabled}
                onChange={(event) =>
                  onChange(togglePermission(value, permission.id, event.target.checked))
                }
              />
              <span>
                <span className="font-medium text-ink">{permission.label}</span>
                <span className="block text-xs text-muted">{permission.description}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
