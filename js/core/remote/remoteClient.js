import { SessionStore } from "../storage/sessionStore.js";
import { ProfileManager } from "../profile/profileManager.js";
import { Router } from "../../ui/navigation/router.js";
import { ScreenUtils } from "../../ui/navigation/screen.js";
import { RemoteContent } from "./remoteContent.js";

const fail = (code) => {
  throw new Error(code);
};
const SESSION_KEY = "nuvio.remote.webSession";

function findVerticalScroller(node) {
  let current = node instanceof Element ? node : null;
  while (current && current !== document.body) {
    let overflow = "";
    try {
      overflow = getComputedStyle(current).overflowY;
    } catch {
      overflow = "";
    }
    if (
      (overflow === "auto" || overflow === "scroll") &&
      current.scrollHeight > current.clientHeight + 4
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

function remoteKeyboardField() {
  const active = document.activeElement;
  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active?.isContentEditable === true
  ) {
    return active;
  }
  const screen = Router.getCurrentScreen();
  return (
    screen?.container?.querySelector(
      "input:not([type=hidden]):not([disabled]), textarea:not([disabled])"
    ) || null
  );
}

function writeRemoteKeyboardInput(text, key) {
  const field = remoteKeyboardField();
  if (!field) fail("UNSUPPORTED_CAPABILITY");
  if (typeof text === "string") {
    if (!/^(?:input|textarea)$/i.test(field.tagName) && field.isContentEditable !== true)
      fail("UNSUPPORTED_CAPABILITY");
    const value = String(text).slice(0, 200);
    if (field.isContentEditable === true) {
      field.focus();
      document.execCommand?.("selectAll", false, null);
      document.execCommand?.("insertText", false, value);
    } else {
      const setter =
        field instanceof HTMLInputElement
          ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
          : Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(field, value);
    }
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  const init = { bubbles: true, cancelable: true, key, code: key, repeat: false };
  field.focus?.();
  field.dispatchEvent(new KeyboardEvent("keydown", init));
  field.dispatchEvent(new KeyboardEvent("keypress", init));
  if (key === "Enter" && field instanceof HTMLInputElement) {
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }
  field.dispatchEvent(new KeyboardEvent("keyup", init));
}
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
  async start(name = "Nuvio Web") {
    this.disconnect();
    const base = new URL(String(globalThis.__NUVIO_ENV__?.NUVIO_REMOTE_URL || ""));
    if (base.protocol !== "https:" && !(base.protocol === "http:" && base.hostname === "127.0.0.1"))
      fail("INVALID_CONFIGURATION");
    if (base.username || base.password || base.search || base.hash) fail("INVALID_CONFIGURATION");
    const token = SessionStore.accessToken;
    if (!token || SessionStore.isAnonymousSession) fail("UNAUTHORIZED");
    let storedSessionId = "";
    try {
      storedSessionId = sessionStorage.getItem(SESSION_KEY) || "";
    } catch {
      // Session storage can be disabled by the browser; pairing still works.
    }
    const request = async (path, body) => {
      const response = await fetch(new URL(path, base), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000)
      });
      const result = await response.json();
      return { response, result };
    };
    let { response, result: grant } = storedSessionId
      ? await request("/remote/sessions/resume", { webSessionId: storedSessionId })
      : { response: null, result: null };
    if (!response?.ok) {
      try {
        sessionStorage.removeItem(SESSION_KEY);
      } catch {}
      ({ response, result: grant } = await request("/remote/pairings", { name }));
    }
    if (!response.ok) fail(grant.error || "UNAVAILABLE");
    try {
      sessionStorage.setItem(SESSION_KEY, grant.webSessionId);
    } catch {}
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
        Date.now() >= (this.grant.linkExpiresAt || this.grant.expiresAt)
      ) {
        this.stop();
        this.emit({ type: "revoked" });
        return;
      }
      if (ProfileManager.getActiveProfileId() !== this.profile) {
        this.profile = ProfileManager.getActiveProfileId();
        this.send({ type: "suspend" });
        this.content.reset();
        return;
      }
      if (SessionStore.accessToken !== this.token || Date.now() >= this.grant.expiresAt - 60000) {
        void this.renew();
        return;
      }
      this.publishState();
    }, 1000);
    return grant;
  }
  async renew() {
    if (this.closed || this.renewing) return;
    this.renewing = true;
    const grant = this.grant;
    try {
      const token = SessionStore.accessToken;
      const response = await fetch(new URL("/remote/refresh/web", this.base), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ webSessionId: grant.webSessionId }),
        signal: AbortSignal.timeout(10000)
      });
      const result = await response.json();
      if (this.closed || grant !== this.grant) return;
      if (!response.ok) {
        if (result.error === "UNAUTHORIZED") {
          this.stop();
          this.emit({ type: "revoked" });
        }
        return;
      }
      Object.assign(grant, result);
      this.token = token;
      this.publishState();
    } catch {
      this.emit({ type: "offline" });
    } finally {
      this.renewing = false;
    }
  }
  async createCode(name) {
    if (this.closed) {
      const grant = await this.start(name);
      if (!grant.code) fail("RATE_LIMITED");
      return grant;
    }
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
      if (message.type === "state.request" || message.type === "connected") {
        this.publishState();
        this.emit(message);
      } else if (message.type === "command") {
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
          this.publishState();
        });
      } else this.emit(message);
    };
    socket.onclose = (event) => {
      if (this.closed || socket !== this.socket) return;
      if (event.code === 4001 || Date.now() >= (this.grant.linkExpiresAt || this.grant.expiresAt)) {
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
    let content;
    try {
      content = this.content.snapshot();
    } catch {
      // A catalog/track error must not prevent the entire remote from synchronizing.
      content = {
        title: "No se pudo cargar este apartado. Puedes volver a Inicio.",
        route: Router.getCurrent(),
        items: [],
        tracks: [],
        page: 0,
        pageCount: 1
      };
    }
    return {
      content,
      available,
      paused: v?.paused ?? true,
      playing: available && !v.paused && !v.ended && v.readyState >= 3,
      position: v?.currentTime || 0,
      duration: Number.isFinite(v?.duration) ? v.duration : 0,
      volume: v?.volume ?? 1,
      muted: v?.muted ?? false,
      buffering: available && !v.paused && v.readyState < 3,
      rate: v?.playbackRate || 1,
      capabilities: {
        seek: available && Number.isFinite(v?.duration) && v.duration > 0,
        volume: available,
        rate: available,
        fullscreen: false
      }
    };
  }
  publishState() {
    if (this.closed) return;
    const state = this.snapshot();
    // Leave headroom below the transport's 16 KiB limit, including multi-byte titles.
    const bytes = () => new TextEncoder().encode(JSON.stringify(state)).length;
    while (bytes() > 14500 && (state.content.items?.length || state.content.tracks?.length)) {
      if ((state.content.items?.length || 0) >= (state.content.tracks?.length || 0))
        state.content.items.pop();
      else state.content.tracks.pop();
    }
    this.send({ type: "state", state });
  }
  async execute(c) {
    if (
      !SessionStore.accessToken ||
      SessionStore.isAnonymousSession ||
      ProfileManager.getActiveProfileId() !== this.profile
    )
      fail("UNAUTHORIZED");
    const p = c.payload || {};
    if (c.type === "catalog.activate" || c.type === "player.selectTrack") {
      if (typeof p.key !== "string" || p.key.length > 64) fail("INVALID_PAYLOAD");
      return this.content.activate(p.key);
    }
    if (c.type === "catalog.page") return this.content.setPage(p.page);
    if (c.type === "catalog.season") return this.content.setSeason(p.season);
    if (c.type === "navigation.home") return Router.navigate("home");
    if (c.type === "navigation.library") return Router.navigate("library");
    if (c.type === "navigation.discover") return Router.navigate("discover");
    if (c.type === "navigation.back") return Router.back();
    const direction = {
      "navigation.up": "up",
      "navigation.down": "down",
      "navigation.left": "left",
      "navigation.right": "right"
    }[c.type];
    if (direction) {
      const screen = Router.getCurrentScreen();
      if (!screen?.container) fail("UNSUPPORTED_CAPABILITY");
      ScreenUtils.moveFocusDirectional(screen.container, direction);
      // The web focus call uses preventScroll, so bring the newly focused
      // control into view or remote D-pad navigation walks off-screen.
      try {
        screen.container
          ?.querySelector(".focusable.focused")
          ?.scrollIntoView({ block: "nearest", inline: "nearest" });
      } catch {}
      return;
    }
    if (c.type === "navigation.scrollUp" || c.type === "navigation.scrollDown") {
      const screen = Router.getCurrentScreen();
      const container = screen?.container;
      const focused = container?.querySelector(".focusable.focused");
      const scroller = findVerticalScroller(focused) || findVerticalScroller(container);
      const distance = Math.round(
        (scroller === document.scrollingElement || !scroller
          ? globalThis.innerHeight || 600
          : scroller.clientHeight || 600) * 0.75
      );
      const delta = c.type === "navigation.scrollUp" ? -distance : distance;
      if (scroller && scroller !== document.scrollingElement) scroller.scrollTop += delta;
      else globalThis.scrollBy?.({ top: delta, behavior: "smooth" });
      return;
    }
    if (c.type === "keyboard.text" || c.type === "keyboard.key") {
      if (c.type === "keyboard.text" && (typeof p.text !== "string" || !p.text.length))
        fail("INVALID_PAYLOAD");
      writeRemoteKeyboardInput(
        c.type === "keyboard.text" ? p.text : null,
        c.type === "keyboard.key" ? p.key : null
      );
      return;
    }
    if (c.type === "navigation.select") {
      const screen = Router.getCurrentScreen();
      const target = screen?.container?.querySelector(".focusable.focused");
      if (!screen || !target) fail("UNSUPPORTED_CAPABILITY");
      if (screen.activateControl) return screen.activateControl(target);
      if (typeof target.click === "function") return target.click();
      return screen.onKeyDown?.({
        key: "Enter",
        keyCode: 13,
        which: 13,
        target,
        repeat: false,
        preventDefault() {},
        stopPropagation() {},
        stopImmediatePropagation() {}
      });
    }
    if (c.type === "catalog.search") {
      if (typeof p.query !== "string" || p.query.length < 2 || p.query.length > 120)
        fail("INVALID_PAYLOAD");
      return Router.navigate("search", { query: p.query });
    }
    if (c.type === "player.fullscreen") {
      this.emit({ type: "local.gesture", action: "fullscreen" });
      fail("LOCAL_INTERACTION_REQUIRED");
    }
    const v = document.getElementById("videoPlayer");
    if (Router.getCurrent() !== "player" || !v?.currentSrc) fail("NO_SOURCE");
    if (c.type === "player.setRate") {
      if (![0.5, 0.75, 1, 1.25, 1.5, 2].includes(p.rate)) fail("INVALID_PAYLOAD");
      v.playbackRate = p.rate;
      if (v.playbackRate !== p.rate) fail("UNSUPPORTED_CAPABILITY");
    } else if (c.type === "player.play") {
      try {
        await v.play();
      } catch {
        this.emit({ type: "local.gesture", action: "play" });
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
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {}
    this.disconnect();
    this.seen.clear();
    this.content.reset();
  }
  disconnect() {
    this.closed = true;
    clearInterval(this.timer);
    clearTimeout(this.retry);
    this.socket?.close();
    this.socket = null;
  }
}
