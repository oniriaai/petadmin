import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { GuardedRoute, SuperAdminRoute } from "../App";
import { Sidebar } from "../components/layout/Sidebar";
import { frontendModules, validateFrontendModules } from "../modules/registry";
import type { ProductModuleId } from "../modules/shared/contracts";

const mockUseAuth = vi.fn();

vi.mock("../lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("../lib/auth-context")>("../lib/auth-context");
  return { ...actual, useAuth: () => mockUseAuth() };
});

interface SessionOptions {
  role?: string;
  modules?: ProductModuleId[];
  fullAccess?: boolean;
  businessUnit?: string;
}

function session({
  role = "admin",
  modules = [],
  fullAccess = false,
  businessUnit = "GLOBAL",
}: SessionOptions = {}) {
  const enabled = new Set<string>(modules);
  return {
    user: { id: "u1", username: "u", name: "U", role, businessUnit, daycareId: "d1" },
    daycare: { id: "d1", name: "Guardería Uno", slug: "uno" },
    enabledModules: modules,
    units: ["DAYCARE", "GROOMING"],
    fullAccess,
    isLoading: false,
    isSessionLoading: false,
    activeBusinessUnit: null,
    setActiveBusinessUnit: vi.fn(),
    pinnedDaycareId: null,
    setPinnedDaycare: vi.fn(),
    logout: vi.fn(),
    hasModule: (id?: string) => (id ? enabled.has(id) : true),
    hasModules: (ids?: readonly string[]) => !ids || ids.every((id) => enabled.has(id)),
  };
}

function renderGuarded(route: {
  path: string;
  roles?: string[];
  requires?: ProductModuleId[];
  unit?: "DAYCARE" | "GROOMING";
}) {
  render(
    <MemoryRouter initialEntries={[route.path]}>
      <Routes>
        <Route
          path={route.path}
          element={
            <GuardedRoute route={{ ...route, component: () => null } as never}>
              <div>contenido</div>
            </GuardedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockUseAuth.mockReset();
  localStorage.clear();
});

describe("entitlement gating", () => {
  it("renders a route whose product module is enabled", () => {
    mockUseAuth.mockReturnValue(session({ modules: ["finanzas"] }));
    renderGuarded({ path: "/transacciones", requires: ["finanzas"] });
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });

  it("explains the block instead of redirecting when the module is missing", () => {
    mockUseAuth.mockReturnValue(session({ modules: [] }));
    renderGuarded({ path: "/transacciones", requires: ["finanzas"] });

    expect(screen.queryByText("contenido")).not.toBeInTheDocument();
    // The person must be told which module is missing, by its Spanish label, rather than being
    // silently bounced to the dashboard.
    expect(screen.getByText("Este módulo aún no está en tu plan")).toBeInTheDocument();
    expect(screen.getByText(/Gestión Financiera/)).toBeInTheDocument();
  });

  it("requires every module in `requires`, not just one", () => {
    // /transporte reads /reports/transport, so it needs informes as well as guarderia.
    mockUseAuth.mockReturnValue(session({ modules: ["guarderia"] }));
    renderGuarded({ path: "/transporte", requires: ["guarderia", "informes"] });
    expect(screen.queryByText("contenido")).not.toBeInTheDocument();
    expect(screen.getByText(/Informes y Exportación/)).toBeInTheDocument();
  });

  it("separates a role refusal from a disabled module", () => {
    mockUseAuth.mockReturnValue(session({ role: "grooming", modules: ["guarderia"] }));
    renderGuarded({ path: "/guarderia", roles: ["admin", "daycare"], requires: ["guarderia"] });
    expect(screen.getByText("Esta sección no está en tu rol")).toBeInTheDocument();
    expect(screen.queryByText("Este módulo aún no está en tu plan")).not.toBeInTheDocument();
  });

  it("explains a unit mismatch and offers the way out", () => {
    // The backend now refuses a module that does not serve the narrowed unit, so the route has
    // to say the same thing rather than mounting a page that fills with 403s.
    mockUseAuth.mockReturnValue({
      ...session({ modules: ["guarderia"] }),
      activeBusinessUnit: "GROOMING",
    });
    renderGuarded({ path: "/guarderia", requires: ["guarderia"], unit: "DAYCARE" });

    expect(screen.queryByText("contenido")).not.toBeInTheDocument();
    expect(screen.getByText("Esta sección es de Guardería")).toBeInTheDocument();
    // Unlike the other blocked states this one is self-service.
    expect(screen.getByRole("button", { name: /Cambiar a Guardería/ })).toBeInTheDocument();
  });

  it("allows a unit-specific route when that unit is selected", () => {
    mockUseAuth.mockReturnValue({
      ...session({ modules: ["guarderia"] }),
      activeBusinessUnit: "DAYCARE",
    });
    renderGuarded({ path: "/guarderia", requires: ["guarderia"], unit: "DAYCARE" });
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });

  it("allows a unit-specific route in the consolidated view", () => {
    // No unit selected means both, which is what the backend's scope resolves to as well.
    mockUseAuth.mockReturnValue({
      ...session({ modules: ["guarderia"] }),
      activeBusinessUnit: null,
    });
    renderGuarded({ path: "/guarderia", requires: ["guarderia"], unit: "DAYCARE" });
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });

  it("lets a superadmin through regardless of entitlements", () => {
    mockUseAuth.mockReturnValue(session({ role: "superadmin", modules: [], fullAccess: true }));
    renderGuarded({ path: "/transacciones", requires: ["finanzas"] });
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });

  it("waits rather than claiming a module is missing before the session has loaded", () => {
    mockUseAuth.mockReturnValue({ ...session({ modules: [] }), isSessionLoading: true });
    renderGuarded({ path: "/transacciones", requires: ["finanzas"] });
    // enabledModules is empty until /auth/me answers; showing "not available" then would be a
    // false negative on every page load.
    expect(screen.queryByText("Este módulo aún no está en tu plan")).not.toBeInTheDocument();
    expect(screen.getByText("Comprobando permisos...")).toBeInTheDocument();
  });
});

describe("navigation gating", () => {
  function renderSidebar(options: SessionOptions, path = "/") {
    mockUseAuth.mockReturnValue(session(options));
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Sidebar />
      </MemoryRouter>,
    );
  }

  it("hides nav items whose product module is absent", () => {
    renderSidebar({ modules: ["reservas"] });
    expect(screen.queryByText("Finanzas")).not.toBeInTheDocument();
    expect(screen.queryByText("Informes")).not.toBeInTheDocument();
    expect(screen.getByText("Operaciones")).toBeInTheDocument();
  });

  it("shows them once the module is enabled", () => {
    renderSidebar({ modules: ["reservas", "finanzas", "informes"] });
    expect(screen.getByText("Finanzas")).toBeInTheDocument();
    expect(screen.getByText("Informes")).toBeInTheDocument();
  });

  it("hides the clinic's navigation when veterinaria is not enabled", () => {
    renderSidebar({ modules: ["reservas"] });
    expect(screen.queryByText("Agenda veterinaria")).not.toBeInTheDocument();
    expect(screen.queryByText("Historias clínicas")).not.toBeInTheDocument();
    expect(screen.queryByText("Farmacia")).not.toBeInTheDocument();
    expect(screen.queryByText("Hospitalización")).not.toBeInTheDocument();
    expect(screen.queryByText("Laboratorio")).not.toBeInTheDocument();
    expect(screen.queryByText("Recordatorios")).not.toBeInTheDocument();
    expect(screen.queryByText("Informe clínico")).not.toBeInTheDocument();
    expect(screen.queryByText("Catálogo clínico")).not.toBeInTheDocument();
  });

  it("shows the clinic to its own role, without the admin-only catalogue", () => {
    renderSidebar({
      role: "veterinary",
      businessUnit: "VETERINARY",
      modules: ["reservas", "veterinaria"],
    });
    expect(screen.getByText("Agenda veterinaria")).toBeInTheDocument();
    expect(screen.getByText("Historias clínicas")).toBeInTheDocument();
    expect(screen.getByText("Farmacia")).toBeInTheDocument();
    expect(screen.getByText("Hospitalización")).toBeInTheDocument();
    expect(screen.getByText("Laboratorio")).toBeInTheDocument();
    expect(screen.getByText("Recordatorios")).toBeInTheDocument();
    // The clinic's figures are an administrator's.
    expect(screen.queryByText("Informe clínico")).not.toBeInTheDocument();
    expect(screen.queryByText("Catálogo clínico")).not.toBeInTheDocument();
    // And nothing of the other units.
    expect(screen.queryByText("Agenda de peluquería")).not.toBeInTheDocument();
    expect(screen.queryByText("Control de guardería")).not.toBeInTheDocument();
  });

  it("keeps the clinic away from the other units' roles", () => {
    renderSidebar({
      role: "grooming",
      businessUnit: "GROOMING",
      modules: ["reservas", "veterinaria", "peluqueria"],
    });
    expect(screen.queryByText("Agenda veterinaria")).not.toBeInTheDocument();
    expect(screen.getByText("Agenda de peluquería")).toBeInTheDocument();
  });

  it("always shows the core items, which are not sold separately", () => {
    renderSidebar({ modules: [] });
    expect(screen.getByText("Clientes")).toBeInTheDocument();
    expect(screen.getByText("Animales")).toBeInTheDocument();
  });

  it("folds a group and remembers it", () => {
    const { unmount } = renderSidebar({ modules: ["reservas"] });
    fireEvent.click(screen.getByRole("button", { name: "Gestión" }));
    expect(screen.queryByText("Clientes")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gestión" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    unmount();

    // Restored from storage on the next visit.
    renderSidebar({ modules: ["reservas"] });
    expect(screen.queryByText("Clientes")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gestión" }));
    expect(screen.getByText("Clientes")).toBeInTheDocument();
  });

  it("keeps the current page in view when its group is folded", () => {
    renderSidebar({ modules: ["reservas"] }, "/clientes");
    fireEvent.click(screen.getByRole("button", { name: "Gestión" }));
    // Folding must not hide where you are.
    expect(screen.getByText("Clientes").closest("a")).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText("Animales")).not.toBeInTheDocument();
  });

  it("marks only the longest matching item as current", () => {
    renderSidebar(
      { modules: ["reservas", "veterinaria"], businessUnit: "VETERINARY", role: "veterinary" },
      "/veterinaria/farmacia",
    );
    expect(screen.getByText("Farmacia").closest("a")).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Agenda veterinaria").closest("a")).not.toHaveAttribute("aria-current");
  });

  it("still renders when the folded-groups preference cannot be read", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => renderSidebar({ modules: [] })).not.toThrow();
    expect(screen.getByText("Clientes")).toBeInTheDocument();
    getItem.mockRestore();
  });
});

describe("platform console routing", () => {
  it("keeps a daycare user out of /platform", () => {
    mockUseAuth.mockReturnValue(session({ role: "admin" }));
    render(
      <MemoryRouter initialEntries={["/platform"]}>
        <Routes>
          <Route
            path="/platform"
            element={
              <SuperAdminRoute>
                <div>consola</div>
              </SuperAdminRoute>
            }
          />
          <Route path="/" element={<div>inicio</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByText("consola")).not.toBeInTheDocument();
    expect(screen.getByText("inicio")).toBeInTheDocument();
  });

  it("lets the superadmin in", () => {
    mockUseAuth.mockReturnValue(session({ role: "superadmin", fullAccess: true }));
    render(
      <MemoryRouter initialEntries={["/platform"]}>
        <Routes>
          <Route
            path="/platform"
            element={
              <SuperAdminRoute>
                <div>consola</div>
              </SuperAdminRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("consola")).toBeInTheDocument();
  });
});

describe("registry", () => {
  it("accepts the shipped module list", () => {
    expect(() => validateFrontendModules()).not.toThrow();
  });

  it("rejects a route requiring a product module that does not exist", () => {
    // The ids live in two code bases. An unknown one would never match enabledModules and
    // would hide the route from everyone, so it must fail loudly at boot.
    expect(() =>
      validateFrontendModules([
        {
          id: "x",
          label: "X",
          routes: [
            { path: "/x", component: () => null, requires: ["no-such-module" as ProductModuleId] },
          ],
        },
      ]),
    ).toThrow(/Unknown product module/);
  });

  it("rejects a nav item requiring an unknown product module", () => {
    expect(() =>
      validateFrontendModules([
        {
          id: "x",
          label: "X",
          routes: [],
          navigation: {
            label: "X",
            icon: (() => null) as never,
            items: [
              {
                to: "/x",
                label: "X",
                icon: (() => null) as never,
                requires: ["nope" as ProductModuleId],
              },
            ],
          },
        },
      ]),
    ).toThrow(/Unknown product module/);
  });

  it("declares an entitlement for every route that is not core", () => {
    // A route with no `requires` is claiming to be free for every daycare. That is true for
    // clients, pets, the dashboard and static pages, and must be a deliberate list rather than
    // something a new route falls into by forgetting the field.
    const free = frontendModules
      .flatMap((module) => module.routes)
      .filter((route) => !route.requires)
      .map((route) => route.path)
      .sort();

    expect(free).toEqual([
      "/",
      "/animales",
      "/clientes",
      "/configuracion",
      "/guia",
      "/herramientas",
    ]);
  });
});
