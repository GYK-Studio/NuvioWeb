import { mediaCard } from "../media/mediaCard.js";

export function catalogGrid(items, options = {}) {
  return `<div class="catalog-grid">${items.map((item) => mediaCard(item, options)).join("")}</div>`;
}

export function mediaParams(card) {
  return {
    itemId: card.dataset.mediaId,
    itemType: card.dataset.mediaType,
    addonBaseUrl: card.dataset.addonUrl
  };
}
