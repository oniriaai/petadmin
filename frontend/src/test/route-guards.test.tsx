import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { PrivateRoute, PublicOnlyRoute } from "../App";

const mockUseAuth = vi.fn();

vi.mock("../lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("../lib/auth-context")>("../lib/auth-context");
  return {
    ...actual,
    useAuth: () => mockUseAuth(),
  };
});

function LoginProbe() {
  const location = useLocation();
  return <div>login-from:{(location.state as { from?: string } | null)?.from ?? ""}</div>;
}

describe("route guards", () => {
  it("redirects unauthenticated private route to /login with from state", () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });

    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <Routes>
          <Route
            path="/clientes"
            element={<PrivateRoute><div>private-content</div></PrivateRoute>}
          />
          <Route path="/login" element={<LoginProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText("private-content")).not.toBeInTheDocument();
    expect(screen.getByText("login-from:/clientes")).toBeInTheDocument();
  });

  it("redirects authenticated user away from login to requested route", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "u1", username: "admin", name: "Admin", businessUnit: "DAYCARE", role: "admin" },
      isLoading: false,
    });

    render(
      <MemoryRouter initialEntries={[{ pathname: "/login", state: { from: "/clientes" } }]}>
        <Routes>
          <Route
            path="/login"
            element={<PublicOnlyRoute><div>login-page</div></PublicOnlyRoute>}
          />
          <Route path="/clientes" element={<div>clientes-page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText("login-page")).not.toBeInTheDocument();
    expect(screen.getByText("clientes-page")).toBeInTheDocument();
  });
});
