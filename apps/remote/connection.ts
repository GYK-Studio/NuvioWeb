import * as SecureStore from "expo-secure-store";
import { randomUUID } from "expo-crypto";
import { emptySession, sessionEvent } from "./session";

export type Grant = {
  webSessionId: string;
  deviceId: string;
  token: string;
  refreshToken?: string;
  linkExpiresAt?: number;
  expiresAt: number;
  sessionName: string;
  base: string;
};
export class Connection {
  socket: WebSocket | null = null;
  grant: Grant | null = null;
  ready = false;
  sequence = Date.now();
  retry: ReturnType<typeof setTimeout> | undefined;
  closed = true;
  attempt = 0;
  lifecycle = 0;
  session = { ...emptySession };
  handshake: ReturnType<typeof setTimeout> | undefined;
  pending = new Map<string, ReturnType<typeof setTimeout>>();
  renewal: ReturnType<typeof setTimeout> | undefined;
  renewing = false;
  lastStateVersion = -1;
  linkStatuses = new Map<string, { online?: boolean; lastSeen?: number }>();
  async refreshLinks() {
    await Promise.all(
      (await this.saved()).map(async (g) => {
        if (!g.refreshToken) return;
        const controller = new AbortController(),
          timer = setTimeout(() => controller.abort(), 10000);
        try {
          const response = await fetch(`${g.base}/remote/device/status`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              webSessionId: g.webSessionId,
              deviceId: g.deviceId,
              refreshToken: g.refreshToken
            }),
            signal: controller.signal
          });
          if (response.ok) {
            const status = await response.json();
            this.linkStatuses.set(g.deviceId, {
              online: Boolean(status.online),
              lastSeen: status.lastSeen
            });
          }
        } catch {
          this.linkStatuses.set(g.deviceId, {});
        } finally {
          clearTimeout(timer);
        }
      })
    );
    await this.publishLinks();
  }
  constructor(public update: (message: any) => void) {}
  async saved() {
    const raw = await SecureStore.getItemAsync("nuvio.remote.links");
    const links: Grant[] = raw ? JSON.parse(raw) : [];
    return links.filter((g) => (g.linkExpiresAt || g.expiresAt) > Date.now()).slice(0, 5);
  }
  async publishLinks() {
    this.update({
      type: "links",
      sessions: (await this.saved()).map((g) => ({
        deviceId: g.deviceId,
        name: g.sessionName,
        base: g.base,
        expiresAt: g.linkExpiresAt || g.expiresAt,
        active: g.deviceId === this.grant?.deviceId,
        ...this.linkStatuses.get(g.deviceId)
      }))
    });
  }
  async saveGrant(g: Grant) {
    const links = (await this.saved()).filter((link) => link.deviceId !== g.deviceId);
    if (links.length >= 5)
      throw Error("Puedes guardar hasta cinco pantallas. Desvincula una primero.");
    await SecureStore.setItemAsync("nuvio.remote.links", JSON.stringify([...links, g]));
    await SecureStore.setItemAsync("nuvio.remote", JSON.stringify(g));
    await this.publishLinks();
  }
  async selectSaved(deviceId: string) {
    const grant = (await this.saved()).find((g) => g.deviceId === deviceId);
    if (!grant) throw Error("El vínculo ya no está disponible.");
    this.disconnect();
    const generation = this.lifecycle;
    this.grant = grant;
    this.notify({ type: "paired" });
    await this.saveGrant(grant);
    if (generation !== this.lifecycle) return;
    this.closed = false;
    this.connect();
  }
  async newPairing() {
    this.disconnect();
    this.grant = null;
    await SecureStore.deleteItemAsync("nuvio.remote");
    this.notify({ type: "forgotten" });
    await this.publishLinks();
  }
  notify(message: any) {
    this.session = sessionEvent(this.session, message);
    this.ready =
      this.session.approved &&
      this.session.online &&
      this.session.active &&
      this.session.synchronized;
    this.update(message);
  }
  async claim(base: string, code: string, name = "Nuvio Remote") {
    if (this.grant) throw Error("Desvincula la sesión anterior antes de conectar otra web.");
    const generation = ++this.lifecycle;
    if ((await this.saved()).length >= 5)
      throw Error("Ya tienes cinco pantallas guardadas. Desvincula una primero.");
    const url = new URL(base);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
      throw Error("Usa una URL HTTPS válida para el servicio.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let result;
    try {
      const r = await fetch(new URL("/remote/pairings/claim", url).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim().slice(0, 60) || "Nuvio Remote"
        }),
        signal: controller.signal
      });
      result = await r.json();
      if (!r.ok) throw Error(result.error || "No se pudo emparejar");
    } finally {
      clearTimeout(timeout);
    }
    const grant: Grant = { ...result, base: url.origin };
    this.grant = grant;
    await this.saveGrant(grant);
    this.notify({ type: "paired" });
    if (generation !== this.lifecycle) return;
    this.closed = false;
    this.connect();
  }
  async restore() {
    const lifecycle = this.lifecycle;
    await this.publishLinks();
    const raw = await SecureStore.getItemAsync("nuvio.remote");
    if (!raw || lifecycle !== this.lifecycle) return;
    try {
      const g: Grant = JSON.parse(raw);
      if ((g.linkExpiresAt || g.expiresAt) <= Date.now()) {
        await this.forget();
        return;
      }
      this.grant = g;
      await this.saveGrant(g);
      if (lifecycle !== this.lifecycle) return;
      if (!this.session.paired) this.notify({ type: "paired" });
      this.closed = false;
      this.connect();
    } catch {
      if (lifecycle === this.lifecycle) await this.forget();
    }
  }
  connect() {
    const g = this.grant;
    if (this.closed || !g) return;
    if (g.refreshToken && g.expiresAt <= Date.now() + 60000) {
      void this.renew();
      return;
    }
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)
    )
      return;
    clearTimeout(this.retry);
    if (g.expiresAt <= Date.now()) {
      void this.forget();
      this.notify({ type: "revoked" });
      return;
    }
    this.ready = false;
    this.lastStateVersion = -1;
    clearTimeout(this.renewal);
    if (g.refreshToken)
      this.renewal = setTimeout(
        () => {
          void this.renew();
        },
        Math.max(1000, g.expiresAt - Date.now() - 60000)
      );
    const socket = (this.socket = new WebSocket(
      g.base.replace(/^https:/, "wss:") + "/remote/channel"
    ));
    clearTimeout(this.handshake);
    this.handshake = setTimeout(() => {
      if (socket === this.socket && !this.closed) socket.close();
    }, 10000);
    socket.onopen = () => {
      if (this.closed || socket !== this.socket) return;
      this.attempt = 0;
      socket.send(
        JSON.stringify({
          type: "authenticate",
          role: "device",
          webSessionId: g.webSessionId,
          deviceId: g.deviceId,
          token: g.token
        })
      );
    };
    socket.onmessage = (e) => {
      if (this.closed || socket !== this.socket) return;
      let m;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      if (["connected", "approved", "session.snapshot"].includes(m.type))
        clearTimeout(this.handshake);
      if (m.type === "session.snapshot" && Number.isSafeInteger(m.stateVersion)) {
        if (m.stateVersion < this.lastStateVersion) return;
        const gap = this.lastStateVersion >= 0 && m.stateVersion > this.lastStateVersion + 1;
        this.lastStateVersion = m.stateVersion;
        if (gap) this.socket?.send(JSON.stringify({ type: "state.request" }));
      }
      if (m.type === "command.result" && m.status !== "accepted") {
        clearTimeout(this.pending.get(m.commandId));
        this.pending.delete(m.commandId);
      }
      this.notify(m);
    };
    socket.onclose = (e) => {
      if (this.closed || socket !== this.socket) return;
      clearTimeout(this.handshake);
      this.clearPending();
      this.ready = false;
      this.socket = null;
      if (e.code === 4001) {
        void this.forget();
        this.notify({ type: "revoked" });
        return;
      }
      this.notify({ type: "offline" });
      this.retry = setTimeout(
        () => this.connect(),
        Math.min(30000, 1000 * 2 ** this.attempt++) + Math.random() * 500
      );
    };
  }
  command(type: string, payload: Record<string, unknown> = {}) {
    if (!this.ready || this.socket?.readyState !== WebSocket.OPEN || !this.grant)
      throw Error("La web no está conectada y autorizada.");
    const commandId = randomUUID();
    if (this.pending.size >= 10) throw Error("Espera a que terminen las órdenes anteriores.");
    this.socket.send(
      JSON.stringify({
        type: "command",
        command: {
          version: 1,
          commandId,
          webSessionId: this.grant.webSessionId,
          sequence: ++this.sequence,
          type,
          payload,
          expiresAt: new Date(Date.now() + 9000).toISOString()
        }
      })
    );
    this.pending.set(
      commandId,
      setTimeout(() => {
        this.pending.delete(commandId);
        this.notify({ type: "command.result", commandId, status: "rejected", error: "TIMEOUT" });
      }, 10000)
    );
  }
  clearPending() {
    for (const timer of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
  }
  async renew() {
    const g = this.grant,
      generation = this.lifecycle;
    if (this.closed || !g?.refreshToken || this.renewing) return;
    this.renewing = true;
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${g.base}/remote/refresh/device`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webSessionId: g.webSessionId,
          deviceId: g.deviceId,
          refreshToken: g.refreshToken
        }),
        signal: controller.signal
      });
      const result = await response.json();
      if (this.closed || generation !== this.lifecycle || g !== this.grant) return;
      if (!response.ok) {
        if (result.error === "UNAUTHORIZED") {
          await this.forget();
          this.notify({ type: "revoked" });
          return;
        }
        throw Error("UNAVAILABLE");
      }
      Object.assign(g, result);
      await this.saveGrant(g);
      clearTimeout(this.renewal);
      this.renewal = setTimeout(
        () => {
          void this.renew();
        },
        Math.max(1000, g.expiresAt - Date.now() - 60000)
      );
      this.connect();
    } catch {
      if (!this.closed && generation === this.lifecycle) {
        this.notify({ type: "offline" });
        this.renewal = setTimeout(() => {
          void this.renew();
        }, 10000);
      }
    } finally {
      clearTimeout(timer);
      this.renewing = false;
    }
  }
  sync() {
    if (this.socket?.readyState === WebSocket.OPEN && this.session.approved)
      this.socket.send(JSON.stringify({ type: "state.request" }));
    else if (this.grant) {
      this.disconnect();
      this.closed = false;
      this.connect();
    }
  }
  disconnect() {
    this.lifecycle++;
    this.closed = true;
    this.ready = false;
    clearTimeout(this.retry);
    clearTimeout(this.renewal);
    clearTimeout(this.handshake);
    this.clearPending();
    this.socket?.close();
    this.socket = null;
    this.notify({ type: "offline" });
  }
  async forget() {
    const forgottenId = this.grant?.deviceId;
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify({ type: "revoke.self" }));
    this.disconnect();
    this.grant = null;
    this.notify({ type: "forgotten" });
    await SecureStore.deleteItemAsync("nuvio.remote");
    await SecureStore.setItemAsync(
      "nuvio.remote.links",
      JSON.stringify((await this.saved()).filter((g) => g.deviceId !== forgottenId))
    );
    await this.publishLinks();
  }
  async revokeSelected() {
    const g = this.grant;
    if (!g?.refreshToken) return this.forget();
    this.disconnect();
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${g.base}/remote/devices/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webSessionId: g.webSessionId,
          deviceId: g.deviceId,
          refreshToken: g.refreshToken
        }),
        signal: controller.signal
      });
      const result = await response.json();
      if (!response.ok && result.error !== "UNAUTHORIZED")
        throw Error(
          "No se pudo revocar en el servidor. El vínculo sigue guardado para reintentar."
        );
      if (this.grant?.deviceId === g.deviceId) await this.forget();
      else {
        await SecureStore.setItemAsync(
          "nuvio.remote.links",
          JSON.stringify((await this.saved()).filter((link) => link.deviceId !== g.deviceId))
        );
        await this.publishLinks();
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
