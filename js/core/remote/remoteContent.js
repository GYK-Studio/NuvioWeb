import { Router } from "../../ui/navigation/router.js";
import { PlayerController } from "../player/playerController.js";

const text = (value) =>
  String(value || "")
    .replace(/https?:\/\/\S+/g, "[enlace]")
    .slice(0, 160);
export class RemoteContent {
  constructor() {
    this.scope = "";
    this.actions = new Map();
    this.keys = new Map();
    this.page = 0;
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
    if (route === "search") {
      title = `Resultados: ${screen.query || ""}`;
      items = (screen.rows || [])
        .flatMap((row) => row.items || [])
        .slice(0, 500)
        .map((item) => ({
          id: `${item.addonId}:${item.type}:${item.id}`,
          label: item.name || item.title,
          detail: item.releaseInfo || item.year || item.type,
          action: () =>
            Router.navigate("detail", {
              itemId: item.id,
              itemType: item.type || "movie",
              fallbackTitle: item.name || item.title,
              addonBaseUrl: item.addonBaseUrl,
              addonId: item.addonId,
              addonName: item.addonName,
              returnToSearchOnBack: true
            })
        }));
    } else if (route === "detail") {
      title = screen.meta?.name || screen.params?.fallbackTitle || "Detalle";
      items = (screen.episodes || []).map((episode) => ({
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
      items = (screen.streams || [])
        .filter((stream) => stream.id && stream.url)
        .map((stream) => ({
          id: stream.id,
          label: stream.name || stream.addonName || "Fuente",
          detail: stream.title || stream.description || "Reproducir",
          action: () => screen.playStream(stream.id)
        }));
    }
    const pageCount = Math.max(1, Math.ceil(items.length / 12));
    this.page = Math.min(this.page, pageCount - 1);
    const rows = items.slice(this.page * 12, this.page * 12 + 12).map((item) => ({
      key: this.bind(String(item.id), item.action),
      label: text(item.label),
      detail: text(item.detail)
    }));
    const tracks = [];
    if (route === "player") {
      const p = PlayerController;
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
      if (p.hlsInstance) {
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
      if (tracks.some((track) => track.kind === "subtitle"))
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
      tracks: tracks.slice(0, 24)
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
}
