import { loadDetail, toggleDetailSaved } from "../../adapters/detailAdapter.js";
import { escapeHtml } from "../../components/media/mediaCard.js";
import { emptyState } from "../../components/feedback/pageState.js";

function detailMarkup(item, saved) {
  const backdrop = item.background || item.poster || "";
  const meta = [
    item.releaseInfo,
    item.ageRating,
    item.runtime,
    Number.isFinite(Number(item.tmdbRating)) ? `★ ${Number(item.tmdbRating).toFixed(1)}` : null,
    ...(item.genres || []).slice(0, 3)
  ].filter(Boolean);
  const videos = Array.isArray(item.videos) ? item.videos : [];
  const cast = (
    Array.isArray(item.cast) && item.cast.length ? item.cast : item.credits?.cast || []
  ).slice(0, 12);
  const entities = [...(item.companies || []), ...(item.networks || [])]
    .filter((entry) => entry?.name)
    .slice(0, 8);
  const trailers = Array.isArray(item.trailers) ? item.trailers.slice(0, 4) : [];
  return `<article class="detail-page__content" style="--detail-image:url('${String(backdrop).replace(/["')]/g, "")}')"><div class="detail-backdrop"></div><section class="detail-hero"><button class="back-button" data-back>← <span>Back</span></button><div class="detail-copy">${item.logo ? `<img class="detail-logo" src="${escapeHtml(item.logo)}" alt="${escapeHtml(item.name)}">` : `<h1>${escapeHtml(item.name)}</h1>`}<div class="detail-meta">${meta.map((value) => `<span>${escapeHtml(value)}</span>`).join("")}</div><p>${escapeHtml(item.description || "No synopsis is available for this title.")}</p><div class="hero__actions"><button class="button button--primary" data-play>▶ <span>${videos.length ? "Choose episode" : "Watch now"}</span></button><button class="button button--glass" data-save>${saved ? "✓ In library" : "+ Add to library"}</button>${trailers.length ? `<button class="button button--glass" data-trailer-url="${escapeHtml(trailers[0].source || `https://www.youtube.com/watch?v=${trailers[0].ytId || trailers[0].youtubeId}`)}">▷ Trailer</button>` : ""}</div></div></section>${
    videos.length
      ? `<section class="episode-section"><div class="section-heading"><p>EPISODES</p><h2>${videos.length} available</h2></div><div class="episode-grid">${videos
          .slice(0, 60)
          .map(
            (video, index) =>
              `<button class="episode-card" data-video-id="${escapeHtml(video.id || video.videoId)}" data-season="${escapeHtml(video.season || "")}" data-episode="${escapeHtml(video.episode || "")}" data-episode-title="${escapeHtml(video.title || video.name || `Episode ${index + 1}`)}"><span>${video.thumbnail || video.background ? `<img src="${escapeHtml(video.thumbnail || video.background)}" alt="">` : `<b>${index + 1}</b>`}</span><div><small>${video.season ? `S${video.season} · E${video.episode}` : `Episode ${index + 1}`}</small><h3>${escapeHtml(video.title || video.name || `Episode ${index + 1}`)}</h3><p>${escapeHtml(video.overview || video.description || "")}</p></div></button>`
          )
          .join("")}</div></section>`
      : ""
  }${cast.length ? `<section class="cast-strip"><div class="section-heading"><p>CAST</p><h2>Featured cast</h2></div><div>${cast.map((person) => `<button data-cast-name="${escapeHtml(typeof person === "string" ? person : person.name)}" ${typeof person === "object" && person.id ? `data-cast-id="${escapeHtml(person.id)}"` : ""}>${typeof person === "object" && person.profile_path ? `<img src="https://image.tmdb.org/t/p/w185${escapeHtml(person.profile_path)}" alt="">` : ""}<span>${escapeHtml(typeof person === "string" ? person : person.name)}${typeof person === "object" && person.character ? `<small>${escapeHtml(person.character)}</small>` : ""}</span></button>`).join("")}</div></section>` : ""}${entities.length ? `<section class="detail-entities"><div class="section-heading"><p>PRODUCTION</p><h2>Studios & networks</h2></div><div>${entities.map((entity) => `<button data-entity-id="${escapeHtml(entity.tmdbId || "")}" data-entity-name="${escapeHtml(entity.name)}" data-entity-kind="${(item.networks || []).includes(entity) ? "network" : "company"}">${entity.logo ? `<img src="${escapeHtml(entity.logo)}" alt="">` : ""}<span>${escapeHtml(entity.name)}</span></button>`).join("")}</div></section>` : ""}</article>`;
}

export const DetailScreen = {
  async mount({ outlet, router, params }) {
    outlet.className = "page-host detail-page";
    outlet.innerHTML = `<div class="detail-loading"><i></i><span>Loading details</span></div>`;
    try {
      const data = await loadDetail(params);
      outlet.innerHTML = detailMarkup(data.item, data.saved);
      outlet.addEventListener("click", async (event) => {
        if (event.target.closest("[data-back]")) return router.back();
        if (event.target.closest("[data-save]")) {
          const button = event.target.closest("[data-save]");
          button.disabled = true;
          await toggleDetailSaved(data.item);
          const refreshed = await loadDetail(params);
          button.textContent = refreshed.saved ? "✓ In library" : "+ Add to library";
          button.disabled = false;
          return;
        }
        const episode = event.target.closest("[data-video-id]");
        if (episode)
          return router.navigate("stream", {
            ...params,
            videoId: episode.dataset.videoId,
            season: episode.dataset.season || undefined,
            episode: episode.dataset.episode || undefined,
            episodeTitle: episode.dataset.episodeTitle || "",
            title: data.item.name,
            poster: data.item.poster,
            background: data.item.background
          });
        const castMember = event.target.closest("[data-cast-name]");
        if (castMember)
          return router.navigate("castDetail", {
            castId: castMember.dataset.castId,
            castName: castMember.dataset.castName
          });
        const entity = event.target.closest("[data-entity-id]");
        if (entity?.dataset.entityId)
          return router.navigate("tmdbEntityBrowse", {
            entityId: entity.dataset.entityId,
            entityKind: entity.dataset.entityKind,
            entityName: entity.dataset.entityName,
            sourceType: data.item.type || params.itemType
          });
        const trailer = event.target.closest("[data-trailer-url]");
        if (trailer) window.open(trailer.dataset.trailerUrl, "_blank", "noopener,noreferrer");
        if (event.target.closest("[data-play]")) {
          if (data.item.videos?.length)
            outlet.querySelector(".episode-section")?.scrollIntoView({ behavior: "smooth" });
          else
            router.navigate("stream", {
              ...params,
              videoId: data.item.id,
              title: data.item.name,
              poster: data.item.poster,
              background: data.item.background
            });
        }
      });
    } catch (error) {
      outlet.innerHTML = emptyState(
        "Details unavailable",
        error?.message || "This title could not be loaded.",
        "Go back"
      );
      outlet.querySelector("[data-retry]")?.addEventListener("click", () => router.back());
    }
  }
};
