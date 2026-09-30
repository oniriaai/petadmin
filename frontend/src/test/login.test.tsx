import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Login } from "../pages/Login";

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
  });

  it("never sends a business unit, so the server decides the scope", async () => {
    login.mockResolvedValue({ role: "grooming" });
    renderLogin();
    await signIn("pethijos_admin", "pethijos123");
    // The first argument is the unit; sending one is what could contradict the account.
    await waitFor(() => expect(login).toHaveBeenCalledWith(null, "pethijos_admin", "pethijos123"));
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
