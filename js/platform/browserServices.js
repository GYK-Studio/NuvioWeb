const unsupportedResult = Object.freeze({
  status: "unsupported",
  detail: "This capability is available only in the browser runtime."
});

export const browserDeviceCapabilities = Object.freeze({
  get: () => ({
    isTizen: false,
    tizenVersionKnown: false,
    tizenMajorVersion: 0,
    engineFsServicePackaged: false,
    webServiceSupported: false
  }),
  canUseP2p: () => false,
  canUsePlugins: () => typeof Worker === "function" && typeof WebAssembly === "object",
  isP2pUnsupported: () => false,
  isDashAudioSwitchingUnsupported: () => false,
  isAdvancedSubtitleStylingLimited: () => false
});

export const browserDeviceService = Object.freeze({
  ensureStarted: async () => unsupportedResult,
  getLocalBaseUrls: () => []
});

export const browserStreamResolver = Object.freeze({
  canResolveStream: () => false,
  isUnsupportedOnCurrentTizen: () => false,
  getResolvedStreamState: () => null,
  resolve: async (stream = {}) => ({ status: "unsupported", stream, ...unsupportedResult }),
  remove: async () => false
});

export const browserPlaybackProxy = Object.freeze({
  resolve: async (url) => ({ url: String(url || ""), proxied: false })
});

export const browserNativePlayerService = Object.freeze({
  isAvailable: () => false,
  request: async () => Promise.reject(new Error(unsupportedResult.detail)),
  subscribe: () => () => {}
});

export function requestBrowserLocalService() {
  return Promise.reject(new Error(unsupportedResult.detail));
}

export function subscribeBrowserLocalService() {
  return () => {};
}

export function isBrowserLocalServiceAvailable() {
  return false;
}

export function applyBrowserAudioCodecOverrides(codecs = []) {
  return Array.isArray(codecs) ? codecs.slice() : [];
}

export async function detectBrowserAudioCapabilities() {
  return { unsupportedAudioCodecs: [] };
}

export const browserPlayerExtensions = Object.freeze({
  apply: (video) => video,
  startPlaybackKeepAwake: () => {},
  stopPlaybackKeepAwake: () => {}
});
