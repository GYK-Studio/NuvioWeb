import * as SecureStore from "expo-secure-store";
import { randomUUID } from "expo-crypto";

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
  constructor(public update: (message: any) => void) {}
  async claim(base: string, code: string) {
    const url = new URL(base);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
      throw Error("Usa una URL HTTPS válida para el servicio.");
    const r = await fetch(new URL("/remote/pairings/claim", url).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name: "Nuvio Remote" })
    });
    const result = await r.json();
    if (!r.ok) throw Error(result.error || "No se pudo emparejar");
    this.grant = { ...result, base: url.origin };
    await SecureStore.setItemAsync("nuvio.remote", JSON.stringify(this.grant));
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
      this.update({ type: "revoked" });
      return;
    }
    this.ready = false;
    const socket = (this.socket = new WebSocket(
      g.base.replace(/^https:/, "wss:") + "/remote/channel"
    ));
    socket.onopen = () => {
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
      if (m.type === "session.snapshot") this.ready = m.controlActive !== false;
      if (m.type === "control.changed") this.ready = m.controlActive === true;
      if (m.type === "offline") this.ready = false;
      this.update(m);
    };
    socket.onclose = (e) => {
      if (this.closed || socket !== this.socket) return;
      this.ready = false;
      this.socket = null;
      if (e.code === 4001) {
        void this.forget();
        this.update({ type: "revoked" });
        return;
      }
      this.update({ type: "offline" });
      this.retry = setTimeout(
        () => this.connect(),
        Math.min(30000, 1000 * 2 ** this.attempt++) + Math.random() * 500
      );
    };
  }
  command(type: string, payload: Record<string, unknown> = {}) {
    if (!this.ready || this.socket?.readyState !== WebSocket.OPEN || !this.grant)
      throw Error("La web no está conectada y autorizada.");
    this.socket.send(
      JSON.stringify({
        type: "command",
        command: {
          version: 1,
          commandId: randomUUID(),
          webSessionId: this.grant.webSessionId,
          sequence: ++this.sequence,
          type,
          payload,
          expiresAt: new Date(Date.now() + 9000).toISOString()
        }
      })
    );
  }
  disconnect() {
    this.lifecycle++;
    this.closed = true;
    this.ready = false;
    clearTimeout(this.retry);
    this.socket?.close();
    this.socket = null;
  }
  async forget() {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify({ type: "revoke.self" }));
    this.disconnect();
    this.grant = null;
    await SecureStore.deleteItemAsync("nuvio.remote");
  }
}
