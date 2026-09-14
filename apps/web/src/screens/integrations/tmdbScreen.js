import { loadTmdbEntity } from "../../adapters/tmdbAdapter.js";
import { mediaRail, scrollMediaRail } from "../../components/media/mediaRail.js";
import { mediaParams } from "../../components/catalog/catalogGrid.js";
import { escapeHtml } from "../../components/media/mediaCard.js";
import { emptyState } from "../../components/feedback/pageState.js";

export const TmdbScreen = {
  async mount({ outlet, router, params }) {
    outlet.className = "page-host interior-page tmdb-page";
    if (!params.entityId) {
      outlet.innerHTML = `<header class="page-heading page-heading--split"><div><p>METADATA</p><h1>TMDB</h1></div><button class="button button--glass" data-back>← Back</button></header>${emptyState("Choose a company or network", "TMDB entity pages open from supported title details.")}`;
      outlet.querySelector("[data-back]").addEventListener("click", () => router.back());
      return;
    }
    outlet.innerHTML = `<div class="result-loading"><i></i><span>Loading TMDB selection…</span></div>`;
    try {
      const data = await loadTmdbEntity(params);
      if (!data) throw new Error("Selection unavailable");
      outlet.innerHTML = `<header class="collection-hero" style="--collection-image:url('${String(data.header?.backdrop || "").replace(/["')]/g, "")}')"><button class="back-button" data-back>← Back</button><p>${escapeHtml(params.entityKind || "TMDB")}</p>${data.header?.logo ? `<img class="detail-logo" src="${escapeHtml(data.header.logo)}" alt="${escapeHtml(data.header.name)}">` : `<h1>${escapeHtml(data.header?.name || params.entityName || "TMDB")}</h1>`}</header><section class="collection-rows">${(data.rails || []).map((rail) => mediaRail({ title: rail.title || rail.type, items: rail.items || [], key: rail.type })).join("")}</section>`;
      outlet.addEventListener("click", (event) => {
        if (event.target.closest("[data-back]")) return router.back();
        if (event.target.closest("[data-rail-scroll]")) {
          scrollMediaRail(event.target.closest("[data-rail-scroll]"));
          return;
        }
        const card = event.target.closest("[data-media-id]");
        if (card) router.navigate("detail", mediaParams(card));
      });
    } catch (error) {
      outlet.innerHTML = emptyState(
        "TMDB selection unavailable",
        error?.message || "Could not load this selection.",
        "Go back"
      );
      outlet.querySelector("[data-retry]")?.addEventListener("click", () => router.back());
    }
  }
};
