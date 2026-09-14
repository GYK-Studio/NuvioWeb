import {
  loadProfiles,
  selectProfile,
  addProfile,
  deleteProfile,
  verifyProfilePin,
  setProfilePin,
  clearProfilePin
} from "../../adapters/profileAdapter.js";
import { escapeHtml } from "../../components/media/mediaCard.js";

export const ProfilesScreen = {
  async mount({ outlet, router }) {
    outlet.className = "page-host profile-page";
    let adding = false;
    let pinAction = null;
    let message = "";
    const render = async () => {
      const { profiles, activeId, authenticated, pinEnabled } = await loadProfiles();
      const pinProfile = pinAction
        ? profiles.find((profile) => String(profile.id) === String(pinAction.profileId))
        : null;
      outlet.innerHTML = `<section class="profile-picker"><p>WHO'S WATCHING?</p><h1>Choose a profile</h1><div class="profile-grid">${profiles.map((profile) => `<div class="profile-card-wrap" data-profile-id="${profile.id}" data-locked="${pinEnabled[String(profile.id)] ? "true" : "false"}"><button class="profile-card ${String(profile.id) === String(activeId) ? "selected" : ""}" data-select-profile><span style="--avatar-color:${escapeHtml(profile.avatarColorHex || "#3b82f6")}">${profile.avatarUrl ? `<img src="${escapeHtml(profile.avatarUrl)}" alt="">` : escapeHtml((profile.name || "P")[0])}</span><b>${escapeHtml(profile.name)}</b>${pinEnabled[String(profile.id)] ? `<em aria-label="PIN protected">⌁</em>` : ""}</button><div class="profile-card-actions">${authenticated ? `<button data-pin-action="${pinEnabled[String(profile.id)] ? "clear" : "set"}" aria-label="${pinEnabled[String(profile.id)] ? "Remove" : "Set"} PIN for ${escapeHtml(profile.name)}">${pinEnabled[String(profile.id)] ? "Remove PIN" : "Set PIN"}</button>` : ""}${String(profile.id) !== "1" ? `<button data-delete aria-label="Delete ${escapeHtml(profile.name)}">Delete</button>` : ""}</div></div>`).join("")}<button class="profile-card add-profile" data-add-profile><span>+</span><b>Add profile</b></button></div>${adding ? `<form class="profile-form" data-profile-form><label>Profile name<input name="name" maxlength="30" required autofocus></label><button class="button button--primary">Create profile</button><button class="button button--glass" type="button" data-cancel>Add later</button></form>` : ""}${pinProfile ? `<form class="profile-form" data-pin-form><h2>${pinAction.mode === "unlock" ? "Unlock" : pinAction.mode === "set" ? "Set a PIN for" : "Remove PIN from"} ${escapeHtml(pinProfile.name)}</h2><label>${pinAction.mode === "set" ? "4-digit PIN" : "Current PIN"}<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" required autofocus></label><button class="button button--primary">${pinAction.mode === "unlock" ? "Unlock profile" : pinAction.mode === "set" ? "Set PIN" : "Remove PIN"}</button><button class="button button--glass" type="button" data-cancel-pin>Cancel</button><p class="form-status" role="status">${escapeHtml(message)}</p></form>` : ""}<button class="button button--glass" data-home>Done</button></section>`;
    };
    await render();
    outlet.addEventListener("click", async (event) => {
      if (event.target.closest("[data-home]"))
        return router.navigate("home", {}, { replace: true });
      const card = event.target.closest("[data-profile-id]");
      const selectButton = event.target.closest("[data-select-profile]");
      const pinButton = event.target.closest("[data-pin-action]");
      if (pinButton && card) {
        event.stopPropagation();
        pinAction = { profileId: card.dataset.profileId, mode: pinButton.dataset.pinAction };
        message = "";
        await render();
        outlet.querySelector("[data-pin-form] input")?.focus();
        return;
      }
      if (event.target.closest("[data-delete]") && card) {
        event.stopPropagation();
        await deleteProfile(card.dataset.profileId);
        return render();
      }
      if (card && selectButton) {
        if (card.dataset.locked === "true") {
          pinAction = { profileId: card.dataset.profileId, mode: "unlock" };
          message = "";
          await render();
          outlet.querySelector("[data-pin-form] input")?.focus();
          return;
        }
        await selectProfile(card.dataset.profileId);
        return render();
      }
      if (event.target.closest("[data-add-profile]")) {
        adding = true;
        await render();
        outlet.querySelector(".profile-form input")?.focus();
      }
      if (event.target.closest("[data-cancel]")) {
        adding = false;
        await render();
      }
      if (event.target.closest("[data-cancel-pin]")) {
        pinAction = null;
        message = "";
        await render();
      }
    });
    outlet.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (event.target.matches("[data-pin-form]")) {
        const pin = String(new FormData(event.target).get("pin") || "").trim();
        let success = false;
        if (pinAction.mode === "unlock") {
          const result = await verifyProfilePin(pinAction.profileId, pin);
          success = Boolean(result?.unlocked);
          if (success) await selectProfile(pinAction.profileId);
          else if (result?.retryAfterSeconds)
            message = `Try again in ${result.retryAfterSeconds} seconds.`;
        } else if (pinAction.mode === "set") {
          success = await setProfilePin(pinAction.profileId, pin);
        } else {
          success = await clearProfilePin(pinAction.profileId, pin);
        }
        if (!success) {
          if (!message) message = "The PIN could not be verified.";
          await render();
          return;
        }
        pinAction = null;
        message = "";
        await render();
        return;
      }
      if (!event.target.matches("[data-profile-form]")) return;
      const name = String(new FormData(event.target).get("name") || "").trim();
      if (name) await addProfile(name);
      adding = false;
      await render();
    });
  }
};
