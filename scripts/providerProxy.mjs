import https from "node:https";
import { resolve4 } from "node:dns/promises";
import { isIP } from "node:net";
import { readFile } from "node:fs/promises";
import { parseProperties } from "./envProperties.mjs";

const MAX_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 4;
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

export function nextRedirectRequest(input, currentUrl, location, statusCode) {
  const url = new URL(String(location || ""), currentUrl).toString();
  const next = { ...input, url, headers: { ...(input.headers || {}) } };
  if ([301, 302, 303].includes(Number(statusCode)) && String(input.method || "GET") !== "GET") {
    next.method = "GET";
    next.body = "";
    Object.keys(next.headers).forEach((name) => {
      if (["content-type", "content-length"].includes(name.toLowerCase()))
        delete next.headers[name];
    });
  }
  return next;
}

async function upstream(input, allowed, redirects = 0) {
  const url = validateTarget(input.url, allowed);
  const addresses = await resolve4(url.hostname);
  if (!addresses.length || !addresses.every(isPublicIPv4))
    throw new Error("Private destination blocked");
  const method = String(input.method || "GET").toUpperCase();
  if (!["GET", "POST"].includes(method)) throw new Error("Method is not allowed");
  const headers = { "accept-encoding": "identity" };
  for (const [key, value] of Object.entries(input.headers || {})) {
    if (
      [
        "accept",
        "accept-language",
        "content-type",
        "cookie",
        "origin",
        "referer",
        "user-agent",
        "x-requested-with"
      ].includes(key.toLowerCase())
    ) {
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
        if ([301, 302, 303, 307, 308].includes(Number(response.statusCode))) {
          response.resume();
          if (!response.headers.location) {
            reject(new Error("Provider redirect has no destination"));
            return;
          }
          if (redirects >= MAX_REDIRECTS) {
            reject(new Error("Provider redirect limit exceeded"));
            return;
          }
          const next = nextRedirectRequest(
            input,
            url,
            response.headers.location,
            response.statusCode
          );
          upstream(next, allowed, redirects + 1).then(resolve, reject);
          return;
        }
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
            headers: {
              "content-type": response.headers["content-type"] || "",
              "set-cookie": Array.isArray(response.headers["set-cookie"])
                ? response.headers["set-cookie"].join("\n")
                : response.headers["set-cookie"] || ""
            },
            truncated: false
          })
        );
      }
    );
    // Every redirect is resolved, allowlisted and DNS-pinned again inside upstream().
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
