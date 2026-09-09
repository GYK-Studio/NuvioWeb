// Browser images are loaded directly. Hosts must enable CORS for remote artwork.
export function proxifyImageUrl(value = "") {
  return String(value || "").trim();
}

export function normalizeImageUrl(value = "") {
  return proxifyImageUrl(value);
}
