import { useMemo, useState } from "react";

type BusinessUnit = "KINDERDOG" | "PETHIJOS";

type User = {
  username: string;
  businessUnit: BusinessUnit;
  role: string;
};

const tabs = [
  "Nuevo",
  "Control de Reservas",
  "Perfil del Cliente",
  "Animales",
  "Disponibilidad",
  "Transporte",
  "Gestión Administrativa",
  "Informes y Gráficos",
  "Herramientas",
  "Configuración",
  "Guía de Uso",
];

export function App() {
  const [businessUnit, setBusinessUnit] = useState<BusinessUnit | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [error, setError] = useState("");

  const title = useMemo(() => {
    if (!user) return "Sistema Administrativo Pethijos";
    return user.businessUnit === "KINDERDOG" ? "Kinderdog Dashboard" : "Pethijos Dashboard";
  }, [user]);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    if (!businessUnit) {
      setError("Selecciona una unidad de negocio");
      return;
    }

    const response = await fetch("http://localhost:3001/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessUnit, username, password }),
    });

    const payload = await response.json();
    if (!response.ok) {
      setError(payload.message ?? "No se pudo iniciar sesión");
      return;
    }

    setError("");
    setToken(payload.token);
    setUser(payload.user);
  }

  if (!user) {
    return (
      <main className="screen">
        <section className="card">
          <h1>Acceso Administrativo</h1>
          <p>Flujo solicitado: Login - Logo Kinderdog/Pethijos - Dashboard.</p>
          <div className="logo-row">
            <button
              className={businessUnit === "KINDERDOG" ? "selected" : ""}
              onClick={() => setBusinessUnit("KINDERDOG")}
              type="button"
            >
              Kinderdog
            </button>
            <button
              className={businessUnit === "PETHIJOS" ? "selected" : ""}
              onClick={() => setBusinessUnit("PETHIJOS")}
              type="button"
            >
              Pethijos
            </button>
          </div>
          <form onSubmit={handleLogin} className="form">
            <input
              placeholder="Usuario"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button type="submit">Ingresar</button>
          </form>
          {error ? <p className="error">{error}</p> : null}
          <small>Credenciales semilla: kinderdog_admin/kinderdog123 y pethijos_admin/pethijos123</small>
        </section>
      </main>
    );
  }

  return (
    <main className="screen">
      <section className="dashboard">
        <header>
          <h1>{title}</h1>
          <p>Token activo: {token ? "si" : "no"} | Rol: {user.role}</p>
        </header>

        <nav className="tabs">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={activeTab === tab ? "active" : ""}
              type="button"
            >
              {tab}
            </button>
          ))}
        </nav>

        <section className="panel">
          <h2>{activeTab}</h2>
          <p>Modulo inicial implementado. Siguiente bloque: CRUDs y flujos completos por pestaña.</p>
        </section>
      </section>
    </main>
  );
}
