import { test } from "node:test";
import assert from "node:assert/strict";
import { emptySession, sessionEvent } from "./session.ts";
import { rangeValue } from "./controls.ts";
test("touch ranges clamp seek and volume to safe bounds", () => {
  assert.equal(rangeValue(50, 100, 3600), 1800);
  assert.equal(rangeValue(-10, 100, 1), 0);
  assert.equal(rangeValue(150, 100, 1), 1);
  assert.equal(rangeValue(50, 0, 3600), 0);
  assert.equal(rangeValue(NaN, 100, 1), 0);
  assert.equal(rangeValue(50, 100, Infinity), 0);
});
test("approved phone opens remote even when web snapshot is null", () => {
  let s = sessionEvent(emptySession, { type: "paired" });
  s = sessionEvent(s, { type: "connected", approved: false });
  assert.equal(s.approved, false);
  s = sessionEvent(s, { type: "approved" });
  s = sessionEvent(s, { type: "session.snapshot", state: null });
  assert.equal(s.paired && s.approved && s.online && s.active, true);
  assert.equal(s.snapshot, null);
});
test("offline and inactive retain remote screen but disable commands", () => {
  let s = sessionEvent(emptySession, { type: "session.snapshot", state: { available: false } });
  s = sessionEvent(s, { type: "offline" });
  assert.equal(s.approved, true);
  assert.equal(s.online, false);
  s = sessionEvent(s, {
    type: "session.snapshot",
    state: null,
    controlActive: false,
    webOnline: false
  });
  assert.equal(s.active, false);
  assert.equal(s.online, false);
  assert.deepEqual(s.snapshot, { available: false });
  assert.deepEqual(sessionEvent(s, { type: "revoked" }), emptySession);
});
test("legacy connected after snapshot cannot reset approval", () => {
  const s = sessionEvent(emptySession, { type: "session.snapshot", state: null });
  assert.equal(sessionEvent(s, { type: "connected" }).approved, true);
});
test("reconnect and control transfer are explicit", () => {
  let s = sessionEvent(emptySession, {
    type: "connected",
    approved: true,
    controlActive: false,
    webOnline: true
  });
  assert.equal(s.approved, true);
  assert.equal(s.active, false);
  assert.equal(s.synchronized, false);
  s = sessionEvent(s, { type: "control.changed", controlActive: true });
  assert.equal(s.active, true);
  assert.deepEqual(sessionEvent(s, { type: "forgotten" }), emptySession);
});
test("profile change clears private state and requires fresh approval", () => {
  let s = sessionEvent(emptySession, { type: "session.snapshot", state: { title: "old profile" } });
  s = sessionEvent(s, { type: "suspended" });
  assert.equal(s.approved, false);
  assert.equal(s.synchronized, false);
  assert.equal(s.snapshot, null);
});
