import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * A "Volver" that always goes somewhere.
 *
 * `navigate(-1)` does nothing on a page opened in a new tab or from a shared link, because there
 * is no entry behind it. The router marks that first entry with the key "default"; from there the
 * button goes to `fallback`, the page's natural parent, instead.
 */
export function useGoBack(fallback: string): () => void {
  const navigate = useNavigate();
  const { key } = useLocation();
  return useCallback(() => {
    if (key !== "default") navigate(-1);
    else navigate(fallback, { replace: true });
  }, [navigate, key, fallback]);
}
