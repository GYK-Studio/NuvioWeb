const WEB_PLUGIN_QUOTA = Object.freeze({
  maxConcurrent: 10,
  maxManifestBytes: 5 * 1024 * 1024,
  maxCodeBytes: 5 * 1024 * 1024,
  maxCacheBytes: 16 * 1024 * 1024,
  maxFetchBytes: 1024 * 1024,
  maxResultsPerScraper: 150,
  maxResults: 150,
  providerTimeoutMs: 60_000,
  globalTimeoutMs: 120_000,
  maxDocuments: 8,
  maxDomElements: 10_000,
  memoryLimitBytes: 64 * 1024 * 1024
});

export const PLUGIN_QUOTAS = Object.freeze({
  web: WEB_PLUGIN_QUOTA,
  // Keep these aliases while the execution layer is shared with earlier
  // releases. Both resolve to the same browser-safe limits.
  modern: WEB_PLUGIN_QUOTA,
  limited: WEB_PLUGIN_QUOTA
});

export function getPluginCapabilitySnapshot() {
  const hasWorker = typeof globalThis.Worker === "function";
  const hasWebAssembly = typeof globalThis.WebAssembly === "object";
  const supported = hasWorker && hasWebAssembly;

  return {
    platform: "web",
    appSupported: supported,
    normalAddonsSupported: supported,
    candidate: supported,
    executable: supported,
    supportLevel: supported ? "full" : "unsupported",
    reason: supported ? "Browser plugin runtime ready" : "Worker and WebAssembly are required",
    pluginServiceAvailable: supported,
    localJsPluginSupported: supported,
    pluginMemoryBudget: PLUGIN_QUOTAS.web.memoryLimitBytes,
    pluginMaxConcurrency: PLUGIN_QUOTAS.web.maxConcurrent,
    quota: PLUGIN_QUOTAS.web,
    precheckPassed: supported,
    pluginServicePackaged: false
  };
}
