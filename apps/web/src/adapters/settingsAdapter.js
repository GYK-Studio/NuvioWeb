import { ThemeStore } from "../../../../js/data/local/themeStore.js";
import { LayoutPreferences } from "../../../../js/data/local/layoutPreferences.js";
import { PlayerSettingsStore } from "../../../../js/data/local/playerSettingsStore.js";
import { TraktSettingsStore } from "../../../../js/data/local/traktSettingsStore.js";
import { TmdbSettingsStore } from "../../../../js/data/local/tmdbSettingsStore.js";
import { DebridSettingsStore } from "../../../../js/data/local/debridSettingsStore.js";
import { MdbListSettingsStore } from "../../../../js/data/local/mdbListSettingsStore.js";
import { AnimeSkipSettingsStore } from "../../../../js/data/local/animeSkipSettingsStore.js";
import { StreamBadgeSettingsStore } from "../../../../js/data/local/streamBadgeSettingsStore.js";
import { TorrentSettingsStore } from "../../../../js/data/local/torrentSettingsStore.js";
import { applyThemePreferences } from "./themeAdapter.js";

const stores = {
  theme: ThemeStore,
  layout: LayoutPreferences,
  player: PlayerSettingsStore,
  trakt: TraktSettingsStore,
  tmdb: TmdbSettingsStore,
  debrid: DebridSettingsStore,
  mdbList: MdbListSettingsStore,
  animeSkip: AnimeSkipSettingsStore,
  streamBadges: StreamBadgeSettingsStore,
  torrent: TorrentSettingsStore
};

export function loadSettings() {
  return Object.fromEntries(Object.entries(stores).map(([key, store]) => [key, store.get()]));
}

export function updateSetting(storeName, key, value) {
  const store = stores[storeName];
  if (!store) return;
  store.set({ [key]: value });
  if (storeName === "theme") applyThemePreferences();
}
