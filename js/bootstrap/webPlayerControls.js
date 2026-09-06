import { Router } from "../ui/navigation/router.js";

export function installWebPlayerControls() {
  const player = document.getElementById("player");
  const bar = document.createElement("nav");
  bar.className = "web-player-toolbar";
  bar.setAttribute("aria-label", "Controles de ventana");
  bar.innerHTML = `<button type="button" data-window-action="back" aria-label="Volver">← Volver</button>
    <button type="button" data-window-action="fullscreen">Pantalla completa</button>
    <button type="button" data-window-action="pip">Ventana flotante</button>
    <span role="status" aria-live="polite"></span>`;
  document.body.append(bar);
  const sync = () => {
    bar.hidden = player.style.display === "none" || !player.style.display;
    bar.querySelector('[data-window-action="pip"]').hidden = !document.pictureInPictureEnabled;
    bar.querySelector('[data-window-action="fullscreen"]').textContent = document.fullscreenElement
      ? "Salir de pantalla completa"
      : "Pantalla completa";
  };
  new MutationObserver(sync).observe(player, { attributes: true, attributeFilter: ["style"] });
  document.addEventListener("fullscreenchange", sync);
  bar.addEventListener("click", async (event) => {
    const action = event.target.closest("button")?.dataset.windowAction;
    if (!action) return;
    const status = bar.querySelector('[role="status"]');
    status.textContent = "";
    try {
      if (action === "back") {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        if (document.fullscreenElement) await document.exitFullscreen();
        Router.back();
      } else if (action === "fullscreen") {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } else if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await player.querySelector("video").requestPictureInPicture();
    } catch {
      status.textContent = "Esta acción no está disponible para el vídeo actual.";
    }
  });
  sync();
}
