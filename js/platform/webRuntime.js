const WEB_RUNTIME_PROFILE = Object.freeze({
  isPerformanceConstrained: false,
  isLegacyRuntime: false,
  isLegacyTvRuntime: false,
  isTvRuntime: false
});

export function getWebRuntimeProfile() {
  return WEB_RUNTIME_PROFILE;
}

export function getHeroTransitionMode() {
  return "full";
}
