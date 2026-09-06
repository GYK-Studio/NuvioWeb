import { Router } from "./router.js";
import { Platform } from "../../platform/index.js";

function buildNormalizedEvent(event) {
  const normalizedKey = Platform.normalizeKey(event);
  const normalizedCode = Number(normalizedKey.keyCode || 0);

  return {
    key: normalizedKey.key,
    code: normalizedKey.code,
    keyName: normalizedKey.keyName,
    target: event?.target || null,
    altKey: Boolean(event?.altKey),
    ctrlKey: Boolean(event?.ctrlKey),
    shiftKey: Boolean(event?.shiftKey),
    metaKey: Boolean(event?.metaKey),
    repeat: Boolean(event?.repeat),
    defaultPrevented: Boolean(event?.defaultPrevented),
    keyCode: normalizedCode,
    which: normalizedCode,
    originalKeyCode: Number(normalizedKey.originalKeyCode || event?.keyCode || 0),
    keyDownDurationMs: 0,
    preventDefault: () => {
      if (typeof event?.preventDefault === "function") {
        event.preventDefault();
      }
    },
    stopPropagation: () => {
      if (typeof event?.stopPropagation === "function") {
        event.stopPropagation();
      }
    },
    stopImmediatePropagation: () => {
      if (typeof event?.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
    }
  };
}

function hasActiveModal() {
  return Boolean(globalThis?.document?.body?.classList?.contains("nuvio-modal-open"));
}

const BACK_DEBOUNCE_MS = 250;

export const FocusEngine = {
  lastBackHandledAt: 0,
  lastPointerFocusTarget: null,
  pointerMoveFrame: null,
  pendingPointerMoveEvent: null,
  activeKeyDownStartedAt: new Map(),
  activeBackKeyIdentities: new Set(),

  init() {
    this.boundHandleKey = this.handleKey.bind(this);
    this.boundHandleKeyUp = this.handleKeyUp.bind(this);
    document.addEventListener("keydown", this.boundHandleKey, true);
    document.addEventListener("keyup", this.boundHandleKeyUp, true);
    document.addEventListener("focusin", (event) => {
      const target = event.target.closest?.(".focusable");
      if (!target) return;
      const screen = target.closest(".screen");
      screen?.querySelectorAll(".focusable.focused").forEach((node) => {
        if (node !== target) node.classList.remove("focused");
      });
      target.classList.add("focused");
    });
  },

  handleBack(event, normalizedEvent = buildNormalizedEvent(event)) {
    const now = Date.now();
    const elapsedSinceHandled = now - Number(this.lastBackHandledAt || 0);
    if (normalizedEvent.repeat || elapsedSinceHandled < BACK_DEBOUNCE_MS) {
      normalizedEvent.preventDefault();
      normalizedEvent.stopPropagation();
      normalizedEvent.stopImmediatePropagation();
      Router.consumeRouteReturnBackGuard?.();
      return;
    }
    this.lastBackHandledAt = now;

    normalizedEvent.preventDefault();
    normalizedEvent.stopPropagation();
    normalizedEvent.stopImmediatePropagation();

    if (Router.consumeRouteReturnBackGuard?.()) {
      return;
    }

    const currentScreen = Router.getCurrentScreen();
    const consumeResult = currentScreen?.consumeBackRequest?.();
    if (consumeResult) {
      if (consumeResult === "history") {
        return;
      }
      Router.suppressNextPopstate?.();
      return;
    }

    if (hasActiveModal()) {
      Router.suppressNextPopstate?.();
      return;
    }

    Router.back();
  },

  handleKey(event) {
    // Native editing, browser shortcuts and Tab belong to the browser.
    if (event.ctrlKey || event.metaKey || event.altKey || event.key === "Tab") return;
    if (event.target?.closest?.("input, textarea, select, [contenteditable=true], form")) return;
    if (Router.getCurrent() !== "player" && event.key.startsWith("Arrow")) return;
    if (event.target?.closest?.("button, a[href]") && ["Enter", " "].includes(event.key)) return;
    if (event?.target && !document.contains(event.target)) {
      return;
    }

    if (hasActiveModal()) {
      return;
    }

    const normalizedEvent = buildNormalizedEvent(event);
    const keyIdentity = this.getKeyIdentity(normalizedEvent);
    if (keyIdentity && (!normalizedEvent.repeat || !this.activeKeyDownStartedAt.has(keyIdentity))) {
      this.activeKeyDownStartedAt.set(keyIdentity, Date.now());
    }

    if (
      Platform.isBackEvent({
        target: normalizedEvent.target,
        key: normalizedEvent.key,
        code: normalizedEvent.code,
        keyName: normalizedEvent.keyName,
        keyCode: normalizedEvent.keyCode,
        originalKeyCode: normalizedEvent.originalKeyCode
      })
    ) {
      // Samsung TV delivers the mandatory Back key through keydown/keyup. A
      // held remote key can emit another keydown after the 250 ms timing
      // debounce, while the first Player -> Sources transition is still
      // mounting. Treat one keydown/keyup cycle as one Android-style Back
      // action; a later press is released first and therefore remains valid.
      const backKeyIdentity = keyIdentity || "back";
      if (this.activeBackKeyIdentities.has(backKeyIdentity)) {
        normalizedEvent.preventDefault();
        normalizedEvent.stopPropagation();
        normalizedEvent.stopImmediatePropagation();
        Router.consumeRouteReturnBackGuard?.();
        return;
      }
      this.activeBackKeyIdentities.add(backKeyIdentity);
      this.handleBack(event, normalizedEvent);
      return;
    }

    const currentScreen = Router.getCurrentScreen();

    if (currentScreen?.onKeyDown) {
      Promise.resolve(currentScreen.onKeyDown(normalizedEvent)).catch((error) => {
        console.warn("Screen keydown handler failed", error);
      });
    }
  },

  handleKeyUp(event) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.key === "Tab") return;
    if (event.target?.closest?.("input, textarea, select, [contenteditable=true], form")) return;
    if (Router.getCurrent() !== "player" && event.key.startsWith("Arrow")) return;
    if (event.target?.closest?.("button, a[href]") && ["Enter", " "].includes(event.key)) return;
    const normalizedEvent = buildNormalizedEvent(event);
    const keyIdentity = this.getKeyIdentity(normalizedEvent);
    if (
      Platform.isBackEvent({
        target: normalizedEvent.target,
        key: normalizedEvent.key,
        code: normalizedEvent.code,
        keyName: normalizedEvent.keyName,
        keyCode: normalizedEvent.keyCode,
        originalKeyCode: normalizedEvent.originalKeyCode
      })
    ) {
      this.activeBackKeyIdentities.delete(keyIdentity || "back");
    }
    if (event?.target && !document.contains(event.target)) return;
    if (hasActiveModal()) {
      if (keyIdentity) {
        this.activeKeyDownStartedAt.delete(keyIdentity);
      }
      return;
    }

    if (keyIdentity) {
      const startedAt = Number(this.activeKeyDownStartedAt.get(keyIdentity) || 0);
      normalizedEvent.keyDownDurationMs = startedAt > 0 ? Math.max(0, Date.now() - startedAt) : 0;
      this.activeKeyDownStartedAt.delete(keyIdentity);
    }

    const currentScreen = Router.getCurrentScreen();
    if (!currentScreen?.onKeyUp) {
      return;
    }
    Promise.resolve(currentScreen.onKeyUp(normalizedEvent)).catch((error) => {
      console.warn("Screen keyup handler failed", error);
    });
  },

  getKeyIdentity(event) {
    const keyCode = Number(event?.keyCode || event?.which || 0);
    if (keyCode) {
      return `code:${keyCode}`;
    }
    const key = String(event?.key || event?.code || event?.keyName || "").trim();
    return key ? `key:${key}` : "";
  },

  getPointerFocusable(event) {
    const target = event?.target?.closest?.(".focusable");
    if (!target || !(target instanceof HTMLElement) || !document.contains(target)) {
      return null;
    }
    if (
      target.disabled ||
      target.classList.contains("is-disabled") ||
      target.classList.contains("disabled") ||
      target.getAttribute("aria-disabled") === "true"
    ) {
      return null;
    }
    const rect = target.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    return target;
  },

  focusPointerTarget(target, event = null) {
    if (!target) {
      return false;
    }
    if (hasActiveModal() && !target.closest?.(".nuvio-dialog-backdrop")) {
      return false;
    }
    const currentScreen = Router.getCurrentScreen();
    const screenContainer =
      currentScreen?.container instanceof HTMLElement
        ? currentScreen.container
        : target.closest(".screen");
    if (screenContainer && !screenContainer.contains(target)) {
      return false;
    }

    const focusRoot = screenContainer || document;
    focusRoot.querySelectorAll?.(".focusable.focused")?.forEach((node) => {
      if (node !== target) {
        node.classList.remove("focused");
      }
    });
    target.classList.add("focused");
    try {
      target.focus({ preventScroll: true });
    } catch (_) {
      try {
        target.focus();
      } catch (_) {}
    }
    currentScreen?.onPointerFocus?.(target, event);
    this.lastPointerFocusTarget = target;
    return true;
  }

  // Browser controls handle pointer focus and activation natively.
};
