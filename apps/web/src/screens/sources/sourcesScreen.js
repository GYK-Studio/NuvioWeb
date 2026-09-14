import {
  loadSources,
  installSource,
  removeSource,
  refreshSource,
  setSourceEnabled,
  sourceEnabled
} from "../../adapters/sourcesAdapter.js";
import { escapeHtml } from "../../components/media/mediaCard.js";
import { emptyState } from "../../components/feedback/pageState.js";

function sourceCard(source) {
  const enabled = sourceEnabled(source.baseUrl);
  return `<article class="source-card" data-source-url="${escapeHtml(source.baseUrl)}"><div class="source-card__identity">${source.logo ? `<img src="${escapeHtml(source.logo)}" alt="">` : `<span>${escapeHtml((source.displayName || source.name || "S")[0])}</span>`}<div><h2>${escapeHtml(source.displayName || source.name)}</h2><p>${escapeHtml(source.description || source.baseUrl)}</p></div></div><div class="source-card__meta"><span>${source.catalogs?.length || 0} catalogs</span><span>${source.resources?.length || 0} resources</span><span>${escapeHtml(source.version || "")}</span></div><div class="source-card__actions"><label class="switch"><input type="checkbox" data-enable ${enabled ? "checked" : ""}><span></span><b>${enabled ? "Enabled" : "Disabled"}</b></label><button data-refresh>Refresh</button><button class="danger" data-remove>Remove</button></div><p class="source-action-status" role="status"></p></article>`;
}

export const SourcesScreen = {
  async mount({ outlet }) {
    outlet.className = "page-host interior-page sources-page";
    const render = async () => {
      const sources = await loadSources();
      outlet.innerHTML = `<header class="page-heading page-heading--split"><div><p>YOUR CONTENT PIPELINE</p><h1>Sources</h1></div><button class="button button--primary" data-add>+ Add source</button></header><form class="source-form" hidden><label>Manifest or source URL<input name="url" type="url" required placeholder="https://example.com/manifest.json"></label><button class="button button--primary">Install</button><button class="button button--glass" type="button" data-cancel>Cancel</button><p role="status"></p></form><section class="source-list">${sources.length ? sources.map(sourceCard).join("") : emptyState("No sources installed", "Add a compatible source URL to begin.", "Add source")}</section>`;
    };
    try {
      await render();
    } catch (error) {
      outlet.innerHTML = emptyState(
        "Sources unavailable",
        error?.message || "Installed sources could not be loaded."
      );
      return;
    }
    outlet.addEventListener("click", async (event) => {
      const form = outlet.querySelector(".source-form");
      if (event.target.closest("[data-add], [data-retry]")) {
        form.hidden = false;
        form.querySelector("input").focus();
      }
      if (event.target.closest("[data-cancel]")) form.hidden = true;
      const card = event.target.closest("[data-source-url]");
      if (!card) return;
      const url = card.dataset.sourceUrl;
      try {
        if (event.target.closest("[data-refresh]")) await refreshSource(url);
        if (event.target.closest("[data-remove]")) {
          const name = card.querySelector("h2")?.textContent || "this source";
          if (!window.confirm(`Remove ${name}?`)) return;
          await removeSource(url);
        }
        if (event.target.closest("[data-remove], [data-refresh]")) await render();
      } catch (error) {
        card.querySelector("[role=status]").textContent = error?.message || "Action failed";
      }
    });
    outlet.addEventListener("change", (event) => {
      if (!event.target.matches("[data-enable]")) return;
      const card = event.target.closest("[data-source-url]");
      setSourceEnabled(card.dataset.sourceUrl, event.target.checked);
      event.target.parentElement.querySelector("b").textContent = event.target.checked
        ? "Enabled"
        : "Disabled";
    });
    outlet.addEventListener("submit", async (event) => {
      event.preventDefault();
      const status = event.target.querySelector("[role=status]");
      try {
        status.textContent = "Checking source…";
        await installSource(new FormData(event.target).get("url"));
        await render();
      } catch (error) {
        status.textContent = error?.message || "The source could not be installed.";
      }
    });
  }
};
