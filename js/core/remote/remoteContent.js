import { Router } from "../../ui/navigation/router.js";
import { PlayerController } from "../player/playerController.js";

const text = (value) =>
  String(value || "")
    .replace(/https?:\/\/\S+/g, "[enlace]")
    .slice(0, 80);
const artwork = (value) =>
  typeof value === "string" &&
  value.length <= 256 &&
  /^https:\/\/image\.tmdb\.org\/t\/p\/[a-zA-Z0-9/_.%-]+$/.test(value)
    ? value
    : undefined;
export class RemoteContent {
  constructor() {
    this.scope = "";
    this.actions = new Map();
    this.keys = new Map();
    this.page = 0;
    this.season = null;
  }
  bind(id, action) {
    let key = this.keys.get(id);
    if (!key) {
      key = crypto.randomUUID();
      this.keys.set(id, key);
    }
    this.actions.set(key, action);
    return key;
  }
  reset() {
    this.scope = "";
    this.actions.clear();
    this.keys.clear();
    this.page = 0;
    this.season = null;
  }
  snapshot() {
    const route = Router.getCurrent(),
      screen = Router.getCurrentScreen();
    const scope = `${route}|${screen?.params?.itemId || ""}|${screen?.query || ""}|${route === "player" ? PlayerController.video?.currentSrc || "" : ""}`;
    if (scope !== this.scope) {
      this.reset();
      this.scope = scope;
    }
    this.actions.clear();
    let title = "Nuvio Web",
      items = [];
    let seasons = [];
    if (["search", "home", "library", "discover"].includes(route)) {
      title =
        route === "search"
          ? `Resultados: ${screen.query || ""}`
          : route === "home"
            ? "Inicio"
            : route === "discover"
              ? "Descubrir"
              : "Mi biblioteca";
      items = (
        ["library", "discover"].includes(route)
          ? screen.items || []
          : (screen.rows || []).flatMap((row) => row.items || [])
      )
        .slice(0, 500)
        .map((item) => ({
          id: `${item.addonId}:${item.type}:${item.id}`,
          label: item.name || item.title,
          detail: item.releaseInfo || item.year || item.type,
          thumbnail: artwork(item.poster || item.posterUrl),
          mediaType: item.type,
          year: item.releaseInfo || item.year,
          action: () =>
            Router.navigate("detail", {
              itemId: item.id,
              itemType: item.type || "movie",
              fallbackTitle: item.name || item.title,
              addonBaseUrl: item.addonBaseUrl,
              addonId: item.addonId,
              addonName: item.addonName,
              returnToSearchOnBack: route === "search"
            })
        }));
    } else if (route === "detail") {
      title = screen.meta?.name || screen.params?.fallbackTitle || "Detalle";
      seasons = [
        ...new Set(
          (screen.episodes || []).map((e) => Number(e.season)).filter(Number.isSafeInteger)
        )
      ].sort((a, b) => a - b);
      items = (screen.episodes || [])
        .filter((e) => this.season === null || Number(e.season) === this.season)
        .map((episode) => ({
          id: episode.id,
          label: `T${episode.season} E${episode.episode} · ${episode.title || ""}`,
          detail: "Elegir fuente",
          action: () => screen.openEpisodeStreamChooser(episode.id, { manualSelection: true })
        }));
      if (!items.length && screen.meta)
        items = [
          {
            id: "movie",
            label: "Elegir fuente",
            detail: "Reproducir en la web",
            action: () => screen.playDefaultFromHero({ manualSelection: true })
          }
        ];
    } else if (route === "stream") {
      title = "Fuentes disponibles";
      items = (
        typeof screen.getFilteredStreams === "function"
          ? screen.getFilteredStreams()
          : screen.streams || []
      )
        .filter((stream) => stream.id && stream.url)
        .map((stream) => ({
          id: stream.id,
          label: stream.name || stream.addonName || "Fuente",
          detail: stream.title || stream.description || "Reproducir",
          action: async () => {
            const current =
              typeof screen.getFilteredStreams === "function"
                ? screen.getFilteredStreams()
                : screen.streams || [];
            if (!current.some((item) => item.id === stream.id && item.url))
              throw Error("NO_SOURCE");
            await screen.playStream(stream.id);
            const until = Date.now() + 5000;
            while (Date.now() < until) {
              const video = PlayerController.video;
              if (video?.error) throw Error("PLAYBACK_FAILED");
              if (Router.getCurrent() === "player" && video?.readyState >= 3 && !video.paused)
                return;
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
            throw Error("PLAYBACK_FAILED");
          }
        }));
    }
    if (route === "discover" && screen.hasMore && !screen.loading)
      items.push({
        id: "load-more",
        label: "Cargar más títulos",
        detail: "Siguiente página del catálogo",
        action: () => screen.loadNextPage({ preserveViewport: true })
      });
    const pageCount = Math.max(1, Math.ceil(items.length / 12));
    this.page = Math.min(this.page, pageCount - 1);
    const rows = items.slice(this.page * 12, this.page * 12 + 12).map((item) => ({
      key: this.bind(String(item.id), item.action),
      label: text(item.label),
      detail: text(item.detail),
      thumbnail: item.thumbnail,
      mediaType: ["movie", "series", "tv"].includes(item.mediaType) ? item.mediaType : "",
      year: String(item.year || "").match(/\b\d{4}\b/)?.[0] || ""
    }));
    const tracks = [];
    if (route === "player") {
      const p = PlayerController;
      const unifiedTracks =
        typeof screen.getAudioEntries === "function" &&
        typeof screen.collectSubtitleOptionItems === "function";
      const selectAndConfirm = async (apply, selected) => {
        apply();
        const until = Date.now() + 5000;
        while (Date.now() < until) {
          if (Router.getCurrent() !== "player") throw Error("STALE_STATE");
          if (selected()) return;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw Error("PLAYBACK_FAILED");
      };
      const add = (kind, list, selected, apply) =>
        list.slice(0, 32).forEach((track, index) =>
          tracks.push({
            key: this.bind(`${kind}:${index}`, () => {
              if (apply(index) === false) throw Error("UNSUPPORTED_CAPABILITY");
            }),
            label: text(
              track.label || track.name || track.lang || track.language || `Pista ${index + 1}`
            ),
            kind,
            selected: index === selected
          })
        );
      if (unifiedTracks) {
        screen
          .getAudioEntries()
          .slice(0, 8)
          .forEach((entry, index) => {
            if (entry.supported === false || entry.disabled) return;
            tracks.push({
              key: this.bind(`audio:${entry.id}`, () =>
                selectAndConfirm(
                  () => screen.applyAudioTrack(index, { rememberSelection: true }),
                  () =>
                    screen
                      .getAudioEntries()
                      .some((current) => current.id === entry.id && current.selected)
                )
              ),
              label: text(entry.label),
              kind: "audio",
              selected: Boolean(entry.selected)
            });
          });
        screen
          .collectSubtitleOptionItems()
          .filter((option) => !option.disabled && option.entry)
          .slice(0, 16)
          .forEach((option) => {
            tracks.push({
              key: this.bind(`subtitle:${option.id}`, () =>
                selectAndConfirm(
                  () => screen.applySubtitleEntry(option.entry),
                  () =>
                    screen
                      .collectSubtitleOptionItems()
                      .some((current) => current.id === option.id && current.selected)
                )
              ),
              label: text(option.title || option.languageLabel),
              kind: "subtitle",
              selected: Boolean(option.selected)
            });
          });
      } else if (p.hlsInstance) {
        add("audio", p.getHlsAudioTracks(), p.getSelectedHlsAudioTrackIndex(), (i) =>
          p.setHlsAudioTrack(i)
        );
        add("subtitle", p.getHlsSubtitleTracks(), p.getSelectedHlsSubtitleTrackIndex(), (i) =>
          p.setHlsSubtitleTrack(i)
        );
      } else if (p.dashInstance) {
        add("audio", p.getDashAudioTracks(), p.getSelectedDashAudioTrackIndex(), (i) =>
          p.setDashAudioTrack(i)
        );
        add("subtitle", p.getDashTextTracks(), p.getSelectedDashTextTrackIndex?.() ?? -1, (i) =>
          p.setDashTextTrack(i)
        );
      } else {
        const native = Array.from(p.video?.textTracks || []);
        add(
          "subtitle",
          native,
          native.findIndex((track) => track.mode === "showing"),
          (i) => {
            native.forEach((track, index) => (track.mode = index === i ? "showing" : "disabled"));
            return true;
          }
        );
      }
      if (!unifiedTracks && tracks.some((track) => track.kind === "subtitle"))
        tracks.push({
          key: this.bind("subtitle:off", () => {
            if (p.hlsInstance) return p.setHlsSubtitleTrack(-1);
            if (p.dashInstance) return p.setDashTextTrack(-1);
            for (const track of Array.from(p.video?.textTracks || [])) track.mode = "disabled";
          }),
          kind: "subtitle",
          label: "Sin subtítulos",
          selected: false
        });
      title = screen.params?.playerTitle || "Reproductor";
    }
    return {
      title: text(title),
      route,
      page: this.page,
      pageCount,
      items: rows,
      tracks: tracks.slice(0, 24),
      seasons,
      selectedSeason: this.season,
      description: route === "detail" ? text(screen.meta?.description) : "",
      thumbnail: route === "detail" ? artwork(screen.meta?.poster) : undefined
    };
  }
  async activate(key) {
    // Refresh before execution: a key from a previous route/page can never navigate.
    this.snapshot();
    const action = this.actions.get(key);
    if (!action) throw Error("STALE_STATE");
    await action();
  }
  setPage(page) {
    if (!Number.isSafeInteger(page) || page < 0 || page > 10000) throw Error("INVALID_PAYLOAD");
    this.page = page;
    this.snapshot();
  }
  setSeason(season) {
    const snapshot = this.snapshot();
    if (!Number.isSafeInteger(season) || !snapshot.seasons.includes(season))
      throw Error("STALE_STATE");
    this.season = season;
    this.page = 0;
    this.snapshot();
  }
}
