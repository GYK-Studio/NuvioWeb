import http from "node:http";
import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  buildRuntimeEnvScript,
  readEnvProperties,
  resolveBackendDiscovery
} from "./envProperties.mjs";
import { handleProviderProxy } from "./providerProxy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);

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
