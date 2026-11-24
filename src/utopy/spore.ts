// ==============================
// File: src/utopy/spore.ts
// ✅ Opción 1: 2 WS (2 namespaces) SIN romper imports
//  - export const spore   (energy:core)
//  - export const sporeMT (mt)
//  - export async function initSpores(manifest)
//
// ✅ FIX (2026-01):
// - NO forzar ns="public" en el frame WS (antes rompía MT)
// - Guardar this.ns en init() y usarlo para el frame
// - Normalizar ns/say/sym (trim) para evitar "dv .upsert" / "pub lic"
// - En sayIntent: frame ns = intent.ns (así el seed enruta correcto)
// ==============================

import { UPortal } from "./ui/UniversalPortal";

type SporeEvents = {
  onState?: (s: any) => void;
  onLog?: (l: any) => void;
  onMessage?: (m: any) => void;
};

class SeedCompatChannel {
  public kind: "ws" = "ws";
  private url: string;
  private ws: WebSocket | null = null;

  onMessage?: (m: any) => void;
  onState?: (s: { connected: boolean; kind: "ws" }) => void;
  onClose?: (ev?: any) => void;

  constructor(url: string) {
    this.url = url;
  }

  setUrl(url: string) {
    this.url = url;
  }

  isConnected() {
    return this.ws?.readyState === 1;
  }

  async connect(urlOverride?: string) {
    return new Promise<void>((resolve, reject) => {
      const url = urlOverride || this.url;
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        this.onState?.({ connected: true, kind: "ws" });
        resolve();
      };

      ws.onmessage = (ev) => {
        try {
          this.onMessage?.(JSON.parse(String(ev.data)));
        } catch {
          /* ignore */
        }
      };

      ws.onclose = (ev) => {
        this.onState?.({ connected: false, kind: "ws" });
        this.onClose?.(ev);
      };

      ws.onerror = () => {
        this.onState?.({ connected: false, kind: "ws" });
        if (!this.isConnected()) reject(new Error("ws.connect.error"));
      };
    });
  }

  async disconnect() {
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
    this.onState?.({ connected: false, kind: "ws" });
  }

  async send(op: string, top: any) {
    if (!this.isConnected()) throw new Error("ws.not.connected");
    const frame = { kind: op, ...top };
    console.log("[UTOPY send]", frame);
    this.ws!.send(JSON.stringify(frame));
  }
}

function expoBackoff(attempt: number, baseMs = 800, maxMs = 15000) {
  const pow = Math.min(attempt, 6);
  const jitter = Math.floor(Math.random() * 200);
  return Math.min(maxMs, baseMs * Math.pow(2, pow)) + jitter;
}

export class UtopySpore {
  private chan: SeedCompatChannel | null = null;
  private events: SporeEvents;

  private ns: string | undefined;
  private listeners = new Map<string, Set<(msg: any) => void>>();
  private queue: Array<{ op: string; top: any }> = [];
  private state = { attached: false, via: "offline", id: "node@core" };

  private token: string | undefined;
  private seedUrl: string | undefined;
  private keepAliveTimer: any = null;

  private reconnecting = false;
  private reconnectAttempts = 0;

  private seen = new Map<string, number>();
  private seenTTL = 1500;

  private uiMountMode: "sink" | "sink+portal" = "sink";

  constructor(events: SporeEvents = {}) {
    this.events = events;
    this.token = (globalThis as any).__utopy_token || undefined;
  }

  setNamespace(ns?: string) {
    this.ns = (ns ? String(ns).trim() : undefined) || undefined;
  }
  getNamespace() {
    return this.ns;
  }
  getState() {
    return this.state;
  }

  setUIMountMode(mode: "sink" | "sink+portal") {
    this.uiMountMode = mode;
  }

  on(kind: string, fn: (m: any) => void) {
    if (!this.listeners.has(kind)) this.listeners.set(kind, new Set());
    this.listeners.get(kind)!.add(fn);
    return () => this.listeners.get(kind)!.delete(fn);
  }

  private notify(kind: string, msg: any) {
    if (this.listeners.has(kind)) {
      for (const fn of this.listeners.get(kind)!) {
        try {
          fn(msg);
        } catch {}
      }
    }
    if (this.listeners.has("*")) {
      for (const fn of this.listeners.get("*")!) {
        try {
          fn(msg);
        } catch {}
      }
    }
  }

  private _dedupeSig(payload: any) {
    return JSON.stringify({
      ns: payload?.ns,
      sym: payload?.sym,
      say: payload?.say,
      ts: payload?.ts,
      from: payload?.from,
    });
  }

  private _seen(sig: string) {
    const now = Date.now();
    for (const [k, t] of this.seen) if (now - t > this.seenTTL) this.seen.delete(k);
    if (this.seen.has(sig)) return true;
    this.seen.set(sig, now);
    return false;
  }

  async init(
    manifest: any,
    opts?: { token?: string; ns?: string; idSuffix?: string; id?: string }
  ) {
    const baseId = opts?.id || manifest?.id || this.state.id;
    const id = opts?.idSuffix ? `${baseId}${opts.idSuffix}` : baseId;

    this.state = { ...this.state, id };
    const ws = manifest?.ws?.[0] || manifest?.utopy?.transports?.gossip?.wsSeeds?.[0];

    // ✅ token: opts > manifest > global
    const token = opts?.token || manifest?.auth?.token || (globalThis as any).__utopy_token;
    this.token = token || undefined;
    (globalThis as any).__utopy_token = this.token;

    const ns = String(opts?.ns || "public").trim() || "public";
    this.setNamespace(ns); // ✅ guardar namespace del spore

    if (!ws) {
      this.events.onLog?.("No WS in manifest; running offline");
      return;
    }

    const base = String(ws);
    const glue = base.includes("?") ? "&" : "?";
    this.seedUrl = `${base}${glue}ns=${encodeURIComponent(ns)}`;
    await this._connectAndWire(this.seedUrl);
  }

  async attach(manifest: any) {
    const token = manifest?.auth?.token;
    return this.init(manifest, token ? { token, ns: "public" } : { ns: "public" });
  }

  async reconnect(url: string) {
    const ns = String(this.ns || "public").trim() || "public";
    const withNs = url.includes("?") ? url : `${url}?ns=${encodeURIComponent(ns)}`;
    this.seedUrl = withNs;
    await this._connectAndWire(withNs, true);
  }

  async sayIntent(i: {
    sym: string;
    say: string;
    with?: any;
    ns?: string;
    to?: string;
    replyTo?: string;
    ts?: number;
    from?: string;
  }) {
    const clean = (v: any) => String(v ?? "").trim();

    const ns = clean(i.ns ?? this.ns ?? "public") || "public";
    const sym = clean(i.sym);
    const say = clean(i.say);

    const intent = {
      ...i,
      ns,
      sym,
      say,
      ts: i.ts || Date.now(),
      from: i.from || this.state.id,
      with: i.with,
    };

    this._loopbackIntent(intent);

    // ✅ frame ns = intent.ns (seed enruta por frame ns)
    return this._send("intent", { payload: intent, ns });
  }

  async call(op: string, input?: any) {
    return this._send(op, input || {});
  }

  private async _connectAndWire(url: string, force = false) {
    if (!force && this.chan?.isConnected()) return;

    if (!this.chan) this.chan = new SeedCompatChannel(url);
    else this.chan.setUrl(url);

    this.chan.onMessage = (msg: any) => {
      if (msg?.ack && msg?.echo) {
        this.events.onMessage?.(msg);
        return;
      }

      if (msg?.kind === "intent" && msg?.payload) this._onIncomingIntent(msg.payload);

      if (msg?.error === "unauthorized") {
        console.warn("[UTOPY] unauthorized frame (verifica token por frame)");
      }

      this.events.onMessage?.(msg);
    };

    this.chan.onState = (st) => {
      this.state = { ...this.state, attached: st.connected, via: st.kind, id: this.state.id };
      this.events.onState?.(this.state);

      if (st.connected) {
        this.reconnecting = false;
        this.reconnectAttempts = 0;
        this._afterConnect().catch(() => {});
        this.flushQueue().catch(() => {});
      } else {
        this._stopKeepAlive();
      }
    };

    this.chan.onClose = () => {
      if (this.reconnecting) return;
      this.reconnecting = true;

      const wait = expoBackoff(this.reconnectAttempts++);
      setTimeout(async () => {
        try {
          await this.chan!.connect(this.seedUrl);
        } catch {
          /* keep trying */
        }
      }, wait);
    };

    try {
      await this.chan.connect(url);
    } catch {
      this.chan.onClose?.();
    }
  }

  private _emitUI(intent: any) {
    const sink = (this as any).__uiSink;
    if (typeof sink === "function") sink({ payload: intent });

    if (this.uiMountMode === "sink+portal") {
      try {
        const target = intent.ns || "default";
        UPortal.mount(intent.with.blocks, target);
      } catch {}
    }
  }

  private _loopbackIntent(intent: any) {
    try {
      this.notify("intent", { kind: "intent", payload: intent });
      if (intent.say === "render" && intent.with?.blocks) this._emitUI(intent);
    } catch {}
  }

  private _onIncomingIntent(payload: any) {
    try {
      if (payload?.from && payload.from === this.state.id) return;

      const sig = this._dedupeSig(payload);
      if (this._seen(sig)) return;

      this.notify("intent", { kind: "intent", payload });
      if (payload?.say === "render" && payload?.with?.blocks) this._emitUI(payload);
    } catch {}
  }

  private async _afterConnect() {
    await this._send("node.alive", {});
    this._startKeepAlive();
  }

  private _startKeepAlive() {
    this._stopKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      this._send("node.alive", {}).catch(() => {});
    }, 30000);
  }

  private _stopKeepAlive() {
    if (this.keepAliveTimer) {
      try {
        clearInterval(this.keepAliveTimer);
      } catch {}
    }
    this.keepAliveTimer = null;
  }

  private async _send(op: string, body: any) {
    const gTok = (globalThis as any).__utopy_token;

    // ✅ NO dejes que te pisen auth/id desde afuera
    const { auth: _auth, id: _id, ns: bodyNs, ...rest } = (body || {}) as any;

    // ✅ frame ns: bodyNs > this.ns > public
    const nsFrame = String(bodyNs ?? this.ns ?? "public").trim() || "public";

    const top: any = {
      ...rest,
      auth: this.token || gTok, // 🔑 auth por frame (siempre)
      id: this.state.id,        // ✅ id real del spore
      ns: nsFrame,              // ✅ namespace real del canal
    };

    if (!top.auth) {
      console.warn("[UTOPY] auth vacío: falta token en init(manifest,{token})");
    }

    if (!this.chan || !this.chan.isConnected()) {
      this.queue.push({ op, top });
      return { queued: true };
    }

    try {
      await this.chan.send(op, top);
      return { ok: true };
    } catch (e) {
      this.queue.push({ op, top });
      if (!this.reconnecting) this.chan.onClose?.();
      return { queued: true, error: String(e) };
    }
  }

  private async flushQueue() {
    if (!this.chan || !this.chan.isConnected() || this.queue.length === 0) return;
    const q = [...this.queue];
    this.queue.length = 0;
    for (const it of q) {
      try {
        await this.chan.send(it.op, it.top);
      } catch {}
    }
  }
}

// ======= Singletons GLOBAL (anti-duplicación Metro) =======
const G = globalThis as any;

export const spore: UtopySpore =
  G.__utopy_spore_ge ||
  (G.__utopy_spore_ge = new UtopySpore({
    onLog: (l) => console.log("[UTOPY GE]", l),
    onState: (s) => console.log("[UTOPY GE state]", s),
    onMessage: (m) => console.log("[UTOPY GE msg]", m),
  }));

export const sporeMT: UtopySpore =
  G.__utopy_spore_mt ||
  (G.__utopy_spore_mt = new UtopySpore({
    onLog: (l) => console.log("[UTOPY MT]", l),
    onState: (s) => console.log("[UTOPY MT state]", s),
    onMessage: (m) => console.log("[UTOPY MT msg]", m),
  }));

export async function initSpores(manifest: any) {
  const token = manifest?.auth?.token || G.__utopy_token;

  // 🔑 deja token global SIEMPRE
  G.__utopy_token = token;

  // energy core
  await spore.init(manifest, { token, ns: "energy:core", idSuffix: "#ge" });

  // mt
  await sporeMT.init(manifest, { token, ns: "mt", idSuffix: "#mt" });
}
