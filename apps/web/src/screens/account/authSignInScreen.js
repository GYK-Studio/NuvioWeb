import { continueAsGuest, signInWithEmail } from "../../adapters/accountAdapter.js";

export const AuthSignInScreen = {
  async mount({ outlet, router }) {
    outlet.className = "page-host auth-page";
    outlet.innerHTML = `<section class="auth-card"><button class="back-button" data-back>← Back</button><p class="auth-brand">NUVIO</p><h1>Your cinema, wherever you are.</h1><p>Sign in to access profiles, your library and playback progress.</p><form><label>Email<input name="email" type="email" autocomplete="username" required placeholder="you@example.com"></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><p class="form-status" role="alert"></p><button class="button button--primary" type="submit">Sign in</button></form><div class="auth-alternatives"><button class="button button--glass" data-qr>Sign in with QR code</button><button class="button button--glass" data-guest>Continue as guest</button></div></section>`;
    outlet.querySelector("[data-back]").addEventListener("click", () => router.back());
    outlet
      .querySelector("[data-qr]")
      .addEventListener("click", () => router.navigate("authQrSignIn"));
    outlet.querySelector("[data-guest]").addEventListener("click", async () => {
      await continueAsGuest();
      router.navigate("profileSelection", {}, { replace: true });
    });
    outlet.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const status = form.querySelector("[role=alert]");
      const button = form.querySelector("button[type=submit]");
      const data = new FormData(form);
      button.disabled = true;
      status.textContent = "Connecting…";
      try {
        await signInWithEmail(String(data.get("email")).trim(), String(data.get("password")));
        router.navigate("profileSelection", {}, { replace: true });
      } catch {
        status.textContent = "Sign-in failed. Check your email, password and connection.";
        button.disabled = false;
      }
    });
  }
};
