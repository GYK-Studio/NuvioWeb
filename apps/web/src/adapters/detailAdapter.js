import { metaRepository } from "../../../../js/data/repository/metaRepository.js";
import { libraryRepository } from "../../../../js/data/repository/libraryRepository.js";
import { TmdbService } from "../../../../js/core/tmdb/tmdbService.js";
import { TmdbMetadataService } from "../../../../js/core/tmdb/tmdbMetadataService.js";
import { TmdbSettingsStore } from "../../../../js/data/local/tmdbSettingsStore.js";

async function loadMetaThroughWebProxy(addonBaseUrl, itemType, itemId) {
  const url = metaRepository.buildMetaUrl(addonBaseUrl, itemType || "movie", itemId);
  const response = await fetch("/api/providers/fetch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, method: "GET", headers: {} })
  });
  if (!response.ok) return null;
  const envelope = await response.json();
  if (!envelope?.ok || !envelope.body) return null;
  const payload = JSON.parse(envelope.body);
  return metaRepository.mapMeta(payload?.meta || null);
}

async function enrichWithTmdb(item, fallbackType) {
  const settings = TmdbSettingsStore.get();
  if (!settings.enabled || !item?.id) return item;
  try {
    const contentType = item.type || fallbackType || "movie";
    const tmdbId = await TmdbService.ensureTmdbId(item.id, contentType);
    if (!tmdbId) return item;
    const enrichment = await TmdbMetadataService.fetchEnrichment({
      tmdbId,
      contentType,
      language: settings.language
    });
    if (!enrichment) return item;

    let videos = item.videos;
    if (settings.useEpisodes && Array.isArray(videos) && videos.length) {
      const episodeMap = await TmdbMetadataService.fetchEpisodeEnrichment({
        tmdbId,
        seasonNumbers: videos.map((video) => Number(video?.season || 0)).filter(Boolean),
        language: settings.language
      });
      if (episodeMap?.size) {
        videos = videos.map((video) => {
          const episode = episodeMap.get(
            `${Number(video.season || 0)}:${Number(video.episode || 0)}`
          );
          return episode
            ? {
                ...video,
                title: episode.title || video.title,
                overview: episode.overview || video.overview,
                thumbnail: episode.thumbnail || video.thumbnail,
                runtime: episode.runtime || video.runtime,
                released: settings.useReleaseDates
                  ? episode.airDate || video.released
                  : video.released
              }
            : video;
        });
      }
    }

    return {
      ...item,
      name: settings.useBasicInfo ? enrichment.localizedTitle || item.name : item.name,
      description: settings.useBasicInfo
        ? enrichment.description || item.description
        : item.description,
      background: settings.useArtwork ? enrichment.backdrop || item.background : item.background,
      poster: settings.useArtwork ? enrichment.poster || item.poster : item.poster,
      logo: settings.useArtwork ? enrichment.logo || item.logo : item.logo,
      genres: settings.useBasicInfo
        ? [...new Set([...(item.genres || []), ...(enrichment.genres || [])])]
        : item.genres,
      releaseInfo: settings.useReleaseDates
        ? enrichment.releaseInfo || item.releaseInfo
        : item.releaseInfo,
      runtime: settings.useDetails ? enrichment.runtime || item.runtime : item.runtime,
      ageRating: settings.useDetails ? enrichment.ageRating || item.ageRating : item.ageRating,
      country: settings.useDetails ? enrichment.country || item.country : item.country,
      language: settings.useDetails ? enrichment.language || item.language : item.language,
      tmdbRating:
        settings.useBasicInfo && Number.isFinite(enrichment.rating)
          ? Number(enrichment.rating.toFixed(1))
          : item.tmdbRating,
      credits: settings.useCredits ? enrichment.credits || item.credits : item.credits,
      companies: settings.useProductions ? enrichment.companies || item.companies : item.companies,
      networks: settings.useNetworks ? enrichment.networks || item.networks : item.networks,
      trailers:
        item.trailers?.length || !settings.useTrailers
          ? item.trailers || []
          : enrichment.trailers || [],
      collectionId: settings.useCollections
        ? enrichment.collectionId || item.collectionId
        : item.collectionId,
      collectionName: settings.useCollections
        ? enrichment.collectionName || item.collectionName
        : item.collectionName,
      tmdbId,
      videos
    };
  } catch (error) {
    console.warn("apps/web TMDB detail enrichment failed", error);
    return item;
  }
}

export async function loadDetail({ itemId, itemType, addonBaseUrl }) {
  let result = addonBaseUrl
    ? await metaRepository.getMeta(addonBaseUrl, itemType || "movie", itemId)
    : null;
  if (result?.status !== "success" && addonBaseUrl) {
    const item = await loadMetaThroughWebProxy(addonBaseUrl, itemType, itemId).catch(() => null);
    if (item) result = { status: "success", data: item };
  }
  if (result?.status !== "success") {
    result = await metaRepository.getMetaFromAllAddons(itemType || "movie", itemId);
  }
  if (result?.status !== "success") throw new Error(result?.message || "Metadata unavailable");
  const item = await enrichWithTmdb(result.data, itemType);
  const membership = await libraryRepository
    .getMembershipSnapshot(item)
    .catch(() => ({ listMembership: {} }));
  return { item, saved: Object.values(membership?.listMembership || {}).some(Boolean) };
}

export async function toggleDetailSaved(item) {
  return libraryRepository.toggleDefault(item);
}
