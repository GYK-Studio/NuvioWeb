import {
  loadCatalogOrder,
  moveCatalog,
  toggleCatalog
} from "../../adapters/catalogOrderAdapter.js";
import { escapeHtml } from "../../components/media/mediaCard.js";
import { emptyState } from "../../components/feedback/pageState.js";

export const CatalogOrderScreen = {
  async mount({ outlet, router }) {
    outlet.className = "page-host interior-page catalog-order-page";
    const render = async () => {
      const items = await loadCatalogOrder();
      outlet.innerHTML = `<header class="page-heading page-heading--split"><div><p>HOME CONTENT</p><h1>Catalog order</h1></div><button class="button button--glass" data-back>← Back</button></header><section class="settings-list">${items.length ? items.map((item, index) => `<article class="catalog-order-row" data-key="${escapeHtml(item.key)}"><span><small>${escapeHtml(item.addonName || "Source")}</small><b>${escapeHtml(item.catalogName || item.key)}</b></span><div><button data-move="-1" ${index === 0 ? "disabled" : ""} aria-label="Move up">↑</button><button data-move="1" ${index === items.length - 1 ? "disabled" : ""} aria-label="Move down">↓</button><label><input type="checkbox" data-enabled ${item.isDisabled ? "" : "checked"}> Enabled</label></div></article>`).join("") : emptyState("No catalogs installed", "Add a source with catalogs first.")}</section>`;
    };
    await render();
    outlet.addEventListener("click", async (event) => {
      if (event.target.closest("[data-back]")) return router.back();
      const move = event.target.closest("[data-move]");
      if (move) {
        moveCatalog(move.closest("[data-key]").dataset.key, Number(move.dataset.move));
        await render();
      }
    });
    outlet.addEventListener("change", async (event) => {
      if (!event.target.matches("[data-enabled]")) return;
      toggleCatalog(event.target.closest("[data-key]").dataset.key);
      await render();
    });
  }
};
