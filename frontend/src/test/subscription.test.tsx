import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SubscriptionBanner } from "../components/layout/SubscriptionBanner";
import { frontendModules } from "../modules/registry";
import {
  founderPriceCents,
  planPriceCents,
  quoteFor,
  readReturnParams,
  signupApi,
  slugify,
  type Catalog,
} from "../lib/billing";
import { Pricing } from "../pages/LandingPricing";
import SignupApp from "../pages/signup/SignupApp";

const mockUseAuth = vi.fn();

vi.mock("../lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("../lib/auth-context")>("../lib/auth-context");
  return { ...actual, useAuth: () => mockUseAuth() };
});

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
    {
      id: "negocio",
      label: "Negocio",
      summary: "Una unidad con finanzas, inventario, informes y alertas.",
      monthlyCents: 4900,
      annualCents: 49000,
      unitCount: 1,
      allowedUnits: ["DAYCARE", "GROOMING", "VETERINARY"],
      veterinarySurcharge: { monthlyCents: 1000, annualCents: 10000 },
      modules: ["finanzas", "inventario", "informes", "cumplimiento"],
      featured: false,
    },
    {
      id: "integral",
      label: "Integral",
      summary: "Dos unidades con todos los módulos y los recordatorios automáticos.",
      monthlyCents: 8900,
      annualCents: 89000,
      unitCount: 2,
      allowedUnits: ["DAYCARE", "GROOMING", "VETERINARY"],
      veterinarySurcharge: null,
      modules: ["finanzas", "inventario", "informes", "cumplimiento", "recordatorios"],
      featured: true,
    },
  ],
  units: ["DAYCARE", "GROOMING", "VETERINARY"],
  vatPercent: 15,
  founder: { available: false, slotsLeft: 0, discountPercent: 30, months: 12 },
  trial: { days: 30, planId: "integral-3", available: true },
  checkoutAvailable: true,
};

describe("prices on the client", () => {
  // The same figures `backend/tests/billing-plans.ts` pins: the total a visitor reads before
  // paying has to be the one the server then charges.
  it("quotes what the server quotes", () => {
    expect(quoteFor(8900, 0, 15)).toEqual({
      subtotalCents: 8900,
      discountCents: 0,
      taxCents: 1335,
      totalCents: 10235,
    });
    expect(quoteFor(8900, 30, 15)).toEqual({
      subtotalCents: 8900,
      discountCents: 2670,
      taxCents: 935,
      totalCents: 7165,
    });
    expect(founderPriceCents(8900, 30)).toBe(6230);
  });

  it("adds the clinic surcharge only to a plan that has one, and only with the clinic", () => {
    const [, negocio, integral] = CATALOG.plans;
    expect(planPriceCents(negocio, ["GROOMING"], "MONTHLY")).toBe(4900);
    expect(planPriceCents(negocio, ["VETERINARY"], "MONTHLY")).toBe(5900);
    expect(planPriceCents(negocio, ["VETERINARY"], "ANNUAL")).toBe(59000);
    expect(planPriceCents(integral, ["GROOMING", "VETERINARY"], "MONTHLY")).toBe(8900);
  });

  it("derives an identifier the server accepts", () => {
    expect(slugify("Patitas Felices")).toBe("patitas-felices");
    expect(slugify("  Clínica Ñandú & Cía.  ")).toBe("clinica-nandu-cia");
    expect(slugify("a".repeat(60))).toHaveLength(40);
    // Cutting at 40 must not leave the hyphen the server's pattern refuses at the end.
    expect(slugify(`${"a".repeat(39)} b`)).toBe("a".repeat(39));
  });

  it("reads PayPhone's return however it spells the parameters", () => {
    expect(readReturnParams("?id=12&clientTransactionId=abc&ctoken=tok")).toEqual({
      id: "12",
      clientTransactionId: "abc",
      ctoken: "tok",
    });
    expect(readReturnParams("?ID=12&ClientTransactionID=abc")).toEqual({
      id: "12",
      clientTransactionId: "abc",
      ctoken: null,
    });
    expect(readReturnParams("").id).toBeNull();
  });
});

describe("signing up from the public page", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(signupApi, "catalog").mockResolvedValue(CATALOG);
  });

  async function fillAccount() {
    await screen.findByRole("heading", { name: "Crea tu espacio en Argos Suite" });
    const type = (label: RegExp | string, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    type("Nombre comercial", "Patitas Felices");
    type("RUC o cédula", "1790012345001");
    type("Teléfono", "099 123 4567");
    type("Tu nombre", "Ana Prueba");
    type("Correo", "ana@example.com");
    type("Contraseña", "secreto123");
  }

  it("starts on the recommended plan and totals it with IVA", async () => {
    render(<SignupApp />);
    expect(await screen.findByRole("heading", { name: "Plan Integral" })).toBeInTheDocument();
    // 89 + 15% IVA. Not written in the page anywhere: it comes from the catalog.
    expect(
      screen.getByRole("button", { name: /Continuar al pago de \$102,35/ }),
    ).toBeInTheDocument();
  });

  it("does not send a form with missing or malformed fields", async () => {
    const start = vi.spyOn(signupApi, "start");
    render(<SignupApp />);
    fireEvent.click(await screen.findByRole("button", { name: /Continuar al pago/ }));
    expect(await screen.findByText("Escribe el nombre de tu negocio.")).toBeInTheDocument();
    expect(screen.getByText("Usa al menos 8 caracteres.")).toBeInTheDocument();
    expect(start).not.toHaveBeenCalled();
  });

  it("will not go to the payment until the terms are accepted", async () => {
    const start = vi.spyOn(signupApi, "start");
    render(<SignupApp />);
    await fillAccount();
    fireEvent.click(screen.getByRole("button", { name: /Continuar al pago/ }));
    expect(await screen.findByText("Marca esta casilla para continuar.")).toBeInTheDocument();
    expect(start).not.toHaveBeenCalled();
  });

  it("sends the plan, not a price, and derives identifier and username from the name", async () => {
    // Never resolves: the next step is a navigation to PayPhone, which jsdom cannot do.
    const start = vi.spyOn(signupApi, "start").mockReturnValue(new Promise(() => {}));
    render(<SignupApp />);
    await fillAccount();
    fireEvent.click(screen.getByLabelText(/Acepto contratar este plan/));
    fireEvent.click(screen.getByRole("button", { name: /Continuar al pago/ }));

    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    const body = start.mock.calls[0][0];
    expect(body).toMatchObject({
      kind: "PAID",
      planId: "integral",
      units: ["DAYCARE", "GROOMING"],
      period: "MONTHLY",
      slug: "patitas-felices",
      adminUsername: "patitas-felices_admin",
      // Keeping the card is opt-in: an unticked box must never arrive as consent.
      saveCard: false,
      acceptTerms: true,
    });
    expect(JSON.stringify(body)).not.toMatch(/cents|total|price/i);
  });

  it("a trial asks for no plan and ends at the inbox, not at the gateway", async () => {
    const start = vi
      .spyOn(signupApi, "start")
      .mockResolvedValue({ next: "verify-email", email: "ana@example.com" });
    render(<SignupApp />);
    fireEvent.click(await screen.findByRole("radio", { name: "Probar 30 días gratis" }));
    expect(screen.queryByRole("radiogroup", { name: "Plan" })).not.toBeInTheDocument();
    await fillAccount();
    fireEvent.click(screen.getByLabelText(/cuenta de prueba/));
    fireEvent.click(screen.getByRole("button", { name: "Empezar la prueba" }));

    expect(await screen.findByRole("heading", { name: "Revisa tu correo" })).toBeInTheDocument();
    expect(screen.getByText("ana@example.com")).toBeInTheDocument();
    expect(start.mock.calls[0][0]).toMatchObject({ kind: "TRIAL", saveCard: false });
    expect(start.mock.calls[0][0].planId).toBeUndefined();
  });

  it("offers contact instead of a form when nothing can be bought online", async () => {
    vi.spyOn(signupApi, "catalog").mockResolvedValue({
      ...CATALOG,
      checkoutAvailable: false,
      trial: { ...CATALOG.trial, available: false },
    });
    render(<SignupApp />);
    expect(
      await screen.findByRole("heading", { name: "El registro en línea no está disponible ahora" }),
    ).toBeInTheDocument();
  });
});

describe("the price list on the public page", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("links every plan to its checkout when plans can be bought online", async () => {
    vi.spyOn(signupApi, "catalog").mockResolvedValue(CATALOG);
    render(<Pricing />);
    expect(await screen.findByRole("link", { name: /Contratar Integral/ })).toHaveAttribute(
      "href",
      "/registro?plan=integral&periodo=mensual",
    );
    expect(screen.getByRole("link", { name: "Probar 30 días gratis" })).toHaveAttribute(
      "href",
      "/registro?prueba=1",
    );
  });

  // The public demo: no gateway, but a trial. Hiding the whole section there left the header's
  // "Precios" link pointing at nothing and no way from the page into the signup.
  it("still shows the plans and the way into the trial where nothing can be paid online", async () => {
    vi.spyOn(signupApi, "catalog").mockResolvedValue({
      ...CATALOG,
      checkoutAvailable: false,
      founder: { ...CATALOG.founder, available: true, slotsLeft: 20 },
    });
    const { container } = render(<Pricing />);
    expect(await screen.findByRole("heading", { name: "Inicial" })).toBeInTheDocument();
    expect(container.querySelector("#precios")).not.toBeNull();
    expect(screen.queryByRole("link", { name: /Contratar/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Probar 30 días gratis" })).toBeInTheDocument();
    // No founder price where there is no price to pay: list prices only.
    expect(screen.queryByText(/Precio fundador/)).not.toBeInTheDocument();
    expect(screen.getByText("$89")).toBeInTheDocument();
  });

  it("is absent when the catalog cannot be read", async () => {
    vi.spyOn(signupApi, "catalog").mockRejectedValue(new Error("sin red"));
    const { container } = render(<Pricing />);
    await waitFor(() => expect(signupApi.catalog).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the subscription banner", () => {
  const DAY_MS = 86_400_000;
  const inDays = (days: number) => new Date(Date.now() + days * DAY_MS - 60_000).toISOString();

  function renderBanner(role: string, subscription: Record<string, unknown> | null, path = "/") {
    mockUseAuth.mockReturnValue({ user: { role }, subscription });
    return render(
      <MemoryRouter initialEntries={[path]}>
        <SubscriptionBanner />
      </MemoryRouter>,
    );
  }

  const trial = (days: number) => ({ status: "TRIALING", trialEndsAt: inDays(days) });
  const pastDue = { status: "PAST_DUE", suspendsAt: "2026-10-20T12:00:00.000Z" };

  it("stays quiet while a trial has weeks left, and speaks up in its last week", () => {
    expect(renderBanner("admin", trial(20)).container).toBeEmptyDOMElement();
    renderBanner("admin", trial(3));
    expect(screen.getByText("Tu prueba gratuita termina en 3 días.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Elegir un plan" })).toHaveAttribute(
      "href",
      "/suscripcion",
    );
  });

  it("tells the admin when a payment is pending and when access stops", () => {
    renderBanner("admin", pastDue);
    expect(screen.getByText(/El acceso se suspende el 20 de octubre de 2026/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pagar ahora" })).toBeInTheDocument();
  });

  it("says nothing to staff, who cannot pay", () => {
    expect(renderBanner("grooming", pastDue).container).toBeEmptyDOMElement();
    expect(renderBanner("daycare", trial(1)).container).toBeEmptyDOMElement();
  });

  it("says nothing with the plan up to date, without one, or on the page that already says it", () => {
    expect(renderBanner("admin", { status: "ACTIVE" }).container).toBeEmptyDOMElement();
    expect(renderBanner("admin", null).container).toBeEmptyDOMElement();
    expect(renderBanner("admin", pastDue, "/suscripcion").container).toBeEmptyDOMElement();
  });
});

describe("the subscription route", () => {
  it("is the account holder's, and sits in no navigation group", () => {
    const route = frontendModules
      .flatMap((module) => module.routes)
      .find((candidate) => candidate.path === "/suscripcion");
    expect(route?.roles).toEqual(["admin"]);
    // `billing` is core on the server, so the page asks for no product module.
    expect(route?.requires).toBeUndefined();
    const linked = frontendModules.flatMap((module) =>
      (module.navigation?.items ?? []).map((item) => item.to),
    );
    expect(linked).not.toContain("/suscripcion");
  });
});
