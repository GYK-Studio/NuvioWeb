import { RemoteClient } from "./remoteClient.js";
import { QrCodeGenerator } from "../qr/qrCodeGenerator.js";
const client = new RemoteClient();
let dialog;
let gestureNotice;
function showGestureNotice(action) {
  gestureNotice?.remove();
  gestureNotice = document.createElement("section");
  gestureNotice.setAttribute("aria-label", "Solicitud del mando");
  gestureNotice.style.cssText =
    "position:fixed;inset:auto 16px 16px auto;max-width:calc(100vw - 32px);padding:16px;background:#181a24;color:white;z-index:99999;border:1px solid #aaa;border-radius:12px";
  const message = document.createElement("p");
  message.setAttribute("role", "status");
  message.textContent = "El mando solicita una acción que requiere tu clic en este navegador.";
  const accept = document.createElement("button"),
    dismiss = document.createElement("button");
  accept.type = dismiss.type = "button";
  accept.style.minHeight = dismiss.style.minHeight = "44px";
  accept.textContent = action === "fullscreen" ? "Abrir pantalla completa" : "Reproducir";
  dismiss.textContent = "Cerrar aviso";
  dismiss.onclick = () => gestureNotice?.remove();
  accept.onclick = async () => {
    const video = document.getElementById("videoPlayer");
    if (!video?.currentSrc) {
      message.textContent = "No hay un vídeo activo.";
      return;
    }
    try {
      if (action === "fullscreen") await video.requestFullscreen();
      else await video.play();
      gestureNotice?.remove();
    } catch {
      message.textContent =
        "Este navegador no pudo completar la acción. Usa los controles del reproductor.";
    }
  };
  gestureNotice.append(message, accept, dismiss);
  document.body.append(gestureNotice);
}
export function openRemotePanel() {
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.className = "remote-panel";
    dialog.setAttribute("aria-labelledby", "remote-title");
    dialog.innerHTML = `<header><h2 id="remote-title">Control desde móvil</h2><button type="button" data-close>Cerrar</button></header>
      <p>Empareja Nuvio Remote y aprueba el dispositivo aquí. Puedes recuperar el control en cualquier momento.</p>
      <p role="status" data-status>Sin conexión</p>
      <label>Nombre de esta pantalla <input data-name maxlength="60" value="Nuvio Web" autocomplete="off"></label>
      <canvas width="256" height="256" aria-label="Código QR de emparejamiento" hidden></canvas>
      <p data-code class="remote-code"></p>
      <div class="remote-actions"><button type="button" data-start>Crear código</button><button type="button" data-stop>Desconectar todos</button></div>
      <h3>Dispositivos</h3><div data-devices><p>Ningún dispositivo emparejado.</p></div>`;
    document.body.append(dialog);
    const status = dialog.querySelector("[data-status]");
    let expiration;
    dialog.querySelector("[data-close]").onclick = () => dialog.close();
    dialog.addEventListener("close", () => {
      document.body.classList.remove("nuvio-modal-open");
      document
        .querySelector('#settings [data-focus-key="about:remote"]')
        ?.focus({ preventScroll: true });
    });
    dialog.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key !== "Tab") return;
      const buttons = [
        ...dialog.querySelectorAll("button:not(:disabled), input:not(:disabled)")
      ].filter((button) => button.getClientRects().length);
      const first = buttons[0],
        last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    });
    dialog.querySelector("[data-start]").onclick = async (event) => {
      event.target.disabled = true;
      try {
        const grant = await client.createCode(
          dialog.querySelector("[data-name]").value.trim() || "Nuvio Web"
        );
        const canvas = dialog.querySelector("canvas");
        canvas.hidden = false;
        QrCodeGenerator.generate(canvas, grant.code, 256);
        dialog.querySelector("[data-code]").textContent = grant.code;
        status.textContent = "Escanea el QR o introduce el código. Caduca en dos minutos.";
        clearTimeout(expiration);
        expiration = setTimeout(() => {
          canvas.hidden = true;
          dialog.querySelector("[data-code]").textContent =
            "Código caducado. Crea uno nuevo si aún no emparejaste.";
        }, 120000);
      } catch (error) {
        status.textContent = `No se pudo iniciar: ${error.message}. Revisa NUVIO_REMOTE_URL y tu sesión.`;
      } finally {
        event.target.disabled = false;
      }
    };
    dialog.querySelector("[data-stop]").onclick = () => {
      client.stop();
      clearTimeout(expiration);
      dialog.querySelector("canvas").hidden = true;
      dialog.querySelector("[data-code]").textContent = "";
      dialog.querySelector("[data-devices]").replaceChildren();
      status.textContent = "Todos los dispositivos desconectados.";
    };
    client.addEventListener("update", (event) => {
      const m = event.detail;
      if (m.type === "local.gesture") showGestureNotice(m.action);
      else if (m.type === "devices") {
        const list = dialog.querySelector("[data-devices]");
        list.replaceChildren();
        for (const device of m.devices) {
          const row = document.createElement("div");
          row.className = "remote-device";
          const label = document.createElement("span");
          label.textContent = `${device.name} · ${device.approved ? "Autorizado" : "Solicita permiso"} · ${device.online ? "Conectado" : "Sin conexión"}${device.lastSeen ? ` · ${new Date(device.lastSeen).toLocaleString()}` : ""}`;
          row.append(label);
          if (!device.approved || !device.active) {
            const approve = document.createElement("button");
            approve.textContent = device.approved ? "Dar control" : "Aprobar";
            approve.onclick = () => client.send({ type: "approve", deviceId: device.id });
            row.append(approve);
          }
          const revoke = document.createElement("button");
          revoke.textContent = device.approved ? "Revocar" : "Rechazar";
          revoke.onclick = () => client.send({ type: "revoke", deviceId: device.id });
          row.append(revoke);
          list.append(row);
        }
      } else if (m.type === "connected")
        status.textContent = "Servicio conectado. Aprueba solo los dispositivos que reconozcas.";
      else if (m.type === "offline")
        status.textContent = "Reconectando. El mando no puede enviar órdenes.";
      else if (m.type === "revoked")
        status.textContent = "Sesión finalizada. Crea un código nuevo para conectar.";
      else if (m.type === "error") status.textContent = `Error de control: ${m.error}`;
    });
    window.addEventListener("pagehide", () => client.disconnect());
  }
  document.body.classList.add("nuvio-modal-open");
  dialog.showModal();
}
