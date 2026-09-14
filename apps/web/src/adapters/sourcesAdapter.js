import { addonRepository } from "../../../../js/data/repository/addonRepository.js";

export async function loadSources() {
  return addonRepository.getInstalledAddons({ includeDisabled: true });
}

export async function installSource(url) {
  const result = await addonRepository.fetchAddon(url, { force: true });
  if (result?.status !== "success")
    throw new Error(result?.message || "Source manifest unavailable");
  await addonRepository.addAddon(url);
  return result.data;
}

export async function removeSource(url) {
  return addonRepository.removeAddon(url);
}

export async function refreshSource(url) {
  const result = await addonRepository.refreshAddon(url);
  if (result?.status !== "success") throw new Error(result?.message || "Source refresh failed");
  return result.data;
}

export function setSourceEnabled(url, enabled) {
  return addonRepository.setAddonEnabledStates([{ url, enabled }], { replace: false });
}

export function sourceEnabled(url) {
  return addonRepository.isAddonEnabled(url);
}
