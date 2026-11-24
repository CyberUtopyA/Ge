// ============================================
// FILE: src/goodenergy/core/ge.dv.ts
// ============================================
export type DV = {
  id: string;
  kind: string;
  labels?: string[];
  traits?: string[];
  attrs?: any;
  meta?: {
    ns?: string;           // contexto semántico (ej "energy:diagram", "mt:market")
    scopes?: string[];     // ["public"] o ["public", `world:${id}`]
    ts?: number;
    source?: string;
    by?: string;
    worldId?: string;
    ttl_ms?: number;       // ✅ persistencia por DV
    pinned?: boolean;
    [k: string]: any;
  };
};

const dvId = (kind: string, parts: string[]) => `dv:ge:${kind}:${parts.filter(Boolean).join(":")}`;
const now = () => Date.now();

export function dvTelemetry(siteId: string, t: any): DV {
  const ts = Number(t?.ts ?? now());
  return {
    id: dvId("telemetry", [siteId, String(ts)]),
    kind: "energy.telemetry",
    labels: ["Telemetría GE"],
    traits: ["ge:telemetry", "mt:energy.signal"],
    attrs: { siteId, ...t, epistemic: t?.epistemic || (t?.source === "mock" ? "simulado" : t?.source ? "observado" : "inferido"), ts },
    meta: { ns: "energy:telemetry", scopes: ["public"], ts, source: "ge:core", ttl_ms: 10 * 60 * 1000 },
  };
}

// ✅ Diagrama que MO consume
export function dvDiagram(siteId: string, rev: string, diagram: any): DV {
  const ts = now();
  return {
    id: dvId("diagram", [siteId, rev]),
    kind: "ge.diagram",
    labels: ["Diagrama (GE)"],
    traits: ["ge:diagram", "ge:diagram.electric", "mo:input.diagram"],
    // ✅ IMPORTANTE: MO adapter busca attrs.diagram.rooms[]
    attrs: { siteId, rev, diagram },
    meta: { ns: "energy:diagram", scopes: ["public"], ts, source: "ge:editor", ttl_ms: 7 * 24 * 60 * 60 * 1000 },
  };
}

export function dvMarketSignal(siteId: string, kind: "excess" | "deficit", kwh: number, price_hint?: number): DV {
  const ts = now();
  return {
    id: dvId("market_signal", [siteId, String(ts)]),
    kind: "energy.market_signal",
    labels: ["Market signal"],
    traits: ["ge:market.signal", "mt:order.hint"],
    attrs: { siteId, kind, kwh, price_hint, ts },
    meta: { ns: "mt:market", scopes: ["public"], ts, source: "ge:core", ttl_ms: 60 * 60 * 1000 },
  };
}
