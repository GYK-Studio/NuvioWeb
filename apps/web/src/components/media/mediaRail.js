import { mediaCard, escapeHtml } from "./mediaCard.js";

export function mediaRail({ title, items, key, landscape = false, continueWatching = false }) {
  const railKey = escapeHtml(key || title);
  return `<section class="media-rail" data-rail="${railKey}"><div class="media-rail__heading"><div class="media-rail__title"><h2>${escapeHtml(title)}</h2>${continueWatching ? `<span>${items.length} ${items.length === 1 ? "title" : "titles"}</span>` : ""}</div><div class="media-rail__actions"><button class="media-rail__arrow" data-rail-scroll="-1" aria-label="Scroll ${escapeHtml(title)} backward">‹</button><button class="media-rail__arrow" data-rail-scroll="1" aria-label="Scroll ${escapeHtml(title)} forward">›</button><button class="media-rail__see-all" data-see-all="${escapeHtml(key || "")}">See all <span>→</span></button></div></div><div class="media-rail__track">${items.map((item) => mediaCard(item, { landscape, progress: continueWatching ? item.progress : null })).join("")}</div></section>`;
}

export function scrollMediaRail(control) {
  const track = control?.closest(".media-rail")?.querySelector(".media-rail__track");
  if (!track) return;
  const direction = Number(control.dataset.railScroll) || 1;
  track.scrollBy({ left: direction * Math.max(track.clientWidth * 0.82, 280), behavior: "smooth" });
}
