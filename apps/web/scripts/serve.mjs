import http from "node:http";
import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { handleProviderProxy } from "../../../scripts/providerProxy.mjs";
import {
  buildRuntimeEnvScript,
  readEnvProperties,
  resolveBackendDiscovery
} from "../../../scripts/envProperties.mjs";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = path.resolve(appDir, "../..");
const distDir = path.join(appDir, "dist");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4174);
const types = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".wasm": "application/wasm"
};

http
  .createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${request.headers.host || host}`);
      if (url.pathname === "/api/providers/fetch") return handleProviderProxy(request, response);
      if (url.pathname === "/health") {
        response.writeHead(200, { "Content-Type": "application/json" });
        return response.end('{"status":"ok"}');
      }
      if (url.pathname === "/nuvio.env.js") {
        const { env } = await readEnvProperties({ rootDir });
        const resolvedEnv = await resolveBackendDiscovery(env);
        response.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" });
        return response.end(buildRuntimeEnvScript(resolvedEnv));
      }
      const relative =
        url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
      const target = path.join(distDir, path.normalize(relative).replace(/^(\.\.[/\\])+/, ""));
      const info = await stat(target).catch(() => null);
      if (!info?.isFile()) {
        response.writeHead(404, { "Content-Type": "text/plain" });
        return response.end("Not found");
      }
      response.writeHead(200, {
        "Content-Type": `${types[path.extname(target)] || "application/octet-stream"}; charset=utf-8`,
        "Cache-Control": "no-store"
      });
      response.end(await readFile(target));
    } catch (error) {
      response.writeHead(500, { "Content-Type": "text/plain" });
      response.end(error?.message || "Server error");
    }
  })
  .listen(port, host, () => console.log(`Nuvio apps/web is running at http://${host}:${port}/`));
