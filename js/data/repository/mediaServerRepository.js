import { LocalStore } from "../../core/storage/localStore.js";

const STORAGE_KEY = "connectedMediaServers";
const REQUEST_TIMEOUT_MS = 6000;

function cleanBaseUrl(value) {
  const parsed = new URL(String(value || "").trim());
  if (
    !/^https?:$/.test(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("Usa una URL HTTP(S) válida sin credenciales ni parámetros.");
  }
  return parsed.origin + parsed.pathname.replace(/\/+$/, "");
}

function readServers() {
  const value = LocalStore.get(STORAGE_KEY, []);
  return Array.isArray(value) ? value.filter((server) => server?.url && server?.type) : [];
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`El servidor respondió HTTP ${response.status}.`);
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

async function probeJellyfin(url) {
  const baseUrl = cleanBaseUrl(url);
  const info = await requestJson(`${baseUrl}/System/Info/Public`);
  if (!info?.Id || !info?.ServerName) throw new Error("La respuesta no parece de Jellyfin.");
  return {
    id: `jellyfin:${info.Id}`,
    type: "jellyfin",
    name: String(info.ServerName).slice(0, 120),
    url: baseUrl,
    version: String(info.Version || "")
  };
}

export const mediaServerRepository = {
  list() {
    return readServers();
  },
  get(type = "jellyfin") {
    return readServers().find((server) => server.type === type) || null;
  },
  async detect(url) {
    return probeJellyfin(url);
  },
  async saveJellyfin(url, token = "") {
    const server = await probeJellyfin(url);
    const next = readServers().filter((entry) => entry.id !== server.id);
    next.push({ ...server, token: String(token || "").trim() });
    LocalStore.set(STORAGE_KEY, next.slice(-5));
    return server;
  },
  remove(id) {
    LocalStore.set(
      STORAGE_KEY,
      readServers().filter((server) => server.id !== id)
    );
  }
};
