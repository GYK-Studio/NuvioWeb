import { searchCatalogs } from "../../adapters/searchAdapter.js";
import { catalogGrid, mediaParams } from "../../components/catalog/catalogGrid.js";
import { emptyState } from "../../components/feedback/pageState.js";

export const SearchScreen = {
  async mount({ outlet, router, params }) {
    const controller = new AbortController();
    let activeRequest = null;
    let requestId = 0;
    outlet.className = "page-host interior-page search-page";
    const supportsVoice = Boolean(
      globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition
    );
    outlet.innerHTML = `<header class="page-heading"><p>DISCOVER SOMETHING NEW</p><h1>Search</h1><div class="search-input-row"><label class="search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"/></svg><input type="search" autocomplete="off" placeholder="Titles, people and catalogs" value="${String(params?.query || "").replace(/["<>]/g, "")}"><kbd>ESC</kbd></label>${supportsVoice ? `<button class="voice-search" data-voice aria-label="Search by voice">◉</button>` : ""}</div></header><section class="search-results" aria-live="polite"><div class="search-prompt"><span>⌕</span><h2>Search across your sources</h2><p>Results come directly from the catalogs you have installed.</p></div></section>`;
    const input = outlet.querySelector("input");
    const results = outlet.querySelector(".search-results");
    const run = async () => {
      const query = input.value.trim();
      const ownRequest = ++requestId;
      activeRequest?.abort();
      activeRequest = new AbortController();
      controller.signal.addEventListener("abort", () => activeRequest.abort(), { once: true });
      router.replaceParams(query ? { query } : {});
      if (!query) {
        results.innerHTML = `<div class="search-prompt"><span>⌕</span><h2>Search across your sources</h2><p>Results come directly from the catalogs you have installed.</p></div>`;
        return;
      }
      results.innerHTML = `<div class="result-loading"><i></i><span>Searching for “${query.replace(/[<>]/g, "")}”</span></div>`;
      try {
        const updateResults = (data, loading = false) => {
          if (ownRequest !== requestId || activeRequest.signal.aborted) return;
          results.innerHTML = data.items.length
            ? `<div class="result-summary"><h2>Results for “${query.replace(/[<>]/g, "")}”</h2><span>${data.items.length} titles${loading ? " · searching…" : ""}</span></div>${catalogGrid(data.items)}`
            : loading
              ? `<div class="result-loading"><i></i><span>Searching every source…</span></div>`
              : emptyState(
                  "No matches",
                  `Nothing in your sources matched “${query.replace(/[<>]/g, "")}”.`,
                  "Clear search"
                );
        };
        const data = await searchCatalogs(query, {
          signal: activeRequest.signal,
          onUpdate: (partial) => updateResults(partial, true)
        });
        if (ownRequest !== requestId || controller.signal.aborted) return;
        updateResults(data);
      } catch (error) {
        if (error?.name !== "AbortError")
          results.innerHTML = emptyState(
            "Search unavailable",
            "Your sources could not be searched right now."
          );
      }
    };
    let timer = 0;
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(run, 320);
    });
    outlet.addEventListener("click", (event) => {
      const card = event.target.closest("[data-media-id]");
      if (card) router.navigate("detail", mediaParams(card));
      if (event.target.closest("[data-retry]")) {
        input.value = "";
        input.focus();
        run();
      }
      if (event.target.closest("[data-voice]")) {
        const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
        const recognition = new Recognition();
        recognition.lang = document.documentElement.lang || navigator.language || "en";
        recognition.onresult = (voiceEvent) => {
          input.value = voiceEvent.results?.[0]?.[0]?.transcript || "";
          run();
        };
        recognition.start();
      }
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        input.value = "";
        run();
      }
    });
    input.focus();
    if (input.value) await run();
    return () => {
      clearTimeout(timer);
      activeRequest?.abort();
      controller.abort();
    };
  }
};
