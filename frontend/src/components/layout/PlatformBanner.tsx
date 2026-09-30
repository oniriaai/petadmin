import { useNavigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "../../lib/auth-context";

/**
 * Shown inside a daycare workspace while the vendor is operating it.
 *
 * Deliberately NOT dismissible: it is the only thing distinguishing us inside a tenant's
 * workspace from that tenant's own administrator, and every action taken here is attributed to
 * the daycare. A banner that can be closed stops being that.
 */
export function PlatformBanner() {
  const { user, pinnedDaycareId, daycare, setPinnedDaycare } = useAuth();
  const navigate = useNavigate();

  if (user?.role !== "superadmin" || !pinnedDaycareId) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-indigo-600 text-white text-sm" role="status">
      <ShieldAlert size={16} className="shrink-0" />
      <span className="font-medium">
        Modo plataforma · operando {daycare?.name ?? "una guardería"}
      </span>
      <button
        className="ml-auto underline underline-offset-2 hover:no-underline font-medium"
        onClick={async () => {
          await setPinnedDaycare(null);
          navigate("/platform");
        }}
      >
        Salir a la consola
      </button>
    </div>
  );
}
