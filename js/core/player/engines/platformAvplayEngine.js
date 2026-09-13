export const browserMediaEngine = {
  name: "none",

  isSupported() {
    return false;
  },

  getApi() {
    return null;
  }
};

export function resolvePlatformAvplayEngine(_platformName) {
  return browserMediaEngine;
}
