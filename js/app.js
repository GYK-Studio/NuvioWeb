/* global __NUVIO_APP_VERSION__ */

import "./core/diagnostics/consoleDebugBuffer.js";
import { detailWatchedEnrichmentService } from "./data/repository/detailWatchedEnrichmentService.js";
import { Router } from "./ui/navigation/router.js";
import { FocusEngine } from "./ui/navigation/focusEngine.js";
import { PlayerController } from "./core/player/playerController.js";
import { AuthManager } from "./core/auth/authManager.js";
import { AuthState } from "./core/auth/authState.js";
import { DeviceSessionRegistration } from "./core/auth/deviceSessionRegistration.js";
import { ProfileManager } from "./core/profile/profileManager.js";
import { MemberAccessRepository } from "./data/remote/supabase/memberAccessRepository.js";
import { ProfileSyncService } from "./core/profile/profileSyncService.js";
import { StartupSyncService } from "./core/profile/startupSyncService.js";
import { ProviderCredentialSyncService } from "./core/profile/providerCredentialSyncService.js";
import { ThemeManager } from "./ui/theme/themeManager.js";
import { renderAppShell } from "./bootstrap/renderAppShell.js";
import { renderAddonRemotePage } from "./bootstrap/renderAddonRemotePage.js";
import { preloadStreamBadgeImages } from "./ui/screens/stream/streamScreen.js";
import { warmStreamingLibs } from "./runtime/loadStreamingLibs.js";
import { Platform } from "./platform/index.js";
import { LocalStore } from "./core/storage/localStore.js";
import { I18n } from "./i18n/index.js";
import { resolveExperienceRoute } from "./core/profile/experienceModeRouting.js";
import { PluginRuntime } from "./core/player/pluginRuntime.js";

const GUEST_QR_BYPASS_KEY = "skipAuthQrGate";
const SIGNED_OUT_ALLOWED_ROUTES = new Set(["trakt"]);
let hasSelectedProfileThisSession = false;
let appShellRendered = false;

function isAddonRemoteMode() {
  try {
    return new URLSearchParams(window.location.search).get("addonsRemote") === "1";
  } catch {
    return false;
  }
}

function formatErrorMessage(error) {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  return String(error?.stack || error?.message || error);
}

function renderFatalError(error) {
  const message = formatErrorMessage(error);
  document.body.innerHTML = `
    <main class="web-fatal-error" role="alert">
      <div>
        <p class="web-fatal-error__eyebrow">Nuvio Web</p>
        <h1>We couldn't open Nuvio.</h1>
        <p>Refresh the page to try again. If the problem persists, the details below may help identify it.</p>
        <pre>${message}</pre>
      </div>
    </main>
  `;
}

function isSignedOutRouteAllowed() {
  return SIGNED_OUT_ALLOWED_ROUTES.has(Router.getCurrent());
}

function setupForegroundSync() {
  let wasBackgrounded = document.visibilityState === "hidden";
  const requestAfterBackground = () => {
    if (!wasBackgrounded) return;
    wasBackgrounded = false;
    ProviderCredentialSyncService.requestForegroundPull();
    StartupSyncService.requestForegroundSync();
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") wasBackgrounded = true;
    else requestAfterBackground();
  });
  window.addEventListener("pageshow", (event) => {
    if (event?.persisted) requestAfterBackground();
  });
  window.addEventListener("focus", requestAfterBackground);
}

function setupPluginRuntimeLifecycle() {
  const cancel = () => PluginRuntime.cancelAll();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") cancel();
  });
  window.addEventListener("pagehide", cancel);
  window.addEventListener("beforeunload", cancel);
}

async function shouldShowProfileSelection() {
  const [, pinStates] = await Promise.all([
    ProfileSyncService.pull(),
    ProfileSyncService.pullProfileLockStates()
  ]);
  const profiles = await ProfileManager.getProfiles();
  const activeProfileId = ProfileManager.getActiveProfileId();
  const activeProfileHasPin = Boolean(
    pinStates?.[String(activeProfileId)] || pinStates?.[Number(activeProfileId)]
  );

  if (hasSelectedProfileThisSession) return { show: false, pinStates };
  if (
    ProfileManager.isRememberLastProfileEnabled() &&
    ProfileManager.hasEverSelectedProfile() &&
    !activeProfileHasPin
  ) {
    return { show: false, pinStates };
  }
  return { show: profiles.length > 1 || activeProfileHasPin, pinStates };
}

async function enterWithLastProfile() {
  hasSelectedProfileThisSession = true;
  const profiles = await ProfileManager.getProfiles();
  const activeProfileId = ProfileManager.getActiveProfileId();
  const activeProfile =
    profiles.find((profile) => String(profile.id) === String(activeProfileId)) ||
    profiles[0] ||
    null;

  if (activeProfile) {
    await ProfileManager.setActiveProfile(activeProfile.id);
    StartupSyncService.enableProfileScopedSync();
    detailWatchedEnrichmentService.invalidateAllCache();
    await I18n.init();
    const memberAccess = MemberAccessRepository.getCachedAccess();
    ThemeManager.apply({ enforceAccess: true, access: memberAccess });
    void MemberAccessRepository.getAccess().catch((error) => {
      console.warn("Profile member access refresh failed", error);
    });
    I18n.apply();
    void preloadStreamBadgeImages().catch((error) => {
      console.warn("Stream badge image prefetch failed", error);
    });
  }

  const experienceRoute = activeProfile ? await resolveExperienceRoute(activeProfile.id) : "home";
  await Router.navigate(experienceRoute, {}, { replaceHistory: true, skipStackPush: true });
  void StartupSyncService.requestSyncNow({
    notifyPullCompleted: ["home", "plugins"].includes(experienceRoute)
  }).catch((error) => {
    console.warn("Profile background sync failed", error);
  });
}

async function routeAfterAuthentication() {
  const profileRoute = await shouldShowProfileSelection();
  if (profileRoute.show) {
    await Router.navigate("profileSelection", {
      skipInitialProfileSync: true,
      profilePinEnabled: profileRoute.pinStates
    });
    return;
  }
  await enterWithLastProfile();
}

function subscribeToAuthentication() {
  AuthManager.subscribe((state) => {
    if (state === AuthState.LOADING) {
      StartupSyncService.stop();
      ProviderCredentialSyncService.cancelForegroundPull();
      return;
    }

    if (state === AuthState.SIGNED_OUT) {
      StartupSyncService.stop();
      ProviderCredentialSyncService.cancelForegroundPull();
      hasSelectedProfileThisSession = false;
      if (isSignedOutRouteAllowed()) return;

      const shouldBypassQr = Boolean(LocalStore.get(GUEST_QR_BYPASS_KEY, false));
      if (shouldBypassQr) {
        if (
          ProfileManager.isRememberLastProfileEnabled() &&
          ProfileManager.hasEverSelectedProfile()
        ) {
          void enterWithLastProfile().catch((error) => {
            console.warn("Failed to restore the last profile", error);
            ProfileManager.clearActiveProfile();
            void Router.navigate(
              "profileSelection",
              {},
              { replaceHistory: true, skipStackPush: true }
            );
          });
          return;
        }
        ProfileManager.clearActiveProfile();
        void Router.navigate("profileSelection", {}, { replaceHistory: true, skipStackPush: true });
        return;
      }

      const hasSeenQr = LocalStore.get("hasSeenAuthQrOnFirstLaunch");
      void Router.navigate("authSignIn", { onboardingMode: !hasSeenQr });
      return;
    }

    if (state === AuthState.AUTHENTICATED) {
      LocalStore.remove(GUEST_QR_BYPASS_KEY);
      StartupSyncService.start({ runInitialPull: false });
      void routeAfterAuthentication().catch((error) => {
        console.warn("Failed to resolve the authenticated route", error);
        void Router.navigate("profileSelection");
      });
    }
  });
}

async function bootstrapApp() {
  renderAppShell();
  appShellRendered = true;
  Platform.init();
  await I18n.init();
  Router.init();
  PlayerController.init();
  FocusEngine.init();
  setupForegroundSync();
  setupPluginRuntimeLifecycle();
  ThemeManager.apply();
  I18n.apply();
  warmStreamingLibs({ delayMs: 800 });
  DeviceSessionRegistration.start();
  subscribeToAuthentication();
  await AuthManager.bootstrap();
}

async function bootstrapAddonRemoteMode() {
  await renderAddonRemotePage();
  appShellRendered = true;
}

function start() {
  const bootstrap = isAddonRemoteMode() ? bootstrapAddonRemoteMode : bootstrapApp;
  bootstrap().catch((error) => {
    console.error("App bootstrap failed", error);
    renderFatalError(error);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}

window.addEventListener("error", (event) => {
  if (!event?.error) return;
  if (!appShellRendered) renderFatalError(event.error);
  else console.warn("Unhandled runtime error", event.error);
});

window.addEventListener("unhandledrejection", (event) => {
  if (!appShellRendered) renderFatalError(event?.reason);
  else console.warn("Unhandled promise rejection", event?.reason);
});
