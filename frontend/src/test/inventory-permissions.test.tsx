import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { InventarioPage } from "../pages/inventario/InventarioPage";

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
        Promise.resolve([
          {
            id: "i1",
            name: "Shampoo neutro",
            category: "Higiene",
            unit: "unidad",
            minStock: 2,
            currentStock: 8,
            unitCost: 4,
            isActive: true,
          },
        ]),
    },
  };
});

function session(permissions: string[]) {
  return {
    user: { id: "u1", username: "ana", name: "Ana", role: "daycare", businessUnit: "DAYCARE" },
    activeBusinessUnit: "DAYCARE",
    can: (id?: string) => !id || permissions.includes(id),
  };
}

function renderPage(permissions: string[]) {
  mockUseAuth.mockReturnValue(session(permissions));
  render(
    <MemoryRouter>
      <InventarioPage />
    </MemoryRouter>,
  );
}

beforeEach(() => mockUseAuth.mockReset());

/**
 * `inventario.read` opens the page; it must not offer what the server would then refuse. A
 * button that answers 403 is how a permission boundary gets reported as a bug.
 */
describe("inventory with read-only permission", () => {
  it("shows the stock without any way to change it", async () => {
    renderPage(["inventario.read"]);
    expect(await screen.findByText("Shampoo neutro")).toBeInTheDocument();
    expect(screen.queryByText("Nuevo artículo")).not.toBeInTheDocument();
    expect(screen.queryByText("Movimiento")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Editar Shampoo neutro")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Dar de baja Shampoo neutro")).not.toBeInTheDocument();
  });

  it("offers every action once the write permission is granted", async () => {
    renderPage(["inventario.read", "inventario.write"]);
    expect(await screen.findByText("Shampoo neutro")).toBeInTheDocument();
    expect(screen.getByText("Nuevo artículo")).toBeInTheDocument();
    expect(screen.getByText("Movimiento")).toBeInTheDocument();
    expect(screen.getByLabelText("Editar Shampoo neutro")).toBeInTheDocument();
    expect(screen.getByLabelText("Dar de baja Shampoo neutro")).toBeInTheDocument();
  });
});
