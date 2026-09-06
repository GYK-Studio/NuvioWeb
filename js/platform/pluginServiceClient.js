import {
  normalizePluginHeaders,
  validatePluginFetchRequest
} from "../core/player/pluginSecurity.js";
import {
  diagnosticError,
  emitPluginDiagnosticEvent,
  emitPluginServiceDiagnostics
} from "../core/diagnostics/pluginDiagnostics.js";

const HEALTH_TTL_MS = 30_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
export const PLUGIN_PROTOCOL_VERSION = 1;

let cachedHealth = null;
let cachedHealthAt = 0;
const activeRequests = new Map();

function pluginRequestDetails(request = {}) {
  return {
    requestId: String(request.requestId || "").slice(0, 128),
    executionId: String(request.executionId || "").slice(0, 128),
    profileId: String(request.profileId || "").slice(0, 64),
    repositoryId: String(request.repositoryId || "").slice(0, 128),
    scraperId: String(request.scraperId || "").slice(0, 128),
    method: String(request.method || "GET").toUpperCase(),
    url: String(request.url || "")
  };
}

function getBrowserHealth() {
  const workerSupport = typeof globalThis.Worker === "function";
  const wasmSupport = typeof globalThis.WebAssembly === "object";
  return {
    returnValue: workerSupport && wasmSupport,
    status: workerSupport && wasmSupport ? "ready" : "unsupported",
    detail:
      workerSupport && wasmSupport
        ? "Browser plugin runtime ready"
        : "Worker and WebAssembly are required",
    protocolVersion: PLUGIN_PROTOCOL_VERSION,
    serviceVersion: 1,
    runtimeVersion: "browser",
    quickjsVersion: "bundled",
    workerSupport,
    maxConcurrency: 10,
    memoryTier: "browser",
    jsPluginCapability: workerSupport && wasmSupport,
    networkBoundary: true
  };
}

function assertCompatibleHealth(health) {
  if (health?.returnValue !== true) {
    throw new Error(health?.detail || "Browser plugin runtime is not ready");
  }
  return health;
}

function normalizeResponse(response, body, requestedUrl) {
  return {
    returnValue: true,
    ok: response.ok,
    status: Number(response.status || 0),
    statusText: String(response.statusText || ""),
    url: String(response.url || requestedUrl),
    body,
    headers: Object.fromEntries(response.headers?.entries?.() || []),
    truncated: false
  };
}

async function readResponseBody(response, maxBytes) {
  const contentLength = Number(response.headers?.get?.("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`Provider response exceeds the ${maxBytes} byte limit`);
  }
  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > maxBytes) {
    throw new Error(`Provider response exceeds the ${maxBytes} byte limit`);
  }
  return body;
}

async function directBrowserFetch(request = {}) {
  const maxBodyBytes = Number(request.maxBodyBytes || DEFAULT_MAX_RESPONSE_BYTES);
  const validation = validatePluginFetchRequest(request, { maxBodyBytes });
  if (!validation.ok) throw new Error(validation.reason);

  const requestId = String(request.requestId || `${Date.now()}-${Math.random()}`);
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  request.signal?.addEventListener?.("abort", forwardAbort, { once: true });
  activeRequests.set(requestId, controller);
  const timeoutMs = Math.max(1, Number(request.timeoutMs || 30_000));
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(validation.url, {
      method: validation.method,
      headers: normalizePluginHeaders(validation.headers),
      body: ["POST", "PUT", "PATCH"].includes(validation.method) ? validation.body : undefined,
      signal: controller.signal
    });
    const body = await readResponseBody(
      response,
      Number(request.maxResponseBytes || maxBodyBytes || DEFAULT_MAX_RESPONSE_BYTES)
    );
    return normalizeResponse(response, body, validation.url);
  } finally {
    clearTimeout(timeoutId);
    request.signal?.removeEventListener?.("abort", forwardAbort);
    activeRequests.delete(requestId);
  }
}

function reportFetchFailure(request, result) {
  if (result.ok && !result.truncated && result.returnValue !== false) return;
  emitPluginDiagnosticEvent(
    result.truncated ? "provider response truncated" : "provider response failed",
    {
      ...pluginRequestDetails(request),
      status: result.status,
      statusText: result.statusText,
      responseUrl: result.url,
      truncated: result.truncated
    },
    {
      prefix: "[Nuvio Plugins]",
      level: result.status >= 500 || result.status === 0 ? "error" : "warn"
    }
  );
}

export const PluginServiceClient = {
  getService() {
    return null;
  },

  async health({ force = false } = {}) {
    const now = Date.now();
    if (!force && cachedHealth && now - cachedHealthAt < HEALTH_TTL_MS) return cachedHealth;
    cachedHealth = getBrowserHealth();
    cachedHealthAt = now;
    return cachedHealth;
  },

  async ensureReady(options = {}) {
    return assertCompatibleHealth(await this.health(options));
  },

  startLifecycleMonitor() {
    return Promise.resolve({ status: "ready" });
  },

  checkLifecycleNow() {
    return this.health({ force: true });
  },

  stopLifecycleMonitor() {},

  async fetch(request = {}) {
    const requestDetails = pluginRequestDetails(request);
    try {
      const result = await directBrowserFetch(request);
      reportFetchFailure(request, result);
      return result;
    } catch (error) {
      emitPluginDiagnosticEvent(
        "plugin request failed",
        { ...requestDetails, error: diagnosticError(error) },
        { prefix: "[Nuvio Plugins]", level: "error" }
      );
      if (request.androidResponseContract === true) {
        return {
          returnValue: true,
          ok: false,
          status: 0,
          statusText: String(error?.message || error || "Fetch failed"),
          url: String(request.url || ""),
          body: "",
          headers: {},
          truncated: false
        };
      }
      throw error;
    }
  },

  async capabilities() {
    return this.health({ force: true });
  },

  async diagnostics() {
    const result = {
      ...(await this.health({ force: true })),
      activeRequests: activeRequests.size
    };
    emitPluginServiceDiagnostics(result);
    return result;
  },

  cancel(requestId) {
    const controller = activeRequests.get(String(requestId || ""));
    if (!controller) return Promise.resolve(false);
    controller.abort();
    return Promise.resolve(true);
  },

  clearCache() {
    return Promise.resolve(false);
  },

  resetHealthCache() {
    cachedHealth = null;
    cachedHealthAt = 0;
  }
};
