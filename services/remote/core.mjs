import { randomBytes, randomUUID, createHash } from "node:crypto";

const hash = (value) => createHash("sha256").update(String(value)).digest("hex");
const fail = (code) => {
  throw new Error(code);
};
const empty = (value) => value && typeof value === "object" && !Array.isArray(value);
const keys = (value, allowed) =>
  empty(value) && Object.keys(value).every((key) => allowed.includes(key));
export function validateCommand(command, now = Date.now()) {
  if (
    !keys(command, [
      "version",
      "commandId",
      "webSessionId",
      "sequence",
      "type",
      "payload",
      "expiresAt"
    ]) ||
    command.version !== 1 ||
    !/^[\w-]{16,64}$/.test(command.commandId || "") ||
    !Number.isSafeInteger(command.sequence) ||
    command.sequence < 1 ||
    typeof command.webSessionId !== "string" ||
    command.webSessionId.length > 64
  )
    fail("INVALID_PAYLOAD");
  const expires = Date.parse(command.expiresAt);
  if (!Number.isFinite(expires) || expires <= now || expires > now + 10000) fail("STALE_STATE");
  const p = command.payload;
  const noPayload = [
    "navigation.home",
    "navigation.back",
    "navigation.library",
    "navigation.discover",
    "player.play",
    "player.pause",
    "player.fullscreen"
  ];
  if (noPayload.includes(command.type)) {
    if (!keys(p, [])) fail("INVALID_PAYLOAD");
  } else if (command.type === "player.seek") {
    if (
      !keys(p, ["positionSeconds"]) ||
      !Number.isFinite(p.positionSeconds) ||
      p.positionSeconds < 0 ||
      p.positionSeconds > 86400
    )
      fail("INVALID_PAYLOAD");
  } else if (command.type === "player.setVolume") {
    if (!keys(p, ["volume"]) || !Number.isFinite(p.volume) || p.volume < 0 || p.volume > 1)
      fail("INVALID_PAYLOAD");
  } else if (command.type === "player.setMuted") {
    if (!keys(p, ["muted"]) || typeof p.muted !== "boolean") fail("INVALID_PAYLOAD");
  } else if (command.type === "catalog.search") {
    if (
      !keys(p, ["query"]) ||
      typeof p.query !== "string" ||
      p.query.trim().length < 2 ||
      p.query.length > 120
    )
      fail("INVALID_PAYLOAD");
  } else if (["catalog.activate", "player.selectTrack"].includes(command.type)) {
    if (!keys(p, ["key"]) || typeof p.key !== "string" || !/^[\w-]{16,64}$/.test(p.key))
      fail("INVALID_PAYLOAD");
  } else if (command.type === "catalog.season") {
    if (!keys(p, ["season"]) || !Number.isSafeInteger(p.season) || p.season < 0 || p.season > 10000)
      fail("INVALID_PAYLOAD");
  } else if (command.type === "player.setRate") {
    if (!keys(p, ["rate"]) || ![0.5, 0.75, 1, 1.25, 1.5, 2].includes(p.rate))
      fail("INVALID_PAYLOAD");
  } else if (command.type === "catalog.page") {
    if (!keys(p, ["page"]) || !Number.isSafeInteger(p.page) || p.page < 0 || p.page > 10000)
      fail("INVALID_PAYLOAD");
  } else fail("UNSUPPORTED_CAPABILITY");
  return command;
}

const ACCESS_MS = 15 * 60 * 1000;
const LINK_MS = 30 * 24 * 60 * 60 * 1000;
export class RemoteCore {
  constructor(now = () => Date.now()) {
    this.now = now;
    this.sessions = new Map();
    this.codes = new Map();
    this.changed = () => {};
    this.audit = [];
    this.auditDays = 7;
  }
  create(owner, name) {
    this.sweep();
    if (
      [...this.sessions.values()].filter((s) => s.owner === owner).length >= 5 ||
      this.sessions.size >= 1000
    )
      fail("RATE_LIMITED");
    const id = randomUUID(),
      token = randomBytes(32).toString("base64url");
    const code = randomBytes(16).toString("hex").toUpperCase();
    const s = {
      id,
      owner,
      name: String(name || "Nuvio Web").slice(0, 60),
      hash: hash(token),
      expires: this.now() + LINK_MS,
      accessExpires: this.now() + ACCESS_MS,
      pairExpires: this.now() + 120000,
      devices: new Map(),
      codeHash: hash(code),
      active: null,
      web: null,
      state: null,
      version: 0
    };
    this.sessions.set(id, s);
    this.codes.set(s.codeHash, id);
    this.changed();
    return {
      webSessionId: id,
      token,
      code,
      expiresAt: s.accessExpires,
      linkExpiresAt: s.expires,
      pairingExpiresAt: s.pairExpires
    };
  }
  session(id) {
    const s = this.sessions.get(id);
    if (!s || s.expires <= this.now()) fail("UNAUTHORIZED");
    return s;
  }
  web(id, token) {
    const s = this.session(id);
    if (s.hash !== hash(token) || s.accessExpires <= this.now()) fail("UNAUTHORIZED");
    return s;
  }
  claim(code, name) {
    const id = this.codes.get(hash(String(code).replace(/\s/g, "").toUpperCase()));
    if (!id) fail("PAIRING_EXPIRED");
    const s = this.session(id);
    if (s.pairExpires <= this.now() || !s.web) fail("PAIRING_EXPIRED");
    if (s.devices.size >= 3) fail("RATE_LIMITED");
    this.codes.delete(s.codeHash);
    const token = randomBytes(32).toString("base64url"),
      deviceId = randomUUID();
    const refreshToken = randomBytes(32).toString("base64url");
    const d = {
      id: deviceId,
      name: String(name || "Móvil").slice(0, 60),
      hash: hash(token),
      refreshHash: hash(refreshToken),
      accessExpires: this.now() + ACCESS_MS,
      lastSeen: this.now(),
      approved: false,
      socket: null,
      sequence: 0,
      commands: new Map()
    };
    s.devices.set(deviceId, d);
    this.changed();
    return {
      webSessionId: s.id,
      deviceId,
      token,
      refreshToken,
      sessionName: s.name,
      expiresAt: d.accessExpires,
      linkExpiresAt: s.expires
    };
  }
  device(id, deviceId, token, approved = true) {
    const s = this.session(id),
      d = s.devices.get(deviceId);
    if (!d || d.hash !== hash(token) || d.accessExpires <= this.now() || (approved && !d.approved))
      fail("UNAUTHORIZED");
    return { s, d };
  }
  approve(s, id) {
    const d = s.devices.get(id);
    if (!d) fail("UNAUTHORIZED");
    d.approved = true;
    s.active = id;
    this.changed();
    return d;
  }
  suspend(s) {
    s.active = null;
    s.state = null;
    for (const d of s.devices.values()) d.approved = false;
    this.changed();
  }
  pairing(s) {
    if (s.devices.size >= 3) fail("RATE_LIMITED");
    this.codes.delete(s.codeHash);
    const code = randomBytes(16).toString("hex").toUpperCase();
    s.codeHash = hash(code);
    s.pairExpires = this.now() + 120000;
    this.codes.set(s.codeHash, s.id);
    return { type: "pairing.created", code, pairingExpiresAt: s.pairExpires, expiresAt: s.expires };
  }
  command(s, d, command) {
    if (d.accessExpires <= this.now() || s.accessExpires <= this.now()) fail("UNAUTHORIZED");
    if (!d.approved || s.active !== d.id) fail("UNAUTHORIZED");
    if (!s.web) fail("SESSION_OFFLINE");
    validateCommand(command, this.now());
    if (command.webSessionId !== s.id) fail("UNAUTHORIZED");
    for (const [id, item] of d.commands) if (item.at + 300000 < this.now()) d.commands.delete(id);
    if (d.commands.has(command.commandId)) return d.commands.get(command.commandId).result;
    if (command.sequence <= d.sequence) fail("STALE_STATE");
    if (d.commands.size >= 6000) fail("RATE_LIMITED");
    d.sequence = command.sequence;
    d.lastSeen = this.now();
    const result = { type: "command.result", commandId: command.commandId, status: "accepted" };
    d.commands.set(command.commandId, { at: this.now(), result });
    this.record(command.type, "accepted", s.id, d.id);
    this.changed();
    return null;
  }
  revoke(s, id) {
    const d = s.devices.get(id);
    d?.socket?.close(4001, "Revoked");
    s.devices.delete(id);
    if (s.active === id) s.active = null;
    this.record("device.revoke", "completed", s.id, id);
    this.changed();
  }
  renewWeb(id, owner) {
    const s = this.session(id);
    if (s.owner !== owner) fail("UNAUTHORIZED");
    const token = randomBytes(32).toString("base64url");
    s.hash = hash(token);
    s.accessExpires = Math.min(this.now() + ACCESS_MS, s.expires);
    this.changed();
    return { token, expiresAt: s.accessExpires, linkExpiresAt: s.expires };
  }
  record(type, status, sessionId, deviceId) {
    this.audit.push({
      at: this.now(),
      type,
      status,
      session: hash(sessionId).slice(0, 16),
      device: hash(deviceId).slice(0, 16)
    });
    this.audit = this.audit
      .filter((event) => event.at >= this.now() - this.auditDays * 86400000)
      .slice(-20000);
  }
  renewDevice(id, deviceId, refreshToken) {
    const s = this.session(id),
      d = s.devices.get(deviceId);
    if (!d || !d.refreshHash || d.refreshHash !== hash(refreshToken)) fail("UNAUTHORIZED");
    const token = randomBytes(32).toString("base64url");
    d.hash = hash(token);
    d.accessExpires = Math.min(this.now() + ACCESS_MS, s.expires);
    d.lastSeen = this.now();
    this.changed();
    return { token, expiresAt: d.accessExpires, linkExpiresAt: s.expires };
  }
  deviceStatus(id, deviceId, refreshToken) {
    const s = this.session(id),
      d = s.devices.get(deviceId);
    if (!d?.refreshHash || d.refreshHash !== hash(refreshToken)) fail("UNAUTHORIZED");
    return {
      online: s.web?.readyState === 1,
      lastSeen: d.lastSeen,
      approved: d.approved,
      sessionName: s.name
    };
  }
  exportRecords() {
    // Persist only credential hashes and permissions, never catalog/player state or sockets.
    return [...this.sessions.values()].map((s) => ({
      id: s.id,
      owner: s.owner,
      name: s.name,
      hash: s.hash,
      expires: s.expires,
      accessExpires: s.accessExpires,
      active: s.active,
      devices: [...s.devices.values()].map((d) => ({
        id: d.id,
        name: d.name,
        hash: d.hash,
        refreshHash: d.refreshHash,
        approved: d.approved,
        accessExpires: d.accessExpires,
        lastSeen: d.lastSeen,
        sequence: d.sequence,
        commands: [...d.commands].filter(([, value]) => value.at + 300000 > this.now())
      }))
    }));
  }
  importRecords(records) {
    if (!Array.isArray(records) || records.length > 1000) fail("INVALID_STORAGE");
    for (const row of records) {
      if (
        !row ||
        typeof row.id !== "string" ||
        typeof row.owner !== "string" ||
        !Array.isArray(row.devices) ||
        row.devices.length > 3 ||
        !Number.isFinite(row.expires) ||
        !Number.isFinite(row.accessExpires) ||
        !/^[a-f0-9]{64}$/.test(row.hash || "") ||
        row.devices.some(
          (d) =>
            !d ||
            typeof d.id !== "string" ||
            typeof d.approved !== "boolean" ||
            !Number.isFinite(d.accessExpires) ||
            !/^[a-f0-9]{64}$/.test(d.hash || "") ||
            !/^[a-f0-9]{64}$/.test(d.refreshHash || "")
        )
      )
        fail("INVALID_STORAGE");
      if (row.expires <= this.now()) continue;
      this.sessions.set(row.id, {
        ...row,
        devices: new Map(
          row.devices.map((d) => [
            d.id,
            { ...d, socket: null, commands: new Map(d.commands || []) }
          ])
        ),
        web: null,
        state: null,
        version: 0,
        pairExpires: 0,
        codeHash: null
      });
    }
  }
  remove(id) {
    const s = this.sessions.get(id);
    if (!s) return;
    this.codes.delete(s.codeHash);
    for (const d of s.devices.values()) d.socket?.close(4001, "Revoked");
    s.web?.close(4001, "Revoked");
    this.sessions.delete(id);
    this.changed();
  }
  sweep() {
    const remaining = this.audit.filter(
      (event) => event.at >= this.now() - this.auditDays * 86400000
    );
    if (remaining.length !== this.audit.length) {
      this.audit = remaining;
      this.changed();
    }
    for (const s of this.sessions.values()) {
      if (s.expires <= this.now()) this.remove(s.id);
      else if (s.pairExpires <= this.now()) this.codes.delete(s.codeHash);
    }
  }
}
