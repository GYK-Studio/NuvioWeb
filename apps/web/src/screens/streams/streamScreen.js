import {
  loadStreams,
  playbackUrlForStream,
  prepareStreams,
  replacePreparedStream,
  resolveStreamForPlayback
} from "../../adapters/streamAdapter.js";
import { savePlaybackSession } from "../../adapters/playbackSessionAdapter.js";
import { escapeHtml } from "../../components/media/mediaCard.js";
import { emptyState } from "../../components/feedback/pageState.js";

function streamCard(stream) {
  return `<button class="stream-card" data-stream-key="${stream.key}" data-stream-url="${escapeHtml(playbackUrlForStream(stream))}"><span class="stream-card__source">${stream.addonLogo ? `<img src="${escapeHtml(stream.addonLogo)}" alt="">` : ""}<b>${escapeHtml(stream.addonName)}</b></span><span class="stream-card__copy"><strong>${escapeHtml(stream.label)}</strong><small>${escapeHtml(stream.description || stream.name || "Ready to play")}</small></span><span class="stream-card__badges"><i>${escapeHtml(stream.qualityLabel)}</i>${stream.debridCacheStatus ? "<i>Debrid</i>" : ""}</span><span aria-hidden="true">›</span></button>`;
}

export const StreamScreen = {
  async mount({ outlet, router, params }) {
    const controller = new AbortController();
    let streams = [];
    outlet.className = "page-host interior-page streams-page";
    const render = (loading = false) => {
      const qualities = [...new Set(streams.map((stream) => stream.qualityLabel))];
      outlet.innerHTML = `<header class="page-heading page-heading--split"><div><p>CHOOSE PLAYBACK</p><h1>${escapeHtml(params.title || "Available streams")}</h1></div><button class="button button--glass" data-back>← Back</button></header>${qualities.length > 1 ? `<div class="filter-chips"><button class="selected" data-quality="all">All</button>${qualities.map((quality) => `<button data-quality="${escapeHtml(quality)}">${escapeHtml(quality)}</button>`).join("")}</div>` : ""}<section class="stream-results">${streams.length ? streams.map(streamCard).join("") : loading ? `<div class="result-loading"><i></i><span>Searching every source…</span></div>` : emptyState("No streams found", "Try refreshing your sources or choose another title.", "Try again")}</section>`;
    };
    render(true);
    outlet.addEventListener("click", async (event) => {
      if (event.target.closest("[data-back]")) return router.back();
      if (event.target.closest("[data-retry]"))
        return router.navigate("stream", params, { replace: true });
      const filter = event.target.closest("[data-quality]");
      if (filter) {
        outlet
          .querySelectorAll("[data-quality]")
          .forEach((node) => node.classList.toggle("selected", node === filter));
        outlet.querySelectorAll("[data-stream-key]").forEach((card) => {
          const stream = streams.find((item) => item.key === card.dataset.streamKey);
          card.hidden =
            filter.dataset.quality !== "all" && stream?.qualityLabel !== filter.dataset.quality;
        });
        return;
      }
      const card = event.target.closest("[data-stream-key]");
      if (!card) return;
      let stream = streams.find((item) => item.key === card.dataset.streamKey);
      if (!stream) return;
      card.disabled = true;
      card.dataset.state = "preparing";
      try {
        stream = await resolveStreamForPlayback(stream, params);
        if (!playbackUrlForStream(stream)) throw new Error("No playable URL was returned.");
        savePlaybackSession(stream, params);
        router.navigate("player", { title: params.title || stream.label });
      } catch (error) {
        card.disabled = false;
        card.dataset.state = "error";
        card.querySelector(".stream-card__copy small").textContent =
          error?.message || "This stream could not be prepared.";
      }
    });
    try {
      streams = await loadStreams(params, {
        signal: controller.signal,
        onUpdate: (next) => {
          streams = next;
          render(true);
        }
      });
      render(false);
      void prepareStreams(streams, params, (original, prepared) => {
        if (controller.signal.aborted) return;
        streams = replacePreparedStream(streams, original, prepared);
        render(false);
      });
    } catch (error) {
      if (!controller.signal.aborted)
        outlet.querySelector(".stream-results").innerHTML = emptyState(
          "Streams unavailable",
          error?.message || "The stream search failed.",
          "Try again"
        );
    }
    return () => controller.abort();
  }
};
