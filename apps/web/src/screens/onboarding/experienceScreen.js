import { ExperienceModeStore } from "../../../../../js/data/local/experienceModeStore.js";
import { LayoutPreferences } from "../../../../../js/data/local/layoutPreferences.js";
import { ProfileManager } from "../../../../../js/core/profile/profileManager.js";
import { addonRepository } from "../../../../../js/data/repository/addonRepository.js";

export const ExperienceScreen = {
  async mount({ outlet, router }) {
    outlet.className = "page-host onboarding-page";
    let step = "mode";
    const render = () => {
      outlet.innerHTML = `<section class="onboarding-card"><p class="auth-brand">NUVIO</p><h1>${step === "mode" ? "Choose your Nuvio experience" : "Choose your Home layout"}</h1><p>${step === "mode" ? "Start focused or unlock every customization. You can change this later." : "Select the catalog presentation used for this profile."}</p><div class="onboarding-options">${step === "mode" ? `<button data-mode="ESSENTIAL"><b>Essential</b><span>Sources, playback basics, Trakt and account settings.</span></button><button data-mode="ADVANCED"><b>Advanced</b><span>Full layout, catalog, collection and diagnostic controls.</span></button>` : ["modern", "grid", "classic"].map((layout) => `<button data-layout="${layout}"><b>${layout[0].toUpperCase() + layout.slice(1)}</b></button>`).join("")}</div></section>`;
    };
    render();
    outlet.addEventListener("click", async (event) => {
      const profileId = ProfileManager.getActiveProfileId();
      const mode = event.target.closest("[data-mode]")?.dataset.mode;
      if (mode === "ADVANCED") {
        step = "layout";
        render();
        return;
      }
      if (mode === "ESSENTIAL") {
        ExperienceModeStore.setForProfile(profileId, { mode });
        LayoutPreferences.setForProfile(profileId, { homeLayout: "modern", hasChosenLayout: true });
        const addons = await addonRepository.getInstalledAddons().catch(() => []);
        router.navigate(addons.length ? "home" : "essentialAddonSetup", {}, { replace: true });
      }
      const layout = event.target.closest("[data-layout]")?.dataset.layout;
      if (layout) {
        ExperienceModeStore.setForProfile(profileId, { mode: "ADVANCED" });
        LayoutPreferences.setForProfile(profileId, { homeLayout: layout, hasChosenLayout: true });
        router.navigate("home", {}, { replace: true });
      }
    });
  }
};
