import { renderTopNavigation } from "../components/navigation/topNavigation.js";

export function createAppShell() {
  const root = document.createElement("div");
  root.className = "app-shell";
  root.innerHTML = `<button class="skip-link" type="button" data-skip-content>Skip to content</button><header class="top-nav"></header><main id="page-content" class="page-host" tabindex="-1"></main><div class="dialog-host"></div><section class="player-layer" hidden><video id="videoPlayer" playsinline preload="metadata"></video></section>`;
  document.body.replaceChildren(root);
  const nav = root.querySelector(".top-nav");
  const outlet = root.querySelector(".page-host");
  let router = null;
  nav.innerHTML = renderTopNavigation();
  nav.addEventListener("click", (event) => {
    const target = event.target.closest("[data-route]");
    if (target && router) router.navigate(target.dataset.route);
  });
  root.querySelector("[data-skip-content]").addEventListener("click", () => outlet.focus());
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && router) {
      event.preventDefault();
      router.navigate("search");
    }
  });
  return {
    outlet,
    connect(nextRouter) {
      router = nextRouter;
    },
    setRoute(route) {
      root.dataset.route = route;
      nav
        .querySelectorAll("[data-route]")
        .forEach((item) => item.toggleAttribute("aria-current", item.dataset.route === route));
    }
  };
}
