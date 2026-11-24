
import type { PlcStoreEntry } from "../plc/plc.types";
import { aggregateEnergyTelemetry } from "./tagmap";

type NsTelemetryState = {
  byPlc: Record<string, PlcStoreEntry>;
  updatedAt: number;
};

const STATE: Record<string, NsTelemetryState> = {};

function getNs(ns: string): NsTelemetryState {
  if (!STATE[ns]) {
    STATE[ns] = {
      byPlc: {},
      updatedAt: 0,
    };
  }
  return STATE[ns];
}

export function upsertPlcTelemetry(ns: string, entry: PlcStoreEntry) {
  const S = getNs(ns);
  S.byPlc[entry.plcId] = entry;
  S.updatedAt = Date.now();
}

export function getPlcTelemetry(ns: string) {
  return Object.values(getNs(ns).byPlc);
}

export function getPlcTelemetryById(ns: string, plcId: string) {
  return getNs(ns).byPlc[plcId] || null;
}

export function getAggregatedEnergyTelemetry(ns: string) {
  return aggregateEnergyTelemetry(getPlcTelemetry(ns));
}

export function getTelemetrySummary(ns: string) {
  const list = getPlcTelemetry(ns);
  const agg = getAggregatedEnergyTelemetry(ns);

  return {
    count: list.length,
    online: list.filter((x) => x.status !== "offline").length,
    alert: list.filter((x) => x.status === "alert").length,
    warn: list.filter((x) => x.status === "warn").length,
    offline: list.filter((x) => x.status === "offline").length,
    aggregated: agg,
    updatedAt: getNs(ns).updatedAt,
  };
}