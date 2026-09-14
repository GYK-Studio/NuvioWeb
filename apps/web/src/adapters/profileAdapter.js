import { ProfileManager } from "../../../../js/core/profile/profileManager.js";
import { ProfileSyncService } from "../../../../js/core/profile/profileSyncService.js";
import { AuthManager } from "../../../../js/core/auth/authManager.js";
import { activateProfile } from "./profileSessionAdapter.js";

export async function loadProfiles() {
  return {
    profiles: await ProfileManager.getProfiles(),
    activeId: ProfileManager.getActiveProfileId(),
    authenticated: AuthManager.isAuthenticated,
    pinEnabled: AuthManager.isAuthenticated
      ? await ProfileSyncService.pullProfileLockStates().catch(() => ({}))
      : {}
  };
}

export async function selectProfile(id) {
  await activateProfile(id);
}

export async function addProfile(name) {
  return ProfileManager.createProfile({ name });
}

export async function deleteProfile(id) {
  return ProfileManager.deleteProfile(id);
}

export async function verifyProfilePin(id, pin) {
  return ProfileSyncService.verifyProfilePin(id, pin);
}

export async function setProfilePin(id, pin, currentPin = null) {
  return ProfileSyncService.setProfilePin(id, pin, currentPin);
}

export async function clearProfilePin(id, currentPin) {
  return ProfileSyncService.clearProfilePin(id, currentPin);
}
