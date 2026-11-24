import type { EnergyContext, EnergyPlanAttrs, MaterialLine } from "../core/energy.phase1.types";

export type EnergyStructureKind =
  | "energy.cabinet"
  | "energy.station"
  | "energy.rack"
  | "energy.ewaste.module";

export type MoSceneSeed = {
  id: string;
  space: "cartesian-3d";
  unit: "m";
  version: number;
  meta: {
    source: "ge";
    contextType: EnergyContext["siteType"];
    structureKind: EnergyStructureKind;
  };
  nodes: Array<{
    id: string;
    kind: string;
    pose: { x: number; y: number; z: number; rotY?: number };
    params?: Record<string, any>;
    material?: string;
    traits?: string[];
  }>;
};

export type MoFabricationPackAttrs = {
  title: string;
  structureKind: EnergyStructureKind;
  basedOnPlanId?: string;
  source: {
    node: "ge";
    contextType: EnergyContext["siteType"];
    siteId: string;
  };
  dimensions: {
    width_m: number;
    depth_m: number;
    height_m: number;
  };
  cutlist: Array<{
    id: string;
    material: string;
    qty: number;
    unit: "u";
    width_m?: number;
    height_m?: number;
    depth_m?: number;
    thickness_mm?: number;
    note?: string;
  }>;
  hardware: Array<{
    id: string;
    name: string;
    qty: number;
    unit: string;
    note?: string;
  }>;
  electrical: Array<MaterialLine>;
  sensors: EnergyPlanAttrs["sensors"];
  assemblySteps: string[];
  notes: string[];
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function inferEnergyStructureKind(
  ctx: EnergyContext,
  plan: EnergyPlanAttrs
): EnergyStructureKind {
  const hasManySensors = (ctx.sensorCount || 0) >= 6;
  const hasManyCircuits = (plan.circuits || []).length >= 8;
  const peak = Number(plan.summary?.estimatedPeakKw || 0);

  if (ctx.siteType === "territorio" && hasManySensors) return "energy.station";
  if (ctx.siteType === "fabrica" || peak >= 10 || hasManyCircuits) return "energy.station";
  if (ctx.siteType === "microgrid") return "energy.rack";
  if (ctx.siteType === "estacion") return "energy.ewaste.module";
  return "energy.cabinet";
}

function deriveEnvelope(kind: EnergyStructureKind, ctx: EnergyContext, plan: EnergyPlanAttrs) {
  const batteryCount = ctx.counts["bateria"] || 0;
  const relayCount = ctx.relayCount || 0;
  const sensorCount = ctx.sensorCount || 0;
  const breaker = Number(plan.board?.mainBreakerAmp || 32);

  if (kind === "energy.station") {
    return {
      width_m: round3(1.4 + Math.min(0.8, (plan.circuits.length || 0) * 0.05)),
      depth_m: round3(0.55 + Math.min(0.15, batteryCount * 0.03)),
      height_m: round3(2.1 + Math.min(0.2, sensorCount * 0.01)),
      breaker,
    };
  }

  if (kind === "energy.rack") {
    return {
      width_m: 0.8,
      depth_m: round3(0.7 + Math.min(0.2, batteryCount * 0.04)),
      height_m: round3(2 + Math.min(0.2, relayCount * 0.02)),
      breaker,
    };
  }

  if (kind === "energy.ewaste.module") {
    return {
      width_m: 1.2,
      depth_m: 0.7,
      height_m: 1.95,
      breaker,
    };
  }

  return {
    width_m: round3(0.8 + Math.min(0.25, (plan.circuits.length || 0) * 0.025)),
    depth_m: round3(0.38 + Math.min(0.12, batteryCount * 0.02)),
    height_m: round3(1.85 + Math.min(0.12, relayCount * 0.015)),
    breaker,
  };
}

export function buildMoSceneFromEnergyPlan(
  ctx: EnergyContext,
  plan: EnergyPlanAttrs,
  basedOnPlanId?: string
): MoSceneSeed {
  const structureKind = inferEnergyStructureKind(ctx, plan);
  const env = deriveEnvelope(structureKind, ctx, plan);
  const batteryCount = ctx.counts["bateria"] || 0;
  const inverterCount = ctx.counts["inversor"] || 0;
  const sensorCount = ctx.sensorCount || 0;
  const relayCount = ctx.relayCount || 0;

  const nodes: MoSceneSeed["nodes"] = [
    {
      id: "base",
      kind: "rect.box",
      pose: { x: 0, y: 0, z: 0.05 },
      params: { w: env.width_m, h: 0.1, d: env.depth_m },
      material: "metal.dark",
      traits: ["mo:frame", "energy:base"],
    },
    {
      id: "left-side",
      kind: "rect.box",
      pose: { x: -env.width_m / 2 + 0.015, y: 0, z: env.height_m / 2 },
      params: { w: 0.03, h: env.height_m, d: env.depth_m },
      material: "metal.dark",
      traits: ["mo:panel", "energy:side"],
    },
    {
      id: "right-side",
      kind: "rect.box",
      pose: { x: env.width_m / 2 - 0.015, y: 0, z: env.height_m / 2 },
      params: { w: 0.03, h: env.height_m, d: env.depth_m },
      material: "metal.dark",
      traits: ["mo:panel", "energy:side"],
    },
    {
      id: "back",
      kind: "rect.box",
      pose: { x: 0, y: -env.depth_m / 2 + 0.01, z: env.height_m / 2 },
      params: { w: env.width_m - 0.03, h: env.height_m, d: 0.02 },
      material: "metal.dark",
      traits: ["mo:panel", "energy:back"],
    },
    {
      id: "top",
      kind: "rect.box",
      pose: { x: 0, y: 0, z: env.height_m - 0.015 },
      params: { w: env.width_m, h: 0.03, d: env.depth_m },
      material: "metal.dark",
      traits: ["mo:panel", "energy:top"],
    },
    {
      id: "door",
      kind: "rect.box",
      pose: { x: 0, y: env.depth_m / 2 - 0.01, z: env.height_m / 2 },
      params: { w: env.width_m - 0.04, h: env.height_m - 0.06, d: 0.02 },
      material: "glass.smoke",
      traits: ["mo:door", "energy:front"],
    },
    {
      id: "mount-plate",
      kind: "rect.box",
      pose: { x: 0, y: -env.depth_m / 2 + 0.06, z: env.height_m / 2 },
      params: { w: env.width_m - 0.12, h: env.height_m - 0.24, d: 0.015 },
      material: "metal.light",
      traits: ["mo:mount", "energy:plate"],
    },
  ];

  for (let i = 0; i < Math.max(1, inverterCount); i++) {
    nodes.push({
      id: `inverter-${i + 1}`,
      kind: "rect.box",
      pose: {
        x: -env.width_m * 0.18 + i * 0.22,
        y: -env.depth_m / 2 + 0.08,
        z: env.height_m * 0.72 - i * 0.02,
      },
      params: { w: 0.22, h: 0.32, d: 0.08 },
      material: "white.matte",
      traits: ["energy:inverter"],
    });
  }

  for (let i = 0; i < Math.max(1, batteryCount); i++) {
    nodes.push({
      id: `battery-${i + 1}`,
      kind: "rect.box",
      pose: {
        x: -env.width_m * 0.2 + (i % 2) * 0.24,
        y: -env.depth_m / 2 + 0.12,
        z: 0.28 + Math.floor(i / 2) * 0.22,
      },
      params: { w: 0.2, h: 0.16, d: 0.24 },
      material: "battery.black",
      traits: ["energy:battery"],
    });
  }

  for (let i = 0; i < Math.max(1, relayCount); i++) {
    nodes.push({
      id: `breaker-${i + 1}`,
      kind: "rect.box",
      pose: {
        x: env.width_m * 0.18 - (i % 3) * 0.08,
        y: -env.depth_m / 2 + 0.1,
        z: env.height_m * 0.48 - Math.floor(i / 3) * 0.09,
      },
      params: { w: 0.06, h: 0.08, d: 0.05 },
      material: "gray.matte",
      traits: ["energy:breaker"],
    });
  }

  for (let i = 0; i < sensorCount; i++) {
    nodes.push({
      id: `sensor-${i + 1}`,
      kind: "rect.box",
      pose: {
        x: -env.width_m * 0.28 + (i % 4) * 0.1,
        y: env.depth_m / 2 - 0.03,
        z: env.height_m * 0.88 - Math.floor(i / 4) * 0.08,
      },
      params: { w: 0.04, h: 0.04, d: 0.02 },
      material: "blue.glow",
      traits: ["energy:sensor"],
    });
  }

  if (structureKind === "energy.station") {
    nodes.push(
      {
        id: "pedestal-left",
        kind: "rect.box",
        pose: { x: -env.width_m * 0.35, y: 0, z: 0.45 },
        params: { w: 0.08, h: 0.9, d: 0.08 },
        material: "metal.dark",
        traits: ["energy:support"],
      },
      {
        id: "pedestal-right",
        kind: "rect.box",
        pose: { x: env.width_m * 0.35, y: 0, z: 0.45 },
        params: { w: 0.08, h: 0.9, d: 0.08 },
        material: "metal.dark",
        traits: ["energy:support"],
      }
    );
  }

  if (structureKind === "energy.ewaste.module") {
    nodes.push(
      {
        id: "tray-pcb",
        kind: "rect.box",
        pose: { x: -0.22, y: 0.12, z: 0.52 },
        params: { w: 0.32, h: 0.1, d: 0.26 },
        material: "green.matte",
        traits: ["ewaste:tray", "chips:pcb"],
      },
      {
        id: "tray-batt",
        kind: "rect.box",
        pose: { x: 0.18, y: 0.12, z: 0.32 },
        params: { w: 0.28, h: 0.14, d: 0.26 },
        material: "orange.matte",
        traits: ["ewaste:tray", "battery:collection"],
      }
    );
  }

  return {
    id: `mo:scene:energy:${Date.now()}`,
    space: "cartesian-3d",
    unit: "m",
    version: 1,
    meta: {
      source: "ge",
      contextType: ctx.siteType,
      structureKind,
    },
    nodes,
  };
}

export function buildFabricationPackFromEnergyPlan(
  ctx: EnergyContext,
  plan: EnergyPlanAttrs,
  basedOnPlanId?: string
): MoFabricationPackAttrs {
  const structureKind = inferEnergyStructureKind(ctx, plan);
  const env = deriveEnvelope(structureKind, ctx, plan);

  const cutlist: MoFabricationPackAttrs["cutlist"] = [
    {
      id: "panel-left",
      material: "chapa plegada",
      qty: 1,
      unit: "u",
      width_m: 0.03,
      height_m: env.height_m,
      depth_m: env.depth_m,
      thickness_mm: 1.2,
    },
    {
      id: "panel-right",
      material: "chapa plegada",
      qty: 1,
      unit: "u",
      width_m: 0.03,
      height_m: env.height_m,
      depth_m: env.depth_m,
      thickness_mm: 1.2,
    },
    {
      id: "back",
      material: "chapa lisa",
      qty: 1,
      unit: "u",
      width_m: env.width_m - 0.03,
      height_m: env.height_m,
      thickness_mm: 1.0,
    },
    {
      id: "door",
      material: "marco + acrílico / vidrio",
      qty: 1,
      unit: "u",
      width_m: env.width_m - 0.04,
      height_m: env.height_m - 0.06,
      thickness_mm: 25,
    },
    {
      id: "top",
      material: "chapa plegada",
      qty: 1,
      unit: "u",
      width_m: env.width_m,
      depth_m: env.depth_m,
      thickness_mm: 1.2,
    },
    {
      id: "base",
      material: "chapa plegada",
      qty: 1,
      unit: "u",
      width_m: env.width_m,
      depth_m: env.depth_m,
      thickness_mm: 1.5,
    },
    {
      id: "mount-plate",
      material: "placa galvanizada",
      qty: 1,
      unit: "u",
      width_m: env.width_m - 0.12,
      height_m: env.height_m - 0.24,
      thickness_mm: 1.5,
    },
  ];

  if (structureKind === "energy.station") {
    cutlist.push(
      {
        id: "pedestal-left",
        material: "tubo estructural",
        qty: 1,
        unit: "u",
        height_m: 0.9,
        thickness_mm: 2,
        note: "Soporte lateral",
      },
      {
        id: "pedestal-right",
        material: "tubo estructural",
        qty: 1,
        unit: "u",
        height_m: 0.9,
        thickness_mm: 2,
        note: "Soporte lateral",
      }
    );
  }

  if (structureKind === "energy.ewaste.module") {
    cutlist.push(
      {
        id: "tray-pcb",
        material: "chapa doblada",
        qty: 1,
        unit: "u",
        width_m: 0.32,
        depth_m: 0.26,
        height_m: 0.1,
        thickness_mm: 1,
      },
      {
        id: "tray-batt",
        material: "chapa doblada",
        qty: 1,
        unit: "u",
        width_m: 0.28,
        depth_m: 0.26,
        height_m: 0.14,
        thickness_mm: 1,
      }
    );
  }

  const hardware: MoFabricationPackAttrs["hardware"] = [
    { id: "hinges", name: "Bisagras reforzadas", qty: 2, unit: "u" },
    { id: "lock", name: "Cerradura / pestillo", qty: 1, unit: "u" },
    { id: "din-rail", name: "Riel DIN", qty: Math.max(1, Math.ceil(plan.circuits.length / 3)), unit: "u" },
    { id: "terminals", name: "Borneras", qty: Math.max(8, plan.circuits.length * 2), unit: "u" },
    { id: "fan-grid", name: "Ventilación + rejilla", qty: 2, unit: "u" },
    { id: "cable-gland", name: "Prensaestopa", qty: Math.max(4, plan.circuits.length), unit: "u" },
  ];

  const notes = [
    `Estructura derivada para ${ctx.siteType}.`,
    `Tablero recomendado: ${plan.board.cabinetType || "tablero expandible"}.`,
    `Breaker principal estimado: ${plan.board.mainBreakerAmp || 0}A (${plan.board.phases || "1P"}).`,
  ];

  if (ctx.estimatedStorageKwh > 0) notes.push("Reservar compartimiento ventilado para baterías.");
  if (ctx.sensorCount > 0) notes.push("Prever frente y placa con mounts para sensores/telemetría.");
  if (ctx.hasGrid) notes.push("Agregar espacio para medición bidireccional / acople a red.");

  return {
    title:
      structureKind === "energy.station"
        ? "Estación energética"
        : structureKind === "energy.rack"
        ? "Rack energético"
        : structureKind === "energy.ewaste.module"
        ? "Módulo e-waste / chips"
        : "Gabinete energético",
    structureKind,
    basedOnPlanId,
    source: {
      node: "ge",
      contextType: ctx.siteType,
      siteId: ctx.siteId,
    },
    dimensions: {
      width_m: env.width_m,
      depth_m: env.depth_m,
      height_m: env.height_m,
    },
    cutlist,
    hardware,
    electrical: plan.materials,
    sensors: plan.sensors,
    assemblySteps: [
      "Fabricar base, laterales, fondo y tapa.",
      "Montar placa interior y rieles DIN.",
      "Montar puerta, cerradura y ventilación.",
      "Instalar pasacables, borneras y soporte de sensado.",
      "Instalar inversor/batería/protecciones según plan.",
      "Verificar separación entre potencia, señales y respaldo.",
    ],
    notes,
  };
}