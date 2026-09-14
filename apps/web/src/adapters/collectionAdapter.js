import {
  CollectionsStore,
  getCollectionFolderSources
} from "../../../../js/data/local/collectionsStore.js";
import { loadCollectionSourcePage } from "../../../../js/core/collections/collectionSourceLoader.js";

export function loadCollections() {
  return CollectionsStore.getState().collections || [];
}

export async function loadFolder(folderId, signal) {
  const collections = loadCollections();
  let folder = null;
  let collection = null;
  for (const candidate of collections) {
    const match = candidate.folders?.find((entry) => String(entry.id) === String(folderId));
    if (match) {
      folder = match;
      collection = candidate;
      break;
    }
  }
  if (!folder) throw new Error("Collection folder not found");
  const sources = getCollectionFolderSources(folder);
  const settled = await Promise.allSettled(
    sources.map((source) => loadCollectionSourcePage(source, { signal }))
  );
  const rows = settled.map((entry, index) => ({
    source: sources[index],
    title: sources[index]?.title || sources[index]?.catalogName || `Source ${index + 1}`,
    ...(entry.status === "fulfilled"
      ? entry.value
      : { items: [], page: 1, hasMore: false, error: entry.reason?.message || "Unavailable" })
  }));
  return { collection, folder, rows };
}

export async function loadFolderPage(row, signal) {
  return loadCollectionSourcePage(row.source, {
    page: Number(row.page || 1) + 1,
    skip: row.nextSkip,
    signal
  });
}
