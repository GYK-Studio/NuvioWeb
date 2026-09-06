import { browserAdapter } from "./adapters/browserAdapter.js";

// Nuvio is a browser application. This small boundary keeps web capabilities
// explicit without carrying device launch code into the active runtime.
export const Platform = {
  current: browserAdapter,

  init() {
    browserAdapter.init?.();
    return browserAdapter;
  },

  getName() {
    return browserAdapter.name;
  },

  isBrowser() {
    return true;
  },

  // Transitional compatibility shims for modules that select browser
  // fallbacks. They are permanently false in the web application.
  isTizen() {
    return false;
  },

  isWebOS() {
    return false;
  },

  getWebOsMajorVersion() {
    return 0;
  },

  exitApp() {
    return browserAdapter.exitApp();
  },

  isBackEvent(event) {
    return browserAdapter.isBackEvent(event);
  },

  normalizeKey(event) {
    return browserAdapter.normalizeKey(event);
  },

  getDeviceLabel() {
    return browserAdapter.getDeviceLabel();
  },

  getCapabilities() {
    return browserAdapter.getCapabilities();
  },

  prepareVideoElement(videoElement) {
    return browserAdapter.prepareVideoElement?.(videoElement);
  }
};
