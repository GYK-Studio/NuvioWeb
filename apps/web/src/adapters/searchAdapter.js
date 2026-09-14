import { addonRepository } from "../../../../js/data/repository/addonRepository.js";
import { catalogRepository } from "../../../../js/data/repository/catalogRepository.js";
import { catalogSupportsExtra } from "../../../../js/core/addons/homeCatalogs.js";

export async function searchCatalogs(query, { signal, onUpdate } = {}) {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) return { items: [], errors: [] };
  const addons = await addonRepository.getInstalledAddons();
  const targets = addons.flatMap((addon) =>
    (addon.catalogs || [])
      .filter((catalog) => catalogSupportsExtra(catalog, "search"))
      .map((catalog) => ({ addon, catalog }))
  );
  const byIdentity = new Map();
  const errors = [];
  for (let offset = 0; offset < targets.length; offset += 6) {
    if (signal?.aborted) throw new DOMException("Search aborted", "AbortError");
    const settled = await Promise.allSettled(
      targets.slice(offset, offset + 6).map(({ addon, catalog }) =>
        catalogRepository.getCatalog({
          addonBaseUrl: addon.baseUrl,
          addonId: addon.id,
          addonName: addon.displayName,
          catalogId: catalog.id,
          catalogName: catalog.name,
          type: catalog.apiType,
          extraArgs: { search: cleanQuery },
          signal
        })
      )
    );
    settled.forEach((entry) => {
      if (entry.status !== "fulfilled" || entry.value?.status !== "success") {
        errors.push(entry);
        return;
      }
      (entry.value.data?.items || []).forEach((item) => {
        const key = `${item.type}:${item.id}`;
        if (!byIdentity.has(key)) byIdentity.set(key, item);
      });
    });
    onUpdate?.({ items: [...byIdentity.values()], errors: [...errors], loading: true });
  }
  return { items: [...byIdentity.values()], errors };
}
