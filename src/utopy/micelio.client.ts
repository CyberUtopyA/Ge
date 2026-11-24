// ==============================
// FILE: src/utopy/micelio/micelio.client.ts
// Micelio client (RN/Browser safe)
// - HTTP Micelio: /health /dv /dv/:id /events(SSE) /sem/dv/ask
// - Publish DV DIRECTO por seed: dato.create (no intent dv.upsert) ✅
// - Fallback subscribe: escucha intents "dv.upsert" (compat viejo)
// - CERO import.meta (Hermes friendly)
//
// ✅ FIX (2026-01):
// - micelioPublishDV: si dv.meta.ns es mt/* -> publicar por sporeMT (frame ns=mt)
// - PUBLICAR con spore.call("dato.create", ...) directo (no sayIntent) ✅
// - no hardcodear ns:"public" al publicar DV (solo asegurar public en scopes)
// - micelioOnDV filtra por dv.meta.ns (real) y normaliza strings (trim)
// ==============================

import { spore, sporeMT } from "./spore";

// -----------------------------
// Config (SIN import.meta)
// -----------------------------
const ENV = (globalThis as any)?.process?.env ?? {};

const MICELIO_HTTP =
  ENV.VITE_MICELIO_HTTP ||
  ENV.MICELIO_HTTP ||
  "https://seed.mterra.space/micelio"; // ✅ por defecto el proxy caddy

const DEFAULT_WS_URL =
  ENV.VITE_SEED_WS ||
  "wss://seed.mterra.space/utopy?ns=public&client=ge";

const SEED_AUTH =
  ENV.VITE_SEED_TOKEN ||
  ENV.SEED_AUTH ||
  "utopy-resonancia";

// -----------------------------
// Types
// -----------------------------
export type DV = {
  id: string;
  kind?: string;
  labels?: string[];
  traits?: string[];
  attrs?: any;
  meta?: {
    ns?: string;
    scopes?: string[];
    ts?: number;
    scope?: string;
    [k: string]: any;
  };
  [k: string]: any;
};

export type MicelioHealth = {
  ok: boolean;
  id?: string;
  ns?: string;
  scopes?: string[];
  seedWs?: string;
  ws?: "open" | "closed" | string;
  ts?: number;
  [k: string]: any;
};

export type DVListResponse =
  | { ok?: boolean; items?: DV[]; dvs?: DV[]; payload?: { items?: DV[] } }
  | DV[];

export type SemAsk = {
  kind?: "sem.dv.ask";
  dv?: DV;
  dvId?: string;
  scope?: string;
  ui?: { ctx?: string; [k: string]: any };
  [k: string]: any;
};

export type SemAnswer = {
  ok?: boolean;
  kind?: "sem.dv.answer";
  dvId?: string;
  scope?: string;
  facets?: Record<string, any>;
  outcome?: any;
  [k: string]: any;
};

type Unsub = () => void;
type PublishMode = "RAW" | "EVENT"; // RAW = manda dv suelto; EVENT = dato.create (recomendado)

// -----------------------------
// Small helpers
// -----------------------------
const clean = (v: any) => String(v ?? "").trim();

function toURL(p: string) {
  const base = clean(MICELIO_HTTP).replace(/\/+$/, "");
  const path = clean(p).replace(/^\/+/, "");
  return `${base}/${path}`;
}

async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url, { method: "GET" });
  if (!r.ok) throw new Error(`micelio GET ${r.status}`);
  return (await r.json()) as T;
}

async function jpost<T>(url: string, body: any): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`micelio POST ${r.status}: ${txt || "error"}`);
  }
  return (await r.json()) as T;
}

function normalizeDVItems(json: DVListResponse): DV[] {
  if (Array.isArray(json)) return json as DV[];
  const any = json as any;
  const items =
    any?.items ||
    any?.dvs ||
    any?.payload?.items ||
    (Array.isArray(any?.payload) ? any.payload : null);
  return Array.isArray(items) ? (items as DV[]) : [];
}

const pickSporeByDvNs = (dvNs?: string) => {
  const n = clean(dvNs);
  if (n === "mt" || n.startsWith("mt:")) return sporeMT;
  return spore;
};

const pickFrameNsByDvNs = (_dvNs?: string) => {
  // Prosegur: todo enruta por el seed MT
  return "mt";
};


// -----------------------------
// 1) HTTP API
// -----------------------------
export async function micelioHealth(): Promise<MicelioHealth> {
  return jget<MicelioHealth>(toURL("/health"));
}

export async function micelioListDV(opts?: {
  limit?: number;
  scope?: string;
  worldId?: string;
}): Promise<DV[]> {
  const url = new URL(toURL("/dv"));
  url.searchParams.set("limit", String(opts?.limit ?? 200));
  if (opts?.scope) url.searchParams.set("scope", clean(opts.scope));
  if (opts?.worldId) url.searchParams.set("worldId", clean(opts.worldId));
  const json = await jget<DVListResponse>(url.toString());
  return normalizeDVItems(json);
}

export async function micelioGetDV(id: string): Promise<DV | null> {
  if (!id) return null;
  try {
    return await jget<DV>(toURL(`/dv/${encodeURIComponent(id)}`));
  } catch {
    return null;
  }
}

export async function micelioAskFacets(ask: SemAsk): Promise<SemAnswer> {
  const payload: SemAsk = {
    kind: ask.kind || "sem.dv.ask",
    scope: ask.scope || "public",
    dvId: ask.dvId || ask.dv?.id,
    dv: ask.dv,
    ui: ask.ui,
    ...ask,
  };
  return jpost<SemAnswer>(toURL("/sem/dv/ask"), payload);
}

/**
 * SSE /events
 * Nota RN: EventSource casi nunca existe.
 * En RN devolvemos noop y usás micelioWatchDV o spore fallback.
 */
export function micelioOnEvents(
  handler: (evt: any) => void,
  opts?: { path?: string }
): Unsub {
  const ES: any = (globalThis as any)?.EventSource;
  if (!ES) return () => {};

  const url = toURL(opts?.path || "/events");
  const es = new ES(url);

  const onMsg = (e: MessageEvent) => {
    try {
      const data = JSON.parse((e as any)?.data ?? "{}");
      handler(data);
    } catch {
      handler({ raw: (e as any)?.data });
    }
  };

  es.addEventListener("message", onMsg as any);
  es.addEventListener("dv", onMsg as any);
  es.addEventListener("event", onMsg as any);

  return () => {
    try {
      es.removeEventListener("message", onMsg as any);
      es.close?.();
    } catch {}
  };
}

// -----------------------------
// 2) Publish DV (DIRECTO dato.create ✅)
// -----------------------------
export async function micelioPublishDV(
  dv: DV,
  opts?: { mode?: PublishMode; ns?: string; scopes?: string[] }
) {
  const mode = (opts?.mode || "EVENT") as PublishMode; // ✅ por defecto EVENT (dato.create)

  const me = (spore as any)?.getState?.()?.id || "unknown";
  const meta = dv.meta || {};

  const nsDv = clean(meta.ns ?? opts?.ns ?? "mt:ge") || "mt:ge";

  dv.meta = {
    ...meta,
    ts: meta.ts ?? Date.now(),
    ns: nsDv,
    // ✅ nunca pisar scopes existentes; solo asegurar "public" + opts.scopes
    scopes: Array.from(
      new Set([...(meta.scopes || []), ...(opts?.scopes || []), "public"])
    ),
    source: meta.source ?? me,
    emitter: meta.emitter ?? me,
    eventId:
      meta.eventId ?? `${me}:${Date.now()}:${Math.random().toString(16).slice(2)}`,
  };

  // ✅ si es mt:* publicamos por sporeMT y frame ns="mt"
  const s = pickSporeByDvNs(nsDv);
  const frameNs = pickFrameNsByDvNs(nsDv);

  if (mode === "RAW") {
    // RAW: mandar el DV suelto por dato.create igual (más compatible que inventar otro op)
    // (Micelio server/seed ya entiende dato.create)
    return s.call("dato.create", {
      payload: dv,
      meta: dv.meta,
      auth: SEED_AUTH,
      ns: frameNs, // frame ns para routing del seed
    } as any);
  }

  // EVENT: dato.create con payload+meta (recomendado)
  return s.call("dato.create", {
    payload: dv,
    meta: dv.meta,
    auth: SEED_AUTH,
    ns: frameNs, // ✅ frame ns (mt/public)
  } as any);
}

// -----------------------------
// 3) Subscribe DV (fallback por seed/spore)
// -----------------------------
// (esto queda por compat: si todavía recibís intents dv.upsert desde otros nodos)
export function micelioOnDV(
  handler: (dv: DV, raw: any) => void,
  opts?: { scopeNs?: string } // filtra por dv.meta.ns real
): Unsub {
  const wantNs = clean(opts?.scopeNs);

  const unsub = spore.on("intent", (msg: any) => {
    const i = msg?.payload || msg;
    if (!i) return;

    if (clean(i.say) !== "dv.upsert") return;

    // ✅ ignorar self-echo
    const me = (spore as any)?.getState?.()?.id;
    const fromId = msg?.id || i?.id;
    if (me && fromId === me) return;

    // soporta RAW y EVENT
    const rawDv = i?.with?.dv;
    const dv = rawDv?.payload || rawDv;
    if (!dv?.id) return;

    // ✅ filtrar por ns REAL del DV (no por i.ns del frame)
    const dvNs = clean(dv?.meta?.ns);
    if (wantNs && dvNs !== wantNs) return;

    // ✅ opcional: evitar rebotes por source/emitter
    if (me && (dv?.meta?.source === me || dv?.meta?.emitter === me)) return;

    handler(dv as DV, i);
  });

  return () => {
    try {
      if (typeof unsub === "function") unsub();
    } catch {}
  };
}

// -----------------------------
// 4) Polling liviano (RN safe)
// -----------------------------
export function micelioWatchDV(
  handler: (dv: DV) => void,
  opts?: {
    everyMs?: number;
    scope?: string;
    worldId?: string;
    limit?: number;
  }
): Unsub {
  const seen = new Set<string>();
  let alive = true;
  let t: ReturnType<typeof setTimeout> | undefined;

  const tick = async () => {
    if (!alive) return;

    try {
      const items = await micelioListDV({
        limit: opts?.limit ?? 200,
        scope: clean(opts?.scope ?? "public"),
        worldId: opts?.worldId,
      });

      for (const dv of items) {
        const id = clean(dv?.id);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        handler(dv);
      }
    } catch {
      // silencioso
    } finally {
      t = setTimeout(tick, Math.max(1000, opts?.everyMs ?? 5000));
    }
  };

  tick();

  return () => {
    alive = false;
    if (t) clearTimeout(t);
  };
}

// -----------------------------
// 5) Optional: ensure spore boot
// -----------------------------
export async function micelioEnsureSporeBoot() {
  if ((spore as any)?.getState?.()?.ok) return;

  await spore.init(
    {
      id: "ge@node",
      ws: [DEFAULT_WS_URL],
      auth: { token: SEED_AUTH },
      utopy: { transports: { gossip: { wsSeeds: [DEFAULT_WS_URL] } } },
    },
    { ns: "public" }
  );
}
