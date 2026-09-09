import http from "node:http";
import { createHash } from "node:crypto";
import { WebSocketServer } from "ws";
import { RemoteCore } from "./core.mjs";
import { attachStorage } from "./storage.mjs";

const origins = new Set((process.env.REMOTE_ALLOWED_ORIGINS || "").split(",").filter(Boolean));
// Android supplies the WSS endpoint origin. Devices still need pairing tokens.
// This allowlist never permits authentication as a web owner.
const deviceOrigins = new Set(
  (process.env.REMOTE_DEVICE_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const backend = process.env.NUVIO_SUPABASE_URL;
const apiKey = process.env.NUVIO_SUPABASE_ANON_KEY;
if (!backend?.startsWith("https://") || !apiKey || !origins.size)
  throw new Error("Configure remote auth backend and origins");
const core = new RemoteCore();
attachStorage(core, process.env.REMOTE_DATA_FILE);
const limits = new Map();
function rate(key, max, interval = 60000) {
  const now = Date.now();
  let entry = limits.get(key);
  if (!entry || entry.until < now) {
    entry = { count: 0, until: now + interval };
    limits.set(key, entry);
  }
  if (++entry.count > max) throw new Error("RATE_LIMITED");
}
const send = (socket, data) => {
  if (socket?.readyState === 1) socket.send(JSON.stringify(data));
};
const broadcast = (s, data) => {
  for (const d of s.devices.values())
    if (d.approved) send(d.socket, { ...data, controlActive: s.active === d.id });
};
const devices = (s) => ({
  type: "devices",
  devices: [...s.devices.values()].map((d) => ({
    id: d.id,
    name: d.name,
    approved: d.approved,
    active: s.active === d.id,
    lastSeen: d.lastSeen,
    online: d.socket?.readyState === 1
  }))
});
function publicContent(content = {}) {
  const artwork = (value) =>
    typeof value === "string" &&
    value.length <= 512 &&
    /^https:\/\/image\.tmdb\.org\/t\/p\/[a-zA-Z0-9/_\.%-]+$/.test(value)
      ? value
      : undefined;
  const text = (value) =>
    String(value || "")
      .replace(/https?:\/\/\S+/g, "[enlace]")
      .slice(0, 160);
  const rows = (list, count, track = false) =>
    (Array.isArray(list) ? list : [])
      .slice(0, count)
      .filter((item) => item && /^[\w-]{16,64}$/.test(item.key || ""))
      .map((item) =>
        track
          ? {
              key: item.key,
              label: text(item.label),
              kind: item.kind === "audio" ? "audio" : "subtitle",
              selected: Boolean(item.selected)
            }
          : {
              key: item.key,
              label: text(item.label),
              detail: text(item.detail),
              thumbnail: artwork(item.thumbnail),
              mediaType: text(item.mediaType),
              year: text(item.year)
            }
      );
  return {
    title: text(content.title),
    route: text(content.route),
    page: Math.max(0, Math.min(10000, Number(content.page) || 0)),
    pageCount: Math.max(1, Math.min(10001, Number(content.pageCount) || 1)),
    items: rows(content.items, 12),
    tracks: rows(content.tracks, 24, true),
    seasons: Array.isArray(content.seasons)
      ? content.seasons.filter((n) => Number.isSafeInteger(n) && n >= 0 && n <= 10000).slice(0, 100)
      : [],
    selectedSeason: Number.isSafeInteger(content.selectedSeason) ? content.selectedSeason : null,
    description: text(content.description),
    thumbnail: artwork(content.thumbnail)
  };
}
const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && !origins.has(origin)) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "POST");
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.url === "/health") {
    res.end("ok");
    return;
  }
  try {
    rate(`http:${req.socket.remoteAddress}`, 30);
    if (req.method !== "POST" || req.headers["content-type"] !== "application/json")
      throw new Error("INVALID_PAYLOAD");
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16384) throw new Error("INVALID_PAYLOAD");
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString());
    let result;
    if (req.url === "/remote/pairings" || req.url === "/remote/refresh/web") {
      if (!origins.has(origin)) throw new Error("UNAUTHORIZED");
      const authorization = req.headers.authorization;
      if (!authorization?.startsWith("Bearer ") || authorization.length > 8192)
        throw new Error("UNAUTHORIZED");
      const response = await fetch(`${backend.replace(/\/$/, "")}/auth/v1/user`, {
        headers: { authorization, apikey: apiKey },
        signal: AbortSignal.timeout(5000),
        redirect: "error"
      });
      if (!response.ok) throw new Error("UNAUTHORIZED");
      const user = await response.json();
      if (!user.id || user.is_anonymous) throw new Error("UNAUTHORIZED");
      rate(`owner:${user.id}`, 10);
      result =
        req.url === "/remote/refresh/web"
          ? core.renewWeb(body.webSessionId, user.id)
          : core.create(user.id, body.name);
    } else if (req.url === "/remote/device/status") {
      if (typeof body.refreshToken !== "string" || body.refreshToken.length > 100)
        throw new Error("UNAUTHORIZED");
      result = core.deviceStatus(body.webSessionId, body.deviceId, body.refreshToken);
    } else if (req.url === "/remote/devices/revoke") {
      if (typeof body.refreshToken !== "string" || body.refreshToken.length > 100)
        throw new Error("UNAUTHORIZED");
      core.renewDevice(body.webSessionId, body.deviceId, body.refreshToken);
      const s = core.session(body.webSessionId);
      core.revoke(s, body.deviceId);
      send(s.web, devices(s));
      result = { revoked: true };
    } else if (req.url === "/remote/refresh/device") {
      if (typeof body.refreshToken !== "string" || body.refreshToken.length > 100)
        throw new Error("UNAUTHORIZED");
      result = core.renewDevice(body.webSessionId, body.deviceId, body.refreshToken);
    } else if (req.url === "/remote/pairings/claim") {
      rate(`claim:${req.socket.remoteAddress}`, 5);
      if (typeof body.code !== "string" || body.code.length > 64)
        throw new Error("INVALID_PAYLOAD");
      rate(
        `challenge:${createHash("sha256").update(body.code.replace(/\s/g, "").toUpperCase()).digest("hex")}`,
        5
      );
      result = core.claim(body.code, body.name);
      const s = core.session(result.webSessionId);
      send(s.web, devices(s));
    } else {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(result));
  } catch (error) {
    const code = ["RATE_LIMITED", "PAIRING_EXPIRED", "UNAUTHORIZED", "INVALID_PAYLOAD"].includes(
      error.message
    )
      ? error.message
      : "UNAVAILABLE";
    res.writeHead(code === "RATE_LIMITED" ? 429 : 400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: code }));
  }
});
server.requestTimeout = 10000;
const wss = new WebSocketServer({ noServer: true, maxPayload: 16384, perMessageDeflate: false });
server.on("upgrade", (req, socket, head) => {
  try {
    rate(`upgrade:${req.socket.remoteAddress}`, 20);
    if (
      req.url !== "/remote/channel" ||
      (req.headers.origin &&
        !origins.has(req.headers.origin) &&
        !deviceOrigins.has(req.headers.origin))
    )
      throw new Error();
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  } catch {
    socket.destroy();
  }
});
wss.on("connection", (socket, req) => {
  let identity = null;
  const authTimer = setTimeout(() => socket.close(4003, "Authentication required"), 5000);
  socket.lastPong = Date.now();
  socket.on("pong", () => {
    socket.lastPong = Date.now();
  });
  socket.on("error", () => {});
  socket.on("message", (raw) => {
    try {
      rate(`ws:${req.socket.remoteAddress}`, 100, 1000);
      const m = JSON.parse(raw.toString());
      if (!identity) {
        if (
          m.type !== "authenticate" ||
          !["web", "device"].includes(m.role) ||
          typeof m.token !== "string" ||
          m.token.length > 100
        )
          throw new Error("UNAUTHORIZED");
        if (m.role === "web") {
          if (!origins.has(req.headers.origin)) throw new Error("UNAUTHORIZED");
          const s = core.web(m.webSessionId, m.token);
          s.web?.close(4001, "Replaced");
          s.web = socket;
          identity = { s, role: "web" };
          send(socket, devices(s));
          send(socket, { type: "state.request" });
        } else {
          const { s, d } = core.device(m.webSessionId, m.deviceId, m.token, false);
          d.socket?.close(4001, "Replaced");
          d.socket = socket;
          d.lastSeen = Date.now();
          core.changed();
          identity = { s, d, role: "device" };
          send(socket, {
            type: "connected",
            approved: d.approved,
            controlActive: s.active === d.id,
            webOnline: s.web?.readyState === 1
          });
          if (d.approved)
            send(socket, {
              type: "session.snapshot",
              state: s.state,
              stateVersion: s.version,
              webOnline: s.web?.readyState === 1,
              controlActive: s.active === d.id
            });
        }
        clearTimeout(authTimer);
        if (identity.role === "web") send(socket, { type: "connected" });
        return;
      }
      const { s, d, role } = identity;
      core.session(s.id);
      if (role === "web") {
        if (s.web !== socket) throw new Error("UNAUTHORIZED");
        if (m.type === "close") {
          core.remove(s.id);
          return;
        }
        if (s.accessExpires <= Date.now()) throw new Error("UNAUTHORIZED");
        if (m.type === "suspend") {
          core.suspend(s);
          for (const device of s.devices.values()) send(device.socket, { type: "suspended" });
          send(socket, devices(s));
        } else if (m.type === "pairing.create") {
          rate(`pairing:${s.id}`, 5);
          send(socket, core.pairing(s));
        } else if (m.type === "approve") {
          const approved = core.approve(s, m.deviceId);
          send(approved.socket, { type: "approved", controlActive: true, webOnline: true });
          send(approved.socket, {
            type: "session.snapshot",
            state: s.state,
            stateVersion: s.version,
            webOnline: true,
            controlActive: true
          });
          send(socket, { type: "state.request" });
          send(socket, devices(s));
          broadcast(s, { type: "control.changed" });
        } else if (m.type === "revoke") {
          core.revoke(s, m.deviceId);
          send(socket, devices(s));
        } else if (m.type === "close") core.remove(s.id);
        else if (m.type === "state") {
          // Fixed public fields only: never relay provider URLs or arbitrary objects.
          const p = m.state || {};
          s.state = {
            content: publicContent(p.content),
            paused: Boolean(p.paused),
            playing: Boolean(p.playing),
            position: Math.max(0, Number(p.position) || 0),
            duration: Math.max(0, Number(p.duration) || 0),
            volume: Math.min(1, Math.max(0, Number(p.volume) || 0)),
            muted: Boolean(p.muted),
            available: Boolean(p.available),
            buffering: Boolean(p.buffering),
            rate: Number.isFinite(p.rate) ? Math.min(2, Math.max(0.5, p.rate)) : 1,
            capabilities: {
              seek: Boolean(p.capabilities?.seek),
              volume: Boolean(p.capabilities?.volume),
              rate: Boolean(p.capabilities?.rate),
              fullscreen: false
            }
          };
          s.version++;
          broadcast(s, {
            type: "session.snapshot",
            state: s.state,
            stateVersion: s.version,
            webOnline: true
          });
        } else if (m.type === "command.result") {
          for (const device of s.devices.values()) {
            const item = device.commands.get(m.commandId);
            if (item) {
              item.result = {
                type: "command.result",
                commandId: m.commandId,
                status: m.status === "completed" ? "completed" : "rejected",
                stateVersion: s.version,
                error:
                  typeof m.error === "string" && /^[A-Z_]{1,40}$/.test(m.error)
                    ? m.error
                    : undefined
              };
              send(device.socket, item.result);
              core.record("command.result", item.result.status, s.id, device.id);
              core.changed();
            }
          }
        }
      } else {
        if (d.socket !== socket || !s.devices.has(d.id)) throw new Error("UNAUTHORIZED");
        if (d.accessExpires <= Date.now()) throw new Error("UNAUTHORIZED");
        rate(`device:${d.id}`, 20, 1000);
        if (m.type === "revoke.self") {
          core.revoke(s, d.id);
          send(s.web, devices(s));
          return;
        }
        if (m.type === "state.request") {
          if (!d.approved) throw new Error("UNAUTHORIZED");
          send(s.web, { type: "state.request" });
          send(socket, {
            type: "session.snapshot",
            state: s.state,
            stateVersion: s.version,
            controlActive: s.active === d.id,
            webOnline: s.web?.readyState === 1
          });
          return;
        }
        if (m.type !== "command") throw new Error("INVALID_PAYLOAD");
        const cached = core.command(s, d, m.command);
        if (cached) send(socket, cached);
        else {
          send(socket, {
            type: "command.result",
            commandId: m.command.commandId,
            status: "accepted"
          });
          send(s.web, { type: "command", command: m.command });
        }
      }
    } catch (error) {
      send(socket, {
        type: "error",
        error: /^[A-Z_]+$/.test(error.message) ? error.message : "INVALID_PAYLOAD"
      });
      if (!identity) socket.close(4001, "Unauthorized");
    }
  });
  socket.on("close", () => {
    clearTimeout(authTimer);
    if (identity?.role === "web" && identity.s.web === socket) {
      identity.s.web = null;
      broadcast(identity.s, { type: "offline" });
    }
  });
});
setInterval(() => {
  core.sweep();
  for (const [key, value] of limits) if (value.until < Date.now()) limits.delete(key);
  for (const socket of wss.clients) {
    if (Date.now() - socket.lastPong >= 45000) socket.terminate();
    else socket.ping();
  }
}, 15000).unref();
server.listen(Number(process.env.PORT || 3001), process.env.HOST || "127.0.0.1");
export { core, server, wss };
