import { PlayerController } from "../../../../../js/core/player/playerController.js";
import { loadPlaybackSession } from "../../adapters/playbackSessionAdapter.js";
import { playbackUrlForStream } from "../../adapters/streamAdapter.js";
import { escapeHtml } from "../../components/media/mediaCard.js";
import { emptyState } from "../../components/feedback/pageState.js";
import { loadResumePosition } from "../../adapters/playerAdapter.js";

function clock(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function trackOptions(kind) {
  const engine = String(PlayerController.playbackEngine || "");
  if (kind === "audio") {
    if (engine === "hls.js") return PlayerController.getHlsAudioTracks?.() || [];
    if (engine === "dash.js") return PlayerController.getDashAudioTracks?.() || [];
    if (PlayerController.isUsingAvPlay?.()) return PlayerController.getAvPlayAudioTracks?.() || [];
    return Array.from(PlayerController.video?.audioTracks || []);
  }
  if (engine === "hls.js") return PlayerController.getHlsSubtitleTracks?.() || [];
  if (engine === "dash.js") return PlayerController.getDashTextTracks?.() || [];
  if (PlayerController.isUsingAvPlay?.()) return PlayerController.getAvPlaySubtitleTracks?.() || [];
  return Array.from(PlayerController.video?.textTracks || []);
}

function selectTrack(kind, index) {
  const engine = String(PlayerController.playbackEngine || "");
  if (kind === "audio") {
    if (engine === "hls.js") return PlayerController.setHlsAudioTrack?.(index);
    if (engine === "dash.js") return PlayerController.setDashAudioTrack?.(index);
    if (PlayerController.isUsingAvPlay?.()) return PlayerController.setAvPlayAudioTrack?.(index);
    Array.from(PlayerController.video?.audioTracks || []).forEach((track, trackIndex) => {
      track.enabled = trackIndex === index;
    });
    return;
  }
  if (engine === "hls.js") return PlayerController.setHlsSubtitleTrack?.(index);
  if (engine === "dash.js") return PlayerController.setDashTextTrack?.(index);
  if (PlayerController.isUsingAvPlay?.()) return PlayerController.setAvPlaySubtitleTrack?.(index);
  Array.from(PlayerController.video?.textTracks || []).forEach((track, trackIndex) => {
    track.mode = trackIndex === index ? "showing" : "disabled";
  });
}

export const PlayerScreen = {
  async mount({ outlet, router }) {
    const session = loadPlaybackSession();
    const layer = document.querySelector(".player-layer");
    const video = PlayerController.video;
    outlet.className = "page-host player-page";
    if (!session || !playbackUrlForStream(session.stream)) {
      outlet.innerHTML = emptyState(
        "Playback session expired",
        "Choose a stream again.",
        "Go back"
      );
      outlet.querySelector("[data-retry]")?.addEventListener("click", () => router.back());
      return;
    }
    outlet.innerHTML = `<section class="player-hud" data-loading><div class="player-hud__top"><button data-back aria-label="Exit player">←</button><div><p>${escapeHtml(session.context?.title || "Now playing")}</p><small>${escapeHtml(session.stream.addonName || session.stream.qualityLabel || "Nuvio")}</small></div><button class="player-source-button" data-back>Change source</button></div><div class="player-hud__center"><div class="player-loading" role="status"><i aria-hidden="true"></i><span>Preparing stream…</span></div><button class="player-toggle" data-toggle aria-label="Play or pause" hidden>❚❚</button><div class="track-panel" hidden></div></div><div class="player-hud__bottom"><input data-seek type="range" min="0" max="100" value="0" aria-label="Seek"><div><span data-time>0:00 / 0:00</span><span>${escapeHtml(session.stream.qualityLabel || "Auto")}</span><button data-audio>Audio</button><button data-subtitles>Subtitles</button><button data-speed>1×</button><button data-fullscreen aria-label="Fullscreen">⛶</button></div></div></section>`;
    layer.hidden = false;
    const hud = outlet.querySelector(".player-hud");
    let loadingTimer = null;
    const finishLoading = () => {
      clearTimeout(loadingTimer);
      hud.removeAttribute("data-loading");
      outlet.querySelector(".player-loading")?.remove();
      const toggle = outlet.querySelector("[data-toggle]");
      if (toggle) toggle.hidden = false;
    };
    const showPlaybackError = (error) => {
      clearTimeout(loadingTimer);
      hud.removeAttribute("data-loading");
      const message = error?.message || error?.detail?.message || "This stream could not start.";
      outlet.querySelector(".player-hud__center").innerHTML =
        `<div class="player-error" role="alert"><h2>Playback failed</h2><p>${escapeHtml(message)}</p><button class="button button--glass" data-back>Choose another stream</button></div>`;
    };
    const update = () => {
      const duration = PlayerController.getDurationSeconds?.() || video.duration || 0;
      const current = PlayerController.getCurrentTimeSeconds?.() || video.currentTime || 0;
      const seek = outlet.querySelector("[data-seek]");
      if (seek) seek.value = duration ? String((current / duration) * 100) : "0";
      const time = outlet.querySelector("[data-time]");
      if (time) time.textContent = `${clock(current)} / ${clock(duration)}`;
      const toggle = outlet.querySelector("[data-toggle]");
      if (toggle) toggle.textContent = video.paused ? "▶" : "❚❚";
    };
    const events = ["timeupdate", "durationchange", "play", "pause", "ended"];
    events.forEach((name) => video.addEventListener(name, update));
    video.addEventListener("playing", finishLoading, { once: true });
    video.addEventListener("canplay", finishLoading, { once: true });
    video.addEventListener("error", showPlaybackError, { once: true });
    loadingTimer = setTimeout(
      () => showPlaybackError(new Error("The stream did not become ready in time.")),
      20_000
    );
    outlet.addEventListener("click", async (event) => {
      if (event.target.closest("[data-back]")) return router.back();
      if (event.target.closest("[data-toggle]"))
        return video.paused ? PlayerController.resume() : PlayerController.pause();
      if (event.target.closest("[data-fullscreen]")) return layer.requestFullscreen?.();
      const trackKind = event.target.closest("[data-audio]")
        ? "audio"
        : event.target.closest("[data-subtitles]")
          ? "subtitles"
          : "";
      if (trackKind) {
        const panel = outlet.querySelector(".track-panel");
        const tracks = trackOptions(trackKind);
        panel.hidden = false;
        panel.innerHTML = `<h2>${trackKind === "audio" ? "Audio" : "Subtitles"}</h2>${trackKind === "subtitles" ? `<button data-track-kind="subtitles" data-track-index="-1">Off</button>` : ""}${tracks.length ? tracks.map((track, index) => `<button data-track-kind="${trackKind}" data-track-index="${index}">${escapeHtml(track.name || track.label || track.lang || track.language || `Track ${index + 1}`)}</button>`).join("") : `<p>No tracks reported by this stream.</p>`}<button data-close-tracks>Close</button>`;
        return;
      }
      if (event.target.closest("[data-close-tracks]")) {
        outlet.querySelector(".track-panel").hidden = true;
        return;
      }
      const track = event.target.closest("[data-track-kind]");
      if (track) {
        selectTrack(track.dataset.trackKind, Number(track.dataset.trackIndex));
        outlet.querySelector(".track-panel").hidden = true;
        return;
      }
      if (event.target.closest("[data-speed]")) {
        const rates = [1, 1.25, 1.5, 2];
        const next = rates[(rates.indexOf(video.playbackRate) + 1) % rates.length];
        video.playbackRate = next;
        event.target.closest("[data-speed]").textContent = `${next}×`;
      }
    });
    outlet.querySelector("[data-seek]").addEventListener("input", (event) => {
      const duration = PlayerController.getDurationSeconds?.() || video.duration || 0;
      PlayerController.seekToSeconds?.((Number(event.target.value) / 100) * duration);
    });
    const onKeyDown = (event) => {
      if (event.key === " " || event.key === "Enter") {
        if (event.target.matches("button, input")) return;
        event.preventDefault();
        video.paused ? PlayerController.resume() : PlayerController.pause();
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        if (event.target.matches("input")) return;
        event.preventDefault();
        const current = PlayerController.getCurrentTimeSeconds?.() || video.currentTime || 0;
        PlayerController.seekToSeconds?.(
          Math.max(0, current + (event.key === "ArrowRight" ? 10 : -10))
        );
      }
      if (event.key === "Escape") router.back();
    };
    document.addEventListener("keydown", onKeyDown);
    let applyResume = null;
    try {
      const hints = session.stream.behaviorHints || {};
      const resumePosition = await loadResumePosition(session.context);
      applyResume = () => {
        const duration = PlayerController.getDurationSeconds?.() || video.duration || 0;
        if (resumePosition >= 30 && (!duration || resumePosition < duration - 30)) {
          PlayerController.seekToSeconds?.(resumePosition);
        }
      };
      video.addEventListener("loadedmetadata", applyResume, { once: true });
      await PlayerController.play(playbackUrlForStream(session.stream), {
        ...session.context,
        requestHeaders:
          hints.proxyHeaders?.request || hints.notWebReady ? hints.proxyHeaders?.request || {} : {},
        mediaSourceType: hints.videoHash ? null : undefined
      });
      update();
    } catch (error) {
      showPlaybackError(error);
    }
    return () => {
      events.forEach((name) => video.removeEventListener(name, update));
      video.removeEventListener("playing", finishLoading);
      video.removeEventListener("canplay", finishLoading);
      video.removeEventListener("error", showPlaybackError);
      clearTimeout(loadingTimer);
      document.removeEventListener("keydown", onKeyDown);
      if (applyResume) video.removeEventListener("loadedmetadata", applyResume);
      PlayerController.stop?.();
      layer.hidden = true;
    };
  }
};
