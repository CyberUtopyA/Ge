import type { PlcNormalizedMetrics, PlcStoreEntry, PlcTagAlias, PlcTags } from "./plc.types";

const ALIASES: PlcTagAlias[] = [
  { canonical: "energy.voltage", aliases: ["voltage", "volt", "v", "db100.voltage", "line.voltage"] },
  { canonical: "energy.current", aliases: ["current", "amp", "a", "db100.current", "line.current"] },
  { canonical: "energy.powerKw", aliases: ["power_kw", "kw", "power", "db100.powerkw", "line.powerkw"] },
  { canonical: "energy.energyKwh", aliases: ["energy_kwh", "kwh", "energy", "db100.energykwh"] },
  { canonical: "env.temperatureC", aliases: ["temp_c", "temperature", "temp", "db100.temp1", "cabinet.temp"] },
  { canonical: "env.humidityPct", aliases: ["humidity_pct", "humidity", "hum", "env.humidity"] },
  { canonical: "pv.kw", aliases: ["pv_kw", "pv", "solar_kw", "gen.pvkw"] },
  { canonical: "load.kw", aliases: ["load_kw", "load", "consumption_kw", "site.loadkw"] },
  { canonical: "storage.soc", aliases: ["soc", "battery_soc", "storage.soc"] },
  { canonical: "grid.in_kw", aliases: ["grid_in", "grid_in_kw", "grid.import_kw"] },
  { canonical: "grid.out_kw", aliases: ["grid_out", "grid_out_kw", "grid.export_kw"] },
  { canonical: "line.enabled", aliases: ["line_enabled", "enabled", "m10.0"] },
  { canonical: "extractor.on", aliases: ["extractor_on", "q0.1"] },
];

function keyNorm(s: string) {
  return String(s).trim().toLowerCase();
}

function findCanonicalKey(inputKey: string) {
  const k = keyNorm(inputKey);
  for (const a of ALIASES) {
    if (keyNorm(a.canonical) === k) return a.canonical;
    if (a.aliases.some((x) => keyNorm(x) === k)) return a.canonical;
  }
  return inputKey;
}

function toNum(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function toBool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.toLowerCase().trim();
    if (["1", "true", "on", "yes"].includes(s)) return true;
    if (["0", "false", "off", "no"].includes(s)) return false;
  }
  return undefined;
}

export function normalizePlcTags(tags: PlcTags): PlcTags {
  const out: PlcTags = {};
  for (const [k, v] of Object.entries(tags || {})) {
    out[findCanonicalKey(k)] = v;
  }
  return out;
}

export function derivePlcMetrics(tags: PlcTags): PlcNormalizedMetrics {
  const t = normalizePlcTags(tags);

  return {
    voltage: toNum(t["energy.voltage"]),
    current: toNum(t["energy.current"]),
    powerKw: toNum(t["energy.powerKw"]),
    energyKwh: toNum(t["energy.energyKwh"]),
    temperatureC: toNum(t["env.temperatureC"]),
    humidityPct: toNum(t["env.humidityPct"]),
    pvKw: toNum(t["pv.kw"]),
    loadKw: toNum(t["load.kw"]),
    soc: toNum(t["storage.soc"]),
    gridInKw: toNum(t["grid.in_kw"]),
    gridOutKw: toNum(t["grid.out_kw"]),
    lineEnabled: toBool(t["line.enabled"]),
    extractorOn: toBool(t["extractor.on"]),
  };
}

export function aggregateEnergyTelemetry(entries: PlcStoreEntry[]) {
  const live = entries.filter((e) => e.status !== "offline");
  if (!live.length) {
    return {
      pv_kw: 0,
      load_kw: 0,
      soc: 0,
      grid_in: 0,
      grid_out: 0,
      ts: Date.now(),
    };
  }

  const avg = (vals: Array<number | undefined>) => {
    const xs = vals.filter((x): x is number => Number.isFinite(x as number));
    if (!xs.length) return 0;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  };

  const sum = (vals: Array<number | undefined>) =>
    vals.filter((x): x is number => Number.isFinite(x as number)).reduce((a, b) => a + b, 0);

  return {
    pv_kw: Number(sum(live.map((e) => e.normalized.pvKw)).toFixed(3)),
    load_kw: Number(sum(live.map((e) => e.normalized.loadKw ?? e.normalized.powerKw)).toFixed(3)),
    soc: Number(avg(live.map((e) => e.normalized.soc)).toFixed(2)),
    grid_in: Number(sum(live.map((e) => e.normalized.gridInKw)).toFixed(3)),
    grid_out: Number(sum(live.map((e) => e.normalized.gridOutKw)).toFixed(3)),
    ts: Math.max(...live.map((e) => e.ts)),
  };
}

export function deriveAlarmCandidates(entry: PlcStoreEntry) {
  const alarms: Array<{
    alarmCode: string;
    severity: "low" | "medium" | "high" | "critical";
    message: string;
    relatedTag?: string;
  }> = [];

  const m = entry.normalized;

  if (typeof m.temperatureC === "number" && m.temperatureC >= 70) {
    alarms.push({
      alarmCode: "cabinet.overtemp",
      severity: m.temperatureC >= 85 ? "critical" : "high",
      message: `Temperatura de gabinete alta (${m.temperatureC}°C)`,
      relatedTag: "env.temperatureC",
    });
  }

  if (typeof m.voltage === "number" && (m.voltage < 190 || m.voltage > 250)) {
    alarms.push({
      alarmCode: "line.voltage.out_of_range",
      severity: "high",
      message: `Voltaje fuera de rango (${m.voltage}V)`,
      relatedTag: "energy.voltage",
    });
  }

  if (typeof m.current === "number" && m.current > 63) {
    alarms.push({
      alarmCode: "line.overcurrent",
      severity: m.current > 90 ? "critical" : "high",
      message: `Corriente alta (${m.current}A)`,
      relatedTag: "energy.current",
    });
  }

  if (entry.status === "offline") {
    alarms.push({
      alarmCode: "plc.offline",
      severity: "critical",
      message: `PLC ${entry.plcId} offline`,
    });
  }

  return alarms;
}