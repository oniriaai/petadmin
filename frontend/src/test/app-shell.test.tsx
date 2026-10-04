import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";

const mockUseAuth = vi.fn();

vi.mock("../lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("../lib/auth-context")>("../lib/auth-context");
  return { ...actual, useAuth: () => mockUseAuth() };
});

const setPinnedDaycare = vi.fn();
const logout = vi.fn();

function session(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: "u1",
      username: "ana",
      name: "Ana",
      role: "admin",
      businessUnit: "GLOBAL",
      daycareId: "d1",
    },
    daycare: {
      id: "d1",
      name: "Guardería Uno",
      slug: "uno",
      legalName: "Uno S.A.",
      unitList: ["DAYCARE", "GROOMING"],
    },
    enabledModules: ["nucleo", "reservas"],
    units: ["DAYCARE", "GROOMING"],
    fullAccess: false,
    isLoading: false,
    isSessionLoading: false,
    activeBusinessUnit: null,
    setActiveBusinessUnit: vi.fn(),
    pinnedDaycareId: null,
    setPinnedDaycare,
    logout,
    hasModule: () => true,
    hasModules: () => true,
    ...overrides,
  };
}

function renderShell(overrides: Record<string, unknown> = {}) {
  mockUseAuth.mockReturnValue(session(overrides));
  return render(
    <MemoryRouter>
      <AppShell>
        <div>contenido</div>
      </AppShell>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockUseAuth.mockReset();
  localStorage.clear();
  setPinnedDaycare.mockReset();
  logout.mockReset();
});

describe("app shell", () => {
  it("renders a topbar naming the daycare", () => {
    renderShell();
    // There was no header at all before this; the daycare you are operating has to be visible.
    expect(screen.getByText("Guardería Uno")).toBeInTheDocument();
    expect(screen.getByText("Uno S.A.")).toBeInTheDocument();
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });

  it("opens and closes the mobile drawer", () => {
    renderShell();
    expect(screen.queryByLabelText("Cerrar menú")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Abrir menú"));
    expect(screen.getAllByLabelText("Cerrar menú").length).toBeGreaterThan(0);

    // Escape is the expected way out of an overlay.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByLabelText("Cerrar menú")).not.toBeInTheDocument();
  });

  it("offers the unit switcher inside the drawer, where the topbar one is hidden on mobile", () => {
    // The topbar switcher is `hidden sm:flex`, so below 640px it did not exist at all and an
    // administrator on a phone could not change unit. jsdom applies no media queries, so this
    // asserts the drawer carries its own copy rather than asserting the breakpoint.
    renderShell();
    expect(screen.getAllByLabelText("Unidad de negocio")).toHaveLength(1);

    fireEvent.click(screen.getByLabelText("Abrir menú"));
    const switchers = screen.getAllByLabelText("Unidad de negocio");
    expect(switchers).toHaveLength(2);
    // The drawer copy must be a real control, not a decorative label.
    expect(switchers.every((el) => el.tagName === "SELECT")).toBe(true);
  });

  it("keeps the drawer switcher out of a session that cannot switch units", () => {
    renderShell({ units: ["GROOMING"] });
    fireEvent.click(screen.getByLabelText("Abrir menú"));
    expect(screen.queryByLabelText("Unidad de negocio")).not.toBeInTheDocument();
  });

  it("remembers the collapsed sidebar across renders", () => {
    const { unmount } = renderShell();
    fireEvent.click(screen.getByLabelText("Contraer menú"));
    expect(localStorage.getItem("sidebarCollapsed")).toBe("1");
    unmount();

    renderShell();
    // Restored from storage, so the control offers the opposite action.
    expect(screen.getByLabelText("Expandir menú")).toBeInTheDocument();
  });

  it("still renders when localStorage throws", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    // A private window or blocked site data must not take the whole shell down.
    expect(() => renderShell()).not.toThrow();
    expect(screen.getByText("contenido")).toBeInTheDocument();
    getItem.mockRestore();
  });
});

describe("unit switcher", () => {
  it("is offered to a role that spans both units", () => {
    renderShell();
    expect(screen.getByLabelText("Unidad de negocio")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Consolidado" })).toBeInTheDocument();
  });

  it("offers and selects the clinic unit when the daycare bought it", () => {
    const setActiveBusinessUnit = vi.fn();
    renderShell({ units: ["DAYCARE", "GROOMING", "VETERINARY"], setActiveBusinessUnit });
    const switcher = screen.getByLabelText("Unidad de negocio");
    expect(screen.getByRole("option", { name: "Veterinaria" })).toBeInTheDocument();
    // The switcher used to accept only the two original units and silently fall back to
    // consolidated for anything else.
    fireEvent.change(switcher, { target: { value: "VETERINARY" } });
    expect(setActiveBusinessUnit).toHaveBeenCalledWith("VETERINARY");
  });

  it("is hidden from a unit-scoped role", () => {
    renderShell({
      user: {
        id: "u2",
        username: "b",
        name: "B",
        role: "grooming",
        businessUnit: "GROOMING",
        daycareId: "d1",
      },
    });
    expect(screen.queryByLabelText("Unidad de negocio")).not.toBeInTheDocument();
  });

  it("offers only the units the daycare bought", () => {
    renderShell({
      units: ["GROOMING"],
      daycare: { id: "d1", name: "Solo Peluquería", slug: "sp", unitList: ["GROOMING"] },
    });
    // One unit leaves nothing to switch between.
    expect(screen.queryByLabelText("Unidad de negocio")).not.toBeInTheDocument();
  });
});

describe("user menu", () => {
  it("shows the console entry only to the vendor", () => {
    renderShell();
    fireEvent.click(screen.getByLabelText("Menú de usuario"));
    expect(screen.queryByText("Consola de plataforma")).not.toBeInTheDocument();
    expect(screen.getByText("Cerrar sesión")).toBeInTheDocument();
  });

  it("offers the console to a superadmin", () => {
    renderShell({
      user: {
        id: "s1",
        username: "superadmin",
        name: "Plataforma",
        role: "superadmin",
        businessUnit: "GLOBAL",
        daycareId: null,
      },
      fullAccess: true,
    });
    fireEvent.click(screen.getByLabelText("Menú de usuario"));
    expect(screen.getByText("Consola de plataforma")).toBeInTheDocument();
  });
});

describe("platform banner", () => {
  it("is absent for an ordinary tenant session", () => {
    renderShell();
    expect(screen.queryByText(/Modo plataforma/)).not.toBeInTheDocument();
  });

  it("is shown, and offers no way to dismiss it, while the vendor operates a tenant", () => {
    renderShell({
      user: {
        id: "s1",
        username: "superadmin",
        name: "Plataforma",
        role: "superadmin",
        businessUnit: "GLOBAL",
        daycareId: null,
      },
      fullAccess: true,
      pinnedDaycareId: "d1",
    });

    expect(screen.getByText(/Modo plataforma · operando Guardería Uno/)).toBeInTheDocument();
    // The only control is the way out to the console. A dismiss button would defeat the point:
    // this banner is what distinguishes the vendor from the tenant's own administrator.
    expect(screen.getByText("Salir a la consola")).toBeInTheDocument();
    expect(screen.queryByLabelText("Cerrar aviso")).not.toBeInTheDocument();
  });
});
