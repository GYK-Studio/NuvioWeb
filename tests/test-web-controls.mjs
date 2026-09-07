import assert from "node:assert/strict";
import { build } from "esbuild";

// Unit test the explicit browser click bridge, without a backend or browser
// session. Visual/layout coverage is recorded separately in the audit report.
const listeners = new Map();
globalThis.HTMLElement = class {};
globalThis.document = {
  addEventListener: (type, handler) => listeners.set(type, handler),
  contains: () => true,
  body: { classList: { contains: () => false } }
};
const screen = { container: { contains: () => true } };
globalThis.__webTestRouter = { current: "detail", getCurrentScreen: () => screen };
const bundle = await build({
  entryPoints: ["js/ui/navigation/focusEngine.js"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "isolated-navigation",
      setup(builder) {
        builder.onResolve({ filter: /router\.js$/ }, () => ({ path: "router", namespace: "test" }));
        builder.onResolve({ filter: /platform\/index\.js$/ }, () => ({
          path: "platform",
          namespace: "test"
        }));
        builder.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => ({
          contents:
            path === "router"
              ? "export const Router = globalThis.__webTestRouter;"
              : "export const Platform = { normalizeKey: (event) => event };"
        }));
      }
    }
  ]
});
const { FocusEngine } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
FocusEngine.focusPointerTarget = () => true;
FocusEngine.init();
const target = Object.assign(new HTMLElement(), {
  closest() {
    return this;
  },
  matches: () => false,
  classList: { contains: () => false },
  getAttribute: () => null,
  getBoundingClientRect: () => ({ width: 44, height: 44 })
});
async function click(overrides = {}) {
  listeners.get("click")({ target, defaultPrevented: false, ...overrides });
  await new Promise(setImmediate);
}
let count = 0;
screen.activateControl = () => {
  count++;
};
await click();
assert.equal(count, 1, "detail must activate exactly once");
await click({ defaultPrevented: true });
target.disabled = true;
await click();
target.disabled = false;
assert.equal(count, 1, "cancelled and disabled controls must not activate");
for (const route of ["home", "settings", "search", "plugins", "profileSelection"]) {
  globalThis.__webTestRouter.current = route;
  await click();
}
assert.equal(count, 1, "views with their own click handlers must not activate twice");
delete screen.activateControl;
globalThis.__webTestRouter.current = "stream";
screen.onPointerActivate = () => {
  count++;
  return true;
};
screen.onKeyDown = () => {
  throw new Error("pointer-handled action must not fall through");
};
await click();
assert.equal(count, 2);
delete screen.onPointerActivate;
globalThis.__webTestRouter.current = "catalogSeeAll";
const sequence = [];
screen.onKeyDown = (event) => sequence.push(["down", event.keyCode]);
screen.onKeyUp = (event) => sequence.push(["up", event.keyCode]);
await click();
assert.deepEqual(
  sequence,
  [
    ["down", 13],
    ["up", 13]
  ],
  "legacy short activation must release hold handlers"
);
console.log("Web controls: all activation regression tests passed.");
