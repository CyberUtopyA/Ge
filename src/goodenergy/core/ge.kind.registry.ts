// ============================================
// FILE: src/goodenergy/core/ge.kind.registry.ts
// - Merge builtins + remoto (energy.kind / energy.wire.rule)
// ============================================

export type KindDef = {
  kindId: string;
  title: string;
  icon?: string;
  attach?: Array<"floor" | "wall" | "roof">;
  ports?: Array<{ id: string; role?: "in" | "out"; type?: string }>;
  params?: Record<string, any>;
  shape?: any;
  official?: boolean;
};

export type WireRuleDef = {
  ruleId: string;
  fromKinds: string[];
  toKinds: string[];
  edgeType: string;
  weight?: number;
  official?: boolean;
};

export type Registry = {
  kinds: Record<string, KindDef>;
  wireRules: WireRuleDef[];
};

// builtins mínimos (podés ampliar)
export function builtinRegistry(): Registry {
  const kinds: Record<string, KindDef> = {
    "panel.solar": { kindId: "panel.solar", title: "Panel solar", icon: "🔆", attach: ["roof"] },
    "turbina.eolica": { kindId: "turbina.eolica", title: "Turbina", icon: "🌬️", attach: ["roof", "floor"] },
    "hidro": { kindId: "hidro", title: "Hidro", icon: "💧", attach: ["floor"] },
    "bateria": { kindId: "bateria", title: "Batería", icon: "🔋", attach: ["floor", "wall"] },
    "inversor": { kindId: "inversor", title: "Inversor", icon: "🔀", attach: ["wall"] },
    "sensor": { kindId: "sensor", title: "Sensor", icon: "🛰️", attach: ["wall", "roof"] },
    "rele": { kindId: "rele", title: "Relé", icon: "⚙️", attach: ["wall"] },
    "puerta": { kindId: "puerta", title: "Puerta", icon: "🚪", attach: ["wall"] },
    "ventana": { kindId: "ventana", title: "Ventana", icon: "🪟", attach: ["wall"] },
  };

  const wireRules: WireRuleDef[] = [
    { ruleId: "pv->inv", fromKinds: ["panel.solar"], toKinds: ["inversor"], edgeType: "dc", weight: 1, official: true },
    { ruleId: "inv->battery", fromKinds: ["inversor"], toKinds: ["bateria"], edgeType: "dc", weight: 1, official: true },
    { ruleId: "sensor->rele", fromKinds: ["sensor"], toKinds: ["rele"], edgeType: "sig", weight: 1, official: true },
  ];

  return { kinds, wireRules };
}

export function applyRemoteKind(reg: Registry, dv: any): Registry {
  const def = dv?.attrs;
  const kindId = String(def?.kindId || def?.kind || "").trim();
  if (!kindId) return reg;

  return {
    ...reg,
    kinds: {
      ...reg.kinds,
      [kindId]: {
        kindId,
        title: def?.title || def?.label || kindId,
        icon: def?.icon,
        attach: Array.isArray(def?.attach) ? def.attach : undefined,
        ports: Array.isArray(def?.ports) ? def.ports : undefined,
        params: def?.params || undefined,
        shape: def?.shape || undefined,
        official: !!dv?.meta?.pinned,
      },
    },
  };
}

export function applyRemoteWireRule(reg: Registry, dv: any): Registry {
  const a = dv?.attrs || {};
  const rule: WireRuleDef = {
    ruleId: String(a.ruleId || dv?.id || "rule").trim(),
    fromKinds: Array.isArray(a.fromKinds) ? a.fromKinds.map(String) : [],
    toKinds: Array.isArray(a.toKinds) ? a.toKinds.map(String) : [],
    edgeType: String(a.edgeType || "sig"),
    weight: Number.isFinite(Number(a.weight)) ? Number(a.weight) : 1,
    official: !!dv?.meta?.pinned,
  };

  if (!rule.fromKinds.length || !rule.toKinds.length) return reg;

  // dedupe por ruleId
  const next = reg.wireRules.filter((r) => r.ruleId !== rule.ruleId);
  next.push(rule);

  return { ...reg, wireRules: next };
}
