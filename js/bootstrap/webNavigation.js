import { Router } from "../ui/navigation/router.js";

// Secondary TV routes relied on a remote's Back key. Expose that action to
// mouse and touch users without changing route history or account state.
export function installWebNavigation() {
  const app = document.getElementById("app");
  const header = document.createElement("header");
  header.className = "web-header";
  header.hidden = true;
  header.innerHTML = `<button type="button" class="web-brand" data-route="home" aria-label="Nuvio · Inicio">nuvio<span>WEB</span></button>
    <nav aria-label="Navegación principal"><button type="button" data-route="home">Inicio</button><button type="button" data-route="discover">Explorar</button><button type="button" data-route="library">Mi biblioteca</button><button type="button" data-route="plugins">Fuentes</button></nav>
    <div class="web-header-tools"><button type="button" data-route="search" aria-label="Buscar películas y series">Buscar</button><button type="button" data-route="settings">Ajustes</button><button type="button" data-route="profileSelection" aria-label="Cambiar perfil">Perfil</button></div>`;
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
