import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Login } from "../pages/Login";
import { ApiError } from "../lib/api";

const login = vi.fn();
const navigate = vi.fn();

vi.mock("../lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("../lib/auth-context")>("../lib/auth-context");
  return { ...actual, useAuth: () => ({ login }) };
});

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

function renderLogin(state?: { from?: string }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/login", state }]}>
      <Login />
    </MemoryRouter>,
  );
}

async function signIn(username: string, password: string) {
  fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: username } });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: /Ingresar/ }));
}

beforeEach(() => {
  login.mockReset();
  navigate.mockReset();
});

describe("login", () => {
  it("asks for credentials and nothing else", () => {
    renderLogin();
    // The unit picker is gone on purpose: `businessUnit` is optional on the endpoint, and a
    // mismatched one made the server answer 401 "Credenciales incorrectas" to a correct password.
    expect(screen.queryByText("Selecciona tu unidad")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Guardería/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Plataforma/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Usuario")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
    // The login carries the product brand, never a tenant's.
    expect(screen.getByRole("img", { name: "Argos Suite" })).toBeInTheDocument();
  });

  it("never sends a business unit, so the server decides the scope", async () => {
    login.mockResolvedValue({ role: "grooming" });
    renderLogin();
    await signIn("peluqueria_admin", "peluqueria123");
    // The first argument is the unit; sending one is what could contradict the account. The
    // fourth is the daycare slug, which stays undefined until the server asks for it: a
    // username that is unique across the installation resolves without one.
    await waitFor(() =>
      expect(login).toHaveBeenCalledWith(null, "peluqueria_admin", "peluqueria123", undefined),
    );
  });

  it("asks for the daycare only when the server says the username is ambiguous", async () => {
    const ambiguous = new ApiError(
      400,
      "Este usuario existe en varias guarderías.",
      "DAYCARE_REQUIRED",
    );
    login.mockRejectedValueOnce(ambiguous);
    renderLogin();

    // Usernames are unique per daycare now, so two clients can both have a `recepcion`. The
    // field must not be on screen for everyone -- most staff have no reason to know their
    // daycare's identifier -- so it appears only in answer to DAYCARE_REQUIRED.
    expect(screen.queryByLabelText("Guardería")).not.toBeInTheDocument();

    await signIn("recepcion", "secreto123");

    const field = await screen.findByLabelText("Guardería");
    expect(field).toBeInTheDocument();

    // Retrying now sends the slug through.
    login.mockResolvedValue({ role: "daycare" });
    fireEvent.change(field, { target: { value: "demo" } });
    fireEvent.click(screen.getByRole("button", { name: /Ingresar/ }));
    await waitFor(() =>
      expect(login).toHaveBeenLastCalledWith(null, "recepcion", "secreto123", "demo"),
    );
  });

  it("routes the vendor to the console and a tenant user to where they came from", async () => {
    login.mockResolvedValue({ role: "superadmin" });
    const { unmount } = renderLogin();
    await signIn("superadmin", "x");
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/platform", { replace: true }));
    unmount();

    navigate.mockReset();
    login.mockResolvedValue({ role: "admin" });
    renderLogin({ from: "/clientes" });
    await signIn("admin_global", "x");
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/clientes", { replace: true }));
  });

  it("shows the server's reason for a refusal and keeps the user on the page", async () => {
    login.mockRejectedValue(new Error("Credenciales incorrectas"));
    renderLogin();
    await signIn("admin_global", "nope");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Credenciales incorrectas");
    expect(navigate).not.toHaveBeenCalled();
    // Announced *and* drawn: the styling hook that marks the fields.
    expect(screen.getByLabelText("Usuario")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("aria-invalid", "true");
  });

  it("lets the password be revealed", () => {
    renderLogin();
    const field = screen.getByLabelText("Contraseña");
    expect(field).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByLabelText("Mostrar contraseña"));
    expect(field).toHaveAttribute("type", "text");

    fireEvent.click(screen.getByLabelText("Ocultar contraseña"));
    expect(field).toHaveAttribute("type", "password");
  });
});
