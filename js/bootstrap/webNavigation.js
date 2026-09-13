import { Router } from "../ui/navigation/router.js";
import { ProfileManager } from "../core/profile/profileManager.js";

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

function icon(path, className = "") {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}" fill="currentColor"></path></svg>`;
}

function navItem(route, label) {
  return `<button type="button" class="nuvio-nav-link" data-route="${route}"><span>${label}</span></button>`;
}

export function installWebNavigation() {
  const app = document.getElementById("app");
  if (!app || document.querySelector(".nuvio-topbar")) return;

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

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && (event.key === "k" || event.key === "K")) {
      event.preventDefault();
      Router.navigate("search");
    }
  });

  const header = document.createElement("header");
  header.className = "nuvio-topbar";
  header.hidden = true;
  header.innerHTML = `
    <div class="nuvio-topbar-inner">
      <div class="nuvio-topbar-left">
        <button type="button" class="nuvio-brand" data-route="home" aria-label="Nuvio Web · Inicio">
          <span class="nuvio-brand-word">Nuvio</span>
          <span class="nuvio-brand-badge">WEB</span>
        </button>
        <nav class="nuvio-primary-nav" aria-label="Navegación principal">
          ${navItem("home", "Inicio")}
          ${navItem("discover", "Explorar")}
          ${navItem("library", "Biblioteca")}
          ${navItem("plugins", "Fuentes")}
        </nav>
      </div>
      <div class="nuvio-topbar-tools">
        <button type="button" class="nuvio-search-trigger" data-route="search" aria-label="Buscar títulos, actores y fuentes">
          ${icon("M10.5 3a7.5 7.5 0 1 0 4.73 13.32l4.72 4.73 1.42-1.42-4.73-4.72A7.5 7.5 0 0 0 10.5 3Zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z")}
          <span class="nuvio-search-trigger-label">Buscar títulos, actores...</span>
          <kbd>⌘K</kbd>
        </button>
        <button type="button" class="nuvio-icon-button" data-route="settings" aria-label="Ajustes">
          ${icon("M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8 3.5 2 1.3-2 3.4-2.3-.2a8 8 0 0 1-1.7 1l-.9 2.2h-4l-.9-2.2a8 8 0 0 1-1.7-1l-2.3.2-2-3.4 2-1.3a8 8 0 0 1 0-2l-2-1.3 2-3.4 2.3.2a8 8 0 0 1 1.7-1l.9-2.2h4l.9 2.2a8 8 0 0 1 1.7 1l2.3-.2 2 3.4-2 1.3a8 8 0 0 1 0 2Z")}
        </button>
        <button type="button" class="nuvio-avatar-button" data-route="profileSelection" aria-label="Cambiar perfil">
          <span class="nuvio-avatar"><span class="nuvio-profile-initial">P</span></span>
          <span class="nuvio-avatar-status" aria-hidden="true"></span>
        </button>
      </div>
    </div>`;

  header.addEventListener("click", (event) => {
    const target = event.target.closest("[data-route]");
    if (target) Router.navigate(target.dataset.route);
  });
  app.before(header);

  const backBar = document.createElement("nav");
  backBar.className = "web-back-navigation";
  backBar.setAttribute("aria-label", "Navegación de página");
  backBar.hidden = true;
  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.innerHTML = `${icon("M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z")}<span>Volver</span>`;
  backButton.addEventListener("click", () => Router.back());
  backBar.append(backButton);
  app.before(backBar);

  const rootRoutes = new Set([
    "home",
    "library",
    "search",
    "discover",
    "settings",
    "plugins",
    "account",
    "profileSelection",
    "experienceModeSelection",
    "essentialAddonSetup",
    "player"
  ]);
  const noTopbarRoutes = new Set([
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
    const route = screen?.id || "";
    backBar.hidden = !screen || rootRoutes.has(route);
    header.hidden = !screen || noTopbarRoutes.has(route);
    document.body.classList.toggle("web-with-header", !header.hidden);
    app.classList.toggle("web-has-back-navigation", !backBar.hidden);

    for (const link of header.querySelectorAll("[data-route]")) {
      const active = link.dataset.route === route;
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }

    try {
      const activeId = ProfileManager.getActiveProfileId();
      const initial = header.querySelector(".nuvio-profile-initial");
      if (initial && activeId)
        initial.textContent = String(activeId).charAt(0).toUpperCase() || "P";
    } catch (_) {
      // Header avatar is presentation-only; profile state may not be ready yet.
    }
  };

  const observer = new MutationObserver(sync);
  for (const screen of app.children) {
    observer.observe(screen, { attributes: true, attributeFilter: ["style"] });
  }
  sync();
}
