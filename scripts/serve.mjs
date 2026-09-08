import http from "node:http";
import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildRuntimeEnvScript, readEnvProperties } from "./envProperties.mjs";
import { handleProviderProxy } from "./providerProxy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1000;
let backendDiscoveryCache = null;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".m3u8": "application/vnd.apple.mpegurl",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".webp": "image/webp"
};

function contentType(filePath) {
  return mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function resolveFile(pathname) {
  const relative =
    pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const normalized = path.normalize(relative).replace(/^(\.\.[/\\])+/, "");
  return path.join(distDir, normalized);
}

function normalizePublicUrl(value = "") {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString().replace(/\/+$/, "")
      : "";
  } catch {
    return "";
  }
}

async function resolveBackendDiscovery(env = {}) {
  const configuredBackendUrl = normalizePublicUrl(env.NUVIO_BACKEND_URL);
  if (!configuredBackendUrl || (env.NUVIO_SUPABASE_URL && env.NUVIO_SUPABASE_ANON_KEY)) {
    return env;
  }

  if (
    backendDiscoveryCache?.backendUrl === configuredBackendUrl &&
    backendDiscoveryCache.expiresAt > Date.now()
  ) {
    return { ...env, ...backendDiscoveryCache.values };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${configuredBackendUrl}/.well-known/nuvio`, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Discovery returned HTTP ${response.status}`);
    }
    const discovery = await response.json();
    const backendUrl = normalizePublicUrl(discovery?.backend_url);
    const publishableKey = String(discovery?.publishable_key || "").trim();
    if (discovery?.service !== "nuvio" || !backendUrl || !publishableKey) {
      throw new Error("Discovery response is missing Nuvio public client configuration");
    }
    const values = {
      NUVIO_SUPABASE_URL: backendUrl,
      NUVIO_SUPABASE_ANON_KEY: publishableKey,
      AVATAR_PUBLIC_BASE_URL:
        env.AVATAR_PUBLIC_BASE_URL || `${backendUrl}/storage/v1/object/public/avatars`
    };
    backendDiscoveryCache = {
      backendUrl: configuredBackendUrl,
      expiresAt: Date.now() + DISCOVERY_CACHE_TTL_MS,
      values
    };
    return { ...env, ...values };
  } finally {
    clearTimeout(timeoutId);
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || host}`);
    if (requestUrl.pathname === "/api/providers/fetch") {
      await handleProviderProxy(request, response);
      return;
    }
    if (requestUrl.pathname === "/health") {
      response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "application/json" });
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (requestUrl.pathname === "/nuvio.env.js") {
      const { env } = await readEnvProperties({ rootDir });
      const resolvedEnv = await resolveBackendDiscovery(env);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "application/javascript; charset=utf-8"
      });
      response.end(buildRuntimeEnvScript(resolvedEnv));
      return;
    }

    const filePath = resolveFile(requestUrl.pathname);
    const fileStat = await stat(filePath).catch(() => null);
    if (!fileStat?.isFile()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": contentType(filePath) });
    response.end(await readFile(filePath));
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`Server error: ${error?.message || error}`);
  }
});

server.listen(port, host, () => {
  console.log(`Nuvio Web is running at http://${host}:${port}/`);
});
