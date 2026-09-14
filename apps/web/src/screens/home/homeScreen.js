import { loadHome, toggleHomeSaved } from "../../adapters/homeAdapter.js";
import { mediaRail, scrollMediaRail } from "../../components/media/mediaRail.js";
import { escapeHtml } from "../../components/media/mediaCard.js";
import { emptyState, loadingHome } from "../../components/feedback/pageState.js";

function heroMarkup(item, saved = false) {
  const backdrop = item.background || item.poster || "";
  const metadata = [
    item.releaseInfo,
    item.type === "series" ? "Series" : "Movie",
    item.runtime
  ].filter(Boolean);
  return `<section class="hero" data-hero-id="${escapeHtml(item.id)}" data-hero-type="${escapeHtml(item.type)}" data-hero-addon="${escapeHtml(item.addonBaseUrl || "")}" style="--hero-image:url('${String(backdrop).replace(/["')]/g, "")}')"><div class="hero__scrim"></div><div class="hero__content"><p class="hero__eyebrow">FEATURED ON NUVIO</p>${item.logo ? `<img class="hero__logo" src="${escapeHtml(item.logo)}" alt="${escapeHtml(item.name)}">` : `<h1>${escapeHtml(item.name)}</h1>`}<div class="hero__meta">${metadata.map((value) => `<span>${escapeHtml(value)}</span>`).join("")}</div>${item.description ? `<p class="hero__description">${escapeHtml(item.description)}</p>` : ""}<div class="hero__actions"><button class="button button--primary" data-hero-play>▶ <span>Watch now</span></button><button class="button button--glass" data-hero-save aria-pressed="${saved}">${saved ? "✓" : "+"} <span>My list</span></button><button class="button button--quiet" data-hero-info>ⓘ <span>More info</span></button></div></div></section>`;
}

function renderLoaded(data) {
  const sections = [];
  if (data.continueWatching.length)
    sections.push(
      mediaRail({
        title: "Continue watching",
        items: data.continueWatching,
        key: "continue",
        landscape: true,
        continueWatching: true
      })
    );
  data.rows.forEach((row) =>
    sections.push(
      mediaRail({
        title: row.title || row.catalogName,
        items: row.items.slice(0, 18),
        key: `${row.addonId}:${row.catalogId}`
      })
    )
  );
  if (!data.hero && !sections.length)
    return emptyState(
      "Your screen is ready",
      data.hasSources
        ? "No titles are available from your sources right now."
        : "Add a source to begin building your home screen.",
      data.hasSources ? "Retry" : "Open sources"
    );
  return `${data.hero ? heroMarkup(data.hero, data.heroSaved) : ""}<div class="home-content">${data.errors.length ? `<div class="inline-notice" role="status">Some sources did not respond. Available catalogs are shown below.</div>` : ""}${sections.join("")}</div>`;
}

export const HomeScreen = {
  async mount({ outlet, router }) {
    const controller = new AbortController();
    let currentData = null;
    outlet.className = "page-host home-page";
    outlet.innerHTML = loadingHome();
    const reload = async () => {
      outlet.innerHTML = loadingHome();
      try {
        const data = await loadHome({ signal: controller.signal });
        if (!controller.signal.aborted) {
          currentData = data;
          outlet.innerHTML = renderLoaded(data);
        }
      } catch (error) {
        if (error?.name !== "AbortError")
          outlet.innerHTML = emptyState(
            "Home couldn't load",
            "Check your connection and try again."
          );
      }
    };
    outlet.addEventListener("click", async (event) => {
      const card = event.target.closest("[data-media-id]");
      if (card)
        router.navigate("detail", {
          itemId: card.dataset.mediaId,
          itemType: card.dataset.mediaType,
          addonBaseUrl: card.dataset.addonUrl
        });
      else if (event.target.closest("[data-rail-scroll]")) {
        scrollMediaRail(event.target.closest("[data-rail-scroll]"));
      } else if (event.target.closest("[data-see-all]")) {
        const key = event.target.closest("[data-see-all]").dataset.seeAll;
        const row = currentData?.rows.find(
          (candidate) => `${candidate.addonId}:${candidate.catalogId}` === key
        );
        if (row)
          router.navigate("catalogSeeAll", {
            addonBaseUrl: row.addonBaseUrl,
            addonId: row.addonId,
            addonName: row.addonName,
            catalogId: row.catalogId,
            itemType: row.apiType,
            title: row.title || row.catalogName,
            supportsSkip: row.supportsSkip,
            skipStep: row.skipStep
          });
      } else if (event.target.closest("[data-retry]")) reload();
      else if (event.target.closest("[data-hero-save]") && currentData?.hero) {
        const control = event.target.closest("[data-hero-save]");
        control.disabled = true;
        try {
          const result = await toggleHomeSaved(currentData.hero);
          currentData.heroSaved = result?.isSavedInLibrary === true;
          control.setAttribute("aria-pressed", String(currentData.heroSaved));
          control.innerHTML = `${currentData.heroSaved ? "✓" : "+"} <span>My list</span>`;
        } finally {
          control.disabled = false;
        }
      } else if (event.target.closest("[data-hero-info], [data-hero-play]")) {
        const hero = outlet.querySelector("[data-hero-id]");
        if (hero)
          router.navigate("detail", {
            itemId: hero.dataset.heroId,
            itemType: hero.dataset.heroType,
            addonBaseUrl: hero.dataset.heroAddon
          });
      }
    });
    await reload();
    return () => controller.abort();
  }
};
