import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter/wght.css";
import "@fontsource/marcellus/latin-400.css";
import "./styles.css";
import { primeCatalog } from "./lib/billing";

/**
 * The public product page, the signup and the application are separate chunks, chosen before any
 * of them loads: a visitor never downloads the operator's code or starts a session check, and an
 * operator never downloads the page.
 *
 * The page is what the bare address opens. A browser that holds a session goes straight to the
 * workspace instead, so `/` stays the operator's dashboard; a session that has lapsed is caught
 * by the application, which sends it to `/login`. `/bienvenida` always shows the page.
 *
 * The build repeats this choice in an inline script so the chunk is requested while this file is
 * still downloading (`preloadRoute` in vite.config.ts). Change one, change the other.
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

// Both public pages open on the price list, so it is asked for now and not once they have mounted.
if (isLanding || isSignup) primeCatalog();

/**
 * A tab that outlives a deploy asks for chunks that no longer exist. One reload fetches the new
 * shell; the mark keeps a chunk that is truly missing from reloading for ever.
 */
const RELOADED_KEY = "argos:chunk-reload";
window.addEventListener("vite:preloadError", () => {
  try {
    if (sessionStorage.getItem(RELOADED_KEY)) return;
    sessionStorage.setItem(RELOADED_KEY, "1");
  } catch {
    return;
  }
  window.location.reload();
});
window.addEventListener("load", () => {
  // Cleared once a page has loaded and stayed up, so the next deploy gets its reload too.
  window.setTimeout(() => {
    try {
      sessionStorage.removeItem(RELOADED_KEY);
    } catch {
      // Storage is unavailable: there was no mark to clear.
    }
  }, 10_000);
});

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
