import { Platform } from "../../../../js/platform/index.js";
import { I18n } from "../../../../js/i18n/index.js";
import { PlayerController } from "../../../../js/core/player/playerController.js";
import { ProfileManager } from "../../../../js/core/profile/profileManager.js";
import { createAppShell } from "../layouts/appShell.js";
import { createRouter } from "../navigation/router.js";
import { routes } from "../navigation/routes.js";
import { startRuntimeLifecycle } from "./runtimeLifecycle.js";
import { applyThemePreferences } from "../adapters/themeAdapter.js";
import { setupRemoteClient } from "../adapters/remoteAdapter.js";

export async function bootstrapWebApp() {
  const shell = createAppShell();
  Platform.init();
  await I18n.init();
  I18n.apply();
  applyThemePreferences();
  PlayerController.init();
  const router = createRouter({ outlet: shell.outlet, routes, shell });
  const remoteClient = setupRemoteClient(router);
  globalThis.NuvioWeb = { router, PlayerController, ProfileManager, remoteClient };
  shell.connect(router);
  await router.start();
  await startRuntimeLifecycle(router);
  if (new URLSearchParams(location.search).get("addonsRemote") === "1")
    await router.navigate("plugins", { remoteMode: true }, { replace: true });
}
