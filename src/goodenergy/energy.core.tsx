// ===============================================
// File: src/goodenergy/core/energycorecontroller.ts
// GoodEnergy — Controlador headless (lógica pura)
// ✅ Registry dinámico (kinds + wireRules) vía DV + intents
// ✅ UI_NS routing: acepta i.ns === ns OR i.with.uiNs === ns
// ✅ Publica DV a Micelio: telemetría / diagrama / mercado / registry
// ✅ Import/Export JSON + model.load.request
// ===============================================

import { micelioPublishDV } from "../utopy/micelio.client";
import { spore } from "../utopy/spore";
import { buildEnergyFabricationArtifacts } from "./adapters/energy.fabrication";

// ✅ DV builders (GoodEnergy)
import { dvTelemetry, dvMarketSignal, dvDiagram } from "./core/ge.dv";
import { runEnergyPhase1 } from "./core/runtime";

// ---------- Tipos mínimos compartidos ----------
type Room = { id: string; x: number; y: number; w: number; d: number; h: number; roof: boolean };

// CompType abierto (soporta custom:xxx)
type CompType = string;

type Comp = {
  id: string;
  kind: CompType;
  roomId: string;
  attach: "floor" | "wall" | "roof";
  x: number;
  y: number;
  params?: Record<string, any>;
};
type Topologia = { rooms: Room[]; comps: Comp[] };

type Edge = { id: string; a: string; b: string; type: "dc" | "ac" | "sig" };
type CircuitGraph = { nodes: { id: string; kind: string }[]; edges: Edge[] };

type Telemetry = {
  source?: string;
  epistemic?: "observado" | "calculado" | "simulado" | "inferido" | "propuesto" | "ejecutado";
  pv_kw?: number;
  load_kw?: number;
  soc?: number;
  grid_in?: number;
  grid_out?: number;
  ts?: number;
};

type Offer = {
  id: string;
  seller: string;
  location?: { lat: number; lng: number };
  amount_kwh: number;
  price_per_kwh: number;
  visibility?: { radius_km?: number };
  ts: number;
};

type Order = {
  id: string;
  buyer: string;
  location?: { lat: number; lng: number; radius_km?: number };
  amount_kwh: number;
  max_price_per_kwh: number;
  prefer_local?: boolean;
  ts: number;
};

// ---------- Registry dinámico ----------
type PortDef = { id?: string; name?: string; type: "dc" | "ac" | "sig"; role?: "in" | "out"; dir?: "in" | "out" };

type KindDef = {
  kind: string;
  title?: string; // UI
  label?: string;
  icon?: string; // UI
  category?: "source" | "storage" | "power" | "sensor" | "actuator" | "load" | "other";
  defaultParams?: Record<string, any>;
  attach?: Array<"floor" | "wall" | "roof">;
  ports?: PortDef[];
  preferredSinkKinds?: string[];
  official?: boolean;
  by?: string;
};

type WireRule = { fromKinds: string[]; toKinds: string[]; edgeType: "dc" | "ac" | "sig"; by?: string; confidence?: number };

// ---------- DV mínimo (para registry) ----------
type AnyDV = {
  id?: string;
  kind: string;
  traits?: string[];
  labels?: string[];
  attrs?: any;
  meta?: {
    ns?: string;
    scopes?: string[];
    ttl_ms?: number;
    pinned?: boolean;
    ts?: number;
    [k: string]: any;
  };

  // ✅ agregá estas dos (para compat con dv.def y dv.rule)
  def?: any;
  rule?: any;
};


// ---------- Estado en memoria por ns ----------
const STATE: Record<
  string,
  {
    topo: Topologia | null;
    previewTheme: "day" | "night";
    graph: CircuitGraph | null;
    telemetry: Telemetry;
    offers: Offer[];
    orders: Order[];
    kindRegistry: Record<string, KindDef>;
    wireRules: WireRule[];

    lastSceneJson: any | null;
    lastSceneAt: number;

    lastTelemDVAt: number;
    lastMarketDVAt: number;
    lastMarketListDVAt: number;

    lastGeo?: { lat: number; lng: number; radius_km?: number };
  }
> = {};

// util
const now = () => Date.now();
const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}_${Date.now() % 1e6}`;

// Identidad
const SITE_ID = "ge:site:default";

// Namespaces para DVs
const NS_ENERGY = "energy:market";
const NS_MT_MARKET = "mt:market";
const NS_DIAGRAM = "energy:diagram";
const NS_REGISTRY = "energy:registry";

// Distancia Haversine (km)
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (x: number) => (x * Math.PI) / 180,
    R = 6371;
  const dLat = toRad(b.lat - a.lat),
    dLon = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat),
    la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ---------- Helpers de estado ----------
async function publishPhase1Artifacts(_ns: string, withData?: any) {
  const S = getNs(_ns);

  const seller = {
    id: withData?.sellerId || SITE_ID,
    name: withData?.sellerName || "GoodEnergy",
    location: S.lastGeo ? { lat: S.lastGeo.lat, lng: S.lastGeo.lng } : undefined,
    serviceAreaKm: Number(withData?.serviceAreaKm ?? S.lastGeo?.radius_km ?? 15),
  };

  const result = runEnergyPhase1({
    ns: _ns,
    siteId: SITE_ID,
    topo: S.topo,
    telemetry: S.telemetry,
    geo: S.lastGeo,
    seller,
    publishOffers: withData?.publishOffers !== false,
  });

  await micelioPublishDV(result.intentDV as any, {
    ns: "energy:core",
    scopes: ["public"],
  } as any);

  await micelioPublishDV(result.planDV as any, {
    ns: "energy:core",
    scopes: ["public"],
  } as any);

  if (withData?.publishOffers !== false) {
    for (const dv of result.offerDVs) {
      await micelioPublishDV(dv as any, {
        ns: "mt:market",
        scopes: ["public"],
      } as any);
    }
  }

  await spore.sayIntent({
    sym: "⚡",
    say: "energy.plan.result",
    ns: _ns,
    with: {
      intent: result.intent,
      plan: result.plan,
      offers: result.offers,
    },
  });

  await render(
    _ns,
    [
      {
        kind: "note",
        text:
          `⚡ Plan generado · ` +
          `${result.plan.summary.connectedKw}kW conectados · ` +
          `pico ${result.plan.summary.estimatedPeakKw}kW · ` +
          `${result.plan.circuits.length} circuitos · ` +
          `${result.plan.materials.length} materiales`,
      },
    ],
    true
  );
}

async function publishPhase3Artifacts(_ns: string, withData?: any) {
  const S = getNs(_ns);

  const phase1 = runEnergyPhase1({
    ns: _ns,
    siteId: SITE_ID,
    topo: S.topo,
    telemetry: S.telemetry,
    geo: S.lastGeo,
    seller: {
      id: withData?.sellerId || SITE_ID,
      name: withData?.sellerName || "GoodEnergy",
      location: S.lastGeo ? { lat: S.lastGeo.lat, lng: S.lastGeo.lng } : undefined,
      serviceAreaKm: Number(withData?.serviceAreaKm ?? S.lastGeo?.radius_km ?? 15),
    },
  });

  const phase3 = buildEnergyFabricationArtifacts({
    siteId: SITE_ID,
    ns: _ns,
    context: phase1.context,
    plan: phase1.plan,
    basedOnPlanId: phase1.planDV.id,
  });

  await micelioPublishDV(phase3.infrastructureSeedDV as any, {
    ns: _ns,
    scopes: ["public"],
  } as any);

  await micelioPublishDV(phase3.fabricationPackDV as any, {
    ns: "mo:plan",
    scopes: ["public"],
  } as any);

  await micelioPublishDV(phase3.actionRunDV as any, {
    ns: _ns,
    scopes: ["public"],
  } as any);

  await spore.sayIntent({
    sym: "⚡",
    say: "energy.fabrication.result",
    ns: _ns,
    with: {
      structureKind: phase3.structureKind,
      dimensions: phase3.fabricationPack.dimensions,
      title: phase3.fabricationPack.title,
      cutlistCount: phase3.fabricationPack.cutlist.length,
      hardwareCount: phase3.fabricationPack.hardware.length,
      electricalCount: phase3.fabricationPack.electrical.length,
    },
  });

  await render(
    _ns,
    [
      {
        kind: "note",
        text:
          `🛠 Infra lista para MO · ${phase3.fabricationPack.title} · ` +
          `${phase3.fabricationPack.dimensions.width_m}×${phase3.fabricationPack.dimensions.depth_m}×${phase3.fabricationPack.dimensions.height_m}m · ` +
          `${phase3.fabricationPack.cutlist.length} piezas`,
      },
    ],
    true
  );
}
function getNs(ns: string) {
  if (!STATE[ns])
    STATE[ns] = {
      topo: null,
      previewTheme: "day",
      graph: null,
      telemetry: {},
      offers: [],
      orders: [],
      kindRegistry: {},
      wireRules: [],
      lastSceneJson: null,
      lastSceneAt: 0,
      lastTelemDVAt: 0,
      lastMarketDVAt: 0,
      lastMarketListDVAt: 0,
      lastGeo: undefined,
    };
  return STATE[ns];
}

// ---------- Builtins ----------
function ensureBuiltinKinds(S: ReturnType<typeof getNs>) {
  if (Object.keys(S.kindRegistry).length) return;

  const builtins: KindDef[] = [
    { kind: "panel.solar", title: "PV", icon: "🔆", category: "source", attach: ["roof", "wall"], ports: [{ id: "dc", type: "dc", role: "out" }], preferredSinkKinds: ["inversor"], official: true },
    { kind: "turbina.eolica", title: "Eólica", icon: "🌬️", category: "source", attach: ["roof", "floor"], ports: [{ id: "dc", type: "dc", role: "out" }], preferredSinkKinds: ["inversor"], official: true },
    { kind: "hidro", title: "Hidráulica", icon: "💧", category: "source", attach: ["floor"], ports: [{ id: "dc", type: "dc", role: "out" }], preferredSinkKinds: ["inversor"], official: true },
    { kind: "bateria", title: "Batería", icon: "🔋", category: "storage", attach: ["floor", "wall"], ports: [{ id: "dc", type: "dc", role: "in" }], preferredSinkKinds: ["inversor"], official: true },
    {
      kind: "inversor",
      title: "Inversor",
      icon: "🔀",
      category: "power",
      attach: ["wall", "floor"],
      ports: [
        { id: "dc-in", type: "dc", role: "in" },
        { id: "ac-out", type: "ac", role: "out" },
        { id: "sig", type: "sig", role: "in" },
      ],
      official: true,
    },
    { kind: "sensor", title: "Sensor", icon: "🛰️", category: "sensor", attach: ["wall", "floor", "roof"], ports: [{ id: "sig", type: "sig", role: "out" }], preferredSinkKinds: ["inversor"], official: true },
    { kind: "rele", title: "Relé", icon: "⚙️", category: "actuator", attach: ["wall", "floor"], ports: [{ id: "sig", type: "sig", role: "in" }], preferredSinkKinds: ["inversor"], official: true },
    { kind: "carga", title: "Load", icon: "🏠", category: "load", attach: ["floor", "wall"], ports: [{ id: "ac", type: "ac", role: "in" }], preferredSinkKinds: ["inversor"], official: true },
    { kind: "grid", title: "Red", icon: "🌐", category: "power", attach: ["wall", "floor"], ports: [{ id: "ac", type: "ac", role: "out" }], preferredSinkKinds: ["inversor"], official: true },
  ];
  for (const k of builtins) S.kindRegistry[k.kind] = k;

  S.wireRules.push(
    { fromKinds: ["panel.solar", "turbina.eolica", "hidro", "bateria"], toKinds: ["inversor"], edgeType: "dc", confidence: 0.9, by: "builtin" },
    { fromKinds: ["inversor"], toKinds: ["carga", "bateria"], edgeType: "ac", confidence: 0.85, by: "builtin" },
    { fromKinds: ["grid"], toKinds: ["inversor"], edgeType: "ac", confidence: 0.8, by: "builtin" },
    { fromKinds: ["sensor"], toKinds: ["inversor"], edgeType: "sig", confidence: 0.8, by: "builtin" },
    { fromKinds: ["rele"], toKinds: ["inversor"], edgeType: "sig", confidence: 0.75, by: "builtin" }
  );
}

// ---------- Registry: normalizadores ----------
function normalizeKindDef(input: any): KindDef | null {
  if (!input) return null;

  // soporta formatos varios
  const kind = String(input.kind || input.kindId || input.id || "").trim();
  if (!kind) return null;

  const portsIn: any[] = Array.isArray(input.ports) ? input.ports : [];
  const ports: PortDef[] = portsIn
    .map((p) => {
      const type = p?.type;
      const role = p?.role || p?.dir;
      if (!type) return null;
      return {
        id: p?.id || p?.name,
        name: p?.name,
        type: type === "signal" ? "sig" : type,
        role: role === "in" || role === "out" ? role : undefined,
        dir: role === "in" || role === "out" ? role : undefined,
      } as PortDef;
    })
    .filter(Boolean) as any;

  const attach = Array.isArray(input.attach) ? (input.attach.filter((x: any) => x === "floor" || x === "wall" || x === "roof") as any) : undefined;

  const out: KindDef = {
    kind,
    title: input.title || input.label || input.name,
    label: input.label,
    icon: input.icon,
    category: input.category,
    defaultParams: input.defaultParams || input.params,
    attach,
    ports: ports.length ? ports : undefined,
    preferredSinkKinds: Array.isArray(input.preferredSinkKinds) ? input.preferredSinkKinds.map(String) : undefined,
    official: !!input.official,
    by: input.by || input.author,
  };
  return out;
}

function normalizeWireRule(input: any): WireRule | null {
  if (!input) return null;
  const fromKinds = Array.isArray(input.fromKinds) ? input.fromKinds.map(String) : Array.isArray(input.from) ? input.from.map(String) : null;
  const toKinds = Array.isArray(input.toKinds) ? input.toKinds.map(String) : Array.isArray(input.to) ? input.to.map(String) : null;
  const edgeType = String(input.edgeType || input.type || "").trim() as any;
  if (!fromKinds?.length || !toKinds?.length || !edgeType) return null;
  if (edgeType !== "dc" && edgeType !== "ac" && edgeType !== "sig") return null;
  return { fromKinds, toKinds, edgeType, by: input.by, confidence: Number(input.confidence ?? 0) || undefined };
}

// ---------- Registry: aplicar DV ----------
function applyEnergyKindDV(S: ReturnType<typeof getNs>, dv: AnyDV) {
  ensureBuiltinKinds(S);

  const defRaw =
    dv?.attrs?.def ||
    dv?.attrs?.kindDef ||
    dv?.attrs?.kind ||
    (dv?.attrs?.kindId ? { kind: dv.attrs.kindId, ...dv.attrs } : null) ||
    dv?.def ||
    null;

  const def = normalizeKindDef(defRaw);
  if (!def) return false;

  S.kindRegistry[def.kind] = { ...(S.kindRegistry[def.kind] || { kind: def.kind }), ...def };
  return true;
}

function applyWireRuleDV(S: ReturnType<typeof getNs>, dv: AnyDV) {
  ensureBuiltinKinds(S);

  const ruleRaw = dv?.attrs?.rule || dv?.attrs?.wireRule || dv?.rule || dv?.attrs || null;
  const rule = normalizeWireRule(ruleRaw);
  if (!rule) return false;

  // dedupe simple
  const key = (r: WireRule) => `${r.edgeType}|${r.fromKinds.join(",")}|${r.toKinds.join(",")}`;
  const k = key(rule);
  const exists = S.wireRules.some((x) => key(x) === k);
  if (!exists) S.wireRules.push(rule);
  return true;
}

// ---------- Render helpers ----------
async function render(ns: string, blocks: any[], append = false) {
  await spore.sayIntent({ sym: "⚡", say: "render", ns, with: { ns, blocks, append } });
}

async function pushInspector(ns: string) {
  const S = getNs(ns);
  const s = S.telemetry;
  await render(
    ns,
    [
      {
        kind: "note",
        text: `PV ${s.pv_kw ?? 0}kW · Load ${s.load_kw ?? 0}kW · SoC ${s.soc ?? 0}% · Grid→ ${s.grid_in ?? 0}kW · Grid← ${s.grid_out ?? 0}kW`,
      },
    ],
    false
  );
}

// ---------- Derivar grafo desde topología ----------
function deriveGraph(topo: Topologia | null, S: ReturnType<typeof getNs>): CircuitGraph {
  if (!topo) return { nodes: [], edges: [] };
  ensureBuiltinKinds(S);

  const nodes = topo.comps.map((c) => ({ id: c.id, kind: String(c.kind) }));
  const edges: Edge[] = [];

  const compsByKind = (kinds: string[]) => topo.comps.filter((c) => kinds.includes(String(c.kind)));

  for (const rule of S.wireRules) {
    const froms = compsByKind(rule.fromKinds);
    const tos = compsByKind(rule.toKinds);

    for (const src of froms) {
      let best: Comp | undefined;
      let bd = Infinity;

      for (const t of tos) {
        const sameRoom = src.roomId === t.roomId;
        const dx = src.x - t.x,
          dy = src.y - t.y;
        const cost = Math.hypot(dx, dy) + (src.attach !== t.attach ? 0.25 : 0) + (sameRoom ? 0 : 1.0);
        if (cost < bd) {
          bd = cost;
          best = t;
        }
      }

      if (best) edges.push({ id: uid("e"), a: src.id, b: best.id, type: rule.edgeType });
    }
  }

  const seen = new Set<string>();
  const uniq = edges.filter((e) => {
    const k = e.a < e.b ? `${e.a}|${e.b}|${e.type}` : `${e.b}|${e.a}|${e.type}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return { nodes, edges: uniq };
}

// ---------- Micelio publish helpers ----------
const lastMeaningfulTelemetry: Record<string, string> = {};
async function publishTelemetryDV(_ns: string) {
  const S = getNs(_ns);
  const t = S.telemetry;
  const ts = Number(t?.ts ?? now());
  const gridState = Number(t?.grid_in) > 0.1 ? "import" : Number(t?.grid_out) > 0.1 ? "export" : "balanced";
  const batteryState = Number(t?.soc) < 20 ? "low" : Number(t?.soc) > 80 ? "high" : "normal";
  const generationState = Number(t?.pv_kw) > 0.1 ? "active" : "idle";
  const stateKey = `${gridState}:${batteryState}:${generationState}`;
  if (lastMeaningfulTelemetry[_ns] === stateKey) return;
  lastMeaningfulTelemetry[_ns] = stateKey;
  S.lastTelemDVAt = ts;
  // Legacy energy.telemetry is retained for compatibility, now emitted for
  // meaningful state changes. Individual samples remain on telemetry.update.
  await micelioPublishDV(dvTelemetry(SITE_ID, { ...t, ts }), { ns: "energy:telemetry", scopes: ["public"] } as any);
}

async function publishMarketOfferDV(_ns: string, offer: Offer) {
  const dvAny = dvMarketSignal(SITE_ID, "excess", offer.amount_kwh, offer.price_per_kwh) as any;

  dvAny.id = dvAny.id || `dv:${SITE_ID}:offer:${offer.id}`;
  dvAny.kind = dvAny.kind || "energy.offer";
  dvAny.attrs = { ...(dvAny.attrs || {}), offer: { ...offer } };
  dvAny.meta = { ...(dvAny.meta || {}), ns: NS_MT_MARKET, scopes: ["public"] };

  await micelioPublishDV(dvAny, { ns: NS_MT_MARKET, scopes: ["public"] } as any);
}

async function publishMarketOrderDV(_ns: string, order: Order) {
  const dvAny = dvMarketSignal(SITE_ID, "deficit", order.amount_kwh, order.max_price_per_kwh) as any;

  dvAny.id = dvAny.id || `dv:${SITE_ID}:order:${order.id}`;
  dvAny.kind = dvAny.kind || "energy.order";
  dvAny.attrs = { ...(dvAny.attrs || {}), order: { ...order } };
  dvAny.meta = { ...(dvAny.meta || {}), ns: NS_MT_MARKET, scopes: ["public"] };

  await micelioPublishDV(dvAny, { ns: NS_MT_MARKET, scopes: ["public"] } as any);
}

async function publishMarketSignalDV(_ns: string, hint?: "excess" | "deficit") {
  const S = getNs(_ns);

  const tnow = now();
  if (tnow - (S.lastMarketDVAt || 0) < 10_000) return;

  const pv = Number(S.telemetry.pv_kw ?? 0);
  const load = Number(S.telemetry.load_kw ?? 0);
  const diff = pv - load;

  const kwh = Math.abs(diff) * (10 / 3600);
  if (kwh < 0.02 && !hint) return;

  const kind: "excess" | "deficit" = hint ?? (diff >= 0 ? "excess" : "deficit");
  const price = kind === "excess" ? 0.12 : 0.14;

  const dv = dvMarketSignal(SITE_ID, kind, Math.max(kwh, 0.02), price);
  dv.meta = { ...(dv.meta || {}), ns: NS_ENERGY, scopes: ["public"] };

  await micelioPublishDV(dv as any, { ns: NS_ENERGY, scopes: ["public"] } as any);

  S.lastMarketDVAt = tnow;
}

function deriveRoomsFromTopo(topo: Topologia | null) {
  if (!topo) return [];
  const byRoom = new Map<string, any[]>();
  for (const c of topo.comps || []) {
    const rid = String(c.roomId || "room:main");
    if (!byRoom.has(rid)) byRoom.set(rid, []);
    byRoom.get(rid)!.push(c);
  }

  const rooms: any[] = [];
  for (const [rid, comps] of byRoom.entries()) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const c of comps) {
      const x = Number(c.x ?? 0),
        y = Number(c.y ?? 0);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    rooms.push({
      id: rid,
      name: rid,
      rect: {
        x: isFinite(minX) ? minX : 0,
        y: isFinite(minY) ? minY : 0,
        w: isFinite(maxX - minX) ? maxX - minX + 1 : 8,
        h: isFinite(maxY - minY) ? maxY - minY + 1 : 6,
      },
      comps: comps.map((c) => ({ id: c.id, kind: String(c.kind) })),
    });
  }
  return rooms;
}

async function publishDiagramDV(_ns: string, title: string) {
  const S = getNs(_ns);
  S.graph = deriveGraph(S.topo, S);

  const rooms = deriveRoomsFromTopo(S.topo);

  const diagram = {
    title,
    rooms,
    nodes: S.graph.nodes,
    edges: S.graph.edges,
  };

  const dv = dvDiagram(SITE_ID, `r${now()}`, diagram);
  dv.meta = { ...(dv.meta || {}), ns: NS_DIAGRAM, scopes: ["public"] };

  await micelioPublishDV(dv as any, { ns: NS_DIAGRAM, scopes: ["public"] } as any);
}

// ---------- Registry publish helpers ----------
async function publishRegistryKindDV(def: KindDef, opts?: { ttl_ms?: number; scopes?: string[]; by?: string; official?: boolean }) {
  const ttl_ms = Number(opts?.ttl_ms ?? 30 * 24 * 60 * 60 * 1000);
  const scopes = opts?.scopes?.length ? opts.scopes : ["public"];

  const dv: AnyDV = {
    id: `dv:${SITE_ID}:energy.kind:${def.kind}`,
    kind: "energy.kind",
    traits: ["energy:registry", "energy:kind"],
    attrs: {
      kindId: def.kind,
      def: {
        kind: def.kind,
        title: def.title || def.label || def.kind,
        icon: def.icon || "🧩",
        category: def.category || "other",
        attach: def.attach || ["floor", "wall", "roof"],
        ports: def.ports || [],
        defaultParams: def.defaultParams || {},
        preferredSinkKinds: def.preferredSinkKinds || [],
        official: typeof opts?.official === "boolean" ? opts.official : !!def.official,
        by: opts?.by || def.by || "ge:core",
      },
    },
    meta: { ns: NS_REGISTRY, scopes, ttl_ms, ts: now() },
  };

  await micelioPublishDV(dv as any, { ns: NS_REGISTRY, scopes } as any);

  // eco local para que la UI lo reciba inmediato si está escuchando bus
  await spore.sayIntent({ sym: "⚡", say: "ui.registry.dv", ns: (opts as any)?.uiNs || "energy:core", with: { dv } });
}

async function publishRegistryWireRuleDV(rule: WireRule, opts?: { ttl_ms?: number; scopes?: string[]; by?: string }) {
  const ttl_ms = Number(opts?.ttl_ms ?? 30 * 24 * 60 * 60 * 1000);
  const scopes = opts?.scopes?.length ? opts.scopes : ["public"];

  const dv: AnyDV = {
    id: `dv:${SITE_ID}:energy.wire.rule:${uid("r")}`,
    kind: "energy.wire.rule",
    traits: ["energy:registry", "energy:wire"],
    attrs: {
      rule: {
        fromKinds: rule.fromKinds,
        toKinds: rule.toKinds,
        edgeType: rule.edgeType,
        by: opts?.by || rule.by || "ge:core",
        confidence: rule.confidence ?? 0.7,
      },
    },
    meta: { ns: NS_REGISTRY, scopes, ttl_ms, ts: now() },
  };

  await micelioPublishDV(dv as any, { ns: NS_REGISTRY, scopes } as any);
}

// ---------- Handlers de escena ----------
async function onGuardarEscena(ns: string, withData: any) {
  const S = getNs(ns);
  const topo: Topologia | null = withData?.topologia ?? null;
  const theme: "day" | "night" = withData?.meta?.previewTheme === "night" ? "night" : "day";

  S.topo = topo;
  S.previewTheme = theme;
  S.graph = deriveGraph(topo, S);

  await spore.sayIntent({ sym: "⚡", say: "guardar.escena", ns, with: { topologia: topo, meta: { previewTheme: theme } } });
  await render(ns, [{ kind: "note", text: "✅ Escena guardada" }], true);
  await pushInspector(ns);

  await publishDiagramDV(ns, "Circuito derivado (save)");
}

async function onCircuitView(ns: string) {
  const S = getNs(ns);
  S.graph = deriveGraph(S.topo, S);

  await render(
    ns,
    [
      {
        kind: "energy.viewport",
        scene: { meta: { title: "Circuito derivado" }, nodes: S.graph.nodes, edges: S.graph.edges },
        with: { hint: "Autogenerado desde topología" },
      },
    ],
    false
  );

  await publishDiagramDV(ns, "Circuito derivado (view)");
}

async function onAutoWire(ns: string) {
  const S = getNs(ns);
  S.graph = deriveGraph(S.topo, S);

  await render(ns, [{ kind: "note", text: "✅ Auto-wire aplicado" }], true);
  await publishDiagramDV(ns, "Circuito derivado (autowire)");
}

async function onSceneExport(ns: string) {
  const S = getNs(ns);
  const graph = S.graph ?? deriveGraph(S.topo, S);
  const blob = { meta: { exported: now() }, theme: S.previewTheme, topo: S.topo, graph };

  S.lastSceneJson = blob;
  S.lastSceneAt = now();

  await render(ns, [{ kind: "note", text: `📦 JSON exportado (${(JSON.stringify(blob).length / 1024).toFixed(1)} KB)` }], true);
  await spore.sayIntent({ sym: "⚡", say: "scene.export.result", ns, with: { json: blob } });

  if (blob.graph) {
    await micelioPublishDV(
      dvDiagram(SITE_ID, `r${now()}`, { meta: { title: "Circuito derivado (export)" }, nodes: blob.graph.nodes, edges: blob.graph.edges }) as any,
      { ns: NS_DIAGRAM, scopes: ["public"] } as any
    );
  }
}

async function onSceneImport(ns: string, withData: any) {
  const inJson = withData?.json;
  if (!inJson) return;

  const S = getNs(ns);

  let json: any = inJson;
  if (typeof json === "string") {
    try {
      json = JSON.parse(json);
    } catch {
      await render(ns, [{ kind: "note", text: "⚠️ JSON inválido" }], true);
      return;
    }
  }

  S.previewTheme = json?.theme === "night" ? "night" : "day";
  S.topo = json?.topo ?? null;
  S.graph = deriveGraph(S.topo, S);

  await render(ns, [{ kind: "note", text: "📥 JSON importado" }], true);
  await pushInspector(ns);

  await publishDiagramDV(ns, "Circuito derivado (import)");
}

// ---------- Telemetría ----------
async function onTelemetryUpdate(ns: string, withData: any) {
  const S = getNs(ns);

  const geo = withData?.geo || withData?.location;
  if (geo?.lat && geo?.lng) {
    S.lastGeo = { lat: Number(geo.lat), lng: Number(geo.lng), radius_km: Number(geo.radius_km ?? 0) || undefined };
  }

  S.telemetry = {
    ...S.telemetry,
    ...(withData || {}),
    source: String(withData?.source || "legacy:unknown"),
    epistemic: withData?.epistemic || (withData?.source === "mock" ? "simulado" : withData?.source ? "observado" : "inferido"),
    ts: Number(withData?.ts ?? now()),
  };

  await pushInspector(ns);

  await publishTelemetryDV(ns);
  if (S.telemetry?.epistemic === "observado") await publishMarketSignalDV(ns);
}

// ---------- Mercado P2P ----------
function normalizeLoc(x: any): { lat: number; lng: number } | undefined {
  const lat = Number(x?.lat);
  const lng = Number(x?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat, lng };
}

async function onOfferCreate(ns: string, withData: any) {
  const S = getNs(ns);

  const loc = normalizeLoc(withData?.location) ?? (S.lastGeo ? { lat: S.lastGeo.lat, lng: S.lastGeo.lng } : undefined);

  const off: Offer = {
    id: uid("offer"),
    seller: withData?.seller ?? "peer:" + ns,
    location: loc,
    amount_kwh: Number(withData?.amount_kwh || 0),
    price_per_kwh: Number(withData?.price_per_kwh || 0),
    visibility: withData?.visibility,
    ts: now(),
  };

  if (off.amount_kwh > 0 && off.price_per_kwh > 0) {
    S.offers.unshift(off);
    await render(ns, [{ kind: "note", text: "✅ Oferta de venta publicada" }], true);
    await publishMarketOfferDV(ns, off);
  } else {
    await render(ns, [{ kind: "note", text: "⚠️ Oferta inválida" }], true);
  }
}

async function onOffersQuery(ns: string, withData: any) {
  const S = getNs(ns);
  let list = [...S.offers];

  const near = withData?.near as { lat: number; lng: number; radius_km: number } | undefined;
  if (near?.lat && near?.lng && near?.radius_km) {
    list = list.filter((o) => {
      if (!o.location) return false;
      const d = haversineKm({ lat: o.location.lat, lng: o.location.lng }, { lat: near.lat, lng: near.lng });
      return d <= near.radius_km;
    });
  }

  list.sort((a, b) => a.price_per_kwh - b.price_per_kwh || a.ts - b.ts);

  await spore.sayIntent({
    sym: "⚡",
    say: "market.offers.result",
    ns,
    with: {
      offers: list.map((o) => ({
        id: o.id,
        seller: o.seller,
        location: o.location,
        amount_kwh: o.amount_kwh,
        price_per_kwh: o.price_per_kwh,
        ts: o.ts,
      })),
    },
  });
}

async function onOrderCreate(ns: string, withData: any) {
  const S = getNs(ns);

  const loc = normalizeLoc(withData?.location) ?? (S.lastGeo ? { lat: S.lastGeo.lat, lng: S.lastGeo.lng } : undefined);

  const ord: Order = {
    id: uid("order"),
    buyer: withData?.buyer ?? "peer:" + ns,
    amount_kwh: Number(withData?.amount_kwh || 0),
    max_price_per_kwh: Number(withData?.max_price_per_kwh || 0),
    location: loc
      ? { lat: Number(loc.lat), lng: Number(loc.lng), radius_km: Number(withData?.radius_km ?? (withData?.location?.radius_km ?? 0)) || undefined }
      : undefined,
    prefer_local: !!withData?.prefer_local,
    ts: now(),
  };

  if (!(ord.amount_kwh > 0 && ord.max_price_per_kwh > 0)) {
    await render(ns, [{ kind: "note", text: "⚠️ Orden inválida" }], true);
    return;
  }

  S.orders.unshift(ord);

  const candidates = S.offers.filter((o) => o.price_per_kwh <= ord.max_price_per_kwh && o.amount_kwh > 0);
  candidates.sort((a, b) => {
    const p = a.price_per_kwh - b.price_per_kwh;
    if (p !== 0) return p;
    if (ord.location && a.location && b.location) {
      const da = haversineKm(ord.location, a.location);
      const db = haversineKm(ord.location, b.location);
      return da - db;
    }
    return a.ts - b.ts;
  });

  let remaining = ord.amount_kwh;
  const fills: { offerId: string; kwh: number; price: number }[] = [];

  for (const off of candidates) {
    if (ord.prefer_local && ord.location && off.location && typeof ord.location.radius_km === "number") {
      const d = haversineKm(ord.location, off.location);
      if (d > (ord.location.radius_km || 5)) continue;
    }
    if (remaining <= 0) break;

    const take = Math.min(remaining, off.amount_kwh);
    if (take <= 0) continue;

    fills.push({ offerId: off.id, kwh: take, price: off.price_per_kwh });
    off.amount_kwh -= take;
    remaining -= take;
  }

  const filled = ord.amount_kwh - Math.max(0, remaining);
  const avgPrice = fills.length && filled > 0 ? fills.reduce((s, f) => s + f.price * f.kwh, 0) / filled : 0;

  await spore.sayIntent({ sym: "⚡", say: "market.order.result", ns, with: { order_id: ord.id, filled_kwh: filled, avg_price: Number(avgPrice.toFixed(3)), partial: remaining > 0, fills } });

  await render(ns, [{ kind: "note", text: filled > 0 ? `✅ Orden ejecutada ${filled.toFixed(2)} kWh @ ~$${avgPrice.toFixed(3)}` : "ℹ️ Sin ofertas compatibles" }], true);

  await publishMarketOrderDV(ns, ord);
}

// ---------- Kinds & WireRules (intents clásicos) ----------
async function onKindRegister(ns: string, withData: any) {
  const S = getNs(ns);
  ensureBuiltinKinds(S);

  const def: KindDef = withData?.def;
  if (!def?.kind) {
    await render(ns, [{ kind: "note", text: "⚠️ kind.register: falta def.kind" }], true);
    return;
  }
  S.kindRegistry[def.kind] = { ...S.kindRegistry[def.kind], ...def };
  await render(ns, [{ kind: "note", text: `🧩 Kind registrado: ${def.kind}` }], true);
}

async function onKindList(ns: string) {
  const S = getNs(ns);
  ensureBuiltinKinds(S);
  await spore.sayIntent({ sym: "⚡", say: "kind.list.result", ns, with: { kinds: Object.values(S.kindRegistry) } });
}

async function onWireRuleAdd(ns: string, withData: any) {
  const S = getNs(ns);
  const r: WireRule = withData?.rule;
  const rule = normalizeWireRule(r);
  if (!rule) {
    await render(ns, [{ kind: "note", text: "⚠️ wire.rule.add: datos incompletos" }], true);
    return;
  }
  S.wireRules.push({ ...rule });
  await render(ns, [{ kind: "note", text: `🔗 Regla añadida (${rule.edgeType})` }], true);
}

// ---------- Nuevos intents desde tu editor ----------
async function onEnergyKindPublish(ns: string, withData: any) {
  const S = getNs(ns);
  ensureBuiltinKinds(S);

  const dv: AnyDV | null = withData?.dv || null;
  if (!dv) {
    await render(ns, [{ kind: "note", text: "⚠️ energy.kind.publish: falta dv" }], true);
    return;
  }

  // aplicar a memoria
  const ok = applyEnergyKindDV(S, dv);
  if (!ok) {
    await render(ns, [{ kind: "note", text: "⚠️ energy.kind.publish: dv inválido (sin kindId/def)" }], true);
    return;
  }

  // publicar a micelio para comunidad
  dv.kind = dv.kind || "energy.kind";
  dv.meta = { ...(dv.meta || {}), ns: NS_REGISTRY, scopes: ["public"] };

  await micelioPublishDV(dv as any, { ns: NS_REGISTRY, scopes: ["public"] } as any);

  await spore.sayIntent({ sym: "⚡", say: "ui.toast", ns, with: { text: `🧩 Kind publicado: ${dv?.attrs?.kindId || dv?.attrs?.def?.kind || "ok"}` } });
}

async function onEnergyWireRulePublish(ns: string, withData: any) {
  const S = getNs(ns);
  ensureBuiltinKinds(S);

  const dv: AnyDV | null = withData?.dv || null;
  if (!dv) {
    await render(ns, [{ kind: "note", text: "⚠️ energy.wire.rule.publish: falta dv" }], true);
    return;
  }

  const ok = applyWireRuleDV(S, dv);
  if (!ok) {
    await render(ns, [{ kind: "note", text: "⚠️ energy.wire.rule.publish: dv inválido (sin rule)" }], true);
    return;
  }

  dv.kind = dv.kind || "energy.wire.rule";
  dv.meta = { ...(dv.meta || {}), ns: NS_REGISTRY, scopes: ["public"] };

  await micelioPublishDV(dv as any, { ns: NS_REGISTRY, scopes: ["public"] } as any);

  await spore.sayIntent({ sym: "⚡", say: "ui.toast", ns, with: { text: `🔗 Regla publicada (${dv?.attrs?.rule?.edgeType || "ok"})` } });
}

// ---------- CRUD de instancias via intents ----------
async function onCompCreate(ns: string, withData: any) {
  const S = getNs(ns);
  ensureBuiltinKinds(S);

  const topo = S.topo || { rooms: [], comps: [] };
  const { kind, roomId, attach = "floor", x = 0, y = 0, params = {} } = withData || {};
  if (!kind) {
    await render(ns, [{ kind: "note", text: "⚠️ comp.create: falta kind" }], true);
    return;
  }

  const id = uid("comp");
  topo.comps.push({ id, kind: String(kind), roomId: roomId || topo.rooms[0]?.id || "room0", attach, x, y, params });
  S.topo = topo;

  S.graph = deriveGraph(S.topo, S);
  await render(ns, [{ kind: "note", text: `➕ Componente creado (${kind})` }], true);
}

async function onCompUpdate(ns: string, withData: any) {
  const S = getNs(ns);
  const { id, patch } = withData || {};
  if (!id) {
    await render(ns, [{ kind: "note", text: "⚠️ comp.update: falta id" }], true);
    return;
  }
  const c = S.topo?.comps.find((c) => c.id === id);
  if (!c) {
    await render(ns, [{ kind: "note", text: "⚠️ comp.update: no existe" }], true);
    return;
  }

  Object.assign(c, patch || {});
  S.graph = deriveGraph(S.topo, S);
  await render(ns, [{ kind: "note", text: `✏️ Componente actualizado (${id})` }], true);
}

async function onCompDelete(ns: string, withData: any) {
  const S = getNs(ns);
  const { id } = withData || {};
  if (!id) {
    await render(ns, [{ kind: "note", text: "⚠️ comp.delete: falta id" }], true);
    return;
  }
  if (!S.topo) return;

  S.topo.comps = S.topo.comps.filter((c) => c.id !== id);
  S.graph = deriveGraph(S.topo, S);
  await render(ns, [{ kind: "note", text: `🗑️ Componente eliminado (${id})` }], true);
}

// ---------- UI blocks: comprar / vender ----------
async function uiShowBuy(ns: string, withData?: any) {
  const S = getNs(ns);
  const geo = withData?.near || withData?.geo || withData?.location || S.lastGeo;

  await render(
    ns,
    [
      { kind: "title", text: "Comprar excedente ⚡" },
      {
        kind: "note",
        text: geo?.lat && geo?.lng ? `📍 Cerca de (${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)})` : "📍 Sin geolocalización (podés enviar {near:{lat,lng,radius_km}})",
      },
      {
        kind: "toolbar",
        items: [
          {
            text: "🔎 Buscar ofertas cerca",
            sym: "⚡",
            say: "market.offers.query",
            with: { near: geo?.lat && geo?.lng ? { lat: geo.lat, lng: geo.lng, radius_km: geo.radius_km ?? 5 } : undefined },
          },
          {
            text: "🛒 Comprar 0.2 kWh",
            sym: "⚡",
            say: "market.order.create",
            with: {
              amount_kwh: 0.2,
              max_price_per_kwh: 0.14,
              prefer_local: true,
              radius_km: geo?.radius_km ?? 5,
              location: geo?.lat && geo?.lng ? { lat: geo.lat, lng: geo.lng } : undefined,
            },
          },
          { text: "👁 Ver circuito", sym: "⚡", say: "ui.circuit.view" },
          { text: "🔗 Auto-wire", sym: "⚡", say: "ui.autowire" },
        ],
      },
    ],
    false
  );
}

async function uiShowSell(ns: string, withData?: any) {
  const S = getNs(ns);
  const geo = withData?.geo || withData?.location || S.lastGeo;

  await render(
    ns,
    [
      { kind: "title", text: "Vender excedente ⚡" },
      { kind: "note", text: geo?.lat && geo?.lng ? `📍 Tu punto (${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)})` : "📍 Sin geolocalización (podés enviar {location:{lat,lng}})" },
      {
        kind: "toolbar",
        items: [
          {
            text: "📤 Publicar venta 0.1 kWh",
            sym: "⚡",
            say: "market.offer.create",
            with: {
              amount_kwh: 0.1,
              price_per_kwh: 0.12,
              visibility: { radius_km: 10 },
              location: geo?.lat && geo?.lng ? { lat: geo.lat, lng: geo.lng } : undefined,
            },
          },
          { text: "👁 Ver circuito", sym: "⚡", say: "ui.circuit.view" },
          { text: "📦 Export JSON", sym: "⚡", say: "scene.export" },
        ],
      },
    ],
    false
  );
}

// ---------- Bootstrap del controlador ----------
export function bootstrapEnergyCoreController(ns = "energy:core") {
  const g: any = globalThis as any;
  if (g.__GE_CORE_CTL__?.[ns]) return;
  g.__GE_CORE_CTL__ = g.__GE_CORE_CTL__ || {};
  g.__GE_CORE_CTL__[ns] = true;

  const S = getNs(ns);
  ensureBuiltinKinds(S);

  spore.on("intent", async (msg: any) => {
    const i = msg?.payload || msg;
    if (!i || i.sym !== "⚡") return;

    // ✅ UI_NS routing:
    // - normalmente i.ns == ns
    // - pero si UI manda uiNs, aceptamos aunque i.ns sea otro
    const uiNs = i?.with?.uiNs;
    const isForMe = i.ns === ns || uiNs === ns;
    if (!isForMe) return;

    try {
      switch (i.say) {
        // --------- Navegación / UI ---------
        case "ui.nav.buy":
          await uiShowBuy(ns, i.with);
          break;
        case "ui.nav.sell":
          await uiShowSell(ns, i.with);
          break;

        // --------- Escena ---------
        case "guardar.escena":
          await onGuardarEscena(ns, i.with);
          break;
        case "ui.circuit.view":
          await onCircuitView(ns);
          break;
        case "ui.autowire":
          await onAutoWire(ns);
          break;
        case "scene.export":
          await onSceneExport(ns);
          break;
        case "scene.import":
          await onSceneImport(ns, i.with);
          break;

        // Aliases
        case "model.save":
          await onSceneExport(ns);
          break;
        case "model.load":
          await onSceneImport(ns, i.with);
          break;

        // ✅ responde con último export guardado
        case "model.load.request": {
          if (S.lastSceneJson) {
            await spore.sayIntent({ sym: "⚡", say: "scene.import.result", ns, with: { json: S.lastSceneJson } });
            await render(ns, [{ kind: "note", text: "📥 Envié scene.import.result con el último export (memoria local)" }], true);
          } else {
            await render(ns, [{ kind: "note", text: "📥 No hay export previo. Hacé model.save / scene.export primero." }], true);
          }
          await spore.sayIntent({ sym: "⚡", say: "scene.import.request", ns });
          break;
        }

        // --------- Tema preview ---------
        case "ui.preview.theme": {
          const theme = i?.with?.theme === "night" ? "night" : "day";
          S.previewTheme = theme;
          await render(ns, [{ kind: "note", text: `🌗 Tema: ${theme}` }], true);
          break;
        }

        // --------- Simulación (stub) ---------
        case "simular.red": {
  await render(
    ns,
    [{ kind: "note", text: `🧪 Simulación solicitada: ${i?.with?.preset ?? "default"}` }],
    true
  );
  await publishPhase1Artifacts(ns, {
    ...i.with,
    publishOffers: false,
  });
  break;
}

        // --------- Telemetría ---------
        case "telemetry.update":
          await onTelemetryUpdate(ns, i.with);
          break;

        // --------- Mercado ---------
        case "market.offer.create":
          await onOfferCreate(ns, i.with);
          break;
        case "market.offers.query":
          await onOffersQuery(ns, i.with);
          break;
        case "market.order.create":
          await onOrderCreate(ns, i.with);
          break;

        // --------- Registry clásico ---------
        case "kind.register":
          await onKindRegister(ns, i.with);
          break;
        case "kind.list.request":
          await onKindList(ns);
          break;
        case "wire.rule.add":
          await onWireRuleAdd(ns, i.with);
          break;

        // ✅ Registry NUEVO (desde editor)
        case "energy.kind.publish":
          await onEnergyKindPublish(ns, i.with);
          break;
        case "energy.wire.rule.publish":
          await onEnergyWireRulePublish(ns, i.with);
          break;
          case "energy.plan.generate":
  await publishPhase1Artifacts(ns, {
    ...i.with,
    publishOffers: false,
  });
  break;

case "energy.offer.generate":
  await publishPhase1Artifacts(ns, {
    ...i.with,
    publishOffers: true,
  });
  break;

case "energy.fabrication.prepare":
  await publishPhase3Artifacts(ns, i.with);
  break;

case "energy.mo.plan.request":
  await publishPhase3Artifacts(ns, i.with);
  break;

case "energy.fabrication.publish":
  await publishPhase3Artifacts(ns, i.with);
  break;

        // --------- Componentes CRUD ---------
        case "comp.create":
          await onCompCreate(ns, i.with);
          break;
        case "comp.update":
          await onCompUpdate(ns, i.with);
          break;
        case "comp.delete":
          await onCompDelete(ns, i.with);
          break;

        // ✅ publicar diagrama manual
        case "energy.diagram.publish":
          await publishDiagramDV(ns, i?.with?.title || "Circuito derivado (manual)");
          break;

        default:
          break;
      }
    } catch (e: any) {
      await render(ns, [{ kind: "note", text: `⚠️ Error: ${e?.message || String(e)}` }], true);
    }
  });

  // ✅ Listener EXTRA (si tu bus a veces entrega dv directos como msg.dv)
  // Si no aplica en tu spore, no rompe nada.
  spore.on("dv", async (m: any) => {
    const dv: AnyDV = m?.dv || m;
    if (!dv?.kind) return;
    if (dv.kind === "energy.kind") {
      const ok = applyEnergyKindDV(S, dv);
      if (ok) await render(ns, [{ kind: "note", text: `🧩 Kind recibido: ${dv?.attrs?.kindId || dv?.attrs?.def?.kind}` }], true);
    }
    if (dv.kind === "energy.wire.rule") {
      const ok = applyWireRuleDV(S, dv);
      if (ok) await render(ns, [{ kind: "note", text: `🔗 Regla recibida: ${dv?.attrs?.rule?.edgeType || "ok"}` }], true);
    }
  });
}
