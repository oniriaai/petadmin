import { useCallback, useEffect, useState } from "react";
import { Check, UserPlus, Users, X } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { Badge } from "../../components/ui/Badge";
import { SectionCard } from "../../components/ui/SectionCard";
import { ListSkeleton, Spinner } from "../../components/ui/Spinner";
import { PermissionChecklist } from "../../components/access/PermissionChecklist";
import { DEFAULT_STAFF_PERMISSIONS, PERMISSIONS } from "../../modules/shared/contracts";
import type { BusinessUnit, PermissionId, TenantRole } from "../../modules/shared/contracts";

interface StaffUser {
  id: string;
  username: string;
  name: string;
  role: TenantRole;
  businessUnit: string;
  isActive: boolean;
  permissions: PermissionId[];
}

const ROLE_LABELS: Record<TenantRole, string> = {
  admin: "Administrador",
  daycare: "Guardería",
  grooming: "Peluquería",
  veterinary: "Veterinaria",
};

/** The unit a role works in. The server refuses a role whose unit the daycare does not have. */
const ROLE_UNIT: Partial<Record<TenantRole, BusinessUnit>> = {
  daycare: "DAYCARE",
  grooming: "GROOMING",
  veterinary: "VETERINARY",
};

function message(error: unknown): string {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : "Algo salió mal. Inténtalo de nuevo.";
}

function summary(user: StaffUser): string {
  if (user.role === "admin") return "Todos los permisos";
  if (user.permissions.length === 0) return "Sin permisos adicionales";
  return PERMISSIONS.filter((permission) => user.permissions.includes(permission.id))
    .map((permission) => permission.label)
    .join(" · ");
}

/**
 * The daycare's own staff: who has an account, in which role, and what each one may do.
 *
 * `/users` has existed since tenants could administer themselves, but only the vendor console
 * had a screen for it. Permissions make that screen necessary: they are a decision the owner of
 * the business takes about its own people, not a support request.
 */
export function EquipoSection({ onCount }: { onCount?: (count: number) => void }) {
  const { user: me, units } = useAuth();
  const [users, setUsers] = useState<StaffUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const roles = (Object.keys(ROLE_LABELS) as TenantRole[]).filter((role) => {
    const unit = ROLE_UNIT[role];
    return !unit || units.includes(unit);
  });

  const load = useCallback(async () => {
    try {
      const list = await api.get<StaffUser[]>("/users");
      // Whoever cannot sign in goes last; the order within each group is the server's.
      setUsers([...list].sort((a, b) => Number(b.isActive) - Number(a.isActive)));
      onCount?.(list.filter((user) => user.isActive).length);
      setError(null);
    } catch (err) {
      setError(message(err));
    }
  }, [onCount]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SectionCard
      title="Equipo"
      icon={<Users size={16} aria-hidden />}
      bodyClassName="space-y-4 px-4 py-4 sm:px-5"
      action={
        <button
          type="button"
          className="btn-secondary btn-sm"
          aria-expanded={showNew}
          onClick={() => setShowNew((open) => !open)}
        >
          {showNew ? <X size={14} aria-hidden /> : <UserPlus size={14} aria-hidden />}
          {showNew ? "Cancelar" : "Nueva cuenta"}
        </button>
      }
    >
      <p className="text-sm text-muted">
        Cada persona entra con su cuenta. El rol decide en qué unidad trabaja; los permisos, si
        además puede ver las finanzas, mover el inventario, exportar o eliminar registros.
      </p>

      {error && (
        <div className="notice notice-danger" role="alert">
          {error}
        </div>
      )}

      {showNew && (
        <NewUserForm
          roles={roles}
          onCreated={() => {
            setShowNew(false);
            void load();
          }}
        />
      )}

      {!users ? (
        !error && <ListSkeleton rows={3} />
      ) : (
        <ul className="divide-y divide-line-subtle">
          {users.map((user) => (
            <li key={user.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className={user.isActive ? "min-w-0" : "min-w-0 opacity-70"}>
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                    {user.name}
                    {user.id === me?.id && <Badge tone="info">Tú</Badge>}
                    {!user.isActive && <Badge tone="danger">Inactiva</Badge>}
                  </p>
                  <p className="text-xs text-muted">
                    <span className="font-mono">{user.username}</span> · {ROLE_LABELS[user.role]}
                  </p>
                  <p className="text-xs text-muted mt-1">{summary(user)}</p>
                </div>
                <button
                  className="btn-ghost btn-sm shrink-0"
                  aria-expanded={editingId === user.id}
                  aria-label={`Editar a ${user.name}`}
                  onClick={() => setEditingId(editingId === user.id ? null : user.id)}
                >
                  {editingId === user.id ? "Cerrar" : "Editar"}
                </button>
              </div>
              {editingId === user.id && (
                <EditUserForm
                  user={user}
                  roles={roles}
                  isSelf={user.id === me?.id}
                  onSaved={() => {
                    setEditingId(null);
                    void load();
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function EditUserForm({
  user,
  roles,
  isSelf,
  onSaved,
}: {
  user: StaffUser;
  roles: TenantRole[];
  isSelf: boolean;
  onSaved: () => void;
}) {
  const { refreshSession } = useAuth();
  const [role, setRole] = useState<TenantRole>(user.role);
  const [permissions, setPermissions] = useState<PermissionId[]>(user.permissions);
  const [isActive, setIsActive] = useState(user.isActive);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/users/${user.id}`, {
        // The server refuses an admin changing its own role or deactivating itself; not sending
        // the fields keeps a name or password change from tripping that.
        ...(isSelf ? {} : { role, isActive }),
        permissions,
        ...(password ? { password } : {}),
      });
      if (isSelf) await refreshSession();
      onSaved();
    } catch (err) {
      setError(message(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 rounded-lg bg-sunken p-4 space-y-4">
      {error && (
        <div className="notice notice-danger" role="alert">
          {error}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`role-${user.id}`}>
            Rol
          </label>
          <select
            id={`role-${user.id}`}
            className="input"
            value={role}
            disabled={isSelf}
            onChange={(event) => setRole(event.target.value as TenantRole)}
          >
            {roles.map((option) => (
              <option key={option} value={option}>
                {ROLE_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`password-${user.id}`}>
            Nueva contraseña
          </label>
          <input
            id={`password-${user.id}`}
            type="password"
            className="input"
            autoComplete="new-password"
            placeholder="Déjala vacía para no cambiarla"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
      </div>

      <PermissionChecklist
        idPrefix={`perm-${user.id}`}
        value={permissions}
        onChange={setPermissions}
        isAdmin={role === "admin"}
      />

      {!isSelf && (
        <label className="flex items-center gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          Cuenta activa
        </label>
      )}

      <div className="flex justify-end">
        <button type="submit" className="btn-primary btn-sm" disabled={saving}>
          {saving ? <Spinner size={14} /> : <Check size={14} />} Guardar
        </button>
      </div>
    </form>
  );
}

function NewUserForm({ roles, onCreated }: { roles: TenantRole[]; onCreated: () => void }) {
  const firstStaffRole = roles.find((role) => role !== "admin") ?? "admin";
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<TenantRole>(firstStaffRole);
  const [permissions, setPermissions] = useState<PermissionId[]>([...DEFAULT_STAFF_PERMISSIONS]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post("/users", { username, name, password, role, permissions });
      onCreated();
    } catch (err) {
      setError(message(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-lg bg-sunken p-4 space-y-4">
      {error && (
        <div className="notice notice-danger" role="alert">
          {error}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="equipo-name">
            Nombre
          </label>
          <input
            id="equipo-name"
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="equipo-username">
            Usuario
          </label>
          <input
            id="equipo-username"
            className="input font-mono"
            autoComplete="off"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            minLength={3}
            pattern="[a-zA-Z0-9._\-]+"
          />
        </div>
        <div>
          <label className="label" htmlFor="equipo-password">
            Contraseña
          </label>
          <input
            id="equipo-password"
            type="password"
            className="input"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
          />
        </div>
        <div>
          <label className="label" htmlFor="equipo-role">
            Rol
          </label>
          <select
            id="equipo-role"
            className="input"
            value={role}
            onChange={(event) => setRole(event.target.value as TenantRole)}
          >
            {roles.map((option) => (
              <option key={option} value={option}>
                {ROLE_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <PermissionChecklist
        idPrefix="equipo-new"
        value={permissions}
        onChange={setPermissions}
        isAdmin={role === "admin"}
      />

      <div className="flex justify-end">
        <button type="submit" className="btn-primary btn-sm" disabled={saving}>
          {saving ? <Spinner size={14} /> : <UserPlus size={14} />} Crear cuenta
        </button>
      </div>
    </form>
  );
}
