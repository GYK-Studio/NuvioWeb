import * as SecureStore from "expo-secure-store";
import { randomUUID } from "expo-crypto";
import { emptySession, sessionEvent } from "./session";

export type Grant = {
  webSessionId: string;
  deviceId: string;
  token: string;
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
  constructor(public update: (message: any) => void) {}
  notify(message: any) {
    this.session = sessionEvent(this.session, message);
    this.ready = this.session.approved && this.session.online && this.session.active;
    this.update(message);
  }
  async claim(base: string, code: string) {
    if (this.grant) throw Error("Desvincula la sesión anterior antes de conectar otra web.");
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
        body: JSON.stringify({ code: code.trim(), name: "Nuvio Remote" }),
        signal: controller.signal
      });
      result = await r.json();
      if (!r.ok) throw Error(result.error || "No se pudo emparejar");
    } finally {
      clearTimeout(timeout);
    }
    this.grant = { ...result, base: url.origin };
    await SecureStore.setItemAsync("nuvio.remote", JSON.stringify(this.grant));
    this.notify({ type: "paired" });
    this.closed = false;
    this.connect();
  }
  async restore() {
    const lifecycle = this.lifecycle;
    const raw = await SecureStore.getItemAsync("nuvio.remote");
    if (!raw || lifecycle !== this.lifecycle) return;
    try {
      const g: Grant = JSON.parse(raw);
      if (g.expiresAt <= Date.now()) {
        await this.forget();
        return;
      }
      this.grant = g;
      if (!this.session.paired) this.notify({ type: "paired" });
      this.closed = false;
      this.connect();
    } catch {
      await this.forget();
    }
  }
  connect() {
    const g = this.grant;
    if (this.closed || !g) return;
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
    clearTimeout(this.handshake);
    this.clearPending();
    this.socket?.close();
    this.socket = null;
    this.notify({ type: "offline" });
  }
  async forget() {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify({ type: "revoke.self" }));
    this.disconnect();
    this.grant = null;
    this.notify({ type: "forgotten" });
    await SecureStore.deleteItemAsync("nuvio.remote");
  }
}
