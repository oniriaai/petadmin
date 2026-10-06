import { useEffect } from "react";

const SITE_NAME = "Argos Suite";

/** Names the browser tab after the page: "Clientes · Argos Suite". */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${SITE_NAME}` : SITE_NAME;
  }, [title]);
}
