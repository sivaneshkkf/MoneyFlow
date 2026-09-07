import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

// `beforeinstallprompt` fires only once per page load and can fire before
// React finishes mounting (e.g. on a slow mobile connection) — a listener
// added later, inside a component's useEffect, would miss it entirely
// since the browser never re-dispatches it. Capture it here, as early as
// possible, and stash it on window so useInstallPrompt can pick it up
// whenever it mounts, not just when it happens to already be listening.
window.__mfInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  window.__mfInstallPrompt = e;
  window.dispatchEvent(new CustomEvent("mf-install-prompt-ready"));
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// test changes
