import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, KeyRound, Plus, UserPlus } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import {
  platformApi,
  type DaycareDetail,
  type Entitlement,
  type PlatformUser,
} from "../../lib/platform-api";
import { businessUnitLabel } from "../../modules/shared/contracts";
import { PlatformPage, auditLine, useAsync } from "./shared";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  daycare: "Guardería",
  grooming: "Peluquería",
  veterinary: "Veterinaria",
};

export function DaycareDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { setPinnedDaycare } = useAuth();
  const [detail, setDetail] = useState<DaycareDetail | null>(null);
  const { run, isLoading, error } = useAsync();
  const { run: runWrite, isLoading: isWriting, error: writeError } = useAsync();

  const load = useCallback(async () => setDetail(await platformApi.getDaycare(id)), [id]);

  useEffect(() => {
    void run(load);
  }, [run, load]);

  /**
   * Sends one module change. The server validates dependencies against the resulting state, so
   * a refused toggle comes back with a message naming what is missing; the matrix is then
   * reloaded from the response rather than assumed.
   */
  async function toggle(entitlement: Entitlement) {
    const updated = await runWrite(() =>
      platformApi.setModules(id, [
        { moduleId: entitlement.moduleId, isEnabled: !entitlement.isEnabled },
      ]),
    );
    if (updated)
      setDetail((current) => (current ? { ...current, entitlements: updated } : current));
    else await run(load);
  }

  async function setActive(isActive: boolean) {
    const updated = await runWrite(() => platformApi.updateDaycare(id, { isActive }));
    if (updated) await run(load);
  }

  /** Enters this tenant's workspace as the vendor, with the banner the tenant shell renders. */
  async function operate() {
    await setPinnedDaycare(id);
    navigate("/");
  }

  return (
    <PlatformPage
      title={detail?.name ?? "Guardería"}
      subtitle={
        detail
          ? `${detail.slug} · ${detail.unitList.map(businessUnitLabel).join(" · ")} · ${detail.timezone}`
          : undefined
      }
      isLoading={isLoading}
      error={error ?? writeError}
      actions={
        detail && (
          <div className="flex flex-wrap gap-2">
            <Link
              to="/platform/daycares"
              className="btn btn-secondary bg-surface text-muted border-line"
            >
              <ArrowLeft size={16} /> Volver
            </Link>
            <button
              className="btn btn-secondary bg-surface text-muted border-line"
              onClick={() => void setActive(!detail.isActive)}
              disabled={isWriting}
            >
              {detail.isActive ? "Desactivar" : "Activar"}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => void operate()}
              disabled={!detail.isActive}
            >
              <ExternalLink size={16} /> Operar como esta guardería
            </button>
          </div>
        )
      }
    >
      {detail && (
        <>
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider mb-3 text-muted">
              Módulos contratados
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {detail.entitlements.map((entitlement) => (
                <div
                  key={entitlement.moduleId}
                  className="card p-3 flex items-start gap-3 bg-surface border-line"
                >
                  <label className="flex items-start gap-3 cursor-pointer flex-1 min-w-0">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={entitlement.isEnabled}
                      onChange={() => void toggle(entitlement)}
                      disabled={isWriting}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{entitlement.label}</span>
                      <span className="block text-xs mt-0.5 text-muted">
                        {entitlement.description}
                      </span>
                      {entitlement.requires.length > 0 && (
                        <span className="block text-[11px] mt-1 text-muted">
                          Requiere: {entitlement.requires.join(", ")}
                        </span>
                      )}
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </section>

          <UsersSection daycareId={id} users={detail.users} onChanged={() => void run(load)} />

          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider mb-3 text-muted">
              Auditoría
            </h2>
            <div className="card divide-y bg-surface border-line">
              {detail.audit.length === 0 && (
                <p className="p-4 text-sm text-muted">Sin actividad registrada.</p>
              )}
              {detail.audit.map((entry) => (
                <div key={entry.id} className="p-3 text-sm flex items-baseline gap-3 border-line">
                  <span className="text-xs shrink-0 font-mono text-muted">
                    {new Date(entry.createdAt).toLocaleString("es-EC", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                  <span className="min-w-0">{auditLine(entry)}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </PlatformPage>
  );
}

function UsersSection({
  daycareId,
  users,
  onChanged,
}: {
  daycareId: string;
  users: PlatformUser[];
  onChanged: () => void;
}) {
  const [showNew, setShowNew] = useState(false);
  const { run, isLoading, error } = useAsync();

  async function toggleActive(user: PlatformUser) {
    const ok = await run(() =>
      platformApi.updateUser(daycareId, user.id, { isActive: !user.isActive }),
    );
    if (ok) onChanged();
  }

  async function resetPassword(user: PlatformUser) {
    const password = window.prompt(`Nueva contraseña para ${user.username} (mínimo 8 caracteres)`);
    if (!password) return;
    const ok = await run(() => platformApi.updateUser(daycareId, user.id, { password }));
    if (ok) window.alert("Listo, la contraseña quedó actualizada.");
  }

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Usuarios</h2>
        <button
          className="btn btn-secondary btn-sm bg-surface text-muted border-line"
          onClick={() => setShowNew((v) => !v)}
        >
          <UserPlus size={14} /> Nuevo usuario
        </button>
      </div>

      {error && (
        <div
          className="mb-3 rounded-lg border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger"
          role="alert"
        >
          {error}
        </div>
      )}

      {showNew && (
        <NewUserForm
          daycareId={daycareId}
          onCreated={() => {
            setShowNew(false);
            onChanged();
          }}
        />
      )}

      <div className="card overflow-hidden bg-surface border-line">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {["Usuario", "Nombre", "Rol", "Unidad", "Estado", ""].map((header) => (
                  <th key={header} className="table-th bg-transparent text-muted">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-line">
                  <td className="table-td font-mono text-xs text-ink">{user.username}</td>
                  <td className="table-td text-ink">{user.name}</td>
                  <td className="table-td text-muted">{ROLE_LABELS[user.role] ?? user.role}</td>
                  <td className="table-td text-muted">{businessUnitLabel(user.businessUnit)}</td>
                  <td className="table-td">
                    <span
                      className={`badge ${user.isActive ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}
                    >
                      {user.isActive ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="table-td text-right whitespace-nowrap">
                    <button
                      className="btn btn-ghost btn-sm text-muted"
                      disabled={isLoading}
                      onClick={() => void resetPassword(user)}
                    >
                      <KeyRound size={14} /> Contraseña
                    </button>
                    <button
                      className="btn btn-ghost btn-sm text-muted"
                      disabled={isLoading}
                      onClick={() => void toggleActive(user)}
                    >
                      {user.isActive ? "Desactivar" : "Activar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function NewUserForm({ daycareId, onCreated }: { daycareId: string; onCreated: () => void }) {
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("daycare");
  const { run, isLoading, error } = useAsync();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const created = await run(() =>
      platformApi.provisionUser(daycareId, { username, name, password, role }),
    );
    if (created) onCreated();
  }

  const inputStyle = {
    background: "var(--color-canvas)",
    color: "var(--color-ink)",
    borderColor: "var(--color-border)",
  };

  return (
    <form onSubmit={submit} className="card p-4 mb-3 bg-surface border-line">
      {error && (
        <div
          className="mb-3 rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className="label text-xs text-muted" htmlFor="nu-u">
            Usuario
          </label>
          <input
            id="nu-u"
            className="input font-mono"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
            style={inputStyle}
          />
        </div>
        <div>
          <label className="label text-xs text-muted" htmlFor="nu-n">
            Nombre
          </label>
          <input
            id="nu-n"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={inputStyle}
          />
        </div>
        <div>
          <label className="label text-xs text-muted" htmlFor="nu-p">
            Contraseña
          </label>
          <input
            id="nu-p"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            style={inputStyle}
          />
        </div>
        <div>
          <label className="label text-xs text-muted" htmlFor="nu-r">
            Rol
          </label>
          {/* `superadmin` is absent by construction: the server's schema does not accept it. */}
          <select
            id="nu-r"
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={inputStyle}
          >
            <option value="admin">Administrador</option>
            <option value="daycare">Guardería</option>
            <option value="grooming">Peluquería</option>
            <option value="veterinary">Veterinaria</option>
          </select>
        </div>
      </div>
      <div className="flex justify-end mt-3">
        <button type="submit" className="btn btn-primary btn-sm" disabled={isLoading}>
          <Plus size={14} /> {isLoading ? "Creando..." : "Crear usuario"}
        </button>
      </div>
    </form>
  );
}
