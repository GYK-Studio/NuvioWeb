import { Router } from "../ui/navigation/router.js";

// Secondary TV routes relied on a remote's Back key. Expose that action to
// mouse and touch users without changing route history or account state.
export function installWebNavigation() {
  const app = document.getElementById("app");
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
    app.classList.toggle("web-has-back-navigation", !bar.hidden);
  };
  const observer = new MutationObserver(sync);
  for (const screen of app.children) {
    observer.observe(screen, { attributes: true, attributeFilter: ["style"] });
  }
  sync();
}
