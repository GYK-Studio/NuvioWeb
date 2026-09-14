import { loadDiscoverCatalogs, loadDiscoverPage } from "../../adapters/discoverAdapter.js";
import { catalogGrid, mediaParams } from "../../components/catalog/catalogGrid.js";
import { emptyState } from "../../components/feedback/pageState.js";
import { escapeHtml } from "../../components/media/mediaCard.js";

function option(value, label, selected) {
  return `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

export const DiscoverScreen = {
  async mount({ outlet, router, params }) {
    const controller = new AbortController();
    let catalogs = [];
    let selectedType = String(params.type || "movie");
    let selectedKey = String(params.catalogKey || "");
    let selectedGenre = String(params.genre || "");
    let items = [];
    let nextSkip = 0;
    let hasMore = false;
    let loading = false;
    outlet.className = "page-host interior-page discover-page";
    outlet.innerHTML = `<div class="result-loading"><i></i><span>Loading catalogs…</span></div>`;

    const selectedCatalog = () => catalogs.find((catalog) => catalog.key === selectedKey);
    const selectCatalogDefaults = () => {
      const types = [...new Set(catalogs.map((catalog) => catalog.type))];
      if (!types.includes(selectedType)) selectedType = types[0] || "movie";
      const available = catalogs.filter((catalog) => catalog.type === selectedType);
      if (!available.some((catalog) => catalog.key === selectedKey))
        selectedKey = available[0]?.key || "";
      const genres = selectedCatalog()?.genres || [];
      if (!genres.includes(selectedGenre)) selectedGenre = "";
    };
    const render = () => {
      const types = [...new Set(catalogs.map((catalog) => catalog.type))];
      const available = catalogs.filter((catalog) => catalog.type === selectedType);
      const catalog = selectedCatalog();
      outlet.innerHTML = `<header class="page-heading"><p>CURATED BY YOUR SOURCES</p><h1>Explore</h1><div class="discover-filters"><label><span>Type</span><select data-filter-type>${types.map((type) => option(type, type === "series" ? "Series" : type === "movie" ? "Movies" : type, selectedType)).join("")}</select></label><label><span>Catalog</span><select data-filter-catalog>${available.map((entry) => option(entry.key, `${entry.catalogName} · ${entry.addonName}`, selectedKey)).join("")}</select></label><label><span>Genre</span><select data-filter-genre><option value="">All genres</option>${(catalog?.genres || []).map((genre) => option(genre, genre, selectedGenre)).join("")}</select></label></div></header><section class="discover-results" aria-live="polite">${loading && !items.length ? `<div class="result-loading"><i></i><span>Loading ${escapeHtml(catalog?.catalogName || "catalog")}…</span></div>` : items.length ? `<div class="result-summary"><h2>${escapeHtml(catalog?.catalogName || "Catalog")}</h2><span>${items.length} titles</span></div>${catalogGrid(items)}${hasMore ? `<button class="button button--glass load-more" data-more ${loading ? "disabled" : ""}>${loading ? "Loading…" : "Load more"}</button>` : ""}` : emptyState("No titles available", "Try another catalog or genre.")}</section>`;
      router.replaceParams({ type: selectedType, catalogKey: selectedKey, genre: selectedGenre });
    };
    const load = async ({ append = false } = {}) => {
      const catalog = selectedCatalog();
      if (!catalog || loading) return;
      loading = true;
      if (!append) {
        items = [];
        nextSkip = 0;
      }
      render();
      try {
        const page = await loadDiscoverPage(catalog, {
          skip: nextSkip,
          genre: selectedGenre,
          signal: controller.signal
        });
        const seen = new Set(items.map((item) => `${item.type}:${item.id}`));
        const incoming = (page.items || []).filter(
          (item) => item.id && !seen.has(`${item.type}:${item.id}`)
        );
        items = [...items, ...incoming];
        const reportedNext = Number(page.nextSkip);
        nextSkip =
          Number.isFinite(reportedNext) && reportedNext > nextSkip
            ? reportedNext
            : nextSkip + (page.items?.length || catalog.skipStep || 100);
        hasMore = catalog.supportsSkip !== false && Boolean(page.hasMore) && incoming.length > 0;
      } catch (error) {
        if (error?.name !== "AbortError") {
          items = [];
          hasMore = false;
        }
      } finally {
        loading = false;
        if (!controller.signal.aborted) render();
      }
    };

    try {
      catalogs = await loadDiscoverCatalogs();
      selectCatalogDefaults();
      if (!catalogs.length) {
        outlet.innerHTML = emptyState(
          "Nothing to explore",
          "Install or refresh a source to populate discovery."
        );
      } else await load();
    } catch (error) {
      if (error?.name !== "AbortError")
        outlet.innerHTML = emptyState("Explore unavailable", "Your catalogs could not be loaded.");
    }

    outlet.addEventListener("change", async (event) => {
      if (event.target.matches("[data-filter-type]")) {
        selectedType = event.target.value;
        selectedKey = "";
        selectedGenre = "";
      } else if (event.target.matches("[data-filter-catalog]")) {
        selectedKey = event.target.value;
        selectedGenre = "";
      } else if (event.target.matches("[data-filter-genre]")) selectedGenre = event.target.value;
      else return;
      selectCatalogDefaults();
      await load();
    });
    outlet.addEventListener("click", async (event) => {
      if (event.target.closest("[data-more]")) return load({ append: true });
      const card = event.target.closest("[data-media-id]");
      if (card) router.navigate("detail", mediaParams(card));
    });
    return () => controller.abort();
  }
};
