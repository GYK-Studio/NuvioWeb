import { Router } from "../ui/navigation/router.js";

function wheelPixels(event, viewportHeight) {
  const raw = Number(event?.deltaY || 0);
  if (!raw) return 0;
  if (event.deltaMode === 1) return raw * 18;
  if (event.deltaMode === 2) return raw * viewportHeight;
  return raw;
}

function canScrollVertically(element, delta) {
  if (!element || element.scrollHeight <= element.clientHeight || !delta) return false;
  const style = getComputedStyle(element);
  if (!/(auto|scroll|overlay)/.test(style.overflowY)) return false;
  return delta < 0
    ? element.scrollTop > 0
    : element.scrollTop + element.clientHeight < element.scrollHeight - 1;
}

function scrollTargetForWheel(target, delta) {
  let node = target instanceof Element ? target : null;
  while (node && node !== document.body && node !== document.documentElement) {
    if (canScrollVertically(node, delta)) return node;
    node = node.parentElement;
  }
  const page = document.scrollingElement;
  return canScrollVertically(page, delta) ? page : null;
}

// Secondary TV routes relied on a remote's Back key. Expose that action to
// mouse and touch users without changing route history or account state.
export function installWebNavigation() {
  const app = document.getElementById("app");
  const skip = document.createElement("a");
  skip.className = "web-skip-link";
  skip.href = "#app";
  skip.textContent = "Saltar al contenido";
  document.body.prepend(skip);
  document.addEventListener(
    "wheel",
    (event) => {
      if (Math.abs(Number(event.deltaX || 0)) > Math.abs(Number(event.deltaY || 0))) return;
      const delta = wheelPixels(event, window.innerHeight);
      const target = scrollTargetForWheel(event.target, delta);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      target.scrollTop += delta;
    },
    { passive: false, capture: true }
  );
  const header = document.createElement("header");
  header.className = "web-header";
  header.hidden = true;
  const icon = (path) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"></path></svg>`;
  const navItem = (route, label, path) =>
    `<button type="button" data-route="${route}">${icon(path)}<span>${label}</span></button>`;
  header.innerHTML = `<button type="button" class="web-brand" data-route="home" aria-label="Nuvio, ir al inicio">
      <img class="web-brand-wordmark" src="./assets/brand/app_logo_wordmark.png" alt="" aria-hidden="true">
      <span class="web-brand-section">web</span>
    </button>
    <nav aria-label="Navegación principal">
      ${navItem("home", "Inicio", "M3 11.5 12 4l9 7.5v8a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H4.5A1.5 1.5 0 0 1 3 19.5v-8Z")}
      ${navItem("discover", "Explorar", "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3.9 5.1-2.2 5.6-5.6 2.2 2.2-5.6 5.6-2.2Z")}
      ${navItem("library", "Biblioteca", "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2 3v10h2V7H7Zm4 0v10h6V7h-6Z")}
      ${navItem("plugins", "Fuentes", "M8 3v3H6a3 3 0 0 0-3 3v2h3V9h2v3h3V9h2v2h3V9h2v3h3V9a3 3 0 0 0-3-3h-2V3h-3v3h-2V3H8Zm-2 12H3v2a3 3 0 0 0 3 3h2v2h3v-2h2v2h3v-2h2a3 3 0 0 0 3-3v-2h-3v2H6v-2Z")}
    </nav>
    <div class="web-header-tools">
      ${navItem("search", "Buscar", "M10.5 3a7.5 7.5 0 1 0 4.73 13.32l4.72 4.73 1.42-1.42-4.73-4.72A7.5 7.5 0 0 0 10.5 3Zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z")}
      ${navItem("settings", "Ajustes", "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8 3.5 2 1.3-2 3.4-2.3-.2a8 8 0 0 1-1.7 1l-.9 2.2h-4l-.9-2.2a8 8 0 0 1-1.7-1l-2.3.2-2-3.4 2-1.3a8 8 0 0 1 0-2l-2-1.3 2-3.4 2.3.2a8 8 0 0 1 1.7-1l.9-2.2h4l.9 2.2a8 8 0 0 1 1.7 1l2.3-.2 2 3.4-2 1.3a8 8 0 0 1 0 2Z")}
      ${navItem("profileSelection", "Perfil", "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0H4Z")}
    </div>`;
  header.addEventListener("click", (event) => {
    const target = event.target.closest("[data-route]");
    if (target) Router.navigate(target.dataset.route);
  });
  app.before(header);
  const bar = document.createElement("nav");
  bar.className = "web-back-navigation";
  bar.setAttribute("aria-label", "Navegación de página");
  bar.hidden = true;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "← Volver";
  button.addEventListener("click", () => Router.back());
  bar.append(button);
  app.before(bar);
  const excluded = new Set([
    "home",
    "library",
    "search",
    "settings",
    "account",
    "profileSelection",
    "experienceModeSelection",
    "essentialAddonSetup",
    "player"
  ]);
  const sync = () => {
    const screen = [...app.children].find(
      (node) =>
        node.classList.contains("screen") && node.style.display && node.style.display !== "none"
    );
    bar.hidden = !screen || excluded.has(screen.id);
    header.hidden =
      !screen ||
      [
        "account",
        "profileSelection",
        "experienceModeSelection",
        "essentialAddonSetup",
        "player"
      ].includes(screen.id);
    document.body.classList.toggle("web-with-header", !header.hidden);
    for (const link of header.querySelectorAll("[data-route]")) {
      if (link.dataset.route === screen?.id) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    app.classList.toggle("web-has-back-navigation", !bar.hidden);
  };
  const observer = new MutationObserver(sync);
  for (const screen of app.children) {
    observer.observe(screen, { attributes: true, attributeFilter: ["style"] });
  }
  sync();
}
