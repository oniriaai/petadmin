import React, { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  CalendarCheck2,
  CircleAlert,
  Eye,
  EyeOff,
  PawPrint,
  Stethoscope,
  Wallet,
} from "lucide-react";
import { useAuth } from "../lib/auth-context";
import { ApiError } from "../lib/api";
import { Spinner } from "../components/ui/Spinner";
import { Wordmark } from "../components/brand/Wordmark";
import { Meander } from "../components/brand/Meander";

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
  {
    Icon: CalendarCheck2,
    title: "Reservas y agenda",
    line: "Estancias, citas y planes recurrentes en un calendario.",
  },
  {
    Icon: PawPrint,
    title: "Operación diaria",
    line: "Cupos por sala, entradas y salidas con control de aforo.",
  },
  {
    Icon: Stethoscope,
    title: "Clínica veterinaria",
    line: "Agenda, ficha clínica, farmacia y hospitalización.",
  },
  {
    Icon: Wallet,
    title: "Finanzas por unidad",
    line: "Cobros e ingresos con las cuentas de cada unidad por separado.",
  },
];

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  /**
   * The daycare slug, asked for only when the server says the username is ambiguous.
   *
   * Usernames became unique per daycare rather than globally, so two clients can both have a
   * `recepcion`. Showing this field to everyone would make every member of staff learn an
   * identifier they have no reason to know, so it stays hidden until it is actually needed,
   * and is remembered afterwards.
   */
  const [daycare, setDaycare] = useState(() => {
    try {
      return localStorage.getItem("daycareSlug") ?? "";
    } catch {
      return "";
    }
  });
  const [needsDaycare, setNeedsDaycare] = useState(false);
  const daycareRef = useRef<HTMLInputElement>(null);
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
      const signedIn = await login(null, username.trim(), password, daycare.trim() || undefined);
      try {
        if (daycare.trim()) localStorage.setItem("daycareSlug", daycare.trim());
      } catch {
        // A browser with site data blocked just asks again next time.
      }
      const from = (location.state as { from?: string } | null)?.from;
      // The vendor belongs in the console; a tenant user returns to wherever they were sent from.
      navigate(signedIn.role === "superadmin" ? "/platform" : (from ?? "/"), { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No pudimos iniciar sesión. Inténtalo de nuevo.",
      );
      setLoading(false);

      // The username exists in several daycares: reveal the field and send the user there
      // rather than to the password, which was not the problem.
      if (err instanceof ApiError && err.code === "DAYCARE_REQUIRED") {
        setNeedsDaycare(true);
        requestAnimationFrame(() => daycareRef.current?.focus());
        return;
      }

      // Retyping is the usual next move, so put the cursor where it belongs.
      passwordRef.current?.select();
    }
  }

  /** Caps Lock silently breaks a password field; the browser gives no hint of its own. */
  function trackCapsLock(event: React.KeyboardEvent<HTMLInputElement>) {
    setHasCapsLock(event.getModifierState?.("CapsLock") ?? false);
  }

  return (
    <div className="min-h-[100dvh] bg-canvas flex flex-col lg:grid lg:grid-cols-[minmax(24rem,42%)_1fr]">
      {/*
        The shell colour the operator lands in, so signing in and working look like one product.
        On a phone it collapses to the lockup rather than eating the fold.
      */}
      <aside className="bg-shell text-shell-ink px-6 py-6 sm:px-8 lg:px-12 lg:py-14 lg:flex lg:flex-col lg:justify-between">
        <div className="rise-in max-w-sm">
          <Wordmark size="lg" />
          <div className="mt-4 w-40 text-oro">
            <Meander />
          </div>
        </div>

        <div className="hidden lg:block max-w-sm">
          <h1
            className="rise-in font-display text-4xl leading-[1.1]"
            style={{ "--i": 1 } as React.CSSProperties}
          >
            Cuidamos tu negocio, para que tú cuides de ellos.
          </h1>
          <ul className="mt-10 space-y-5">
            {CAPABILITIES.map(({ Icon, title, line }, index) => (
              <li
                key={title}
                className="rise-in flex gap-3.5"
                style={{ "--i": index + 2 } as React.CSSProperties}
              >
                <Icon size={18} className="mt-0.5 shrink-0 text-shell-muted" aria-hidden="true" />
                <div>
                  <p className="font-medium leading-snug">{title}</p>
                  <p className="text-sm text-shell-muted leading-snug mt-0.5">{line}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="hidden lg:block text-sm text-shell-muted max-w-sm">
          Gestión de guarderías, peluquerías y veterinarias.
        </p>
      </aside>

      <main className="flex-1 flex items-center justify-center px-4 py-12 sm:px-6">
        <div className="rise-in w-full max-w-sm" style={{ "--i": 1 } as React.CSSProperties}>
          <h2 className="font-display text-3xl leading-tight text-ink">Iniciar sesión</h2>
          <p className="text-muted mt-1.5">
            Entra con la cuenta que te entregó tu negocio. Tu unidad de trabajo se ajusta sola.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
            {needsDaycare && (
              <div>
                <label className="label" htmlFor="login-daycare">
                  Guardería
                </label>
                <input
                  id="login-daycare"
                  ref={daycareRef}
                  className="input"
                  value={daycare}
                  onChange={(e) => setDaycare(e.target.value)}
                  placeholder="identificador-de-tu-guarderia"
                  autoComplete="organization"
                  disabled={loading}
                  aria-describedby="login-daycare-hint"
                />
                <p id="login-daycare-hint" className="text-muted mt-1.5 text-sm">
                  Tu usuario existe en más de una guardería. Indica el identificador que te dieron.
                </p>
              </div>
            )}

            <div>
              <label className="label" htmlFor="login-username">
                Usuario
              </label>
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
              <label className="label" htmlFor="login-password">
                Contraseña
              </label>
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
                <p className="mt-2 text-xs text-warning-ink">Bloq Mayús está activado.</p>
              )}
            </div>

            {error && (
              <p id="login-error" role="alert" className="login-error notice notice-danger">
                <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-2.5"
            >
              {loading ? <Spinner size={16} /> : null}
              {loading ? "Entrando…" : "Ingresar al sistema"}
            </button>
          </form>

          <p className="mt-8 text-sm text-muted">
            ¿Olvidaste tu contraseña? Pídele a un administrador de tu negocio que la restablezca.
          </p>
        </div>
      </main>
    </div>
  );
}
