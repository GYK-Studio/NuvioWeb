import { catalogRepository } from "../../../../js/data/repository/catalogRepository.js";
import { mergeCatalogPage } from "../../../../js/core/util/catalogPagination.js";

export async function loadCatalogPage(params, skip = 0, signal = null) {
  const result = await catalogRepository.getCatalog({
    addonBaseUrl: params.addonBaseUrl,
    addonId: params.addonId || params.addonBaseUrl,
    addonName: params.addonName || "Source",
    catalogId: params.catalogId,
    catalogName: params.title || params.catalogId,
    type: params.itemType || params.type || "movie",
    skip,
    skipStep: Number(params.skipStep || 100),
    supportsSkip: String(params.supportsSkip) !== "false",
    signal
  });
  if (result?.status !== "success") throw new Error(result?.message || "Catalog unavailable");
  return result.data;
}

export function mergeCatalogItems(current, page, currentSkip) {
  const nextItems = page?.items || [];
  return mergeCatalogPage(
    current,
    nextItems,
    currentSkip,
    nextItems.length,
    page?.nextSkip,
    page?.hasMore
  );
}
