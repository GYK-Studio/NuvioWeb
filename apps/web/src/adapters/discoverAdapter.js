import { addonRepository } from "../../../../js/data/repository/addonRepository.js";
import { catalogRepository } from "../../../../js/data/repository/catalogRepository.js";
import { catalogSkipStep, catalogSupportsExtra } from "../../../../js/core/addons/homeCatalogs.js";

export async function loadDiscoverCatalogs() {
  const addons = await addonRepository.getInstalledAddons();
  return addons.flatMap((addon) =>
    (addon.catalogs || [])
      .filter(
        (catalog) =>
          catalog.apiType &&
          !(catalog.extra || []).some(
            (extra) => String(extra?.name || "").toLowerCase() === "search" && extra?.isRequired
          )
      )
      .map((catalog) => ({
        key: `${addon.baseUrl}::${catalog.apiType}::${catalog.id}`,
        addonBaseUrl: addon.baseUrl,
        addonId: addon.id,
        addonName: addon.displayName || addon.name,
        catalogId: catalog.id,
        catalogName: catalog.name || catalog.id,
        type: catalog.apiType,
        genres:
          (catalog.extra || []).find((extra) => String(extra?.name || "").toLowerCase() === "genre")
            ?.options || [],
        supportsSkip: catalogSupportsExtra(catalog, "skip"),
        skipStep: catalogSkipStep(catalog)
      }))
  );
}

export async function loadDiscoverPage(catalog, { skip = 0, genre = "", signal } = {}) {
  const result = await catalogRepository.getCatalog({
    addonBaseUrl: catalog.addonBaseUrl,
    addonId: catalog.addonId,
    addonName: catalog.addonName,
    catalogId: catalog.catalogId,
    catalogName: catalog.catalogName,
    type: catalog.type,
    skip,
    skipStep: catalog.skipStep,
    supportsSkip: catalog.supportsSkip,
    extraArgs: genre ? { genre } : {},
    signal
  });
  if (result?.status !== "success") throw new Error(result?.message || "Catalog unavailable");
  return result.data;
}
