import React, { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarCheck2, CircleAlert, Eye, EyeOff, PawPrint, Wallet } from "lucide-react";
import { useAuth } from "../lib/auth-context";
import { Spinner } from "../components/ui/Spinner";

/**
 * Sign-in.
 *
 * There used to be a four-card "Selecciona tu unidad" picker above the credentials. It is gone,
 * and its removal is the point of this screen rather than a simplification of it: `businessUnit`
 * is optional on `POST /auth/login`, and for a unit-scoped role the server answers a *mismatched*
 * unit with 401 "Credenciales incorrectas". A grooming operator who tapped "Guardería" was told
 * their password was wrong when it was not.
 *
 * Nothing was lost with it. The server already knows each account's role and unit; an `admin`
 * lands consolidated and narrows with the unit switcher in the topbar and the mobile drawer; and
 * a `superadmin` is routed to the console by role, which `App.tsx` already did on its own.
 */

/** What the product actually does, in the order a new operator meets it. */
const CAPABILITIES = [
  { Icon: CalendarCheck2, title: "Reservas y agenda", line: "Estancias, citas y planes recurrentes en un calendario." },
  { Icon: PawPrint, title: "Operación diaria", line: "Cupos por sala, entradas y salidas con control de aforo." },
  { Icon: Wallet, title: "Finanzas por unidad", line: "Cobros e ingresos separados entre Guardería y Peluquería." },
];

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [hasCapsLock, setHasCapsLock] = useState(false);
  const [error, setError] = useState("");
  const passwordRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const signedIn = await login(null, username.trim(), password);
      const from = (location.state as { from?: string } | null)?.from;
      // The vendor belongs in the console; a tenant user returns to wherever they were sent from.
      navigate(signedIn.role === "superadmin" ? "/platform" : (from ?? "/"), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos iniciar sesión. Inténtalo de nuevo.");
      setLoading(false);
      // Retyping is the usual next move, so put the cursor where it belongs.
      passwordRef.current?.select();
    }
  }

  /** Caps Lock silently breaks a password field; the browser gives no hint of its own. */
  function trackCapsLock(event: React.KeyboardEvent<HTMLInputElement>) {
    setHasCapsLock(event.getModifierState?.("CapsLock") ?? false);
  }

  return (
    <div className="min-h-screen bg-canvas flex flex-col lg:grid lg:grid-cols-[minmax(24rem,42%)_1fr]">
      {/*
        The shell colour the operator lands in, so signing in and working look like one product.
        On a phone it collapses to a title bar rather than eating the fold.
      */}
      <aside className="bg-shell text-shell-ink px-6 py-7 sm:px-8 lg:px-12 lg:py-14 lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-white/10 grid place-items-center shrink-0">
            <PawPrint size={21} aria-hidden="true" />
          </span>
          <span className="text-lg font-semibold tracking-tight">Pethijos Admin</span>
        </div>

        <div className="hidden lg:block max-w-sm">
          <h1 className="text-4xl font-bold tracking-tight leading-[1.1]">
            Guardería y peluquería en un solo sistema
          </h1>
          <ul className="mt-10 space-y-6">
            {CAPABILITIES.map(({ Icon, title, line }) => (
              <li key={title} className="flex gap-3.5">
                <Icon size={18} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
                <div>
                  <p className="font-medium leading-snug">{title}</p>
                  <p className="text-sm text-slate-400 leading-snug mt-0.5">{line}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="hidden lg:block text-sm text-slate-400 max-w-sm">
          Tu unidad de trabajo se ajusta sola según tu cuenta.
        </p>
      </aside>

      <main className="flex-1 flex items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-bold tracking-tight text-ink">Iniciar sesión</h2>
          <p className="text-muted mt-1.5">Entra con la cuenta que te entregó tu guardería.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
            <div>
              <label className="label" htmlFor="login-username">Usuario</label>
              <input
                id="login-username"
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="nombre_usuario"
                autoComplete="username"
                autoFocus
                required
                disabled={loading}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "login-error" : undefined}
              />
            </div>

            <div>
              <label className="label" htmlFor="login-password">Contraseña</label>
              <div className="relative">
                <input
                  id="login-password"
                  ref={passwordRef}
                  className="input pr-11"
                  type={isPasswordVisible ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={trackCapsLock}
                  onKeyDown={trackCapsLock}
                  onBlur={() => setHasCapsLock(false)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  disabled={loading}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "login-error" : undefined}
                />
                <button
                  type="button"
                  onClick={() => setIsPasswordVisible((visible) => !visible)}
                  aria-label={isPasswordVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
                  aria-pressed={isPasswordVisible}
                  disabled={loading}
                  className="absolute inset-y-0 right-0 px-3 grid place-items-center text-muted rounded-r-lg transition-colors hover:text-ink disabled:opacity-50"
                >
                  {isPasswordVisible ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {hasCapsLock && (
                <p className="mt-2 text-xs text-amber-700">Bloq Mayús está activado.</p>
              )}
            </div>

            {error && (
              <p
                id="login-error"
                role="alert"
                className="login-error flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5"
              >
                <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
              {loading ? <Spinner size={16} /> : null}
              {loading ? "Entrando…" : "Ingresar al sistema"}
            </button>
          </form>

          <p className="mt-8 text-sm text-muted">
            ¿Olvidaste tu contraseña? Pídele a un administrador de tu guardería que la restablezca.
          </p>
        </div>
      </main>
    </div>
  );
}
