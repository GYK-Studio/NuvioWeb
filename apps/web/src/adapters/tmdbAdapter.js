import { TmdbMetadataService } from "../../../../js/core/tmdb/tmdbMetadataService.js";
import { TmdbSettingsStore } from "../../../../js/data/local/tmdbSettingsStore.js";

export async function loadTmdbEntity(params) {
  return TmdbMetadataService.fetchEntityBrowse({
    entityKind: params.entityKind || "company",
    entityId: params.entityId,
    sourceType: params.sourceType || "tv",
    fallbackName: params.entityName || params.fallbackTitle || "",
    language: TmdbSettingsStore.get().language
  });
}
