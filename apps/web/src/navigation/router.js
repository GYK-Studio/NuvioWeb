function routeFromLocation(routes) {
  const route = location.hash.replace(/^#\/?/, "").split("?")[0] || "home";
  return routes[route] ? route : "home";
}

function paramsFromLocation() {
  const query = location.hash.split("?")[1] || "";
  return Object.fromEntries(new URLSearchParams(query));
}

function routeUrl(route, params) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (["string", "number", "boolean"].includes(typeof value) && String(value)) {
      query.set(key, String(value));
    }
  });
  return `#/${route}${query.size ? `?${query}` : ""}`;
}

export function createRouter({ outlet, routes, shell }) {
  let current = null;
  let currentParams = {};
  let cleanup = null;
  const focusable = () =>
    Array.from(
      outlet.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      )
    ).filter((node) => node.getClientRects().length && !node.hidden);
  const currentScreen = () => {
    const items = Array.from(outlet.querySelectorAll("[data-media-id]")).map((node) => ({
      id: node.dataset.mediaId,
      type: node.dataset.mediaType,
      name: node.dataset.mediaName || node.querySelector(".media-card__title")?.textContent,
      releaseInfo: node.dataset.mediaYear,
      poster: node.dataset.mediaPoster,
      addonBaseUrl: node.dataset.addonUrl,
      addonId: node.dataset.addonId,
      addonName: node.dataset.addonName
    }));
    const episodes = Array.from(outlet.querySelectorAll("[data-video-id]")).map((node) => ({
      id: node.dataset.videoId,
      season: Number(node.dataset.season || 0),
      episode: Number(node.dataset.episode || 0),
      title: node.dataset.episodeTitle
    }));
    const streams = Array.from(outlet.querySelectorAll("[data-stream-key]")).map((node) => ({
      id: node.dataset.streamKey,
      url: node.dataset.streamUrl,
      name: node.querySelector(".stream-card__copy strong")?.textContent,
      description: node.querySelector(".stream-card__copy small")?.textContent
    }));
    return {
      ...routes[current],
      container: outlet,
      params: currentParams,
      query: outlet.querySelector('input[type="search"]')?.value || currentParams.query || "",
      items,
      rows: [{ items }],
      meta: {
        name: (() => {
          const node = outlet.querySelector(".detail-copy h1, .detail-logo");
          return node?.alt || node?.textContent || "";
        })()
      },
      episodes,
      streams,
      getFilteredStreams: () => streams.filter((stream) => stream.url),
      openEpisodeStreamChooser: (id) =>
        outlet.querySelector(`[data-video-id="${CSS.escape(String(id))}"]`)?.click(),
      playDefaultFromHero: () => outlet.querySelector("[data-play]")?.click(),
      playStream: (id) =>
        outlet.querySelector(`[data-stream-key="${CSS.escape(String(id))}"]`)?.click()
    };
  };
  const router = {
    getCurrent: () => current,
    replaceParams(params = {}) {
      currentParams = { ...params };
      history.replaceState(
        { route: current, params: currentParams },
        "",
        routeUrl(current, currentParams)
      );
    },
    getCurrentScreen: currentScreen,
    getFocusedElement: () =>
      outlet.contains(document.activeElement) ? document.activeElement : null,
    moveFocusDirectional(container, direction) {
      const nodes = focusable().filter((node) => container.contains(node));
      if (!nodes.length) return false;
      const active = nodes.includes(document.activeElement) ? document.activeElement : null;
      if (!active) {
        nodes[0].focus();
        return true;
      }
      const source = active.getBoundingClientRect();
      const sourceX = source.left + source.width / 2;
      const sourceY = source.top + source.height / 2;
      const horizontal = direction === "left" || direction === "right";
      const sign = direction === "left" || direction === "up" ? -1 : 1;
      const target = nodes
        .filter((node) => node !== active)
        .map((node) => {
          const rect = node.getBoundingClientRect();
          const dx = rect.left + rect.width / 2 - sourceX;
          const dy = rect.top + rect.height / 2 - sourceY;
          const primary = horizontal ? dx : dy;
          const secondary = horizontal ? Math.abs(dy) : Math.abs(dx);
          return { node, primary, score: Math.abs(primary) + secondary * 2.5 };
        })
        .filter((entry) => entry.primary * sign > 2)
        .sort((left, right) => left.score - right.score)[0]?.node;
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "nearest", inline: "nearest" });
      return Boolean(target);
    },
    async navigate(name, params = {}, options = {}) {
      const route = routes[name] ? name : "home";
      const state = { route, params };
      if (!options.fromHistory) {
        const url = routeUrl(route, params);
        if (options.replace) history.replaceState(state, "", url);
        else history.pushState(state, "", url);
      }
      cleanup?.();
      cleanup = null;
      current = route;
      currentParams = params;
      outlet.replaceChildren();
      shell.setRoute(route);
      cleanup = (await routes[route].mount({ outlet, router, params })) || null;
      outlet.focus({ preventScroll: true });
    },
    back() {
      history.back();
    },
    async start() {
      addEventListener("popstate", (event) =>
        router.navigate(
          event.state?.route || routeFromLocation(routes),
          event.state?.params || paramsFromLocation(),
          { fromHistory: true }
        )
      );
      const initial = routeFromLocation(routes);
      await router.navigate(initial, history.state?.params || paramsFromLocation(), {
        replace: true
      });
    }
  };
  return router;
}
