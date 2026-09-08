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
  } else if (command.type === "catalog.page") {
    if (!keys(p, ["page"]) || !Number.isSafeInteger(p.page) || p.page < 0 || p.page > 10000)
      fail("INVALID_PAYLOAD");
  } else fail("UNSUPPORTED_CAPABILITY");
  return command;
}

// Deliberately process-local: restart revokes every grant, rather than resurrecting credentials.
export class RemoteCore {
  constructor(now = () => Date.now()) {
    this.now = now;
    this.sessions = new Map();
    this.codes = new Map();
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
      expires: this.now() + 900000,
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
    return { webSessionId: id, token, code, expiresAt: s.expires, pairingExpiresAt: s.pairExpires };
  }
  session(id) {
    const s = this.sessions.get(id);
    if (!s || s.expires <= this.now()) fail("UNAUTHORIZED");
    return s;
  }
  web(id, token) {
    const s = this.session(id);
    if (s.hash !== hash(token)) fail("UNAUTHORIZED");
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
    const d = {
      id: deviceId,
      name: String(name || "Móvil").slice(0, 60),
      hash: hash(token),
      approved: false,
      socket: null,
      sequence: 0,
      commands: new Map()
    };
    s.devices.set(deviceId, d);
    return { webSessionId: s.id, deviceId, token, sessionName: s.name, expiresAt: s.expires };
  }
  device(id, deviceId, token, approved = true) {
    const s = this.session(id),
      d = s.devices.get(deviceId);
    if (!d || d.hash !== hash(token) || (approved && !d.approved)) fail("UNAUTHORIZED");
    return { s, d };
  }
  approve(s, id) {
    const d = s.devices.get(id);
    if (!d) fail("UNAUTHORIZED");
    d.approved = true;
    s.active = id;
    return d;
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
    if (!d.approved || s.active !== d.id) fail("UNAUTHORIZED");
    if (!s.web) fail("SESSION_OFFLINE");
    validateCommand(command, this.now());
    if (command.webSessionId !== s.id) fail("UNAUTHORIZED");
    for (const [id, item] of d.commands) if (item.at + 300000 < this.now()) d.commands.delete(id);
    if (d.commands.has(command.commandId)) return d.commands.get(command.commandId).result;
    if (command.sequence <= d.sequence) fail("STALE_STATE");
    if (d.commands.size >= 6000) fail("RATE_LIMITED");
    d.sequence = command.sequence;
    const result = { type: "command.result", commandId: command.commandId, status: "accepted" };
    d.commands.set(command.commandId, { at: this.now(), result });
    return null;
  }
  revoke(s, id) {
    const d = s.devices.get(id);
    d?.socket?.close(4001, "Revoked");
    s.devices.delete(id);
    if (s.active === id) s.active = null;
  }
  remove(id) {
    const s = this.sessions.get(id);
    if (!s) return;
    this.codes.delete(s.codeHash);
    for (const d of s.devices.values()) d.socket?.close(4001, "Revoked");
    s.web?.close(4001, "Revoked");
    this.sessions.delete(id);
  }
  sweep() {
    for (const s of this.sessions.values()) {
      if (s.expires <= this.now()) this.remove(s.id);
      else if (s.pairExpires <= this.now()) this.codes.delete(s.codeHash);
    }
  }
}
