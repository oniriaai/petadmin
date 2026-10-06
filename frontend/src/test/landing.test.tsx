import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { signupApi, type Catalog } from "../lib/billing";
import Landing from "../pages/Landing";

const CATALOG: Catalog = {
  plans: [
    {
      id: "inicial",
      label: "Inicial",
      summary: "Una unidad, Guardería o Peluquería, con reservas y agenda.",
      monthlyCents: 2900,
      annualCents: 29000,
      unitCount: 1,
      allowedUnits: ["DAYCARE", "GROOMING"],
      veterinarySurcharge: null,
      modules: [],
      featured: false,
    },
  ],
  units: ["DAYCARE", "GROOMING", "VETERINARY"],
  vatPercent: 15,
  founder: { available: false, slotsLeft: 0, discountPercent: 30, months: 12 },
  trial: { days: 30, planId: "integral3", available: true },
  checkoutAvailable: true,
};

const TRIAL_QUESTION = "¿Puedo probar Argos Suite antes de pagar?";
const PAYMENT_QUESTION = "¿Cómo se paga?";
const ALWAYS_QUESTION = "¿Quién recibe los recordatorios?";

describe("the public page", () => {
  beforeEach(() => {
    vi.spyOn(signupApi, "catalog").mockResolvedValue(CATALOG);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens its sections from a menu button, and closes it again", async () => {
    render(<Landing />);
    const toggle = screen.getByRole("button", { name: "Abrir menú" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAccessibleName("Cerrar menú");

    const menu = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    const links = within(menu).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "#unidades",
      "#modulos",
      "#precios",
      "#preguntas",
      "#historia",
      "/login",
    ]);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    fireEvent.click(within(menu).getByRole("link", { name: "Preguntas" }));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(signupApi.catalog).toHaveBeenCalled());
  });

  it("gives every menu link a section to land on", async () => {
    const { container } = render(<Landing />);
    await screen.findByText("Inicial");
    for (const id of ["inicio", "unidades", "modulos", "precios", "preguntas", "historia"]) {
      expect(container.querySelector(`#${id}`), id).not.toBeNull();
    }
  });

  it("shows the reminders module with the message a tutor receives", async () => {
    render(<Landing />);
    expect(screen.getByRole("heading", { name: "Argos Recordatorios" })).toBeInTheDocument();
    expect(
      screen.getByText("Enviado con Argos Suite. Este número no recibe respuestas."),
    ).toBeInTheDocument();
    await waitFor(() => expect(signupApi.catalog).toHaveBeenCalled());
  });

  it("answers about the trial and about paying where both are on offer", async () => {
    render(<Landing />);
    await screen.findByText("Inicial");
    expect(screen.getByText(TRIAL_QUESTION)).toBeInTheDocument();
    expect(screen.getByText(PAYMENT_QUESTION)).toBeInTheDocument();
    expect(screen.getByText(ALWAYS_QUESTION)).toBeInTheDocument();
  });

  it("leaves those answers out where the deployment offers neither", async () => {
    vi.mocked(signupApi.catalog).mockRejectedValue(new Error("sin catálogo"));
    render(<Landing />);
    await waitFor(() => expect(screen.queryByText(TRIAL_QUESTION)).not.toBeInTheDocument());
    expect(screen.queryByText(PAYMENT_QUESTION)).not.toBeInTheDocument();
    expect(screen.getByText(ALWAYS_QUESTION)).toBeInTheDocument();
  });
});
