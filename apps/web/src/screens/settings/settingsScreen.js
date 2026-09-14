import { loadSettings, updateSetting } from "../../adapters/settingsAdapter.js";
import { openRemotePairingDialog } from "../../components/dialogs/remotePairingDialog.js";

const sections = [
  { id: "account", title: "Account", subtitle: "Session, profiles and device sync" },
  { id: "profiles", title: "Profiles", subtitle: "Active profile and scoped data" },
  { id: "appearance", title: "Appearance", subtitle: "Theme and interface presentation" },
  { id: "layout", title: "Home & layout", subtitle: "Catalog, hero and card behavior" },
  { id: "content", title: "Content & discovery", subtitle: "Sources, catalogs and metadata" },
  { id: "integrations", title: "Integrations", subtitle: "TMDB, MDBList, AnimeSkip and Debrid" },
  { id: "streams", title: "Stream presentation", subtitle: "Badges, provider identity and files" },
  { id: "playback", title: "Playback", subtitle: "Player, subtitles and episode behavior" },
  { id: "tracking", title: "Tracking", subtitle: "Trakt and synchronized watch state" },
  { id: "advanced", title: "Advanced", subtitle: "Torrent and diagnostic controls" },
  { id: "about", title: "About", subtitle: "Supporters, licenses and diagnostics" }
];

function toggle(store, key, title, subtitle, checked) {
  return `<label class="settings-row"><span><b>${title}</b><small>${subtitle}</small></span><input type="checkbox" data-store="${store}" data-key="${key}" ${checked ? "checked" : ""}></label>`;
}

function action(route, title, subtitle) {
  return `<button class="settings-row" data-route="${route}"><span><b>${title}</b><small>${subtitle}</small></span><i>›</i></button>`;
}

function localAction(actionName, title, subtitle) {
  return `<button class="settings-row" data-local-action="${actionName}"><span><b>${title}</b><small>${subtitle}</small></span><i>›</i></button>`;
}

function select(store, key, title, subtitle, value, options) {
  return `<label class="settings-row"><span><b>${title}</b><small>${subtitle}</small></span><select data-store="${store}" data-key="${key}">${options.map((option) => `<option value="${option.value}" ${String(option.value) === String(value) ? "selected" : ""}>${option.label}</option>`).join("")}</select></label>`;
}

function escapeAttribute(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function input(store, key, title, subtitle, value, options = {}) {
  const type = options.type || "text";
  const dataType = type === "number" ? ' data-value-type="number"' : "";
  const bounds = `${options.min !== undefined ? ` min="${options.min}"` : ""}${options.max !== undefined ? ` max="${options.max}"` : ""}`;
  return `<label class="settings-row"><span><b>${title}</b><small>${subtitle}</small></span><input type="${type}" data-store="${store}" data-key="${key}"${dataType}${bounds} value="${escapeAttribute(value)}" autocomplete="off"></label>`;
}

function content(section, model) {
  if (section === "account")
    return `${action("account", "Nuvio account", "Authentication and device session")}${action("profileSelection", "Profiles", "Active and profile-scoped state")}${localAction("remote", "Nuvio Remote", "Pair and approve a phone controller")}${action("syncCode", "Manual sync", "Configure a local sync code")}`;
  if (section === "profiles")
    return `${action("profileSelection", "Choose profile", "Switch, create or remove a local profile")}${action("experienceModeSelection", "Experience mode", "Essential or Advanced with a Home layout")}`;
  if (section === "appearance")
    return `<div class="setting-block"><h2>Accent color</h2><div class="color-options">${["#3b82f6", "#22d37c", "#e53935", "#8e24aa", "#e8a91c"].map((color) => `<button data-color="${color}" style="--swatch:${color}" aria-label="Use ${color}" ${model.theme.accentColor === color ? 'aria-current="true"' : ""}></button>`).join("")}</div></div>${select(
      "theme",
      "fontFamily",
      "Interface font",
      "Choose the body typeface",
      model.theme.fontFamily,
      [
        { value: "MANROPE", label: "Manrope" },
        { value: "SPACE_GROTESK", label: "Space Grotesk" },
        { value: "INTER", label: "Inter" },
        { value: "DM_SANS", label: "DM Sans" },
        { value: "OPEN_SANS", label: "Open Sans" }
      ]
    )}${toggle("theme", "amoledMode", "OLED black", "Use pure black for the canvas", model.theme.amoledMode)}${toggle("theme", "amoledSurfacesMode", "OLED surfaces", "Use pure black for elevated panels too", model.theme.amoledSurfacesMode)}`;
  if (section === "layout")
    return `${action("catalogOrder", "Catalog order", "Reorder and hide Home catalogs")}${select(
      "layout",
      "homeLayout",
      "Home layout",
      "Choose the catalog presentation",
      model.layout.homeLayout,
      [
        { value: "modern", label: "Modern" },
        { value: "classic", label: "Classic" }
      ]
    )}${select(
      "layout",
      "continueWatchingCardStyle",
      "Continue Watching cards",
      "Choose artwork treatment",
      model.layout.continueWatchingCardStyle,
      [
        { value: "card", label: "Card" },
        { value: "wide", label: "Wide" },
        { value: "poster", label: "Poster" }
      ]
    )}${select(
      "layout",
      "discoverLocation",
      "Explore placement",
      "Choose where discovery appears",
      model.layout.discoverLocation,
      [
        { value: "in_search", label: "Inside Search" },
        { value: "in_sidebar", label: "Navigation" },
        { value: "off", label: "Hidden" }
      ]
    )}${toggle("layout", "heroSectionEnabled", "Featured hero", "Show a featured title above catalogs", model.layout.heroSectionEnabled)}${toggle("layout", "modernHeroFullScreenBackdropEnabled", "Full-bleed hero", "Extend the hero artwork across the viewport", model.layout.modernHeroFullScreenBackdropEnabled)}${toggle("layout", "continueWatchingEnabled", "Continue watching", "Show in-progress titles on Home", model.layout.continueWatchingEnabled)}${toggle("layout", "modernLandscapePostersEnabled", "Landscape artwork", "Use wide art in supported modern rails", model.layout.modernLandscapePostersEnabled)}${toggle("layout", "posterLabelsEnabled", "Poster labels", "Show title and year below artwork", model.layout.posterLabelsEnabled)}${toggle("layout", "fastHorizontalNavigationEnabled", "Fast rail navigation", "Accelerate repeated horizontal input", model.layout.fastHorizontalNavigationEnabled)}${toggle("layout", "cardDepthEnabled", "Artwork depth", "Apply supported edge and sheen treatment", model.layout.cardDepthEnabled)}${toggle("layout", "hideUnreleasedContent", "Hide unreleased titles", "Filter future releases from catalogs", model.layout.hideUnreleasedContent)}`;
  if (section === "content")
    return `${action("plugins", "Sources", "Install, enable, refresh and remove sources")}${action("catalogOrder", "Catalog order", "Choose which catalogs appear on Home")}${action("discover", "Explore", "Browse configured catalogs and categories")}${toggle("tmdb", "enabled", "TMDB metadata", "Enrich supported title details", model.tmdb.enabled)}${toggle("mdbList", "enabled", "MDBList ratings", "Enable ratings when an API key is configured", model.mdbList.enabled)}${toggle("animeSkip", "enabled", "Anime skip data", "Use segments when a client ID is configured", model.animeSkip.enabled)}`;
  if (section === "playback")
    return `${select(
      "player",
      "streamAutoPlayMode",
      "Stream selection",
      "Choose whether playback starts automatically",
      model.player.streamAutoPlayMode,
      [
        { value: "MANUAL", label: "Manual" },
        { value: "FIRST_STREAM", label: "First stream" },
        { value: "REGEX_MATCH", label: "Matching stream" }
      ]
    )}${select(
      "player",
      "subtitleRenderMode",
      "Subtitle renderer",
      "Use native text tracks or the ASS renderer",
      model.player.subtitleRenderMode,
      [
        { value: "native", label: "Native" },
        { value: "ass", label: "ASS" }
      ]
    )}${input("player", "subtitleLanguage", "Subtitle language", "Preferred ISO language code or off", model.player.subtitleLanguage)}${input("player", "preferredAudioLanguage", "Audio language", "Preferred language code or system", model.player.preferredAudioLanguage)}${toggle("player", "autoplayNextEpisode", "Autoplay next episode", "Continue series playback automatically", model.player.autoplayNextEpisode)}${toggle("player", "postPlayRecommendationsEnabled", "Post-play recommendations", "Show suggestions near the end", model.player.postPlayRecommendationsEnabled)}${toggle("player", "skipIntroEnabled", "Skip intro", "Use available segment metadata", model.player.skipIntroEnabled)}${toggle("player", "loadingOverlayEnabled", "Loading overlay", "Show playback loading feedback", model.player.loadingOverlayEnabled)}${toggle("player", "pauseOverlayEnabled", "Pause overlay", "Show metadata while paused", model.player.pauseOverlayEnabled)}${toggle("player", "parentalGuideEnabled", "Parental guide", "Show content guidance in the player", model.player.parentalGuideEnabled)}${toggle("player", "stillWatchingEnabled", "Still watching check", "Confirm during extended series sessions", model.player.stillWatchingEnabled)}${toggle("player", "osdClockEnabled", "Player clock", "Show the current time in the HUD", model.player.osdClockEnabled)}`;
  if (section === "integrations")
    return `${action("trakt", "Trakt", "Authentication, progress and library source")}${action("tmdbEntityBrowse", "TMDB", "Metadata enrichment and browsing")}${toggle("debrid", "enabled", "Debrid", "Resolve supported links with connected providers", model.debrid.enabled)}${input("debrid", "realDebridApiKey", "Real-Debrid token", "Stored in the active profile", model.debrid.realDebridApiKey, { type: "password" })}${input("debrid", "premiumizeApiKey", "Premiumize token", "Stored in the active profile", model.debrid.premiumizeApiKey, { type: "password" })}${input("debrid", "torboxApiKey", "TorBox token", "Stored in the active profile", model.debrid.torboxApiKey, { type: "password" })}${toggle("tmdb", "enabled", "TMDB enrichment", "Use TMDB metadata where configured", model.tmdb.enabled)}${input("tmdb", "language", "TMDB language", "Language or language-region code", model.tmdb.language)}${toggle("mdbList", "enabled", "MDBList ratings", "Show configured rating sources", model.mdbList.enabled)}${input("mdbList", "apiKey", "MDBList API key", "Stored and synchronized with provider credentials", model.mdbList.apiKey, { type: "password" })}${toggle("animeSkip", "enabled", "AnimeSkip", "Use intro and outro segments", model.animeSkip.enabled)}${input("animeSkip", "clientId", "AnimeSkip client ID", "Stored and synchronized with provider credentials", model.animeSkip.clientId, { type: "password" })}`;
  if (section === "streams")
    return `${toggle("streamBadges", "showAddonLogo", "Source logos", "Show provider identity beside streams", model.streamBadges.showAddonLogo)}${toggle("streamBadges", "showFileSizeBadges", "File-size badges", "Show parsed file sizes", model.streamBadges.showFileSizeBadges)}${select(
      "streamBadges",
      "badgePlacement",
      "Badge placement",
      "Choose where badges appear",
      model.streamBadges.badgePlacement,
      [
        { value: "BOTTOM", label: "Bottom" },
        { value: "TOP", label: "Top" }
      ]
    )}${select(
      "debrid",
      "streamSortMode",
      "Sort order",
      "Order resolved Debrid results",
      model.debrid.streamSortMode,
      [
        { value: "DEFAULT", label: "Default" },
        { value: "QUALITY_DESC", label: "Highest quality" },
        { value: "SIZE_DESC", label: "Largest file" },
        { value: "SIZE_ASC", label: "Smallest file" }
      ]
    )}${select(
      "debrid",
      "streamMinimumQuality",
      "Minimum quality",
      "Filter prepared Debrid results",
      model.debrid.streamMinimumQuality,
      [
        { value: "ANY", label: "Any" },
        { value: "P720", label: "720p" },
        { value: "P1080", label: "1080p" },
        { value: "P2160", label: "2160p" }
      ]
    )}${input("debrid", "streamMaxResults", "Maximum results", "Zero keeps all available results", model.debrid.streamMaxResults, { type: "number", min: 0 })}${toggle("debrid", "cloudLibraryEnabled", "Debrid cloud library", "Include provider cloud files in Library", model.debrid.cloudLibraryEnabled)}${toggle("debrid", "enabled", "Direct Debrid", "Prepare supported Debrid sources", model.debrid.enabled)}`;
  if (section === "tracking")
    return `${action("trakt", "Trakt & tracking", "Connect providers and choose sync sources")}${select(
      "trakt",
      "watchProgressSource",
      "Watch progress source",
      "Choose synchronized playback progress",
      model.trakt.watchProgressSource,
      [
        { value: "trakt", label: "Trakt" },
        { value: "simkl", label: "SIMKL" },
        { value: "nuvio_sync", label: "Nuvio Sync" }
      ]
    )}${select(
      "trakt",
      "librarySourceMode",
      "Library source",
      "Choose the saved-title provider",
      model.trakt.librarySourceMode,
      [
        { value: "trakt", label: "Trakt" },
        { value: "simkl", label: "SIMKL" },
        { value: "local", label: "Local" }
      ]
    )}${select(
      "trakt",
      "moreLikeThisSource",
      "Recommendations",
      "Choose the related-title provider",
      model.trakt.moreLikeThisSource,
      [
        { value: "trakt", label: "Trakt" },
        { value: "tmdb", label: "TMDB" }
      ]
    )}${input("trakt", "continueWatchingDaysCap", "Continue Watching window", "Days to retain; zero means all", model.trakt.continueWatchingDaysCap, { type: "number", min: 0, max: 365 })}${toggle("trakt", "showMetaComments", "Show comments", "Include provider comments in supported details", model.trakt.showMetaComments)}`;
  if (section === "advanced")
    return `${toggle("torrent", "p2pEnabled", "Peer-to-peer playback", "Allow torrent playback through the existing runtime", model.torrent.p2pEnabled)}${toggle("torrent", "enableUpload", "Torrent upload", "Upload pieces while peer playback is active", model.torrent.enableUpload)}${toggle("torrent", "hideTorrentStats", "Hide torrent statistics", "Keep peer statistics out of the HUD", model.torrent.hideTorrentStats)}${action("debugConsole", "Runtime diagnostics", "Inspect platform and storage state")}`;
  return `${action("supportersContributors", "Supporters & contributors", "People who make Nuvio possible")}${action("licensesAttributions", "Licenses & attributions", "Open-source notices")}${action("debugConsole", "Diagnostics", "Internal runtime console")}`;
}

export const SettingsScreen = {
  async mount({ outlet, router, params }) {
    let active = params.section || "account";
    const render = () => {
      const model = loadSettings();
      outlet.className = "page-host settings-page";
      outlet.innerHTML = `<aside class="settings-nav"><p>NUVIO</p><h1>Settings</h1>${sections.map((section) => `<button data-section="${section.id}" ${active === section.id ? 'aria-current="true"' : ""}><b>${section.title}</b><small>${section.subtitle}</small></button>`).join("")}</aside><section class="settings-content"><header><p>${sections.find((section) => section.id === active)?.subtitle || ""}</p><h2>${sections.find((section) => section.id === active)?.title || "Settings"}</h2></header><div class="settings-list">${content(active, model)}</div></section>`;
    };
    render();
    outlet.addEventListener("click", (event) => {
      const section = event.target.closest("[data-section]")?.dataset.section;
      if (section) {
        active = section;
        render();
        history.replaceState(
          { route: "settings", params: { section } },
          "",
          `#/settings?section=${section}`
        );
        return;
      }
      const route = event.target.closest("[data-route]")?.dataset.route;
      if (route) return router.navigate(route);
      if (event.target.closest('[data-local-action="remote"]')) {
        openRemotePairingDialog();
        return;
      }
      const color = event.target.closest("[data-color]")?.dataset.color;
      if (color) {
        updateSetting("theme", "accentColor", color);
        render();
      }
    });
    outlet.addEventListener("change", (event) => {
      const input = event.target.closest("[data-store][data-key]");
      if (!input) return;
      updateSetting(
        input.dataset.store,
        input.dataset.key,
        input.type === "checkbox"
          ? input.checked
          : input.dataset.valueType === "number"
            ? Number(input.value)
            : input.value
      );
    });
  }
};
