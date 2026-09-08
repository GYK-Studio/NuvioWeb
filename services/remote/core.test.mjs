import { test } from "node:test";
import assert from "node:assert/strict";
import { RemoteCore, validateCommand } from "./core.mjs";
const setup = () => {
  let now = 100000;
  const core = new RemoteCore(() => now);
  const web = core.create("user-a", "Browser");
  const s = core.web(web.webSessionId, web.token);
  s.web = { close() {} };
  const mobile = core.claim(web.code, "Phone");
  return { core, web, s, mobile, advance: (n) => (now += n), now: () => now };
};
test("approval required, challenge is single use, credentials isolated", () => {
  const { core, web, s, mobile } = setup();
  assert.throws(() => core.device(s.id, mobile.deviceId, mobile.token), /UNAUTHORIZED/);
  assert.throws(() => core.claim(web.code, "Other"), /PAIRING_EXPIRED/);
  assert.throws(() => core.web(s.id, mobile.token), /UNAUTHORIZED/);
  core.approve(s, mobile.deviceId);
  assert.equal(core.device(s.id, mobile.deviceId, mobile.token).d.approved, true);
  core.revoke(s, mobile.deviceId);
  assert.throws(() => core.device(s.id, mobile.deviceId, mobile.token), /UNAUTHORIZED/);
});
test("expiry and duplicate commands", () => {
  const { core, s, mobile, now, advance } = setup();
  const d = core.approve(s, mobile.deviceId);
  const c = {
    version: 1,
    commandId: "12345678-12345678",
    webSessionId: s.id,
    sequence: 1,
    type: "player.pause",
    payload: {},
    expiresAt: new Date(now() + 9000).toISOString()
  };
  assert.equal(core.command(s, d, c), null);
  assert.equal(core.command(s, d, c).status, "accepted");
  assert.throws(() => core.command(s, d, { ...c, webSessionId: "other" }), /UNAUTHORIZED/);
  advance(10000);
  assert.throws(() => validateCommand(c, now()), /STALE_STATE/);
  advance(900000);
  assert.throws(() => core.session(s.id), /UNAUTHORIZED/);
});
test("reject arbitrary actions, URLs, invalid ranges and stale ordering", () => {
  const { s, now } = setup();
  const c = {
    version: 1,
    commandId: "12345678-12345678",
    webSessionId: s.id,
    sequence: 1,
    type: "player.setVolume",
    payload: { volume: 2 },
    expiresAt: new Date(now() + 9000).toISOString()
  };
  assert.throws(() => validateCommand(c, now()), /INVALID_PAYLOAD/);
  assert.throws(() => validateCommand({ ...c, type: "eval" }, now()), /UNSUPPORTED/);
  assert.throws(
    () =>
      validateCommand(
        { ...c, type: "player.play", payload: { url: "https://example.com" } },
        now()
      ),
    /INVALID/
  );
});
test("three devices can pair but only the active approved device controls", () => {
  const { core, s, mobile, now } = setup();
  const first = core.approve(s, mobile.deviceId);
  const secondGrant = core.claim(core.pairing(s).code, "Second");
  const second = core.approve(s, secondGrant.deviceId);
  const third = core.claim(core.pairing(s).code, "Third");
  assert.ok(third.deviceId);
  assert.throws(() => core.pairing(s), /RATE_LIMITED/);
  const command = {
    version: 1,
    commandId: "multi-device-12345",
    webSessionId: s.id,
    sequence: 1,
    type: "player.pause",
    payload: {},
    expiresAt: new Date(now() + 9000).toISOString()
  };
  assert.throws(() => core.command(s, first, command), /UNAUTHORIZED/);
  assert.equal(core.command(s, second, command), null);
});
