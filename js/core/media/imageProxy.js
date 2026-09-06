// Browser images are loaded directly. Hosts must enable CORS for remote artwork.
export function isWebOsImageProxyUrl() {
  return false;
}

export function isWebOsImageProxyReady() {
  return true;
}

export function onWebOsImageProxyReady() {
  return () => {};
}

export async function ensureWebOsImageProxyReady() {
  return true;
}

export function proxifyImageUrl(value = "") {
  return String(value || "").trim();
}

export function normalizeImageUrl(value = "") {
  return proxifyImageUrl(value);
}
