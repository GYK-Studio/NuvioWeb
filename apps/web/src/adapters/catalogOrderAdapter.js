import { addonRepository } from "../../../../js/data/repository/addonRepository.js";
import { HomeCatalogStore } from "../../../../js/data/local/homeCatalogStore.js";
import { buildOrderedCatalogItems } from "../../../../js/core/addons/homeCatalogs.js";

export async function loadCatalogOrder() {
  const addons = await addonRepository.getInstalledAddons();
  const settings = HomeCatalogStore.get();
  const items = buildOrderedCatalogItems(
    addons,
    settings.order,
    settings.disabled,
    settings.customTitles
  );
  HomeCatalogStore.ensureOrderKeys(items.map((item) => item.key));
  return items;
}

export function toggleCatalog(key) {
  HomeCatalogStore.toggleDisabled(key);
}

export function moveCatalog(key, direction) {
  const settings = HomeCatalogStore.get();
  const order = [...settings.order];
  const index = order.indexOf(key);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= order.length) return;
  [order[index], order[next]] = [order[next], order[index]];
  HomeCatalogStore.setOrder(order);
}
