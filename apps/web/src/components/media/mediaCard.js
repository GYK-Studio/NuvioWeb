function escape(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]
  );
}

export function mediaCard(item, { landscape = false, progress = null } = {}) {
  const image = landscape ? item.background || item.poster : item.poster || item.background;
  const fallback = `<span class="media-card__fallback" ${image ? "hidden" : ""}>${escape(item.name?.slice(0, 1) || "N")}</span>`;
  return `<button class="media-card ${landscape ? "media-card--landscape" : ""}" data-media-id="${escape(item.id)}" data-media-type="${escape(item.type)}" data-media-name="${escape(item.name || "Untitled")}" data-media-year="${escape(item.releaseInfo || "")}" data-media-poster="${escape(item.poster || "")}" data-addon-url="${escape(item.addonBaseUrl || "")}" data-addon-id="${escape(item.addonId || "")}" data-addon-name="${escape(item.addonName || "")}"><span class="media-card__art">${image ? `<img src="${escape(image)}" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false">` : ""}${fallback}${progress != null ? `<i class="media-card__progress"><b style="width:${Math.round(progress * 100)}%"></b></i>` : ""}</span><span class="media-card__title">${escape(item.name || "Untitled")}</span>${item.releaseInfo ? `<span class="media-card__meta">${escape(item.releaseInfo)}</span>` : ""}</button>`;
}

export { escape as escapeHtml };
