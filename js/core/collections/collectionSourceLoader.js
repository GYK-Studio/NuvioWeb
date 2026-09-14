import { TMDB_API_KEY, TRAKT_API_URL, TRAKT_CLIENT_ID } from "../../config.js";
import { catalogSkipStep, catalogSupportsExtra } from "../addons/homeCatalogs.js";
import { TmdbMetadataService } from "../tmdb/tmdbMetadataService.js";
import { toTraktImageUrl } from "../trakt/traktImageUrl.js";
import { addonRepository } from "../../data/repository/addonRepository.js";
import { catalogRepository } from "../../data/repository/catalogRepository.js";
import { TmdbSettingsStore } from "../../data/local/tmdbSettingsStore.js";

const TMDB_API_URL = "https://api.themoviedb.org/3";
const TRAKT_PAGE_SIZE = 50;

function text(...values) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function normalizeType(value) {
  return ["tv", "series", "show"].includes(String(value || "").toLowerCase()) ? "series" : "movie";
}

function normalizeItem(item = {}, fallbackType = "movie") {
  const type = normalizeType(item.type || item.apiType || fallbackType);
  return {
    ...item,
    id: text(item.id),
    type,
    apiType: type,
    name: text(item.name, item.title, item.id),
    poster: text(item.poster, item.thumbnail, item.background, item.backdrop),
    background: text(item.background, item.backdrop, item.backdropUrl, item.poster),
    releaseInfo: text(item.releaseInfo, item.released, item.releaseDate, item.year),
    description: text(item.description, item.overview, item.plot)
  };
}

function sameAddonUrl(left = "", right = "") {
  if (!left || !right) return false;
  return addonRepository.canonicalizeUrl(left) === addonRepository.canonicalizeUrl(right);
}

async function loadAddonSource(source, page, skipOverride, signal) {
  const addons = await addonRepository.getInstalledAddons();
  const catalogId = String(source.catalogId || "");
  const baseCatalogId = catalogId.split(",")[0].trim();
  const sourceType = String(source.type || source.apiType || "movie");
  let addon =
    addons.find((candidate) => String(candidate.id || "") === String(source.addonId || "")) ||
    addons.find((candidate) => sameAddonUrl(candidate.baseUrl, source.addonBaseUrl));
  const findCatalog = (candidate) =>
    candidate?.catalogs?.find(
      (catalog) =>
        [catalogId, baseCatalogId].includes(String(catalog.id || "")) &&
        String(catalog.apiType || "") === sourceType
    );
  let catalog = findCatalog(addon);
  if (!catalog) {
    addon = addons.find((candidate) => findCatalog(candidate));
    catalog = findCatalog(addon);
  }
  const addonBaseUrl = text(addon?.baseUrl, source.addonBaseUrl);
  if (!addonBaseUrl) throw new Error("Addon not found");
  const supportsSkip = catalogSupportsExtra(catalog, "skip");
  const skipStep = catalogSkipStep(catalog);
  const skip = Number.isFinite(Number(skipOverride))
    ? Math.max(0, Math.trunc(Number(skipOverride)))
    : Math.max(0, (page - 1) * skipStep);
  const result = await catalogRepository.getCatalog({
    addonBaseUrl,
    addonId: text(addon?.id, source.addonId, addonBaseUrl),
    addonName: text(addon?.displayName, addon?.name, source.addonName, "Source"),
    catalogId,
    catalogName: text(source.catalogName, source.title, catalog?.name, catalogId),
    type: sourceType,
    skip,
    skipStep,
    supportsSkip,
    extraArgs: source.genre ? { genre: source.genre } : {},
    signal
  });
  if (result?.status !== "success") throw new Error(result?.message || "Catalog unavailable");
  const items = (result.data?.items || [])
    .map((item) => normalizeItem(item, sourceType))
    .filter((item) => item.id);
  return {
    items,
    page,
    hasMore: Boolean(result.data?.hasMore),
    nextSkip: Number.isFinite(Number(result.data?.nextSkip))
      ? Number(result.data.nextSkip)
      : skip + items.length
  };
}

function setFilter(params, key, value) {
  if (value !== null && value !== undefined && value !== "") params.set(key, String(value));
}

function applyTmdbFilters(params, filters = {}, mediaType) {
  const isTv = mediaType === "tv";
  setFilter(params, "with_genres", filters.withGenres);
  setFilter(params, "without_genres", filters.withoutGenres);
  setFilter(
    params,
    isTv ? "first_air_date.gte" : "primary_release_date.gte",
    filters.releaseDateGte
  );
  setFilter(
    params,
    isTv ? "first_air_date.lte" : "primary_release_date.lte",
    filters.releaseDateLte
  );
  setFilter(params, "vote_average.gte", filters.voteAverageGte);
  setFilter(params, "vote_average.lte", filters.voteAverageLte);
  setFilter(params, "vote_count.gte", filters.voteCountGte);
  setFilter(params, "with_original_language", filters.withOriginalLanguage);
  setFilter(params, "with_origin_country", filters.withOriginCountry);
  setFilter(params, "with_keywords", filters.withKeywords);
  setFilter(params, "without_keywords", filters.withoutKeywords);
  setFilter(params, "with_companies", filters.withCompanies);
  setFilter(params, "without_companies", filters.withoutCompanies);
  if (isTv) setFilter(params, "with_networks", filters.withNetworks);
  if (Number(filters.year) > 0)
    params.set(isTv ? "first_air_date_year" : "year", String(Math.trunc(Number(filters.year))));
  if (filters.withWatchProviders || filters.withoutWatchProviders) {
    setFilter(params, "watch_region", filters.watchRegion || "US");
  }
  setFilter(params, "with_watch_providers", filters.withWatchProviders);
  setFilter(params, "without_watch_providers", filters.withoutWatchProviders);
  if (filters.withWatchProviders)
    params.set("with_watch_monetization_types", "flatrate|free|ads|rent|buy");
}

function tmdbItem(item = {}, fallbackType = "movie") {
  const mediaType =
    String(item.media_type || fallbackType).toLowerCase() === "tv" ? "series" : "movie";
  const name = text(item.title, item.name, item.original_title, item.original_name);
  if (!item.id || !name) return null;
  return normalizeItem(
    {
      id: `tmdb:${item.id}`,
      type: mediaType,
      name,
      poster: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : "",
      background: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : "",
      releaseInfo: String(item.release_date || item.first_air_date || "").slice(0, 4),
      description: item.overview,
      rating: item.vote_average,
      tmdbId: String(item.id)
    },
    mediaType
  );
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || payload?.error || response.statusText);
  return { response, payload };
}

async function loadTmdbSource(source, page, signal) {
  const settings = TmdbSettingsStore.get();
  const apiKey = settings.enabled ? String(TMDB_API_KEY || "").trim() : "";
  if (!apiKey) throw new Error("TMDB is not configured");
  const language = String(settings.language || "en-US");
  const sourceType = String(source.tmdbSourceType || "").toUpperCase();
  const mediaType =
    sourceType === "NETWORK" || String(source.mediaType).toUpperCase() === "TV" ? "tv" : "movie";
  if (sourceType === "COLLECTION") {
    const items = await TmdbMetadataService.fetchMovieCollection({
      collectionId: source.tmdbId,
      language
    });
    return { items: items.map((item) => normalizeItem(item, "movie")), page: 1, hasMore: false };
  }
  let endpoint = "";
  if (sourceType === "LIST") endpoint = `/list/${encodeURIComponent(source.tmdbId)}`;
  else if (["PERSON", "DIRECTOR"].includes(sourceType))
    endpoint = `/person/${encodeURIComponent(source.tmdbId)}/combined_credits`;
  if (endpoint) {
    const url = `${TMDB_API_URL}${endpoint}?api_key=${encodeURIComponent(apiKey)}&language=${encodeURIComponent(language)}&page=${page}`;
    const { payload } = await fetchJson(url, { signal });
    const raw =
      sourceType === "DIRECTOR"
        ? (payload?.crew || []).filter(
            (item) => String(item.job || "").toLowerCase() === "director"
          )
        : sourceType === "PERSON"
          ? payload?.cast || []
          : payload?.items || [];
    return {
      items: raw.map((item) => tmdbItem(item, mediaType)).filter(Boolean),
      page: Number(payload?.page || page),
      hasMore:
        sourceType === "LIST" &&
        Number(payload?.page || page) < Number(payload?.total_pages || page)
    };
  }
  const params = new URLSearchParams({
    api_key: apiKey,
    language,
    page: String(page),
    sort_by: String(
      source.sortBy || (mediaType === "tv" ? "first_air_date.desc" : "popularity.desc")
    )
  });
  applyTmdbFilters(params, source.filters, mediaType);
  if (sourceType === "COMPANY") params.set("with_companies", String(source.tmdbId));
  if (sourceType === "NETWORK") params.set("with_networks", String(source.tmdbId));
  const { payload } = await fetchJson(`${TMDB_API_URL}/discover/${mediaType}?${params}`, {
    signal
  });
  return {
    items: (payload?.results || []).map((item) => tmdbItem(item, mediaType)).filter(Boolean),
    page: Number(payload?.page || page),
    hasMore: Number(payload?.page || page) < Number(payload?.total_pages || page)
  };
}

function traktImage(images = {}, ...keys) {
  return (
    keys
      .map((key) =>
        toTraktImageUrl(images?.[key]?.full || images?.[key]?.medium || images?.[key] || "")
      )
      .find(Boolean) || ""
  );
}

function traktItem(entity = {}, kind = "movie") {
  const ids = entity.ids || {};
  const id = text(ids.imdb, ids.slug && `${kind}:${ids.slug}`, ids.trakt && `trakt:${ids.trakt}`);
  if (!id) return null;
  return normalizeItem({
    id,
    type: kind === "show" ? "series" : "movie",
    name: text(entity.title, entity.name),
    poster: traktImage(entity.images, "poster", "posters", "fanart"),
    background: traktImage(entity.images, "fanart", "background", "backdrop", "banner"),
    releaseInfo: String(entity.year || entity.released || entity.first_aired || "").slice(0, 4)
  });
}

async function loadTraktSource(source, page, signal) {
  if (!TRAKT_CLIENT_ID) throw new Error("Trakt is not configured");
  const kind = String(source.mediaType).toUpperCase() === "TV" ? "show" : "movie";
  const url = new URL(
    `${String(TRAKT_API_URL).replace(/\/+$/, "")}/lists/${encodeURIComponent(source.traktListId)}/items/${kind}`
  );
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(TRAKT_PAGE_SIZE));
  url.searchParams.set("sort_by", String(source.sortBy || "rank"));
  url.searchParams.set("sort_how", String(source.sortHow || "asc"));
  const { response, payload } = await fetchJson(url, {
    signal,
    headers: {
      "Content-Type": "application/json",
      "trakt-api-version": "2",
      "trakt-api-key": TRAKT_CLIENT_ID
    }
  });
  const items = (Array.isArray(payload) ? payload : [])
    .map((entry) => traktItem(kind === "show" ? entry.show : entry.movie, kind))
    .filter(Boolean);
  const pageCount = Number(response.headers.get("X-Pagination-Page-Count") || page);
  return { items, page, hasMore: page < pageCount && items.length > 0 };
}

export async function loadCollectionSourcePage(source = {}, options = {}) {
  const page = Math.max(1, Number(options.page || 1));
  const provider = String(source.provider || "addon").toLowerCase();
  if (provider === "tmdb") return loadTmdbSource(source, page, options.signal);
  if (provider === "trakt") return loadTraktSource(source, page, options.signal);
  return loadAddonSource(source, page, options.skip, options.signal);
}
