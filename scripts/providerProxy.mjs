import https from "node:https";
import { resolve4 } from "node:dns/promises";
import { isIP } from "node:net";
import { readFile } from "node:fs/promises";
import { parseProperties } from "./envProperties.mjs";

const MAX_BYTES = 1024 * 1024;
let active = 0;
let windowStart = 0;
let requests = 0;

export function isPublicIPv4(ip) {
  if (isIP(ip) !== 4) return false;
  const [a, b] = ip.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || b === 2)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0)
  );
}

export function validateTarget(raw, allowed) {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    isIP(url.hostname) ||
    !allowed.has(url.hostname)
  ) {
    throw new Error("Destination is not allowed");
  }
  return url;
}

async function upstream(input, allowed) {
  const url = validateTarget(input.url, allowed);
  const addresses = await resolve4(url.hostname);
  if (!addresses.length || !addresses.every(isPublicIPv4))
    throw new Error("Private destination blocked");
  const method = String(input.method || "GET").toUpperCase();
  if (!["GET", "POST"].includes(method)) throw new Error("Method is not allowed");
  const headers = { "accept-encoding": "identity" };
  for (const [key, value] of Object.entries(input.headers || {})) {
    if (["accept", "accept-language", "content-type", "user-agent"].includes(key.toLowerCase())) {
      headers[key.toLowerCase()] = String(value).slice(0, 2048);
    }
  }
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method,
        headers,
        family: 4,
        autoSelectFamily: false,
        // Pin the validated IPv4 address: a second DNS lookup must not bypass validation.
        lookup: (_host, _options, callback) => callback(null, addresses[0], 4)
      },
      (response) => {
        const chunks = [];
        let size = 0;
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_BYTES) request.destroy(new Error("Response exceeds limit"));
          else chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () =>
          resolve({
            returnValue: true,
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode,
            statusText: response.statusMessage,
            url: url.toString(),
            body: Buffer.concat(chunks).toString("utf8"),
            headers: { "content-type": response.headers["content-type"] || "" },
            truncated: false
          })
        );
      }
    );
    // Redirects are deliberately not followed, including redirects to private networks.
    const deadline = setTimeout(() => request.destroy(new Error("Upstream timeout")), 15000);
    request.on("error", reject);
    request.on("close", () => clearTimeout(deadline));
    request.end(method === "POST" ? String(input.body || "") : undefined);
  });
}

export async function handleProviderProxy(request, response) {
  // Local server-only config is never included in nuvio.env.js.
  const localConfig = parseProperties(
    await readFile(new URL("../local.properties", import.meta.url), "utf8").catch(() => "")
  );
  const config = { ...localConfig, ...process.env };
  const send = (status, data) => {
    response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify(data));
  };
  const allowed = new Set(
    (config.NUVIO_PROVIDER_ALLOWED_HOSTS || "")
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
  );
  const origins = new Set(
    (config.NUVIO_PROVIDER_ALLOWED_ORIGINS || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
  );
  if (config.NUVIO_PROVIDER_PROXY_ENABLED !== "true" || !allowed.size || !origins.size)
    return send(503, { error: "Provider proxy is not configured" });
  if (
    request.method !== "POST" ||
    !origins.has(request.headers.origin) ||
    !String(request.headers["content-type"] || "").startsWith("application/json")
  ) {
    return send(403, { error: "Request is not allowed" });
  }
  if (Date.now() - windowStart > 60000) {
    windowStart = Date.now();
    requests = 0;
  }
  if (active >= 10 || ++requests > 120) return send(429, { error: "Provider proxy rate limit" });
  active++;
  const timeout = setTimeout(() => request.destroy(), 20000);
  try {
    let size = 0;
    const chunks = [];
    for await (const chunk of request) {
      size += chunk.length;
      if (size > MAX_BYTES) throw new Error("Request exceeds limit");
      chunks.push(chunk);
    }
    const result = await upstream(JSON.parse(Buffer.concat(chunks).toString("utf8")), allowed);
    send(200, result);
  } catch {
    send(502, { error: "Provider request rejected or upstream unavailable" });
  } finally {
    clearTimeout(timeout);
    active--;
  }
}
