import { ScreenUtils } from "../../navigation/screen.js";
import { AuthManager } from "../../../core/auth/authManager.js";
import { SUPABASE_URL } from "../../../config.js";

export const AuthSignInScreen = {
  async mount() {
    this.container = document.getElementById("account");
    ScreenUtils.show(this.container);
    this.container.innerHTML = `
      <main class="web-login">
        <form class="web-login-form">
          <p class="web-login-brand">NUVIO</p>
          <h1>Tu cine, donde estés.</h1>
          <p>Inicia sesión para acceder a tus perfiles, biblioteca y progreso.</p>
          <label for="login-email">Correo electrónico</label>
          <input id="login-email" name="email" type="email" autocomplete="username" required placeholder="tu@correo.com">
          <label for="login-password">Contraseña</label>
          <input id="login-password" name="password" type="password" autocomplete="current-password" required minlength="1">
          <p class="web-login-error" role="alert" aria-live="polite"></p>
          <button type="submit">Iniciar sesión</button>
          <a class="web-account-link" target="_blank" rel="noopener noreferrer">Crear o recuperar mi cuenta</a>
        </form>
      </main>`;
    const accountLink = this.container.querySelector(".web-account-link");
    try {
      const url = new URL(SUPABASE_URL);
      if (!/^https?:$/.test(url.protocol)) throw new Error("Invalid backend");
      accountLink.href = new URL("/account/login", url).href;
    } catch {
      accountLink.remove();
    }
    this.form = this.container.querySelector("form");
    this.form.addEventListener("submit", (event) => this.submit(event));
  },

  async submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (form.dataset.pending === "true" || !form.reportValidity()) return;
    const button = form.querySelector("button");
    const error = form.querySelector("[role=alert]");
    const data = new FormData(form);
    form.dataset.pending = "true";
    form.setAttribute("aria-busy", "true");
    button.disabled = true;
    button.textContent = "Conectando…";
    error.textContent = "";
    try {
      await AuthManager.signInWithEmail(
        String(data.get("email")).trim(),
        String(data.get("password"))
      );
    } catch {
      if (form.isConnected)
        error.textContent =
          "No pudimos iniciar sesión. Comprueba tu correo, contraseña y conexión e inténtalo de nuevo.";
    } finally {
      if (form.isConnected) {
        form.dataset.pending = "false";
        form.removeAttribute("aria-busy");
        button.disabled = false;
        button.textContent = "Iniciar sesión";
      }
    }
  },

  cleanup() {
    ScreenUtils.hide(this.container);
    this.form = null;
  }
};
