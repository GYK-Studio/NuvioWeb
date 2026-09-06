import { isBackEvent, normalizeKeyEvent } from "../sharedKeys.js";

export const browserAdapter = {
  name: "browser",

  init() {},

  exitApp() {
    try {
      globalThis.close?.();
    } catch (_) {
      // Browsers commonly block window.close(); ignore that.
    }
  },

  isBackEvent(event) {
    return isBackEvent(event, [27]);
  },

  normalizeKey(event) {
    return normalizeKeyEvent(event, [27]);
  },

  getDeviceLabel() {
    return "Nuvio Web";
  },

  getCapabilities() {
    return {
      hlsJs: Boolean(globalThis.Hls?.isSupported?.()),
      dashJs: Boolean(globalThis.dashjs?.MediaPlayer),
      nativeVideo: true,
      webosAvplay: false,
      tizenAvplay: false
    };
  },

  prepareVideoElement() {}
};
