import { SessionStore } from "../storage/sessionStore.js";
import { ProfileManager } from "../profile/profileManager.js";
import { Router } from "../../ui/navigation/router.js";
import { RemoteContent } from "./remoteContent.js";

const fail = (code) => {
  throw new Error(code);
};
export class RemoteClient extends EventTarget {
  constructor() {
    super();
    this.socket = null;
    this.closed = true;
    this.seen = new Map();
    this.queue = Promise.resolve();
    this.content = new RemoteContent();
  }
  emit(data) {
    this.dispatchEvent(new CustomEvent("update", { detail: data }));
  }
  send(data) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(data));
  }
  async start() {
    this.stop();
    const base = new URL(String(globalThis.__NUVIO_ENV__?.NUVIO_REMOTE_URL || ""));
    if (base.protocol !== "https:" && !(base.protocol === "http:" && base.hostname === "127.0.0.1"))
      fail("INVALID_CONFIGURATION");
    if (base.username || base.password || base.search || base.hash) fail("INVALID_CONFIGURATION");
    const token = SessionStore.accessToken;
    if (!token || SessionStore.isAnonymousSession) fail("UNAUTHORIZED");
    const response = await fetch(new URL("/remote/pairings", base), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "Nuvio Web" }),
      signal: AbortSignal.timeout(10000)
    });
    const grant = await response.json();
    if (!response.ok) fail(grant.error || "UNAVAILABLE");
    this.grant = grant;
    this.base = base;
    this.profile = ProfileManager.getActiveProfileId();
    this.token = token;
    this.closed = false;
    this.attempt = 0;
    this.connect();
    this.timer = setInterval(() => {
      if (
        !SessionStore.accessToken ||
        SessionStore.accessToken !== this.token ||
        ProfileManager.getActiveProfileId() !== this.profile ||
        Date.now() >= grant.expiresAt
      ) {
        this.stop();
        this.emit({ type: "revoked" });
        return;
      }
      this.send({ type: "state", state: this.snapshot() });
    }, 1000);
    return grant;
  }
  async createCode() {
    if (this.closed) return this.start();
    if (this.socket?.readyState !== WebSocket.OPEN) fail("SESSION_OFFLINE");
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        this.removeEventListener("update", onUpdate);
      };
      const onUpdate = (event) => {
        if (event.detail.type === "pairing.created") {
          cleanup();
          resolve(event.detail);
        } else if (event.detail.type === "error") {
          cleanup();
          reject(new Error(event.detail.error));
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("SESSION_OFFLINE"));
      }, 5000);
      this.addEventListener("update", onUpdate);
      this.send({ type: "pairing.create" });
    });
  }
  connect() {
    if (this.closed) return;
    const url = new URL("/remote/channel", this.base);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = (this.socket = new WebSocket(url));
    socket.onopen = () => {
      this.attempt = 0;
      this.send({
        type: "authenticate",
        role: "web",
        webSessionId: this.grant.webSessionId,
        token: this.grant.token
      });
    };
    socket.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === "command") {
        this.queue = this.queue.then(async () => {
          const c = message.command;
          if (this.closed || socket !== this.socket) return;
          let result;
          try {
            if (c.webSessionId !== this.grant.webSessionId || Date.parse(c.expiresAt) <= Date.now())
              fail("STALE_STATE");
            result = this.seen.get(c.commandId);
            if (!result) {
              await this.execute(c);
              result = { type: "command.result", commandId: c.commandId, status: "completed" };
            }
          } catch (error) {
            result = {
              type: "command.result",
              commandId: c.commandId,
              status: "rejected",
              error: /^[A-Z_]+$/.test(error.message) ? error.message : "PLAYBACK_FAILED"
            };
          }
          this.seen.set(c.commandId, result);
          if (this.seen.size > 6000) this.seen.delete(this.seen.keys().next().value);
          this.send(result);
          this.send({ type: "state", state: this.snapshot() });
        });
      } else this.emit(message);
    };
    socket.onclose = (event) => {
      if (this.closed || socket !== this.socket) return;
      if (event.code === 4001 || Date.now() >= this.grant.expiresAt) {
        this.stop();
        this.emit({ type: "revoked" });
        return;
      }
      this.emit({ type: "offline" });
      this.retry = setTimeout(
        () => this.connect(),
        Math.min(30000, 1000 * 2 ** this.attempt++) + Math.random() * 500
      );
    };
  }
  snapshot() {
    const v = document.getElementById("videoPlayer");
    const available = Router.getCurrent() === "player" && Boolean(v?.currentSrc);
    return {
      content: this.content.snapshot(),
      available,
      paused: v?.paused ?? true,
      playing: available && !v.paused && !v.ended && v.readyState >= 3,
      position: v?.currentTime || 0,
      duration: Number.isFinite(v?.duration) ? v.duration : 0,
      volume: v?.volume ?? 1,
      muted: v?.muted ?? false
    };
  }
  async execute(c) {
    if (
      SessionStore.accessToken !== this.token ||
      ProfileManager.getActiveProfileId() !== this.profile
    )
      fail("UNAUTHORIZED");
    const p = c.payload || {};
    if (c.type === "catalog.activate" || c.type === "player.selectTrack") {
      if (typeof p.key !== "string" || p.key.length > 64) fail("INVALID_PAYLOAD");
      return this.content.activate(p.key);
    }
    if (c.type === "catalog.page") return this.content.setPage(p.page);
    if (c.type === "navigation.home") return Router.navigate("home");
    if (c.type === "navigation.back") return Router.back();
    if (c.type === "catalog.search") {
      if (typeof p.query !== "string" || p.query.length < 2 || p.query.length > 120)
        fail("INVALID_PAYLOAD");
      return Router.navigate("search", { query: p.query });
    }
    if (c.type === "player.fullscreen") fail("LOCAL_INTERACTION_REQUIRED");
    const v = document.getElementById("videoPlayer");
    if (Router.getCurrent() !== "player" || !v?.currentSrc) fail("NO_SOURCE");
    if (c.type === "player.play") {
      try {
        await v.play();
      } catch {
        fail("LOCAL_INTERACTION_REQUIRED");
      }
    } else if (c.type === "player.pause") v.pause();
    else if (c.type === "player.seek") {
      if (
        !Number.isFinite(p.positionSeconds) ||
        p.positionSeconds < 0 ||
        !Number.isFinite(v.duration) ||
        p.positionSeconds > v.duration
      )
        fail("INVALID_PAYLOAD");
      if (Math.abs(v.currentTime - p.positionSeconds) > 0.05) {
        await new Promise((resolve, reject) => {
          const cleanup = () => {
            clearTimeout(timer);
            v.removeEventListener("seeked", done);
            v.removeEventListener("error", broken);
          };
          const done = () => {
            cleanup();
            Math.abs(v.currentTime - p.positionSeconds) < 1
              ? resolve()
              : reject(new Error("PLAYBACK_FAILED"));
          };
          const broken = () => {
            cleanup();
            reject(new Error("PLAYBACK_FAILED"));
          };
          const timer = setTimeout(broken, 5000);
          v.addEventListener("seeked", done, { once: true });
          v.addEventListener("error", broken, { once: true });
          try {
            v.currentTime = p.positionSeconds;
          } catch {
            broken();
          }
        });
      }
    } else if (c.type === "player.setVolume") {
      if (!Number.isFinite(p.volume) || p.volume < 0 || p.volume > 1) fail("INVALID_PAYLOAD");
      v.volume = p.volume;
      if (Math.abs(v.volume - p.volume) > 0.01) fail("UNSUPPORTED_CAPABILITY");
    } else if (c.type === "player.setMuted") {
      if (typeof p.muted !== "boolean") fail("INVALID_PAYLOAD");
      v.muted = p.muted;
    } else fail("UNSUPPORTED_CAPABILITY");
  }
  stop() {
    this.send({ type: "close" });
    this.closed = true;
    clearInterval(this.timer);
    clearTimeout(this.retry);
    this.socket?.close();
    this.socket = null;
    this.seen.clear();
    this.content.reset();
  }
}
