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
  let keyboardInput = false;
  const currentPlayer = () => (Router.getCurrent() === "player" ? Router.getCurrentScreen() : null);
  const reveal = () => {
    const screen = currentPlayer();
    if (!screen) return;
    if (!screen.controlsVisible) screen.setControlsVisible(true, { focus: false });
    else screen.resetControlsAutoHide();
  };
  const onActivity = (event) => {
    const screen = currentPlayer();
    if (!screen) return;
    if (event.type === "pointermove" && event.pointerType === "touch") return;
    keyboardInput = false;
    screen.webControlsInteraction = Boolean(
      event.target.closest?.(".web-player-toolbar, .player-controls-bottom, [role='dialog']")
    );
    reveal();
  };
  for (const surface of [player, bar]) {
    surface.addEventListener("pointermove", onActivity, { passive: true });
    surface.addEventListener("pointerdown", onActivity, { passive: true });
    surface.addEventListener("pointerleave", () => {
      const screen = currentPlayer();
      if (screen) {
        screen.webControlsInteraction = false;
        screen.resetControlsAutoHide();
      }
    });
    surface.addEventListener("focusin", (event) => {
      if (!keyboardInput || !event.target.closest?.("button, input, [tabindex='0']")) return;
      const screen = currentPlayer();
      if (screen) screen.webControlsInteraction = true;
      reveal();
    });
    surface.addEventListener("focusout", () => {
      const screen = currentPlayer();
      if (screen) {
        screen.webControlsInteraction = false;
        screen.resetControlsAutoHide();
      }
    });
  }
  document.addEventListener(
    "keydown",
    (event) => {
      keyboardInput = true;
      if (event.key === "Tab") reveal();
    },
    true
  );
  player.addEventListener(
    "wheel",
    (event) => {
      reveal();
      const row = event.target.closest?.(".player-control-buttons");
      if (!row || event.ctrlKey || event.deltaX || row.scrollWidth <= row.clientWidth) return;
      const before = row.scrollLeft;
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? row.clientWidth : 1;
      row.scrollLeft += event.deltaY * scale;
      if (row.scrollLeft !== before) event.preventDefault();
    },
    { passive: false }
  );
  const sync = () => {
    const screen = currentPlayer();
    const idle = Boolean(screen && !screen.controlsVisible && !screen.isDialogOpen?.());
    bar.hidden = player.style.display === "none" || !player.style.display || idle;
    player.classList.toggle("web-player-idle", idle);
    bar.querySelector('[data-window-action="pip"]').hidden = !document.pictureInPictureEnabled;
    bar.querySelector('[data-window-action="fullscreen"]').textContent = document.fullscreenElement
      ? "Salir de pantalla completa"
      : "Pantalla completa";
  };
  new MutationObserver(sync).observe(player, { attributes: true, attributeFilter: ["style"] });
  document.addEventListener("fullscreenchange", sync);
  document.addEventListener("nuvio:player-controls", sync);
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
