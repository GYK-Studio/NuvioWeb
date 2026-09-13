export const MODERN_HOME_CONSTANTS = {
  heroFocusDelayMs: 450,
  heroRapidNavThresholdMs: 130,
  heroRapidSettleMs: 400,
  keyRepeatThrottleMs: 80,
  verticalKeyRepeatThrottleMs: 112,
  trackPaginationIdleMs: 160,
  trackPaginationPrefetchDelayMs: 40,
  trackPaginationLoadAheadItems: 4,
  cameraFollowDelayMs: 140,
  cameraFollowDurationXMs: 440,
  cameraFollowDurationYMs: 440,
  cameraSafetyDurationMs: 180,
  verticalScrollSettlePollMs: 60,
  smartTvLazyHydrationDebounceMs: 240,
  smartTvTrailerCleanupDelayMs: 900,
  springScrollStiffness: 180,
  springScrollDampingRatio: 0.95,
  rowFocusInset: 40,
  trackEdgePadding: 104,
  verticalFastScrollVelocityPxPerSec: 6400,
  verticalFastScrollEndTimeoutMs: 160,
  verticalFastScrollMaxFrameMs: 48
};

export function renderModernHomeLayout({
  rows = [],
  heroItem = null,
  heroCandidates = [],
  continueWatchingItems = [],
  upcomingItems = [],
  continueWatchingLoading = false,
  continueWatchingLoadingCount = 0,
  continueWatchingRenderLimit = 30,
  useEpisodeThumbnailsInCw = true,
  blurContinueWatchingNextUp = false,
  continueWatchingCardStyle = "card",
  rowItemLimit = 15,
  showHeroSection = false,
  showPosterLabels = true,
  showCatalogTypeSuffix = true,
  preferLandscapePosters = false,
  focusedRowKey = "",
  focusedItemIndex = -1,
  expandFocusedPoster = false,
  buildModernHeroPresentation,
  renderHeroBackdropImage,
  renderContinueWatchingSection,
  createPosterCardMarkup,
  createSeeAllCardMarkup: _createSeeAllCardMarkup,
  formatCatalogRowTitle,
  shouldDeferRowImages,
  watchedTitleIds = null,
  escapeHtml,
  escapeAttribute
} = {}) {
  const catalogSeeAllMap = new Map();
  const sectionsMarkup = [];

  rows.forEach((rowData, rowIndex) => {
    const isCollectionRow = rowData?.rowKind === "collection";
    const items = Array.isArray(rowData?.result?.data?.items) ? rowData.result.data.items : [];
    const isLoading = rowData?.result?.status === "loading";
    const rowItems = items.length ? items : rowData.loadingItems || [];
    if (!rowItems.length) return;

    const rowKey = String(rowData?.homeCatalogKey || buildModernRowKey(rowData));
    const seeAllId = `${rowData.addonId || "addon"}_${rowData.catalogId || "catalog"}_${rowData.type || "movie"}`;
    if (!isLoading && !isCollectionRow) {
      const catalogResultData = rowData?.result?.data || {};
      catalogSeeAllMap.set(seeAllId, {
        addonBaseUrl: rowData.addonBaseUrl || "",
        addonId: rowData.addonId || "",
        addonName: rowData.addonName || "",
        catalogId: rowData.catalogId || "",
        catalogName: rowData.catalogName || "",
        type: rowData.type || "movie",
        initialItems: items,
        initialNextSkip: Number(catalogResultData.nextSkip || 0),
        initialHasMore: Boolean(catalogResultData.hasMore),
        supportsSkip: rowData.supportsSkip !== false && catalogResultData.supportsSkip !== false,
        skipStep: Number(rowData.skipStep || catalogResultData.skipStep || 100)
      });
    }

    const maxItems = Math.max(1, Number(rowItemLimit || 15));
    const focusedItemLimit =
      focusedRowKey === rowKey && Number.isFinite(focusedItemIndex)
        ? Math.max(0, Number(focusedItemIndex)) + 1
        : 0;
    const visibleItems = isCollectionRow
      ? rowItems
      : rowItems.slice(0, Math.max(maxItems, focusedItemLimit));
    const rowTitle = isCollectionRow
      ? String(rowData.collectionTitle || rowData.collection?.title || "Collection")
      : formatCatalogRowTitle(rowData.catalogName, rowData.type, showCatalogTypeSuffix);
    const deferRowImages =
      typeof shouldDeferRowImages === "function"
        ? shouldDeferRowImages(rowIndex, rowKey, focusedRowKey)
        : false;
    const cardsMarkup = visibleItems
      .map((item, itemIndex) =>
        createPosterCardMarkup(
          item,
          rowIndex,
          itemIndex,
          rowData.type,
          rowData,
          showPosterLabels,
          "modern",
          expandFocusedPoster && focusedRowKey === rowKey && focusedItemIndex === itemIndex,
          preferLandscapePosters,
          deferRowImages,
          watchedTitleIds
        )
      )
      .join("");

    const hasSeeAll = !isCollectionRow && catalogSeeAllMap.has(seeAllId);
    sectionsMarkup.push(`
      <section class="home-row home-modern-row nuvio-home-row home-row-enter" data-row-key="${escapeHtml(rowKey)}" data-row-index="${rowIndex}">
        <div class="home-row-head nuvio-row-head">
          <div class="home-row-title-wrap">
            <h2 class="home-row-title">${escapeHtml(rowTitle)}</h2>
          </div>
          <div class="home-row-controls">
            ${
              hasSeeAll
                ? `<button type="button" class="home-row-seeall-link focusable" data-action="openCatalogSeeAll" data-see-all-id="${escapeHtml(seeAllId)}" aria-label="Ver todo">
                     <span data-i18n="action_see_all">Ver todo</span>
                     <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" fill="currentColor"/></svg>
                   </button>`
                : ""
            }
            <button type="button" class="home-rail-arrow home-rail-prev focusable" data-action="scrollRailLeft" aria-label="Desplazar a la izquierda">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor"/></svg>
            </button>
            <button type="button" class="home-rail-arrow home-rail-next focusable" data-action="scrollRailRight" aria-label="Desplazar a la derecha">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" fill="currentColor"/></svg>
            </button>
          </div>
        </div>
        <div class="home-track nuvio-media-rail" data-track-row-key="${escapeHtml(rowKey)}">
          ${cardsMarkup}
        </div>
      </section>
    `);
  });

  return {
    catalogSeeAllMap,
    markup: `
      <section class="home-modern-stage nuvio-home-stage">
        ${
          showHeroSection
            ? renderModernHeroMarkup({
                heroItem,
                heroCandidates,
                buildModernHeroPresentation,
                renderHeroBackdropImage,
                escapeHtml,
                escapeAttribute
              })
            : continueWatchingLoading
              ? renderModernHeroSkeletonMarkup()
              : ""
        }
        <div class="home-modern-rows-viewport nuvio-home-rows-viewport">
          <div class="home-modern-rows-scroll nuvio-home-rows">
            ${renderContinueWatchingSection(continueWatchingItems, {
              rowKey: "continue_watching",
              loading: continueWatchingLoading,
              loadingCount: continueWatchingLoadingCount,
              itemLimit: continueWatchingRenderLimit,
              useEpisodeThumbnails: useEpisodeThumbnailsInCw,
              blurNextUp: blurContinueWatchingNextUp,
              cardStyle: continueWatchingCardStyle
            })}
            ${renderContinueWatchingSection(upcomingItems, {
              rowKey: "upcoming_section",
              titleKey: "upcoming_section_title",
              title: "Upcoming",
              startIndex: continueWatchingItems.length,
              itemLimit: upcomingItems.length,
              useEpisodeThumbnails: useEpisodeThumbnailsInCw,
              blurNextUp: blurContinueWatchingNextUp,
              cardStyle: continueWatchingCardStyle
            })}
            <div class="home-modern-catalogs nuvio-home-catalogs">
              ${sectionsMarkup.join("")}
            </div>
          </div>
        </div>
      </section>
    `
  };
}

export function buildModernNavigationRows(container) {
  const rows = [];
  const continueTracks = Array.from(
    container?.querySelectorAll(".home-row-continue .home-track") || []
  );
  continueTracks.forEach((continueTrack) => {
    const continueNodes = Array.from(
      continueTrack.querySelectorAll(".home-content-card.focusable")
    );
    if (continueNodes.length) rows.push(continueNodes);
  });

  const rowSections = Array.from(container?.querySelectorAll(".home-modern-row") || []);
  rowSections.forEach((section) => {
    const track = section.querySelector(".home-track");
    if (!track) return;
    const cards = Array.from(track.querySelectorAll(".home-content-card.focusable"));
    if (cards.length) rows.push(cards);
  });
  return rows;
}

export function buildModernRowKey(rowData = {}) {
  return `${rowData.addonId || ""}_${rowData.type || ""}_${rowData.catalogId || ""}`;
}

function buildHeroIndicators(items = [], activeItem = null) {
  if (!Array.isArray(items) || items.length <= 1) return "";
  const activeId = String(activeItem?.id || "");
  const activeIndex = items.findIndex((item) => String(item?.id || "") === activeId);
  return items
    .map(
      (_, index) => `
      <span class="home-hero-indicator${index === activeIndex ? " is-active" : ""}"></span>`
    )
    .join("");
}

function renderModernHeroMarkup({
  heroItem,
  heroCandidates,
  buildModernHeroPresentation,
  renderHeroBackdropImage,
  escapeHtml,
  escapeAttribute
}) {
  const display = buildModernHeroPresentation(heroItem);
  if (!display) return "";

  const meta = [...(display.leadingMeta || []), ...(display.trailingMeta || [])].filter(Boolean);
  const badges = Array.isArray(display.badges) ? display.badges.filter(Boolean) : [];

  return `
    <section class="home-hero home-hero-modern nuvio-hero">
      <div class="home-hero-visual nuvio-hero-visual" aria-hidden="true">
        <div class="home-modern-hero-media nuvio-hero-media">
          <div class="home-hero-backdrop-wrap">
            ${
              typeof renderHeroBackdropImage === "function"
                ? renderHeroBackdropImage(display)
                : display.backdrop
                  ? `<img class="home-hero-backdrop" src="${escapeAttribute(display.backdrop)}" alt="" decoding="async" fetchpriority="high" />`
                  : '<div class="home-hero-backdrop placeholder"></div>'
            }
          </div>
          <div class="home-hero-trailer-layer"></div>
        </div>
      </div>
      <article class="home-hero-card home-modern-hero-card nuvio-hero-card${heroItem?.heroMetaEnriching ? " is-hero-meta-enriching" : ""}"
               data-item-id="${escapeAttribute(heroItem?.id || "")}"
               data-item-type="${escapeAttribute(heroItem?.type || "movie")}"
               data-item-title="${escapeAttribute(heroItem?.name || "Untitled")}">
        <div class="home-hero-content-grid">
          <div class="home-hero-copy home-modern-hero-copy nuvio-hero-copy">
            <div class="home-hero-eyebrow"><span class="home-hero-eyebrow-pill">Estreno destacado · Nuvio Premiere</span></div>
            <div class="home-hero-brand">
              ${display.logo ? `<img class="home-hero-logo" src="${escapeAttribute(display.logo)}" alt="${escapeAttribute(display.title)}" decoding="async" fetchpriority="high" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='block';" />` : ""}
              <h1 class="home-hero-title-text" style="${display.logo ? "display:none;" : "display:block;"}">${escapeHtml(display.title)}</h1>
            </div>
            <div class="home-modern-hero-meta-line${meta.length || display.showImdbPrimary ? "" : " is-empty"}">
              ${meta.map((token) => `<span>${escapeHtml(token)}</span>`).join('<span class="home-hero-dot">•</span>')}
              ${display.showImdbPrimary ? `${meta.length ? '<span class="home-hero-dot">•</span>' : ""}<span class="home-hero-imdb"><img src="assets/icons/imdb_logo_2016.svg" alt="IMDb"><span>${escapeHtml(display.imdbText)}</span></span>` : ""}
            </div>
            <div class="home-modern-hero-secondary${display.secondaryHighlightText || badges.length || display.showImdbSecondary || display.languageText ? "" : " is-empty"}">
              ${display.secondaryHighlightText ? `<span class="home-modern-hero-highlight">${escapeHtml(display.secondaryHighlightText)}</span>` : ""}
              ${badges.map((badge) => `<span class="home-modern-hero-badge">${escapeHtml(badge)}</span>`).join("")}
              ${display.showImdbSecondary ? `<span class="home-hero-imdb"><img src="assets/icons/imdb_logo_2016.svg" alt="IMDb"><span>${escapeHtml(display.imdbText)}</span></span>` : ""}
              ${display.languageText ? `<span class="home-modern-hero-secondary-detail">${escapeHtml(display.languageText)}</span>` : ""}
            </div>
            <p class="home-hero-description${display.description ? "" : " is-empty"}">${escapeHtml(display.description)}</p>
            <div class="home-hero-actions nuvio-hero-actions">
              <button type="button" class="home-hero-action home-hero-action-primary focusable" data-action="heroPlay" data-item-id="${escapeAttribute(heroItem?.id || "")}" data-item-type="${escapeAttribute(heroItem?.type || "movie")}" data-item-title="${escapeAttribute(heroItem?.name || "Untitled")}">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg><span>Reanudar</span>
              </button>
              <button type="button" class="home-hero-action home-hero-action-secondary focusable" data-action="heroList" data-item-id="${escapeAttribute(heroItem?.id || "")}" data-item-type="${escapeAttribute(heroItem?.type || "movie")}">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="currentColor"/></svg><span>Mi Lista</span>
              </button>
              <button type="button" class="home-hero-action home-hero-action-ghost focusable" data-action="heroInfo" data-item-id="${escapeAttribute(heroItem?.id || "")}" data-item-type="${escapeAttribute(heroItem?.type || "movie")}" data-item-title="${escapeAttribute(heroItem?.name || "Untitled")}">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" fill="currentColor"/></svg><span>Más información</span>
              </button>
            </div>
          </div>
        </div>
        <div class="home-hero-indicators">${buildHeroIndicators(heroCandidates, heroItem)}</div>
      </article>
    </section>`;
}

function renderModernHeroSkeletonMarkup() {
  return `
    <section class="home-hero home-hero-modern nuvio-hero home-hero-modern-loading" aria-hidden="true">
      <div class="home-hero-visual"><div class="home-modern-hero-media home-modern-hero-media-loading"><div class="home-hero-backdrop-wrap"><div class="home-hero-backdrop placeholder home-hero-backdrop-loading"></div></div></div></div>
      <article class="home-hero-card home-modern-hero-card home-modern-hero-card-loading"></article>
    </section>`;
}
