import { loadCatalogPage, mergeCatalogItems } from "../../adapters/catalogAdapter.js";
import { catalogGrid, mediaParams } from "../../components/catalog/catalogGrid.js";
import { escapeHtml } from "../../components/media/mediaCard.js";
import { emptyState } from "../../components/feedback/pageState.js";

export const CatalogScreen = {
  async mount({ outlet, router, params }) {
    const controller = new AbortController();
    let items = [];
    let nextSkip = 0;
    let hasMore = true;
    let loading = false;
    outlet.className = "page-host interior-page catalog-page";
    outlet.innerHTML = `<header class="page-heading page-heading--split"><div><p>${escapeHtml(params.addonName || "CATALOG")}</p><h1>${escapeHtml(params.title || "Browse all")}</h1></div><button class="button button--glass" data-back>← Back</button></header><section class="catalog-results"><div class="result-loading"><i></i><span>Loading catalog…</span></div></section>`;
    const render = () => {
      outlet.querySelector(".catalog-results").innerHTML = items.length
        ? `${catalogGrid(items)}${hasMore ? `<button class="button button--glass load-more" data-more ${loading ? "disabled" : ""}>${loading ? "Loading…" : "Load more"}</button>` : ""}`
        : emptyState("Catalog is empty", "This source did not return any titles.");
    };
    const load = async () => {
      if (loading || !hasMore) return;
      loading = true;
      if (items.length) render();
      try {
        const page = await loadCatalogPage(params, nextSkip, controller.signal);
        const merged = mergeCatalogItems(items, page, nextSkip);
        items = merged.items;
        nextSkip = merged.nextSkip;
        hasMore = merged.hasMore;
        render();
      } catch (error) {
        outlet.querySelector(".catalog-results").innerHTML = emptyState(
          "Catalog unavailable",
          error?.message || "The catalog could not be loaded.",
          "Try again"
        );
      } finally {
        loading = false;
      }
    };
    outlet.addEventListener("click", (event) => {
      if (event.target.closest("[data-back]")) return router.back();
      if (event.target.closest("[data-more], [data-retry]")) return load();
      const card = event.target.closest("[data-media-id]");
      if (card) router.navigate("detail", mediaParams(card));
    });
    await load();
    return () => controller.abort();
  }
};
