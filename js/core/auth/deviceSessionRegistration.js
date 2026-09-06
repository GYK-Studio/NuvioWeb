/* global __NUVIO_APP_VERSION__ */

import { SupabaseApi } from "../../data/remote/supabase/supabaseApi.js";
import { AuthManager } from "./authManager.js";
import { AuthState } from "./authState.js";

const CLIENT_NAME = "Nuvio Web";
const INSTALLATION_ID_KEY = "nuvio_web_installation_id";
const INSTALLATION_ID_PREFIX = "nuvio-web-";
const INSTALLATION_ID_LENGTH = 32;
const INSTALLATION_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const REGISTRATION_INTERVAL_MS = 15 * 60 * 1000;
const MAX_PLATFORM_LENGTH = 80;
const MAX_DEVICE_NAME_LENGTH = 160;
let volatileInstallationId = null;

function normalizedText(value) {
  return String(value ?? "").trim();
}

function firstText(...values) {
  return values.map(normalizedText).find(Boolean) || "";
}

function readAppVersion() {
  return typeof __NUVIO_APP_VERSION__ !== "undefined" ? __NUVIO_APP_VERSION__ : "0.0.0";
}

export function isValidInstallationId(value) {
  const normalized = normalizedText(value);
  return normalized.length >= 16 && normalized.length <= 96 && /^[A-Za-z0-9_-]+$/.test(normalized);
}

export function generateInstallationId(randomValues = null) {
  const bytes = new Uint8Array(INSTALLATION_ID_LENGTH);
  if (typeof randomValues === "function") randomValues(bytes);
  else if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else bytes.forEach((_, index) => (bytes[index] = Math.floor(Math.random() * 256)));

  let suffix = "";
  for (const byte of bytes)
    suffix += INSTALLATION_ID_ALPHABET[byte % INSTALLATION_ID_ALPHABET.length];
  return `${INSTALLATION_ID_PREFIX}${suffix}`;
}

export function getOrCreateInstallationId(storage = globalThis.localStorage, randomValues = null) {
  if (volatileInstallationId) return volatileInstallationId;
  try {
    const stored = storage?.getItem?.(INSTALLATION_ID_KEY);
    if (isValidInstallationId(stored)) {
      volatileInstallationId = normalizedText(stored);
      return volatileInstallationId;
    }
  } catch {
    // Continue with an in-memory identity when persistent storage is unavailable.
  }
  volatileInstallationId = generateInstallationId(randomValues);
  try {
    storage?.setItem?.(INSTALLATION_ID_KEY, volatileInstallationId);
  } catch {
    // Registration continues for this browser session.
  }
  return volatileInstallationId;
}

export function buildDeviceRegistrationParams({ installationId, clientVersion, metadata }) {
  return {
    p_installation_id: installationId,
    p_client_name: normalizedText(metadata?.clientName) || CLIENT_NAME,
    p_client_version: normalizedText(clientVersion).slice(0, 40),
    p_platform: firstText(metadata?.platform, "Web Browser").slice(0, MAX_PLATFORM_LENGTH),
    p_device_name: normalizedText(metadata?.deviceName).slice(0, MAX_DEVICE_NAME_LENGTH) || null
  };
}

export async function resolveCurrentDeviceMetadata(_platform = null, runtime = globalThis) {
  const browserPlatform = firstText(
    runtime.navigator?.userAgentData?.platform,
    runtime.navigator?.platform,
    "Web Browser"
  );
  return {
    clientName: CLIENT_NAME,
    deviceName: firstText(
      runtime.navigator?.userAgentData?.brands?.map?.((brand) => brand.brand).join(" "),
      "Web Browser"
    ),
    platform: `Web Browser ${browserPlatform}`
  };
}

export class DeviceSessionRegistrationService {
  constructor({
    authManager = AuthManager,
    rpc = (functionName, params) => SupabaseApi.rpc(functionName, params),
    storage = globalThis.localStorage,
    metadataResolver = resolveCurrentDeviceMetadata,
    clientVersion = readAppVersion(),
    now = () => Date.now(),
    logger = console,
    documentRef = globalThis.document,
    windowRef = globalThis
  } = {}) {
    Object.assign(this, {
      authManager,
      rpc,
      storage,
      metadataResolver,
      clientVersion,
      now,
      logger,
      documentRef,
      windowRef,
      lastRegistrationAtMs: 0,
      registrationPromise: null,
      unsubscribe: null,
      lifecycleStarted: false
    });
  }

  start() {
    if (!this.unsubscribe) {
      this.unsubscribe = this.authManager.subscribe((state) => {
        if (state === AuthState.AUTHENTICATED) void this.registerIfAuthenticated({ force: true });
        else if (state === AuthState.SIGNED_OUT) this.lastRegistrationAtMs = 0;
      });
    }
    this.startLifecycleTracking();
  }

  startLifecycleTracking() {
    if (this.lifecycleStarted) return;
    this.lifecycleStarted = true;
    const registerWhenVisible = () => {
      if (this.documentRef?.visibilityState !== "hidden") void this.requestForegroundRegistration();
    };
    this.documentRef?.addEventListener?.("visibilitychange", registerWhenVisible);
    this.windowRef?.addEventListener?.("pageshow", registerWhenVisible);
    this.windowRef?.addEventListener?.("focus", registerWhenVisible);
  }

  requestForegroundRegistration() {
    return this.registerIfAuthenticated();
  }

  registerIfAuthenticated({ force = false } = {}) {
    if (!this.authManager.isAuthenticated) return Promise.resolve(false);
    if (this.registrationPromise) return this.registrationPromise;
    if (!force && this.now() - this.lastRegistrationAtMs < REGISTRATION_INTERVAL_MS) {
      return Promise.resolve(true);
    }
    this.registrationPromise = (async () => {
      const metadata = await this.metadataResolver();
      await this.rpc(
        "register_current_device",
        buildDeviceRegistrationParams({
          installationId: getOrCreateInstallationId(this.storage),
          clientVersion: this.clientVersion,
          metadata
        })
      );
      this.lastRegistrationAtMs = this.now();
      return true;
    })()
      .catch((error) => {
        this.logger?.warn?.("Device session registration failed", error);
        return false;
      })
      .finally(() => {
        this.registrationPromise = null;
      });
    return this.registrationPromise;
  }
}

export const DeviceSessionRegistration = new DeviceSessionRegistrationService();
