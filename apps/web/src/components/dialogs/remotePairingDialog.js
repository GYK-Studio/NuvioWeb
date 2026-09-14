import { QrCodeGenerator } from "../../../../../js/core/qr/qrCodeGenerator.js";
import { getRemoteClient } from "../../adapters/remoteAdapter.js";
import { escapeHtml } from "../media/mediaCard.js";

let dialog = null;

function renderDevices(container, devices = []) {
  container.innerHTML = devices.length
    ? devices
        .map(
          (device) =>
            `<div><span><b>${escapeHtml(device.name || "Remote")}</b><small>${device.online ? "Online" : "Offline"}</small></span>${!device.approved || !device.active ? `<button data-approve="${escapeHtml(device.id)}">${device.approved ? "Give control" : "Approve"}</button>` : ""}<button data-revoke="${escapeHtml(device.id)}">${device.approved ? "Revoke" : "Reject"}</button></div>`
        )
        .join("")
    : "<p>No remote devices are connected.</p>";
}

function ensureDialog() {
  if (dialog) return dialog;
  const client = getRemoteClient();
  dialog = document.createElement("dialog");
  dialog.className = "remote-pairing-dialog";
  dialog.innerHTML = `<form method="dialog" class="remote-pairing-card"><header><div><p>NUVIO REMOTE</p><h2>Connect a phone</h2></div><button aria-label="Close">×</button></header><p>Generate a short-lived code, then enter it in the Nuvio Remote app and approve the device here.</p><label>Screen name<input name="name" maxlength="60" value="Nuvio Web" autocomplete="off"></label><div class="remote-pairing-code" hidden><canvas width="256" height="256" aria-label="Remote pairing QR code"></canvas><strong data-code></strong></div><p data-status role="status">Ready to create a pairing code.</p><div class="remote-pairing-actions"><button type="button" class="button button--primary" data-create>Create code</button><button type="button" class="button button--glass" data-stop>Disconnect all</button></div><section><h3>Devices</h3><div data-devices></div></section></form>`;
  document.querySelector(".dialog-host")?.append(dialog);
  renderDevices(dialog.querySelector("[data-devices]"));
  dialog.addEventListener("click", async (event) => {
    const status = dialog.querySelector("[data-status]");
    if (event.target.closest("[data-create]")) {
      const button = event.target.closest("[data-create]");
      button.disabled = true;
      status.textContent = "Connecting to the remote service…";
      try {
        const grant = await client.createCode(
          String(new FormData(dialog.querySelector("form")).get("name") || "Nuvio Web").trim()
        );
        const code = String(grant.code || "");
        const codePanel = dialog.querySelector(".remote-pairing-code");
        codePanel.hidden = false;
        dialog.querySelector("[data-code]").textContent = code;
        QrCodeGenerator.generate(dialog.querySelector("canvas"), code, 256);
        status.textContent = "Scan or enter this code. It expires in two minutes.";
      } catch (error) {
        status.textContent = `Could not connect: ${error?.message || "Remote unavailable"}.`;
      } finally {
        button.disabled = false;
      }
    }
    if (event.target.closest("[data-stop]")) {
      client.stop();
      dialog.querySelector(".remote-pairing-code").hidden = true;
      status.textContent = "Remote devices disconnected.";
      renderDevices(dialog.querySelector("[data-devices]"));
    }
    const approve = event.target.closest("[data-approve]")?.dataset.approve;
    const revoke = event.target.closest("[data-revoke]")?.dataset.revoke;
    if (approve) client.send({ type: "approve", deviceId: approve });
    if (revoke) client.send({ type: "revoke", deviceId: revoke });
  });
  client.addEventListener("update", (event) => {
    if (!dialog) return;
    const message = event.detail || {};
    if (message.type === "devices")
      renderDevices(dialog.querySelector("[data-devices]"), message.devices || []);
    if (message.type === "connected")
      dialog.querySelector("[data-status]").textContent = "Remote service connected.";
    if (message.type === "offline")
      dialog.querySelector("[data-status]").textContent = "Remote service reconnecting…";
    if (message.type === "revoked")
      dialog.querySelector("[data-status]").textContent = "The remote session ended.";
  });
  return dialog;
}

export function openRemotePairingDialog() {
  const panel = ensureDialog();
  panel.showModal();
  panel.querySelector("input")?.focus();
}
