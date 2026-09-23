import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { Spinner } from "../components/ui/Spinner";
import { Compass, PawPrint, Scissors } from "lucide-react";

type BU = "KINDERDOG" | "PETHIJOS" | "ADMIN";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [bu, setBu] = useState<BU | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bu) { setError("Selecciona una unidad de negocio"); return; }
    setLoading(true);
    setError("");
    try {
      await login(bu === "ADMIN" ? null : bu, username, password);
      const to = (location.state as { from?: string } | null)?.from ?? "/";
      navigate(to, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <PawPrint size={48} className="mx-auto mb-3 text-white" aria-hidden="true" />
          <h1 className="text-3xl font-bold text-white">Pethijos Admin</h1>
          <p className="text-gray-400 mt-1">Sistema de gestión administrativa</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Selecciona tu unidad</h2>

          <div className="grid grid-cols-2 gap-3 mb-6">
            {([
              { id: "ADMIN",     label: "Admin",     Icon: Compass, desc: "Vista consolidada", color: "border-slate-500 bg-slate-50 ring-slate-400" },
              { id: "KINDERDOG", label: "Kinderdog", Icon: PawPrint, desc: "Guardería canina", color: "border-amber-500 bg-amber-50 ring-amber-400" },
              { id: "PETHIJOS",  label: "Pethijos",  Icon: Scissors, desc: "Peluquería",       color: "border-violet-500 bg-violet-50 ring-violet-400" },
            ] as const).map(({ id, label, Icon, desc, color }) => (
              <button
                key={id}
                type="button"
                onClick={() => setBu(id)}
                className={`p-4 rounded-xl border-2 text-left transition-all ${bu === id ? `${color} ring-2` : "border-gray-200 hover:border-gray-300"}`}
              >
                <Icon size={24} className="mb-1 text-slate-700" aria-hidden="true" />
                <div className="font-semibold text-gray-900 text-sm">{label}</div>
                <div className="text-xs text-gray-500">{desc}</div>
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="login-username">Usuario</label>
              <input id="login-username" className="input" value={username} onChange={e => setUsername(e.target.value)} placeholder="nombre_usuario" autoComplete="username" />
            </div>
            <div>
              <label className="label" htmlFor="login-password">Contraseña</label>
              <input id="login-password" className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
            </div>
            {error && <p id="login-error" role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
              {loading ? <Spinner size={16} /> : null}
              Ingresar al sistema
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
