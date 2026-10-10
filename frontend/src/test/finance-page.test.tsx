import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { FinancialPage } from "../pages/transacciones/FinancialPage";
import { presetPeriod } from "../pages/transacciones/finance";

const mockUseAuth = vi.fn();
const get = vi.fn();

vi.mock("../lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("../lib/auth-context")>("../lib/auth-context");
  return { ...actual, useAuth: () => mockUseAuth() };
});

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return { ...actual, api: { get: (path: string) => get(path) } };
});

function renderPage(modules: string[], permissions: string[]) {
  mockUseAuth.mockReturnValue({
    hasModule: (id?: string) => !id || modules.includes(id),
    can: (id?: string) => !id || permissions.includes(id),
  });
  render(
    <MemoryRouter>
      <FinancialPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockUseAuth.mockReset();
  get.mockReset();
  get.mockImplementation((path: string) =>
    Promise.resolve(
      path.includes("/summary")
        ? { total: 115, vat: 15, count: 1 }
        : { items: [], total: 0, page: 1, pageSize: 50, pageCount: 1 },
    ),
  );
});

/**
 * The summary and the Excel files are served by `informes`. A daycare with `finanzas` alone
 * must get its ledger, not a tab that answers MODULE_DISABLED.
 */
describe("Finanzas without the informes module", () => {
  it("opens on the ledger, with no summary tab and no export", async () => {
    renderPage(["finanzas"], ["finanzas.read", "finanzas.write", "datos.export"]);
    expect(await screen.findByText("No hay ingresos en este periodo.")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Resumen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Excel/ })).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalledWith(expect.stringContaining("/reports/"));
  });

  it("asks the server for the period and the totals instead of summing the page", async () => {
    renderPage(["finanzas"], ["finanzas.read"]);
    expect(await screen.findByText("$115,00")).toBeInTheDocument();
    const { from, to } = presetPeriod("month");
    expect(get).toHaveBeenCalledWith(`/incomes/summary?from=${from}&to=${to}`);
    expect(screen.queryByRole("button", { name: /Nuevo ingreso/ })).not.toBeInTheDocument();
  });
});

describe("Finanzas with the informes module", () => {
  it("offers the summary tab and the export", async () => {
    get.mockImplementation(() => new Promise(() => undefined));
    renderPage(["finanzas", "informes"], ["finanzas.read", "datos.export"]);
    expect(screen.getByRole("tab", { name: /Resumen/ })).toHaveAttribute("aria-selected", "true");
    expect(get).toHaveBeenCalledWith(expect.stringContaining("/reports/finance?from="));
  });
});

describe("presetPeriod", () => {
  it("covers whole calendar months and the whole year", () => {
    const today = new Date(2026, 2, 15);
    expect(presetPeriod("month", today)).toEqual({ from: "2026-03-01", to: "2026-03-31" });
    expect(presetPeriod("lastMonth", today)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(presetPeriod("year", today)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });
});
