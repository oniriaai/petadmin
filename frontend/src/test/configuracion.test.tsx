import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ConfiguracionPage } from "../pages/configuracion/ConfiguracionPage";

const mockUseAuth = vi.fn();
const mockGet = vi.fn();
const mockPut = vi.fn();

vi.mock("../lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("../lib/auth-context")>("../lib/auth-context");
  return { ...actual, useAuth: () => mockUseAuth() };
});

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      get: (...args: unknown[]) => mockGet(...args),
      put: (...args: unknown[]) => mockPut(...args),
    },
  };
});

const UNIT = {
  businessUnit: "GROOMING",
  timezone: "America/Guayaquil",
  vatPercent: 15,
  reminders: {
    auto: false,
    channels: ["WHATSAPP"],
    defaultChannel: "WHATSAPP",
    leadDays: 7,
    contactPhone: null,
    contactEmail: null,
  },
  isConfigured: true,
  updatedAt: "2026-10-01T12:00:00.000Z",
};

const SETTINGS = {
  daycare: {
    id: "d1",
    slug: "salon-luna",
    name: "Salón Luna",
    legalName: null,
    timezone: "America/Guayaquil",
    isActive: true,
  },
  units: [UNIT],
};

function session(modules: string[]) {
  return {
    user: { id: "u1", name: "Ana", role: "admin" },
    units: ["GROOMING"],
    subscription: null,
    fullAccess: false,
    hasModule: (id: string | undefined) => !id || modules.includes(id),
    refreshSession: vi.fn(),
  };
}

function renderPage(modules: string[], path = "/configuracion") {
  mockUseAuth.mockReturnValue(session(modules));
  render(
    <MemoryRouter initialEntries={[path]}>
      <ConfiguracionPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockGet.mockReset();
  mockPut.mockReset();
  mockGet.mockImplementation((path: string) => {
    if (path === "/settings") return Promise.resolve(SETTINGS);
    if (path === "/users") return Promise.resolve([]);
    if (path === "/reminders/channels")
      return Promise.resolve({ WHATSAPP: "simulated", EMAIL: null });
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
});

describe("configuration tabs", () => {
  it("offers only the tabs the daycare's modules reach", async () => {
    renderPage(["nucleo"]);
    expect(await screen.findByRole("tab", { name: /Negocio/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Equipo/ })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Recordatorios/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Datos/ })).not.toBeInTheDocument();
    // The channels endpoint belongs to a module this daycare did not buy.
    expect(mockGet).not.toHaveBeenCalledWith("/reminders/channels");
  });

  it("opens the tab named in the address", async () => {
    renderPage(["nucleo", "recordatorios", "informes"], "/configuracion?tab=datos");
    expect(await screen.findByRole("tab", { name: /Datos/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("button", { name: "Descargar Clientes" })).toBeInTheDocument();
  });

  it("falls back to the first tab for one the daycare cannot see", async () => {
    renderPage(["nucleo"], "/configuracion?tab=recordatorios");
    expect(await screen.findByRole("tab", { name: /Negocio/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

describe("saving a unit's settings", () => {
  it("refuses an empty VAT instead of saving zero", async () => {
    renderPage(["nucleo"]);
    const vat = await screen.findByLabelText(/IVA por defecto/);
    fireEvent.change(vat, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByText("Escribe un porcentaje entre 0 y 100.")).toBeInTheDocument();
    expect(vat).toHaveAttribute("aria-invalid", "true");
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("sends only the half of the unit its tab edits", async () => {
    mockPut.mockResolvedValue({ ...UNIT, vatPercent: 12 });
    renderPage(["nucleo", "recordatorios"]);
    fireEvent.change(await screen.findByLabelText(/IVA por defecto/), {
      target: { value: "12" },
    });
    expect(screen.getByText("Tienes cambios sin guardar")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith("/settings/GROOMING", {
        timezone: "America/Guayaquil",
        vatPercent: 12,
      }),
    );
    expect(await screen.findByText("Guardado")).toBeInTheDocument();
  });

  it("shows the server's refusal inside the card and lets the change be discarded", async () => {
    mockPut.mockRejectedValue(new Error("Zona horaria no reconocida: Marte/Olimpo"));
    renderPage(["nucleo"]);
    const vat = await screen.findByLabelText(/IVA por defecto/);
    fireEvent.change(vat, { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Zona horaria no reconocida");
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(vat).toHaveValue(15);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the last channel on and hides a default with nothing to choose from", async () => {
    renderPage(["nucleo", "recordatorios"], "/configuracion?tab=recordatorios");
    const whatsapp = await screen.findByRole("checkbox", { name: /WhatsApp/ });
    expect(whatsapp).toBeChecked();
    expect(whatsapp).toBeDisabled();
    expect(screen.queryByLabelText("Canal por defecto")).not.toBeInTheDocument();
  });
});

describe("reminders with several units", () => {
  it("shows one unit at a time and keeps an unsaved edit while another is open", async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === "/settings")
        return Promise.resolve({
          ...SETTINGS,
          units: [{ ...UNIT, businessUnit: "DAYCARE" }, UNIT],
        });
      if (path === "/reminders/channels")
        return Promise.resolve({ WHATSAPP: "simulated", EMAIL: "simulated" });
      return Promise.resolve([]);
    });
    renderPage(["nucleo", "recordatorios"], "/configuracion?tab=recordatorios");
    const picker = await screen.findByLabelText("Unidad");
    expect(screen.getByRole("form", { name: "Recordatorios de Guardería" })).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Recordatorios de Peluquería" })).toBeNull();

    fireEvent.change(screen.getByLabelText("Días de aviso"), { target: { value: "3" } });
    fireEvent.change(picker, { target: { value: "GROOMING" } });
    expect(screen.getByRole("form", { name: "Recordatorios de Peluquería" })).toBeInTheDocument();
    expect(screen.getByLabelText("Días de aviso")).toHaveValue(7);
    expect(screen.getByRole("option", { name: "Guardería · sin guardar" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Unidad"), { target: { value: "DAYCARE" } });
    expect(screen.getByLabelText("Días de aviso")).toHaveValue(3);
  });
});

describe("a failed load", () => {
  it("offers to try again", async () => {
    mockGet.mockImplementation((path: string) =>
      path === "/users" ? Promise.resolve([]) : Promise.reject(new Error("Sin conexión")),
    );
    renderPage(["nucleo"]);
    expect(await screen.findByText("Sin conexión")).toBeInTheDocument();
    mockGet.mockImplementation((path: string) =>
      Promise.resolve(path === "/settings" ? SETTINGS : []),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Salón Luna")).toBeInTheDocument();
  });
});
