import { addonRepository } from "../../../../js/data/repository/addonRepository.js";
import { catalogRepository } from "../../../../js/data/repository/catalogRepository.js";
import { watchProgressRepository } from "../../../../js/data/repository/watchProgressRepository.js";
import { libraryRepository } from "../../../../js/data/repository/libraryRepository.js";
import { HomeCatalogStore } from "../../../../js/data/local/homeCatalogStore.js";
import {
  buildOrderedCatalogItems,
  catalogSkipStep,
  catalogSupportsExtra
} from "../../../../js/core/addons/homeCatalogs.js";

function normalizeProgress(item = {}) {
  const meta = item.enrichedMeta || {};
  return {
    id: item.contentId || item.id || meta.id || "",
    type: item.contentType || item.type || meta.type || "movie",
    name: meta.name || item.title || item.name || "Continue watching",
    poster: meta.poster || item.poster || item.thumbnail || null,
    background: meta.background || item.background || item.thumbnail || null,
    logo: meta.logo || item.logo || null,
    description: meta.description || item.description || "",
    releaseInfo: meta.releaseInfo || item.releaseInfo || "",
    progress: Math.max(
      0,
      Math.min(
        1,
        Number(item.durationMs)
          ? Number(item.positionMs || 0) / Number(item.durationMs)
          : Number(item.progress || 0)
      )
    ),
    raw: item
  };
}

export async function loadHome({ signal } = {}) {
  const [addonsResult, progressResult] = await Promise.allSettled([
    addonRepository.getInstalledAddons(),
    watchProgressRepository.getRecent(18)
  ]);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const addons = addonsResult.status === "fulfilled" ? addonsResult.value : [];
  const preferences = HomeCatalogStore.get();
  const descriptors = buildOrderedCatalogItems(
    addons,
    preferences.order,
    preferences.disabled,
    preferences.customTitles
  )
    .filter((entry) => !entry.isDisabled)
    .slice(0, 10);
  const rowResults = await Promise.allSettled(
    descriptors.map(async (entry) => {
      const result = await catalogRepository.getCatalog({
        addonBaseUrl: entry.addonBaseUrl,
        addonId: entry.addonId,
        addonName: entry.addonName,
        catalogId: entry.catalogId,
        catalogName: entry.catalogName,
        type: entry.type,
        skipStep: catalogSkipStep(entry),
        supportsSkip: catalogSupportsExtra(entry, "skip"),
        signal
      });
      if (result?.status !== "success")
        throw new Error(result?.message || `Could not load ${entry.catalogName}`);
      return { ...result.data, title: entry.catalogName || result.data.catalogName };
    })
  );
  const rows = rowResults
    .filter((entry) => entry.status === "fulfilled" && entry.value?.items?.length)
    .map((entry) => entry.value);
  const errors = rowResults
    .filter((entry) => entry.status === "rejected")
    .map((entry) => entry.reason?.message || "Catalog unavailable");
  const continueWatching =
    progressResult.status === "fulfilled" ? progressResult.value.map(normalizeProgress) : [];
  const hero =
    continueWatching.find((item) => item.background) ||
    rows.flatMap((row) => row.items).find((item) => item.background || item.poster) ||
    null;
  const heroMembership = hero
    ? await libraryRepository.getMembershipSnapshot(hero).catch(() => ({ listMembership: {} }))
    : { listMembership: {} };
  return {
    hero,
    heroSaved: Object.values(heroMembership.listMembership || {}).some(Boolean),
    continueWatching,
    rows,
    errors,
    hasSources: addons.length > 0
  };
}

export const toggleHomeSaved = (item) => libraryRepository.toggleDefault(item);
