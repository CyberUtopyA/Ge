// ============================================
// FILE: src/goodenergy/core/ge.kinds.dv.ts
// - DV vivos para ampliar kinds y wireRules por Micelio
// ============================================

export type DV = {
  id: string;
  kind: string;
  labels?: string[];
  traits?: string[];
  attrs?: any;
  meta?: {
    ns?: string;
    scopes?: string[];
    ts?: number;
    source?: string;
    ttl_ms?: number;
    pinned?: boolean;
    [k: string]: any;
  };
};

const now = () => Date.now();
const dvId = (kind: string, parts: string[]) => `dv:ge:${kind}:${parts.filter(Boolean).join(":")}`;

// ---- KIND UPSERT ----
export function dvEnergyKindUpsert(input: {
  kindId: string;
  title: string;
  icon?: string;
  attach?: Array<"floor" | "wall" | "roof">;
  ports?: Array<{ id: string; role?: "in" | "out"; type?: string }>;
  params?: Record<string, any>;
  shape?: any; // {type:"box",...} | {svgPath:"..."} | etc
  official?: boolean; // => pinned true
  scopes?: string[];
  ttl_ms?: number;
  by?: string;
}): DV {
  const ts = now();
  const kindId = String(input.kindId || "").trim();
  const scopes = Array.isArray(input.scopes) && input.scopes.length ? input.scopes : ["public"];

  return {
    id: dvId("energy_kind", [kindId, "v1"]),
    kind: "energy.kind",
    labels: [input.title || kindId],
    traits: ["ge:kind", "ge:component.kind", input.official ? "mt:official" : "mt:community"],
    attrs: {
      kindId,
      title: input.title || kindId,
      icon: input.icon || "🧩",
      attach: input.attach || ["floor", "wall", "roof"],
      ports: input.ports || [],
      params: input.params || {},
      shape: input.shape || { type: "box", w: 1, h: 1 },
      by: input.by,
    },
    meta: {
      ns: "energy:kinds",
      scopes,
      ts,
      ttl_ms: input.ttl_ms ?? 30 * 24 * 60 * 60 * 1000, // 30 días default
      pinned: !!input.official,
      by: input.by,
    },
  };
}

// ---- WIRE RULE UPSERT ----
export function dvEnergyWireRuleUpsert(input: {
  ruleId: string;
  fromKinds: string[];
  toKinds: string[];
  edgeType: string;
  weight?: number;
  scopes?: string[];
  ttl_ms?: number;
  official?: boolean;
  by?: string;
}): DV {
  const ts = now();
  const scopes = Array.isArray(input.scopes) && input.scopes.length ? input.scopes : ["public"];

  return {
    id: dvId("energy_wire_rule", [input.ruleId, "v1"]),
    kind: "energy.wire.rule",
    labels: [`Rule ${input.ruleId}`],
    traits: ["ge:wire.rule", input.official ? "mt:official" : "mt:community"],
    attrs: {
      ruleId: input.ruleId,
      fromKinds: input.fromKinds || [],
      toKinds: input.toKinds || [],
      edgeType: input.edgeType || "sig",
      weight: input.weight ?? 1,
      by: input.by,
    },
    meta: {
      ns: "energy:kinds",
      scopes,
      ts,
      ttl_ms: input.ttl_ms ?? 30 * 24 * 60 * 60 * 1000,
      pinned: !!input.official,
      by: input.by,
    },
  };
}
