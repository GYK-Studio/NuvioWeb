import {
  TmdbSettingsStore,
  normalizeTmdbLanguageCode
} from "../../../../js/data/local/tmdbSettingsStore.js";
import { TMDB_API_KEY } from "../../../../js/config.js";

const TMDB = "https://api.themoviedb.org/3";
const IMAGE = "https://image.tmdb.org/t/p/w780";

async function request(path, params = {}) {
  if (!TMDB_API_KEY) throw new Error("TMDB API key is not configured");
  const query = new URLSearchParams({ api_key: TMDB_API_KEY, ...params });
  const response = await fetch(`${TMDB}${path}?${query}`);
  if (!response.ok) throw new Error(`TMDB request failed (${response.status})`);
  return response.json();
}

export async function loadCast(params) {
  const language = normalizeTmdbLanguageCode(TmdbSettingsStore.get().language || "en-US");
  let id = String(params.castId || "").trim();
  if (!/^\d+$/.test(id)) {
    const search = await request("/search/person", { language, query: params.castName || "" });
    id = String(search.results?.[0]?.id || "");
  }
  if (!id) throw new Error("Cast profile not found");
  const person = await request(`/person/${encodeURIComponent(id)}`, {
    language,
    append_to_response: "combined_credits"
  });
  const credits = (person.combined_credits?.cast || []).map((item) => ({
    id: item.imdb_id || `tmdb:${item.id}`,
    type: item.media_type === "tv" ? "series" : "movie",
    name: item.title || item.name,
    poster: item.poster_path ? `${IMAGE}${item.poster_path}` : null,
    releaseInfo: String(item.release_date || item.first_air_date || "").slice(0, 4)
  }));
  return {
    person: { ...person, profile: person.profile_path ? `${IMAGE}${person.profile_path}` : null },
    credits
  };
}
