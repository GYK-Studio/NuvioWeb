import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RemoteCore } from "./core.mjs";
import { attachStorage } from "./storage.mjs";
test("persistent restart preserves revocable grants, never secrets or player state", () => {
  const directory = mkdtempSync(join(tmpdir(), "nuvio-remote-test-"));
  try {
    const file = join(directory, "remote.json"),
      core = new RemoteCore();
    attachStorage(core, file);
    const web = core.create("owner", "Living room"),
      s = core.web(web.webSessionId, web.token);
    s.web = { close() {} };
    const phone = core.claim(web.code, "Phone");
    core.approve(s, phone.deviceId);
    s.state = { source: "https://private.invalid/video-secret" };
    core.changed();
    const json = readFileSync(file, "utf8");
    for (const secret of [web.token, phone.token, phone.refreshToken, "video-secret"])
      assert.ok(!json.includes(secret));
    assert.equal(statSync(file).mode & 0o777, 0o600);
    const restored = new RemoteCore();
    attachStorage(restored, file);
    assert.equal(restored.session(s.id).state, null);
    assert.ok(restored.renewDevice(s.id, phone.deviceId, phone.refreshToken));
    restored.revoke(restored.session(s.id), phone.deviceId);
    const afterRevocation = new RemoteCore();
    attachStorage(afterRevocation, file);
    assert.throws(
      () => afterRevocation.renewDevice(s.id, phone.deviceId, phone.refreshToken),
      /UNAUTHORIZED/
    );
  } finally {
    rmSync(directory, { recursive: true });
  }
});
