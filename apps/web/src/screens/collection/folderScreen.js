import { loadFolder, loadFolderPage } from "../../adapters/collectionAdapter.js";
import { catalogGrid, mediaParams } from "../../components/catalog/catalogGrid.js";
import { escapeHtml } from "../../components/media/mediaCard.js";
import { emptyState } from "../../components/feedback/pageState.js";

export const FolderScreen = {
  async mount({ outlet, router, params }) {
    const controller = new AbortController();
    outlet.className = "page-host interior-page folder-page";
    outlet.innerHTML = `<div class="result-loading"><i></i><span>Loading collection…</span></div>`;
    try {
      const data = await loadFolder(params.folderId, controller.signal);
      let activeIndex = 0;
      const mergePage = (row, page) => {
        const seen = new Set(row.items.map((item) => `${item.type}:${item.id}`));
        return {
          ...row,
          ...page,
          items: [
            ...row.items,
            ...page.items.filter((item) => !seen.has(`${item.type}:${item.id}`))
          ]
        };
      };
      const render = () => {
        const active = data.rows[activeIndex];
        outlet.innerHTML = `<header class="collection-hero" style="--collection-image:url('${String(data.folder.heroBackdropUrl || data.folder.coverImageUrl || "").replace(/["')]/g, "")}')"><button class="back-button" data-back>← Back</button><p>${escapeHtml(data.collection.title)}</p><h1>${escapeHtml(data.folder.title)}</h1></header>${data.rows.length > 1 ? `<nav class="collection-tabs" aria-label="Collection sources">${data.rows.map((row, index) => `<button class="${index === activeIndex ? "selected" : ""}" data-source-tab="${index}">${escapeHtml(row.title)}</button>`).join("")}</nav>` : ""}<section class="collection-rows">${active?.error ? emptyState(active.title, active.error) : active?.items?.length ? `<header class="collection-source-heading"><h2>${escapeHtml(active.title)}</h2><span>${active.items.length} titles</span></header>${catalogGrid(active.items)}${active.hasMore ? `<button class="button button--glass load-more" data-load-more>Load more</button>` : ""}` : emptyState("This source is empty", "It did not return any titles.")}</section>`;
        router.replaceParams(params);
      };
      render();
      outlet.addEventListener("click", async (event) => {
        if (event.target.closest("[data-back]")) return router.back();
        const tab = event.target.closest("[data-source-tab]");
        if (tab) {
          activeIndex = Number(tab.dataset.sourceTab || 0);
          render();
          return;
        }
        const loadMore = event.target.closest("[data-load-more]");
        if (loadMore) {
          loadMore.disabled = true;
          loadMore.textContent = "Loading…";
          try {
            const page = await loadFolderPage(data.rows[activeIndex], controller.signal);
            data.rows[activeIndex] = mergePage(data.rows[activeIndex], page);
            render();
          } catch (error) {
            if (error?.name !== "AbortError") {
              loadMore.disabled = false;
              loadMore.textContent = "Try again";
            }
          }
          return;
        }
        const card = event.target.closest("[data-media-id]");
        if (card) router.navigate("detail", mediaParams(card));
      });
    } catch (error) {
      outlet.innerHTML = emptyState(
        "Collection unavailable",
        error?.message || "This folder could not be loaded.",
        "Go back"
      );
      outlet.querySelector("[data-retry]")?.addEventListener("click", () => router.back());
    }
    return () => controller.abort();
  }
};
