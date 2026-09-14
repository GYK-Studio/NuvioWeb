import { bootstrapWebApp } from "./bootstrap/bootstrapWebApp.js";

const start = () =>
  bootstrapWebApp().catch((error) => {
    console.error("Nuvio Web bootstrap failed", error);
    document.body.innerHTML = `<main class="fatal-state"><p>Nuvio</p><h1>We couldn't open the app.</h1><pre>${String(error?.message || error)}</pre></main>`;
  });

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
