import {
  getLastLibraryTab,
  isCloudLibraryEnabled,
  loadCloudLibrary,
  loadLibrary,
  prepareCloudPlayback,
  removeLibraryItem,
  setLastLibraryTab
} from "../../adapters/libraryAdapter.js";
import { savePlaybackSession } from "../../adapters/playbackSessionAdapter.js";
import { mediaParams } from "../../components/catalog/catalogGrid.js";
import { mediaCard } from "../../components/media/mediaCard.js";
import { emptyState } from "../../components/feedback/pageState.js";
import { loadCollections } from "../../adapters/collectionAdapter.js";

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function libraryGrid(items) {
  return `<div class="catalog-grid library-grid">${items
    .map(
      (item) =>
        `<div class="library-card">${mediaCard(item)}<button data-library-remove="${escapeHtml(`${item.type}:${item.id}`)}" aria-label="Remove ${escapeHtml(item.name || "title")} from library">Remove</button></div>`
    )
    .join("")}</div>`;
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index > 2 ? 1 : 0)} ${units[index]}`;
}

function cloudLibrary(items) {
  return `<div class="cloud-library-grid">${items
    .map(
      (item) =>
        `<article class="cloud-library-item"><header><span>${escapeHtml(item.providerName)}</span><small>${escapeHtml(item.status || item.type || "")}</small></header><h2>${escapeHtml(item.name)}</h2><p>${escapeHtml(formatBytes(item.sizeBytes))}</p><div>${
          (item.files || [])
            .filter((file) => file.playable)
            .map(
              (file) =>
                `<button data-cloud-item="${escapeHtml(item.stableKey)}" data-cloud-file="${escapeHtml(file.stableKey)}"><span>${escapeHtml(file.name)}</span><small>${escapeHtml(formatBytes(file.sizeBytes))}</small><b>Play</b></button>`
            )
            .join("") || `<span class="cloud-library-empty">No playable video files</span>`
        }</div></article>`
    )
    .join("")}</div>`;
}

export const LibraryScreen = {
  async mount({ outlet, router }) {
    outlet.className = "page-host interior-page library-page";
    outlet.innerHTML = `<div class="result-loading"><i></i><span>Loading your library</span></div>`;
    let data = null;
    let cloudData = null;
    let activeList = "all";
    const render = async () => {
      data = await loadLibrary();
      const collections = loadCollections();
      const cloudEnabled = isCloudLibraryEnabled();
      const availableKeys = new Set([
        "all",
        ...data.tabs.map((tab) => String(tab.key)),
        ...(cloudEnabled ? ["cloud"] : [])
      ]);
      activeList = availableKeys.has(activeList)
        ? activeList
        : availableKeys.has(getLastLibraryTab())
          ? getLastLibraryTab()
          : "all";
      const visibleItems =
        activeList === "all"
          ? data.items
          : data.items.filter((item) => item.listKeys?.includes(activeList));
      outlet.innerHTML = `<header class="page-heading"><p>${escapeHtml(data.sourceMode.toUpperCase())} LIBRARY</p><h1>Your library</h1><div class="filter-chips"><button class="${activeList === "all" ? "selected" : ""}" data-list="all">All</button>${data.tabs.map((tab) => `<button class="${activeList === String(tab.key) ? "selected" : ""}" data-list="${escapeHtml(tab.key)}">${escapeHtml(tab.title)}</button>`).join("")}${cloudEnabled ? `<button class="${activeList === "cloud" ? "selected" : ""}" data-list="cloud">Cloud</button>` : ""}</div></header>${activeList !== "cloud" && collections.length ? `<section class="library-collections"><div class="section-heading"><p>COLLECTIONS</p><h2>Your folders</h2></div><div>${collections.flatMap((collection) => (collection.folders || []).map((folder) => `<button data-folder-id="${escapeHtml(folder.id)}" style="--folder-art:url('${String(folder.coverImageUrl || collection.backdropImageUrl || "").replace(/["')]/g, "")}')"><span>${escapeHtml(folder.coverEmoji || "")}</span><b>${escapeHtml(folder.title)}</b><small>${escapeHtml(collection.title)}</small></button>`)).join("")}</div></section>` : ""}<section class="library-results">${activeList === "cloud" ? (cloudData?.items?.length ? cloudLibrary(cloudData.items) : cloudData ? emptyState("Cloud library is empty", "No files were returned by your connected providers.") : `<div class="result-loading"><i></i><span>Loading cloud library…</span></div>`) : visibleItems.length ? libraryGrid(visibleItems) : emptyState(activeList === "all" ? "Your library is empty" : "Nothing here yet", activeList === "all" ? "Save a movie or series from its details page." : "This list does not contain any titles.", "Explore titles")}</section>`;
    };
    try {
      await render();
    } catch (error) {
      outlet.innerHTML = emptyState(
        "Library unavailable",
        error?.message || "Your library could not be loaded."
      );
    }
    outlet.addEventListener("click", async (event) => {
      const list = event.target.closest("[data-list]");
      if (list) {
        activeList = list.dataset.list;
        setLastLibraryTab(activeList);
        await render();
        if (activeList === "cloud" && !cloudData) {
          cloudData = await loadCloudLibrary();
          await render();
        }
        return;
      }
      const cloudFile = event.target.closest("[data-cloud-file]");
      if (cloudFile && cloudData) {
        const item = cloudData.items.find(
          (candidate) => candidate.stableKey === cloudFile.dataset.cloudItem
        );
        const file = item?.files?.find(
          (candidate) => candidate.stableKey === cloudFile.dataset.cloudFile
        );
        if (!item || !file) return;
        cloudFile.disabled = true;
        try {
          const session = await prepareCloudPlayback(item, file);
          savePlaybackSession(session.stream, session.context);
          router.navigate("player", { title: session.context.title });
        } catch (error) {
          cloudFile.disabled = false;
          cloudFile.querySelector("b").textContent = error?.message || "Try again";
        }
        return;
      }
      const remove = event.target.closest("[data-library-remove]");
      if (remove && data) {
        const item = data.items.find(
          (entry) => `${entry.type}:${entry.id}` === remove.dataset.libraryRemove
        );
        if (item) await removeLibraryItem(item);
        await render();
        return;
      }
      const card = event.target.closest("[data-media-id]");
      if (card) return router.navigate("detail", mediaParams(card));
      const folder = event.target.closest("[data-folder-id]");
      if (folder) return router.navigate("folderDetail", { folderId: folder.dataset.folderId });
      if (event.target.closest("[data-retry]")) {
        if (activeList === "cloud") {
          cloudData = null;
          await render();
          cloudData = await loadCloudLibrary();
          await render();
          return;
        }
        router.navigate("discover");
      }
    });
  }
};
