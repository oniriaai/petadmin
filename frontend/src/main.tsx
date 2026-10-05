import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter/wght.css";
import "@fontsource/marcellus/latin-400.css";
import "@fontsource/cinzel/latin-700.css";
import "./styles.css";

/**
 * The public product page and the application are separate chunks, chosen before either loads:
 * a visitor to /bienvenida never downloads the operator's code or starts a session check, and
 * an operator never downloads the page.
 */
const isLanding = window.location.pathname.replace(/\/+$/, "") === "/bienvenida";
const Root = lazy(() =>
  isLanding
    ? import("./pages/Landing")
    : import("./App").then((module) => ({ default: module.App })),
);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      <Root />
    </Suspense>
  </React.StrictMode>,
);
