import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { Dashboard } from "../pages/Dashboard";
import { UserMenu } from "../components/layout/UserMenu";
import { UnitSwitcher } from "../components/layout/UnitSwitcher";
import { findRoute } from "../modules/access";
import { useGoBack } from "../lib/use-go-back";

const mockUseAuth = vi.fn();

vi.mock("../lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("../lib/auth-context")>("../lib/auth-context");
  return { ...actual, useAuth: () => mockUseAuth() };
});

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    api: {
      get: () =>
        Promise.resolve({
          reservasHoy: 0,
          activas: 0,
          entradas: 0,
          salidas: 0,
          ingresosHoy: 0,
          ingresosMes: 0,
          totalClientes: 0,
          alertas: [],
          proximasReservas: [],
        }),
    },
  };
});

function session(enabledModules: string[], overrides: Record<string, unknown> = {}) {
  return {
    user: { id: "u1", username: "ana", name: "Ana", role: "admin", businessUnit: "GLOBAL" },
    enabledModules,
    units: ["DAYCARE", "GROOMING"],
    fullAccess: false,
    isLoading: false,
    isSessionLoading: false,
    activeBusinessUnit: null,
    setActiveBusinessUnit: vi.fn(),
    logout: vi.fn(),
    hasModule: (id?: string) => !id || enabledModules.includes(id),
    hasModules: (ids?: readonly string[]) => !ids || ids.every((id) => enabledModules.includes(id)),
    ...overrides,
  };
}

/** Prints where the router is and what the login would be told to return to. */
function Where() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "";
  return (
    <div>
      at:{location.pathname} from:{from}
    </div>
  );
}

beforeEach(() => {
  mockUseAuth.mockReset();
});

describe("dashboard links", () => {
  function renderDashboard(enabledModules: string[]) {
    mockUseAuth.mockReturnValue(session(enabledModules));
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
  }

  it("offers no link into a module the daycare has not bought", async () => {
    renderDashboard(["nucleo"]);
    expect(await screen.findByRole("link", { name: /Nuevo cliente/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Informes/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Finanzas/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Nueva reserva/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Ver todas/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Agendar la primera/ })).not.toBeInTheDocument();
  });

  it("offers them once the modules are enabled", async () => {
    renderDashboard(["nucleo", "reservas", "finanzas", "informes", "cumplimiento"]);
    expect(await screen.findByRole("link", { name: /Informes/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Finanzas/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Nueva reserva/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver todas las alertas/ })).toBeInTheDocument();
  });

  it("links to the alerts only when the alerts tab exists", async () => {
    renderDashboard(["nucleo", "reservas"]);
    expect(await screen.findByRole("link", { name: /Nueva reserva/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Ver todas las alertas/ })).not.toBeInTheDocument();
  });
});

describe("findRoute", () => {
  it("resolves a path with parameters to its registry route", () => {
    expect(findRoute("/veterinaria/recetas/abc")?.path).toBe("/veterinaria/recetas/:id");
    expect(findRoute("/guarderia")?.unit).toBe("DAYCARE");
    expect(findRoute("/no-existe")).toBeUndefined();
  });
});

describe("logout", () => {
  it("goes to the login without remembering the page for whoever signs in next", () => {
    const logout = vi.fn();
    mockUseAuth.mockReturnValue(session(["nucleo"], { logout }));
    render(
      <MemoryRouter initialEntries={["/configuracion"]}>
        <UserMenu />
        <Where />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText("Menú de usuario"));
    fireEvent.click(screen.getByText("Cerrar sesión"));
    expect(logout).toHaveBeenCalled();
    expect(screen.getByText("at:/login from:")).toBeInTheDocument();
  });
});

describe("switching unit", () => {
  function renderSwitcher(path: string) {
    mockUseAuth.mockReturnValue(session(["nucleo"], { activeBusinessUnit: "DAYCARE" }));
    render(
      <MemoryRouter initialEntries={[path]}>
        <UnitSwitcher unit="DAYCARE" />
        <Where />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText(/^Unidad de negocio/));
  }

  it("leaves a page that belongs to the unit being left", () => {
    renderSwitcher("/guarderia");
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Peluquería" }));
    expect(screen.getByText("at:/ from:")).toBeInTheDocument();
  });

  it("stays on a page every unit shares", () => {
    renderSwitcher("/clientes");
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Peluquería" }));
    expect(screen.getByText("at:/clientes from:")).toBeInTheDocument();
  });

  it("stays put when widening to the consolidated view", () => {
    renderSwitcher("/guarderia");
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Consolidado" }));
    expect(screen.getByText("at:/guarderia from:")).toBeInTheDocument();
  });
});

describe("useGoBack", () => {
  function Back() {
    const goBack = useGoBack("/veterinaria/pacientes");
    return <button onClick={goBack}>Volver</button>;
  }

  function renderBack(entries: string[]) {
    render(
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <Routes>
          <Route path="/veterinaria/recetas/:id" element={<Back />} />
        </Routes>
        <Where />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("Volver"));
  }

  it("goes back when there is a page behind it", () => {
    renderBack(["/veterinaria/consultas/v1", "/veterinaria/recetas/r1"]);
    expect(screen.getByText("at:/veterinaria/consultas/v1 from:")).toBeInTheDocument();
  });

  it("goes to the parent page when nothing is behind it", () => {
    renderBack(["/veterinaria/recetas/r1"]);
    expect(screen.getByText("at:/veterinaria/pacientes from:")).toBeInTheDocument();
  });
});
