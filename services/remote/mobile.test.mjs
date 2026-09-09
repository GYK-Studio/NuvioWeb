import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "../../node_modules/esbuild/lib/main.js";
const output = await build({
  entryPoints: ["apps/remote/connection.ts"],
  absWorkingDir: new URL("../../", import.meta.url).pathname,
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "native-storage",
      setup(b) {
        b.onResolve({ filter: /^expo-(secure-store|crypto)$/ }, (args) => ({
          path: args.path,
          namespace: "mock"
        }));
        b.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({
          contents:
            path === "expo-crypto"
              ? "export const randomUUID=()=>crypto.randomUUID()"
              : "export const getItemAsync=async k=>globalThis.__remoteStore.get(k)||null; export const setItemAsync=async(k,v)=>{globalThis.__remoteStore.set(k,v)}; export const deleteItemAsync=async k=>{globalThis.__remoteStore.delete(k)}"
        }));
      }
    }
  ]
});
const { Connection } = await import(
  `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`
);
class Socket {
  static OPEN = 1;
  static CONNECTING = 0;
  static all = [];
  readyState = 0;
  sent = [];
  constructor() {
    Socket.all.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  send(raw) {
    this.sent.push(JSON.parse(raw));
  }
  message(data) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  close() {
    this.readyState = 3;
    this.onclose?.({ code: 1000 });
  }
}
const grant = (id) => ({
  webSessionId: `session-${id}`,
  deviceId: `device-${id}`,
  token: "test-token",
  refreshToken: "test-refresh",
  expiresAt: Date.now() + 900000,
  linkExpiresAt: Date.now() + 86400000,
  sessionName: id,
  base: "https://remote.invalid"
});
test("mobile switches saved screens and rejects commands until a fresh snapshot", async () => {
  const original = globalThis.WebSocket;
  globalThis.WebSocket = Socket;
  globalThis.__remoteStore = new Map();
  const a = grant("a"),
    b = grant("b");
  __remoteStore.set("nuvio.remote", JSON.stringify(a));
  __remoteStore.set("nuvio.remote.links", JSON.stringify([a, b]));
  const c = new Connection(() => {});
  try {
    await c.restore();
    const first = c.socket;
    first.open();
    first.message({ type: "connected", approved: true, webOnline: true, controlActive: true });
    assert.throws(() => c.command("player.pause"));
    first.message({ type: "session.snapshot", stateVersion: 1, state: {} });
    c.command("player.pause");
    const command = first.sent.at(-1).command;
    assert.equal(command.webSessionId, a.webSessionId);
    first.message({ type: "command.result", commandId: command.commandId, status: "completed" });
    assert.equal(c.pending.size, 0);
    await c.selectSaved(b.deviceId);
    assert.equal(c.grant.webSessionId, b.webSessionId);
    assert.equal(c.ready, false);
    first.message({ type: "session.snapshot", stateVersion: 9, state: {} });
    assert.equal(c.ready, false);
    assert.equal((await c.saved()).length, 2);
    assert.equal(c.socket.sent.length, 0);
  } finally {
    c.disconnect();
    globalThis.WebSocket = original;
    delete globalThis.__remoteStore;
  }
});
test("expired access renews in SecureStore before opening the mobile socket", async () => {
  const original = globalThis.WebSocket,
    fetch = globalThis.fetch;
  globalThis.WebSocket = Socket;
  const g = grant("renew");
  g.expiresAt = Date.now() - 1;
  globalThis.__remoteStore = new Map([["nuvio.remote", JSON.stringify(g)]]);
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      token: "renewed-token",
      expiresAt: Date.now() + 900000,
      linkExpiresAt: g.linkExpiresAt
    })
  });
  const c = new Connection(() => {});
  try {
    await c.restore();
    await new Promise(setImmediate);
    assert.equal(c.grant.token, "renewed-token");
    assert.equal(JSON.parse(__remoteStore.get("nuvio.remote")).token, "renewed-token");
    c.socket.open();
    assert.equal(c.socket.sent[0].token, "renewed-token");
  } finally {
    c.disconnect();
    globalThis.WebSocket = original;
    globalThis.fetch = fetch;
    delete globalThis.__remoteStore;
  }
});
test("revoking a previous screen cannot revoke a newly selected screen", async () => {
  const original = globalThis.WebSocket,
    originalFetch = globalThis.fetch;
  globalThis.WebSocket = Socket;
  const a = grant("revoke-a"),
    b = grant("keep-b");
  globalThis.__remoteStore = new Map([
    ["nuvio.remote", JSON.stringify(a)],
    ["nuvio.remote.links", JSON.stringify([a, b])]
  ]);
  let respond;
  globalThis.fetch = () =>
    new Promise((resolve) => {
      respond = resolve;
    });
  const c = new Connection(() => {});
  try {
    await c.restore();
    const revoked = c.revokeSelected();
    await c.selectSaved(b.deviceId);
    respond({ ok: true, json: async () => ({ revoked: true }) });
    await revoked;
    assert.equal(c.grant.deviceId, b.deviceId);
    assert.deepEqual(
      (await c.saved()).map((g) => g.deviceId),
      [b.deviceId]
    );
    assert.equal(JSON.parse(__remoteStore.get("nuvio.remote")).deviceId, b.deviceId);
  } finally {
    c.disconnect();
    globalThis.WebSocket = original;
    globalThis.fetch = originalFetch;
    delete globalThis.__remoteStore;
  }
});
