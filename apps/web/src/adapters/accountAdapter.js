import { AuthManager } from "../../../../js/core/auth/authManager.js";
import { LocalStore } from "../../../../js/core/storage/localStore.js";

export const accountState = () => ({
  authState: AuthManager.getAuthState(),
  authenticated: AuthManager.isAuthenticated,
  syncCode: LocalStore.get("manualSyncCode", "")
});

export const subscribeAccount = (listener) => AuthManager.subscribe(listener);
export const signInWithEmail = (email, password) => AuthManager.signInWithEmail(email, password);
export const signOut = () => AuthManager.signOut();
export const setSyncCode = (value) => LocalStore.set("manualSyncCode", String(value || "").trim());
export const clearSyncCode = () => LocalStore.remove("manualSyncCode");
export async function continueAsGuest() {
  LocalStore.set("hasSeenAuthQrOnFirstLaunch", true);
  LocalStore.set("skipAuthQrGate", true);
  await AuthManager.signOut();
}
