import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "../../node_modules/esbuild/lib/main.js";
test("content actions are opaque, paginated and invalidated on navigation", async () => {
  let route = "search",
    opened = null;
  const screen = {
    query: "Test",
    rows: [
      {
        items: Array.from({ length: 25 }, (_, i) => ({
          id: `tt${i}`,
          name: `Title ${i}`,
          type: "movie",
          addonBaseUrl: "https://example.com/private?token=secret"
        }))
      }
    ]
  };
  globalThis.__remoteRouter = {
    getCurrent: () => route,
    getCurrentScreen: () => screen,
    navigate: async (r, p) => {
      opened = { r, p };
      route = r;
    }
  };
  const output = await build({
    entryPoints: ["js/core/remote/remoteContent.js"],
    absWorkingDir: new URL("../../", import.meta.url).pathname,
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    plugins: [
      {
        name: "mock",
        setup(b) {
          b.onResolve({ filter: /router\.js$/ }, () => ({ path: "router", namespace: "test" }));
          b.onResolve({ filter: /playerController\.js$/ }, () => ({
            path: "player",
            namespace: "test"
          }));
          b.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => ({
            contents:
              path === "router"
                ? "export const Router=globalThis.__remoteRouter"
                : "export const PlayerController={}"
          }));
        }
      }
    ]
  });
  const { RemoteContent } = await import(
    `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`
  );
  const content = new RemoteContent(),
    snapshot = content.snapshot();
  assert.equal(snapshot.items.length, 12);
  assert.equal(snapshot.pageCount, 3);
  assert.ok(!JSON.stringify(snapshot).includes("secret"));
  assert.ok(!JSON.stringify(snapshot).includes("https://"));
  const old = snapshot.items[0].key;
  content.setPage(1);
  await assert.rejects(() => content.activate(old), /STALE_STATE/);
  const current = content.snapshot().items[0].key;
  await content.activate(current);
  assert.equal(opened.p.itemId, "tt12");
  await assert.rejects(() => content.activate(current), /STALE_STATE/);
});
