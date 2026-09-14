import { AuthManager } from "../../../../js/core/auth/authManager.js";
import { AuthState } from "../../../../js/core/auth/authState.js";
import { DeviceSessionRegistration } from "../../../../js/core/auth/deviceSessionRegistration.js";
import { LocalStore } from "../../../../js/core/storage/localStore.js";
import { ProfileManager } from "../../../../js/core/profile/profileManager.js";
import { ProfileSyncService } from "../../../../js/core/profile/profileSyncService.js";
import { StartupSyncService } from "../../../../js/core/profile/startupSyncService.js";
import { ProviderCredentialSyncService } from "../../../../js/core/profile/providerCredentialSyncService.js";
import { resolveExperienceRoute } from "../../../../js/core/profile/experienceModeRouting.js";
import { PluginRuntime } from "../../../../js/core/player/pluginRuntime.js";
import { activateProfile } from "../adapters/profileSessionAdapter.js";

const GUEST_QR_BYPASS_KEY = "skipAuthQrGate";
const SIGNED_OUT_ALLOWED_ROUTES = new Set(["trakt"]);
let selectedProfileThisSession = false;

async function profileEntryRoute() {
  const [, pinStates] = await Promise.all([
    ProfileSyncService.pull(),
    ProfileSyncService.pullProfileLockStates()
  ]);
  const profiles = await ProfileManager.getProfiles();
  const activeId = ProfileManager.getActiveProfileId();
  const activeHasPin = Boolean(pinStates?.[String(activeId)] || pinStates?.[Number(activeId)]);
  const canRestore =
    !selectedProfileThisSession &&
    ProfileManager.isRememberLastProfileEnabled() &&
    ProfileManager.hasEverSelectedProfile() &&
    !activeHasPin;
  if (!selectedProfileThisSession && !canRestore && (profiles.length > 1 || activeHasPin)) {
    return { route: "profileSelection", params: {} };
  }
  const active = profiles.find((profile) => String(profile.id) === String(activeId)) || profiles[0];
  if (!active) return { route: "profileSelection", params: {} };
  await activateProfile(active.id);
  selectedProfileThisSession = true;
  return { route: await resolveExperienceRoute(active.id), params: {} };
}

function setupForegroundSync() {
  let wasBackgrounded = document.visibilityState === "hidden";
  const request = () => {
    if (!wasBackgrounded) return;
    wasBackgrounded = false;
    ProviderCredentialSyncService.requestForegroundPull();
    StartupSyncService.requestForegroundSync();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") wasBackgrounded = true;
    else request();
  });
  window.addEventListener("pageshow", (event) => event.persisted && request());
  window.addEventListener("focus", request);
}

function setupPluginRuntimeLifecycle() {
  const cancel = () => PluginRuntime.cancelAll();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") cancel();
  });
  window.addEventListener("pagehide", cancel);
  window.addEventListener("beforeunload", cancel);
}

async function enterGuestProfile(router) {
  if (ProfileManager.isRememberLastProfileEnabled() && ProfileManager.hasEverSelectedProfile()) {
    const profiles = await ProfileManager.getProfiles();
    const activeId = ProfileManager.getActiveProfileId();
    const active =
      profiles.find((profile) => String(profile.id) === String(activeId)) || profiles[0] || null;
    if (active) {
      await activateProfile(active.id);
      selectedProfileThisSession = true;
      await router.navigate(await resolveExperienceRoute(active.id), {}, { replace: true });
      return;
    }
  }
  ProfileManager.clearActiveProfile();
  await router.navigate("profileSelection", {}, { replace: true });
}

export async function startRuntimeLifecycle(router) {
  setupForegroundSync();
  setupPluginRuntimeLifecycle();
  DeviceSessionRegistration.start();
  AuthManager.subscribe((state) => {
    if (state === AuthState.LOADING) {
      StartupSyncService.stop();
      ProviderCredentialSyncService.cancelForegroundPull();
      return;
    }
    if (state === AuthState.SIGNED_OUT) {
      StartupSyncService.stop();
      ProviderCredentialSyncService.cancelForegroundPull();
      selectedProfileThisSession = false;
      if (SIGNED_OUT_ALLOWED_ROUTES.has(router.getCurrent())) return;
      if (LocalStore.get(GUEST_QR_BYPASS_KEY, false)) {
        void enterGuestProfile(router).catch((error) => {
          console.warn("Failed to restore the guest profile", error);
          ProfileManager.clearActiveProfile();
          void router.navigate("profileSelection", {}, { replace: true });
        });
        return;
      }
      void router.navigate(
        "authSignIn",
        { onboardingMode: !LocalStore.get("hasSeenAuthQrOnFirstLaunch") },
        { replace: true }
      );
      return;
    }
    if (state === AuthState.AUTHENTICATED) {
      LocalStore.remove(GUEST_QR_BYPASS_KEY);
      StartupSyncService.start({ runInitialPull: false });
      void profileEntryRoute()
        .then(({ route, params }) => router.navigate(route, params, { replace: true }))
        .catch((error) => {
          console.warn("Failed to resolve authenticated profile route", error);
          void router.navigate("profileSelection", {}, { replace: true });
        });
    }
  });
  await AuthManager.bootstrap();
}
