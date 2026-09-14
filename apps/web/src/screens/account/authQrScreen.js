import { QrLoginService } from "../../../../../js/core/auth/qrLoginService.js";
import { AuthManager } from "../../../../../js/core/auth/authManager.js";
import { escapeHtml } from "../../components/media/mediaCard.js";
import { continueAsGuest } from "../../adapters/accountAdapter.js";
import { LocalStore } from "../../../../../js/core/storage/localStore.js";

export const AuthQrScreen = {
  async mount({ outlet, router }) {
    let pollTimer = 0;
    let active = true;
    outlet.className = "page-host auth-page qr-auth-page";
    const render = ({ qrImageUrl = "", code = "", status = "Preparing secure sign-in…" } = {}) => {
      outlet.innerHTML = `<section class="qr-auth-copy"><p class="auth-brand">NUVIO</p><h1>Sign in from another device</h1><p>Scan the code, approve the session, and this screen will continue automatically.</p><div class="auth-alternatives"><button class="button button--glass" data-back>← Back</button><button class="button button--glass" data-guest>Continue as guest</button></div></section><section class="qr-auth-card"><h2>Connect your account</h2>${qrImageUrl ? `<img src="${escapeHtml(qrImageUrl)}" alt="Nuvio sign-in QR code">` : `<div class="qr-placeholder"></div>`}${code ? `<strong>${escapeHtml(code)}</strong>` : ""}<p role="status">${escapeHtml(status)}</p><button class="button button--glass" data-refresh>Refresh code</button></section>`;
    };
    const stop = () => {
      clearInterval(pollTimer);
      pollTimer = 0;
    };
    const start = async () => {
      stop();
      render();
      try {
        const session = await QrLoginService.start();
        if (!active) return;
        if (!session) throw new Error(QrLoginService.getLastError() || "QR sign-in is unavailable");
        render({ ...session, status: "Waiting for approval…" });
        pollTimer = setInterval(
          async () => {
            const status = await QrLoginService.poll(session.code, session.deviceNonce);
            if (!active) return;
            if (status === "approved") {
              stop();
              const exchanged = await QrLoginService.exchange(session.code, session.deviceNonce);
              if (exchanged || AuthManager.isAuthenticated) {
                LocalStore.remove("skipAuthQrGate");
                LocalStore.set("hasSeenAuthQrOnFirstLaunch", true);
                router.navigate("profileSelection", {}, { replace: true });
              }
            } else if (status === "expired") {
              stop();
              render({ ...session, status: "This code expired. Refresh to try again." });
            }
          },
          Math.max(2, Number(session.pollIntervalSeconds || 3)) * 1000
        );
      } catch (error) {
        render({ status: error?.message || "QR sign-in could not start." });
      }
    };
    outlet.addEventListener("click", async (event) => {
      if (event.target.closest("[data-back]")) router.back();
      if (event.target.closest("[data-refresh]")) start();
      if (event.target.closest("[data-guest]")) {
        stop();
        await continueAsGuest();
        router.navigate("profileSelection", {}, { replace: true });
      }
    });
    await start();
    return () => {
      active = false;
      stop();
    };
  }
};
