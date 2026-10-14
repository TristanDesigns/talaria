import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { installDemo } from "./lib/supabase";
import "./styles.css";

// macOS draws its window buttons over our sidebar; leave room for them.
if (navigator.userAgent.includes("Mac") && "__TAURI_INTERNALS__" in window) {
  document.documentElement.classList.add("mac-app");
}

if (import.meta.env.DEV && new URLSearchParams(location.search).has("demo")) {
  installDemo((await import("./lib/demo")).demoClient());
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
