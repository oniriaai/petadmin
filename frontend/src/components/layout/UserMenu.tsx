import { useEffect, useRef, useState } from "react";
import { CreditCard, LogOut, ShieldCheck, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth-context";

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Plataforma",
  admin: "Administrador",
  daycare: "Guardería",
  grooming: "Peluquería",
  veterinary: "Veterinaria",
};

export function UserMenu() {
  const { user, logout, subscription } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape: a menu that only closes by reselecting the trigger
  // ends up stuck open on touch devices.
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  if (!user) return null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        className="icon-button text-muted rounded-lg hover:bg-sunken"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Menú de usuario"
      >
        <User size={18} />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-56 card shadow-overlay p-1 z-drawer bg-surface"
        >
          <div className="px-3 py-2 border-b border-line-subtle">
            <p className="text-sm font-semibold text-ink truncate">{user.name || user.username}</p>
            <p className="text-xs text-muted truncate">
              {user.username} · {ROLE_LABELS[user.role] ?? user.role}
            </p>
          </div>

          {user.role === "superadmin" && (
            <button
              role="menuitem"
              className="w-full text-left px-3 py-2 text-sm text-ink rounded-lg hover:bg-sunken flex items-center gap-2"
              onClick={() => {
                setIsOpen(false);
                navigate("/platform");
              }}
            >
              <ShieldCheck size={15} /> Consola de plataforma
            </button>
          )}

          {/* Only where there is one to show: a daycare the vendor manages has no online plan. */}
          {user.role === "admin" && subscription && (
            <button
              role="menuitem"
              className="w-full text-left px-3 py-2 text-sm text-ink rounded-lg hover:bg-sunken flex items-center gap-2"
              onClick={() => {
                setIsOpen(false);
                navigate("/suscripcion");
              }}
            >
              <CreditCard size={15} /> Suscripción
            </button>
          )}

          <button
            role="menuitem"
            className="w-full text-left px-3 py-2 text-sm text-danger rounded-lg hover:bg-danger-soft flex items-center gap-2"
            onClick={() => {
              setIsOpen(false);
              logout();
              // Going there by hand rather than through the route guard, which would remember
              // this page and hand it to whoever signs in next.
              navigate("/login", { replace: true });
            }}
          >
            <LogOut size={15} /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
