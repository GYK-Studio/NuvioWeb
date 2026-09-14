import { watchProgressRepository } from "../../../../js/data/repository/watchProgressRepository.js";

export async function loadResumePosition(context = {}) {
  const explicitResumeSeconds = Number(context.resumePositionMs || 0) / 1000;
  if (Number.isFinite(explicitResumeSeconds) && explicitResumeSeconds > 0) {
    return explicitResumeSeconds;
  }
  if (!context.itemId) return 0;
  const resumeTarget = ["series", "tv"].includes(String(context.itemType || "").toLowerCase())
    ? {
        videoId: context.videoId || null,
        season: context.season,
        episode: context.episode
      }
    : {};
  const progress = await watchProgressRepository
    .getResumeByContentId(context.itemId, resumeTarget)
    .catch(() => null);
  const positionSeconds = Number(progress?.positionMs || 0) / 1000;
  return Number.isFinite(positionSeconds) && positionSeconds > 0 ? positionSeconds : 0;
}
