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

// Exercise the browser toolbar independently of external streaming providers.
function surface() {
  return {
    listeners: new Map(),
    addEventListener(type, fn) {
      this.listeners.set(type, fn);
    },
    classList: { toggle() {} },
    style: { display: "block" }
  };
}
const playerSurface = surface();
const toolbar = surface();
const toolbarNodes = new Map();
toolbar.querySelector = (selector) => {
  if (!toolbarNodes.has(selector)) toolbarNodes.set(selector, {});
  return toolbarNodes.get(selector);
};
const documentSurface = surface();
globalThis.document = Object.assign(documentSurface, {
  getElementById: () => playerSurface,
  createElement: () => toolbar,
  body: { append() {} },
  pictureInPictureEnabled: true
});
toolbar.setAttribute = () => {};
globalThis.MutationObserver = class {
  observe() {}
};
let resets = 0;
const playback = {
  controlsVisible: false,
  setControlsVisible(value) {
    this.controlsVisible = value;
  },
  resetControlsAutoHide() {
    resets++;
  },
  isDialogOpen: () => false
};
globalThis.__webTestRouter = { getCurrent: () => "player", getCurrentScreen: () => playback };
const toolbarBundle = await build({
  entryPoints: ["js/bootstrap/webPlayerControls.js"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "toolbar-router",
      setup(builder) {
        builder.onResolve({ filter: /router\.js$/ }, () => ({
          path: "router",
          namespace: "toolbar-test"
        }));
        builder.onLoad({ filter: /.*/, namespace: "toolbar-test" }, () => ({
          contents: "export const Router = globalThis.__webTestRouter;"
        }));
      }
    }
  ]
});
const { installWebPlayerControls } = await import(
  `data:text/javascript;base64,${Buffer.from(toolbarBundle.outputFiles[0].text).toString("base64")}`
);
installWebPlayerControls();
assert.equal(toolbar.hidden, true, "window buttons hide with playback controls");
playerSurface.listeners.get("pointermove")({
  type: "pointermove",
  pointerType: "mouse",
  target: { closest: () => null }
});
assert.equal(playback.controlsVisible, true, "mouse movement reveals controls without arrows");
documentSurface.listeners.get("nuvio:player-controls")();
assert.equal(toolbar.hidden, false);
playerSurface.listeners.get("pointerdown")({
  type: "pointerdown",
  pointerType: "touch",
  target: { closest: () => toolbar }
});
assert.equal(playback.webControlsInteraction, true, "interaction with controls holds auto-hide");
playerSurface.listeners.get("pointerleave")();
assert.equal(playback.webControlsInteraction, false);
assert.ok(resets > 0);
playback.controlsVisible = false;
documentSurface.listeners.get("keydown")({ key: "Tab" });
assert.equal(playback.controlsVisible, true, "Tab restores access to hidden controls");
console.log("Player toolbar: mouse, touch, keyboard and visibility tests passed.");
