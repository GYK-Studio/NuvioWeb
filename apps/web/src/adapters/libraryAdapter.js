import { libraryRepository } from "../../../../js/data/repository/libraryRepository.js";
import { LibraryPreferencesStore } from "../../../../js/data/local/libraryPreferencesStore.js";
import { DebridSettingsStore } from "../../../../js/data/local/debridSettingsStore.js";
import { cloudLibraryRepository } from "../../../../js/data/repository/cloudLibraryRepository.js";
import { playableCloudFiles } from "../../../../js/core/cloud/cloudLibraryModels.js";
import {
  CloudLibraryPlaybackProgressStore,
  CloudLibraryPlaybackSessionStore
} from "../../../../js/data/local/cloudLibraryPlaybackStore.js";

export async function loadLibrary() {
  const sourceMode = await libraryRepository.getSourceMode();
  const [items, tabs] = await Promise.all([
    libraryRepository.getItems({ sourceMode }),
    libraryRepository.getListTabs({ sourceMode })
  ]);
  return { sourceMode, items, tabs };
}

export async function removeLibraryItem(item) {
  return libraryRepository.toggleDefault(item);
}

export const getLastLibraryTab = () => LibraryPreferencesStore.getLastSelectedListKey();
export const setLastLibraryTab = (key) => LibraryPreferencesStore.setLastSelectedListKey(key);

export const isCloudLibraryEnabled = () => DebridSettingsStore.get().cloudLibraryEnabled === true;

export async function loadCloudLibrary() {
  return cloudLibraryRepository.refresh();
}

export async function prepareCloudPlayback(item, file) {
  const result = await cloudLibraryRepository.resolvePlayback(item, file);
  if (result?.status !== "success" || !result.url) {
    const messages = {
      disabled: "Enable Cloud Library in Settings.",
      missingCredentials: "Connect a compatible Debrid provider in Settings.",
      notPlayable: "This file is not playable."
    };
    throw new Error(
      result?.message || messages[result?.status] || "Could not play this cloud file."
    );
  }
  const playable = playableCloudFiles(item);
  const sequenceIndex = Math.max(
    0,
    playable.findIndex((candidate) => candidate.stableKey === file.stableKey)
  );
  const cloudSessionToken = CloudLibraryPlaybackSessionStore.create({
    item,
    currentFileKey: file.stableKey
  });
  const resume = CloudLibraryPlaybackProgressStore.getResume(item, file);
  const filename = result.filename || file.name || item.name;
  const stream = {
    url: result.url,
    name: filename,
    title: filename,
    description: item.name,
    addonName: item.providerName,
    qualityLabel: "Cloud",
    behaviorHints: {
      filename,
      videoSize: result.videoSizeBytes || file.sizeBytes || null
    }
  };
  return {
    stream,
    context: {
      itemId: item.stableKey,
      itemType: "cloud",
      videoId: `${item.stableKey}:${file.stableKey}`,
      title: filename,
      episodeTitle: filename,
      season: 1,
      episode: sequenceIndex + 1,
      cloudSessionToken,
      resumePositionMs: resume?.positionMs || 0,
      resumeDurationMs: resume?.durationMs || 0,
      returnToLibraryOnBack: true
    }
  };
}
