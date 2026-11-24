import type { SensorDef, SensorReading, NodeSensorLink } from "../utopy/types.simbiosis";

type SensorMap = Map<string, SensorDef>;
type ReadingMap = Map<string, SensorReading>;
type LinkMap = Map<string, Set<string>>; // nodeId -> set(sensorId)

const SENSORS: SensorMap = new Map();
const READINGS: ReadingMap = new Map();
const LINKS: LinkMap = new Map();
const watchers = new Set<() => void>();

export function onSensorsChange(fn: () => void) {
  watchers.add(fn);
  return () => watchers.delete(fn);
}
function emit() { for (const fn of watchers) try { fn(); } catch {} }

export function registerSensor(def: SensorDef) {
  SENSORS.set(def.id, { ...def });
  emit();
}
export function upsertSensors(list: SensorDef[]) {
  for (const s of list) registerSensor(s);
}

export function listSensors(): SensorDef[] { return [...SENSORS.values()]; }
export function getSensor(id: string): SensorDef | undefined { return SENSORS.get(id); }
export function getReading(id: string): SensorReading | undefined { return READINGS.get(id); }

export function attachSensor(nodeId: string, sensorId: string) {
  if (!SENSORS.has(sensorId)) throw new Error("sensor.not.registered");
  if (!LINKS.has(nodeId)) LINKS.set(nodeId, new Set());
  LINKS.get(nodeId)!.add(sensorId);
  emit();
}
export function detachSensor(nodeId: string, sensorId: string) {
  LINKS.get(nodeId)?.delete(sensorId);
  emit();
}
export function getNodeSensors(nodeId: string): string[] {
  return [...(LINKS.get(nodeId) || [])];
}

// push de lectura (desde adaptador real/simulado)
export function pushReading(sensorId: string, reading: SensorReading) {
  READINGS.set(sensorId, reading);
  emit();
}

// Utilidad: aplica mapping a un nodo (mutación in-place)
export function applyReadingToNode(node: any, sensor: SensorDef, reading: SensorReading) {
  const src = reading?.value || {};
  const map = sensor.mapping || {};
  for (const [key, dest] of Object.entries(map)) {
    if (!(key in src)) continue;
    // dest: "params.soc" | "state.p_kw"
    const [root, field] = String(dest).split(".");
    if (!root || !field) continue;
    (node[root] ||= {});
    (node[root] as any)[field] = src[key];
  }
}
