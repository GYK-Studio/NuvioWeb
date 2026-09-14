import { ExperienceModeStore } from "../../../../../js/data/local/experienceModeStore.js";
import { ProfileManager } from "../../../../../js/core/profile/profileManager.js";

export const SourceSetupScreen = {
  async mount({ outlet, router }) {
    outlet.className = "page-host onboarding-page";
    outlet.innerHTML = `<section class="onboarding-card"><p class="auth-brand">NUVIO</p><h1>Set up your sources</h1><p>Add a compatible manifest now, or continue and configure sources later.</p><div class="onboarding-options"><button data-sources><b>Add a source</b><span>Open source management and install from a URL.</span></button><button data-skip><b>Continue for now</b><span>You can return from Settings at any time.</span></button></div></section>`;
    outlet.addEventListener("click", (event) => {
      if (event.target.closest("[data-sources]")) return router.navigate("plugins");
      if (event.target.closest("[data-skip]")) {
        ExperienceModeStore.setForProfile(ProfileManager.getActiveProfileId(), {
          addonSetupSkipped: true
        });
        router.navigate("home", {}, { replace: true });
      }
    });
  }
};
