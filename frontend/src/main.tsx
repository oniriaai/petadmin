import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter/wght.css";
import "@fontsource/marcellus/latin-400.css";
import "@fontsource/cinzel/latin-700.css";
import "./styles.css";

/**
 * The public product page, the signup and the application are separate chunks, chosen before any
 * of them loads: a visitor never downloads the operator's code or starts a session check, and an
 * operator never downloads the page.
 *
 * The page is what the bare address opens. A browser that holds a session goes straight to the
 * workspace instead, so `/` stays the operator's dashboard; a session that has lapsed is caught
 * by the application, which sends it to `/login`. `/bienvenida` always shows the page.
 */
function hasSession() {
  try {
    return localStorage.getItem("token") !== null;
  } catch {
    return false;
  }
}

const path = window.location.pathname.replace(/\/+$/, "");
const isLanding = path === "/bienvenida" || (path === "" && !hasSession());
// Signing up belongs to the visitor's side too: `/registro`, the return from the payment and the
// link a trial is confirmed with.
const isSignup = path === "/registro" || path.startsWith("/registro/");
const Root = lazy(() =>
  isLanding
    ? import("./pages/Landing")
    : isSignup
      ? import("./pages/signup/SignupApp")
      : import("./App").then((module) => ({ default: module.App })),
);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      <Root />
    </Suspense>
  </React.StrictMode>,
);
