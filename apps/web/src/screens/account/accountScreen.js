import { accountState, signOut, subscribeAccount } from "../../adapters/accountAdapter.js";

export const AccountScreen = {
  async mount({ outlet, router }) {
    outlet.className = "page-host interior-page account-page";
    const render = () => {
      const state = accountState();
      outlet.innerHTML = `<header class="page-heading"><p>NUVIO ACCOUNT</p><h1>Account</h1></header><section class="account-panel"><div class="account-status"><span class="account-status__icon">${state.authenticated ? "✓" : "N"}</span><div><h2>${state.authenticated ? "Signed in" : "Sign in to Nuvio"}</h2><p>${state.authenticated ? "Your profiles, library and playback progress can sync across devices." : "Connect your account to keep profiles, library and progress together."}</p></div></div><div class="settings-list">${state.authenticated ? `<button class="settings-row" data-route="profileSelection"><span><b>Profiles</b><small>Choose and manage profile-scoped data</small></span><i>›</i></button><button class="settings-row" data-route="syncCode"><span><b>Manual sync code</b><small>${state.syncCode || "Not configured"}</small></span><i>›</i></button><button class="settings-row settings-row--danger" data-signout><span><b>Sign out</b><small>Remove this session from this device</small></span></button>` : `<button class="button button--primary" data-route="authSignIn">Sign in with email</button><button class="button button--glass" data-route="authQrSignIn">Sign in with QR code</button>`}</div></section>`;
    };
    render();
    const unsubscribe = subscribeAccount(render);
    outlet.addEventListener("click", async (event) => {
      const route = event.target.closest("[data-route]")?.dataset.route;
      if (route) return router.navigate(route);
      if (event.target.closest("[data-signout]")) {
        await signOut();
        router.navigate("account", {}, { replace: true });
      }
    });
    return unsubscribe;
  }
};
