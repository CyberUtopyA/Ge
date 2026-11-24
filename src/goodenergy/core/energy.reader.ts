import type {
  Comp,
  EnergyContext,
  EnergyCounts,
  GeoHint,
  Room,
  RoomEnergyHint,
  Telemetry,
  Topologia,
} from "./energy.phase1.types";

type KindSpec = {
  sourceKw?: number;
  storageKwh?: number;
  inverterKw?: number;
  loadKw?: number;
};

const KIND_SPECS: Record<string, KindSpec> = {
  "panel.solar": { sourceKw: 0.55 },
  "turbina.eolica": { sourceKw: 1.5 },
  hidro: { sourceKw: 2.2 },
  bateria: { storageKwh: 5.0 },
  inversor: { inverterKw: 5.0 },
  carga: { loadKw: 1.5 },
  sensor: { loadKw: 0.005 },
  rele: { loadKw: 0.002 },
  grid: { loadKw: 0 },
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function inc(map: EnergyCounts, key: string, by = 1) {
  map[key] = (map[key] || 0) + by;
}

function safeNum(n: any, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function buildCounts(topo: Topologia | null): EnergyCounts {
  const out: EnergyCounts = {};
  for (const c of topo?.comps || []) inc(out, String(c.kind || "unknown"));
  return out;
}

function compsForRoom(room: Room, comps: Comp[]) {
  return comps.filter((c) => c.roomId === room.id);
}

function deriveRoomHints(topo: Topologia | null): RoomEnergyHint[] {
  if (!topo) return [];

  return topo.rooms.map((room) => {
    const comps = compsForRoom(room, topo.comps || []);
    let sourceKw = 0;
    let loadKw = 0;

    for (const c of comps) {
      const spec = KIND_SPECS[String(c.kind)] || {};
      sourceKw += safeNum(spec.sourceKw);
      loadKw += safeNum(spec.loadKw);
    }

    const area = Math.max(1, room.w * room.d);
    const baseLighting = Math.max(0.18, area * 0.03);
    const baseUsage = comps.length > 0 ? 0.12 : 0.06;
    const baseKw = round3(baseLighting + baseUsage);

    return {
      roomId: room.id,
      componentCount: comps.length,
      sourceKw: round3(sourceKw),
      loadKw: round3(loadKw),
      baseKw,
    };
  });
}

function deriveSiteType(roomCount: number, counts: EnergyCounts): EnergyContext["siteType"] {
  const sources =
    (counts["panel.solar"] || 0) +
    (counts["turbina.eolica"] || 0) +
    (counts["hidro"] || 0);

  const sensors = counts["sensor"] || 0;
  const relays = counts["rele"] || 0;

  if (sources >= 3 && roomCount >= 3) return "microgrid";
  if (roomCount >= 4 || sensors >= 6 || relays >= 4) return "fabrica";
  if (roomCount >= 2) return "taller";
  if (sources >= 1) return "estacion";
  return "territorio";
}

function deriveSourceKinds(counts: EnergyCounts): string[] {
  return Object.keys(counts).filter((k) =>
    ["panel.solar", "turbina.eolica", "hidro", "bateria", "inversor", "sensor", "rele", "grid", "carga"].includes(k)
  );
}

export function buildEnergyContext(input: {
  ns: string;
  siteId: string;
  topo: Topologia | null;
  telemetry?: Telemetry;
  geo?: GeoHint;
}): EnergyContext {
  const topo = input.topo || { rooms: [], comps: [] };
  const telemetry = input.telemetry || {};
  const counts = buildCounts(topo);
  const roomHints = deriveRoomHints(topo);

  const estimatedSourceKw = round3(
    Object.entries(counts).reduce((sum, [kind, qty]) => sum + safeNum(KIND_SPECS[kind]?.sourceKw) * qty, 0)
  );

  const estimatedStorageKwh = round3(
    Object.entries(counts).reduce((sum, [kind, qty]) => sum + safeNum(KIND_SPECS[kind]?.storageKwh) * qty, 0)
  );

  const estimatedInverterKw = round3(
    Math.max(
      0,
      Object.entries(counts).reduce((sum, [kind, qty]) => sum + safeNum(KIND_SPECS[kind]?.inverterKw) * qty, 0)
    )
  );

  const derivedRoomLoadKw = round3(roomHints.reduce((sum, r) => sum + r.baseKw + r.loadKw, 0));
  const telemetryLoadKw = safeNum(telemetry.load_kw);
  const telemetryPvKw = safeNum(telemetry.pv_kw);

  const estimatedConnectedLoadKw = round3(
    Math.max(derivedRoomLoadKw, telemetryLoadKw, topo.rooms.length ? topo.rooms.length * 0.22 : 0.3)
  );

  return {
    ns: input.ns,
    siteId: input.siteId,
    topo,
    telemetry,
    geo: input.geo,

    roomCount: topo.rooms.length,
    componentCount: topo.comps.length,
    counts,
    roomHints,

    siteType: deriveSiteType(topo.rooms.length, counts),
    sourceKinds: deriveSourceKinds(counts),

    estimatedSourceKw,
    estimatedStorageKwh,
    estimatedInverterKw,
    estimatedConnectedLoadKw,
    estimatedTelemetryLoadKw: round3(telemetryLoadKw),
    estimatedTelemetryPvKw: round3(telemetryPvKw),

    sensorCount: counts["sensor"] || 0,
    relayCount: counts["rele"] || 0,
    hasGrid: (counts["grid"] || 0) > 0 || safeNum(telemetry.grid_in) > 0 || safeNum(telemetry.grid_out) > 0,
  };
}