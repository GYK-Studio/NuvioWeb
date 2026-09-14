import { loadCast } from "../../adapters/castAdapter.js";
import { catalogGrid, mediaParams } from "../../components/catalog/catalogGrid.js";
import { escapeHtml } from "../../components/media/mediaCard.js";
import { emptyState } from "../../components/feedback/pageState.js";

export const CastScreen = {
  async mount({ outlet, router, params }) {
    outlet.className = "page-host interior-page cast-page";
    outlet.innerHTML = `<div class="result-loading"><i></i><span>Loading person…</span></div>`;
    try {
      const { person, credits } = await loadCast(params);
      outlet.innerHTML = `<button class="back-button" data-back>← Back</button><header class="cast-profile">${person.profile ? `<img src="${escapeHtml(person.profile)}" alt="${escapeHtml(person.name)}">` : ""}<div><p>CAST & CREW</p><h1>${escapeHtml(person.name)}</h1><small>${escapeHtml([person.known_for_department, person.place_of_birth].filter(Boolean).join(" · "))}</small><p>${escapeHtml(person.biography || "No biography is available.")}</p></div></header><section><div class="section-heading"><p>KNOWN FOR</p><h2>${credits.length} titles</h2></div>${catalogGrid(credits)}</section>`;
      outlet.addEventListener("click", (event) => {
        if (event.target.closest("[data-back]")) return router.back();
        const card = event.target.closest("[data-media-id]");
        if (card) router.navigate("detail", mediaParams(card));
      });
    } catch (error) {
      outlet.innerHTML = emptyState(
        "Person unavailable",
        error?.message || "Cast details could not be loaded.",
        "Go back"
      );
      outlet.querySelector("[data-retry]")?.addEventListener("click", () => router.back());
    }
  }
};
