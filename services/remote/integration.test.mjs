import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import WebSocket from "ws";

test("real WebSocket channel: approval, routing, result and revocation", async () => {
  process.env.PORT = "0";
  process.env.HOST = "127.0.0.1";
  process.env.REMOTE_ALLOWED_ORIGINS = "http://127.0.0.1";
  process.env.REMOTE_DEVICE_ORIGINS = "https://remote.gykstudio.tech";
  process.env.NUVIO_SUPABASE_URL = "https://unused.invalid";
  process.env.NUVIO_SUPABASE_ANON_KEY = "test-public-key";
  const { core, server, wss } = await import("./server.mjs");
  if (!server.listening) await once(server, "listening");
  const port = server.address().port;
  const received = (socket, type) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off("message", listener);
        reject(Error(`Missing ${type}`));
      }, 2000);
      const listener = (raw) => {
        const m = JSON.parse(raw.toString());
        if (m.type === type) {
          clearTimeout(timer);
          socket.off("message", listener);
          resolve(m);
        }
      };
      socket.on("message", listener);
    });
  let web, mobile;
  try {
    const grant = core.create("test-owner", "Test browser");
    web = new WebSocket(`ws://127.0.0.1:${port}/remote/channel`, { origin: "http://127.0.0.1" });
    await once(web, "open");
    let wait = received(web, "connected");
    web.send(
      JSON.stringify({
        type: "authenticate",
        role: "web",
        webSessionId: grant.webSessionId,
        token: grant.token
      })
    );
    await wait;
    const claim = core.claim(grant.code, "Test phone");
    mobile = new WebSocket(`ws://127.0.0.1:${port}/remote/channel`, {
      origin: "https://remote.gykstudio.tech"
    });
    await once(mobile, "open");
    wait = received(mobile, "connected");
    mobile.send(JSON.stringify({ type: "authenticate", role: "device", ...claim }));
    await wait;
    const command = {
      version: 1,
      commandId: "12345678-12345678",
      webSessionId: grant.webSessionId,
      sequence: 1,
      type: "player.pause",
      payload: {},
      expiresAt: new Date(Date.now() + 9000).toISOString()
    };
    wait = received(mobile, "error");
    mobile.send(JSON.stringify({ type: "command", command }));
    assert.equal((await wait).error, "UNAUTHORIZED");
    wait = received(mobile, "approved");
    const firstSnapshot = received(mobile, "session.snapshot");
    const stateRequest = received(web, "state.request");
    web.send(JSON.stringify({ type: "approve", deviceId: claim.deviceId }));
    await wait;
    assert.equal((await firstSnapshot).state, null);
    await stateRequest;
    wait = received(mobile, "session.snapshot");
    web.send(
      JSON.stringify({ type: "state", state: { available: false, content: { title: "Inicio" } } })
    );
    const snapshot = await wait;
    assert.equal(snapshot.state.content.title, "Inicio");
    assert.equal(snapshot.controlActive, true);
    assert.equal(snapshot.webOnline, true);
    wait = received(web, "state.request");
    mobile.send(JSON.stringify({ type: "state.request" }));
    await wait;
    wait = received(web, "command");
    mobile.send(JSON.stringify({ type: "command", command }));
    assert.equal((await wait).command.type, "player.pause");
    wait = received(mobile, "command.result");
    web.send(
      JSON.stringify({ type: "command.result", commandId: command.commandId, status: "completed" })
    );
    assert.equal((await wait).status, "completed");
    wait = once(mobile, "close");
    web.send(JSON.stringify({ type: "revoke", deviceId: claim.deviceId }));
    const [code] = await wait;
    assert.equal(code, 4001);
    const nativeOwner = new WebSocket(`ws://127.0.0.1:${port}/remote/channel`, {
      origin: "https://remote.gykstudio.tech"
    });
    await once(nativeOwner, "open");
    wait = received(nativeOwner, "error");
    nativeOwner.send(
      JSON.stringify({
        type: "authenticate",
        role: "web",
        webSessionId: grant.webSessionId,
        token: grant.token
      })
    );
    assert.equal((await wait).error, "UNAUTHORIZED");
    nativeOwner.terminate();
    const untrusted = new WebSocket(`ws://127.0.0.1:${port}/remote/channel`, {
      origin: "https://untrusted.invalid"
    });
    await once(untrusted, "error");
    assert.notEqual(untrusted.readyState, WebSocket.OPEN);
    untrusted.terminate();
  } finally {
    web?.terminate();
    mobile?.terminate();
    for (const socket of wss.clients) socket.terminate();
    await new Promise((resolve) => server.close(resolve));
    wss.close();
  }
});
