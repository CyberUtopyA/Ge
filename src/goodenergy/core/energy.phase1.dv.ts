import type {
  AnyDV,
  EnergyIntentAttrs,
  EnergyOfferAttrs,
  EnergyPlanAttrs,
} from "./energy.phase1.types";

const safe = (s: string) => s.replace(/[^a-zA-Z0-9:_\-\.]/g, "_");
const now = () => Date.now();

export function dvEnergyIntent(
  siteId: string,
  attrs: EnergyIntentAttrs,
  opts?: { ns?: string; scopes?: string[]; by?: string; ttl_ms?: number }
): AnyDV {
  const ts = now();
  return {
    id: `dv:${safe(siteId)}:energy.intent:${ts}`,
    kind: "energy.intent",
    traits: ["energy:intent", "energy:planning", "work:derived"],
    attrs,
    meta: {
      ns: opts?.ns || "energy:core",
      scopes: opts?.scopes || ["public"],
      by: opts?.by || "ge:phase1",
      ttl_ms: opts?.ttl_ms ?? 7 * 24 * 60 * 60 * 1000,
      ts,
    },
  };
}

export function dvEnergyPlan(
  siteId: string,
  attrs: EnergyPlanAttrs,
  opts?: { ns?: string; scopes?: string[]; by?: string; ttl_ms?: number }
): AnyDV {
  const ts = now();
  return {
    id: `dv:${safe(siteId)}:energy.plan:${ts}`,
    kind: "energy.plan",
    traits: ["energy:plan", "energy:infrastructure", "energy:ready"],
    attrs,
    meta: {
      ns: opts?.ns || "energy:core",
      scopes: opts?.scopes || ["public"],
      by: opts?.by || "ge:phase1",
      ttl_ms: opts?.ttl_ms ?? 14 * 24 * 60 * 60 * 1000,
      ts,
    },
  };
}

export function dvEnergyOffer(
  siteId: string,
  attrs: EnergyOfferAttrs,
  idx: number,
  opts?: { ns?: string; scopes?: string[]; by?: string; ttl_ms?: number }
): AnyDV {
  const ts = now();
  return {
    id: `dv:${safe(siteId)}:energy.offer:${idx}:${ts}`,
    kind: "energy.offer",
    traits: ["energy:offer", "mt:market", "work:support"],
    attrs,
    meta: {
      ns: opts?.ns || "mt:market",
      scopes: opts?.scopes || ["public"],
      by: opts?.by || "ge:phase1",
      ttl_ms: opts?.ttl_ms ?? 14 * 24 * 60 * 60 * 1000,
      ts,
    },
  };
}