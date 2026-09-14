import { TraktAuthService } from "../../../../../js/data/repository/traktAuthService.js";
import { TraktSettingsStore } from "../../../../../js/data/local/traktSettingsStore.js";
import { escapeHtml } from "../../components/media/mediaCard.js";

export const TraktScreen = {
  async mount({ outlet, router }) {
    let timer = 0;
    outlet.className = "page-host interior-page integration-page";
    const render = (status = "") => {
      const auth = TraktAuthService.getCurrentAuthState();
      const settings = TraktSettingsStore.get();
      const connected = TraktAuthService.isAuthenticated();
      outlet.innerHTML = `<header class="page-heading page-heading--split"><div><p>TRACKING & SYNC</p><h1>Trakt</h1></div><button class="button button--glass" data-back>← Back</button></header><section class="integration-card"><div><h2>${connected ? `Connected${auth.username ? ` as ${escapeHtml(auth.username)}` : ""}` : "Connect Trakt"}</h2><p>${connected ? "Nuvio can synchronize watched state, progress and library choices." : "Use Trakt's device authorization flow. Nuvio never asks for your Trakt password."}</p></div>${auth.userCode && !connected ? `<div class="device-code"><small>Enter at ${escapeHtml(auth.verificationUrl || "trakt.tv/activate")}</small><strong>${escapeHtml(auth.userCode)}</strong></div>` : ""}<p class="form-status" role="status">${escapeHtml(status)}</p><div>${connected ? `<button class="button button--glass" data-disconnect>Disconnect</button>` : `<button class="button button--primary" data-connect>Start device connection</button>`}</div></section><section class="settings-list integration-options"><label class="settings-row"><span><b>Show Trakt comments</b><small>Include comments in supported detail views</small></span><input type="checkbox" data-comments ${settings.showMetaComments ? "checked" : ""}></label></section>`;
    };
    const poll = async () => {
      const result = await TraktAuthService.pollDeviceToken();
      if (result.type === "approved") {
        clearInterval(timer);
        render("Connection approved.");
      } else if (!["pending", "slow_down"].includes(result.type)) {
        clearInterval(timer);
        render(result.message || `Connection ${result.type}.`);
      }
    };
    render();
    outlet.addEventListener("click", async (event) => {
      if (event.target.closest("[data-back]")) return router.back();
      if (event.target.closest("[data-connect]")) {
        try {
          await TraktAuthService.startDeviceAuth();
          render("Waiting for approval…");
          const seconds = Math.max(
            5,
            Number(TraktAuthService.getCurrentAuthState().pollInterval || 5)
          );
          timer = setInterval(poll, seconds * 1000);
        } catch (error) {
          render(error?.message || "Trakt connection could not start.");
        }
      }
      if (event.target.closest("[data-disconnect]")) {
        await TraktAuthService.disconnect();
        render("Disconnected.");
      }
    });
    outlet.addEventListener("change", (event) => {
      if (event.target.matches("[data-comments]"))
        TraktSettingsStore.setShowMetaComments(event.target.checked);
    });
    return () => clearInterval(timer);
  }
};
