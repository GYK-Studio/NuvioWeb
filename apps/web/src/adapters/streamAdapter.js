import { streamRepository } from "../../../../js/data/repository/streamRepository.js";
import { orderStreamsByAddonOrder } from "../../../../js/core/streams/streamOrdering.js";
import { DirectDebridResolver } from "../../../../js/core/debrid/directDebridResolver.js";
import {
  DirectDebridStreamPreparer,
  directDebridPreparationKey
} from "../../../../js/core/debrid/directDebridStreamPreparer.js";
import { PlayerSettingsStore } from "../../../../js/data/local/playerSettingsStore.js";
import { addonRepository } from "../../../../js/data/repository/addonRepository.js";

function streamLabel(stream) {
  return String(stream.title || stream.name || stream.description || "Available stream").trim();
}

function qualityFrom(stream) {
  const text = `${stream.quality || ""} ${streamLabel(stream)}`.toLowerCase();
  if (/2160|4k/.test(text)) return "4K";
  if (/1080/.test(text)) return "1080p";
  if (/720/.test(text)) return "720p";
  if (/480/.test(text)) return "480p";
  return stream.quality || "Auto";
}

export function normalizeStreamGroups(groups = []) {
  const flattened = groups.flatMap((group) =>
    (group.streams || []).map((stream) => ({
      ...stream,
      addonName: stream.addonName || group.addonName || "Source",
      addonLogo: stream.addonLogo || group.addonLogo || ""
    }))
  );
  return orderStreamsByAddonOrder(flattened).map((stream, index) => ({
    ...stream,
    key: String(index),
    label: streamLabel(stream),
    qualityLabel: qualityFrom(stream)
  }));
}

export async function prepareStreams(streams, params, onPrepared) {
  const installedAddonNames = new Set(
    (addonRepository.getCachedInstalledAddons?.() || [])
      .map((addon) => String(addon?.displayName || addon?.name || "").trim())
      .filter(Boolean)
  );
  return DirectDebridStreamPreparer.prepare(streams, {
    season: params.season == null ? null : Number(params.season),
    episode: params.episode == null ? null : Number(params.episode),
    playerSettings: PlayerSettingsStore.get(),
    installedAddonNames,
    onPrepared
  });
}

export function replacePreparedStream(streams, original, prepared) {
  const key = directDebridPreparationKey(original);
  return streams.map((stream) =>
    directDebridPreparationKey(stream) === key
      ? {
          ...stream,
          ...prepared,
          addonName: stream.addonName,
          addonLogo: stream.addonLogo,
          key: stream.key,
          label: stream.label,
          qualityLabel: stream.qualityLabel
        }
      : stream
  );
}

export async function resolveStreamForPlayback(stream, params = {}) {
  if (playbackUrlForStream(stream)) return stream;
  const context = {
    season: params.season == null ? null : Number(params.season),
    episode: params.episode == null ? null : Number(params.episode)
  };
  const cached = DirectDebridResolver.cachedPlayableStream(stream, context);
  if (cached) return cached;
  if (!DirectDebridResolver.canResolveStream(stream, context)) {
    throw new Error("This source needs a configured Debrid provider before it can play.");
  }
  const result = await DirectDebridResolver.resolve(stream, context);
  if (result?.status === "success" && playbackUrlForStream(result.stream)) return result.stream;
  const messages = {
    not_cached: "This torrent is not cached by the selected Debrid provider.",
    missing_api_key: "The selected Debrid provider needs an API key.",
    service_degraded: "The selected Debrid provider is temporarily unavailable.",
    disabled: "Enable Debrid in Settings to prepare this stream."
  };
  throw new Error(
    messages[result?.status] || result?.detail || "This stream could not be prepared."
  );
}

export async function loadStreams(params, { signal, onUpdate } = {}) {
  const result = await streamRepository.getStreamsFromAllAddons(
    params.itemType || "movie",
    params.videoId || params.itemId,
    {
      signal,
      itemId: params.itemId,
      season: params.season,
      episode: params.episode,
      onResult: (next) => {
        if (next?.status === "success") onUpdate?.(normalizeStreamGroups(next.data));
      }
    }
  );
  if (result?.status !== "success") throw new Error(result?.message || "Stream search failed");
  return normalizeStreamGroups(result.data);
}

export function playbackUrlForStream(stream) {
  if (stream.url) return stream.url;
  if (stream.ytId) return `https://www.youtube.com/watch?v=${stream.ytId}`;
  return stream.externalUrl || "";
}
