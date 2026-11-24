import type {
  CircuitPlan,
  EnergyContext,
  EnergyIntentAttrs,
  EnergyPlanAttrs,
  MaterialLine,
} from "./energy.phase1.types";

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const ceil = (n: number) => Math.ceil(n);

function hoursPerDayForSite(siteType: EnergyContext["siteType"]) {
  switch (siteType) {
    case "fabrica":
      return 10;
    case "taller":
      return 8;
    case "microgrid":
      return 24;
    case "estacion":
      return 12;
    default:
      return 6;
  }
}

function objectiveFor(ctx: EnergyContext): EnergyIntentAttrs["objective"] {
  const pv = ctx.estimatedTelemetryPvKw;
  const load = ctx.estimatedTelemetryLoadKw;
  const gridIn = Number(ctx.telemetry.grid_in || 0);
  const gridOut = Number(ctx.telemetry.grid_out || 0);

  if (ctx.estimatedSourceKw <= 0 && ctx.componentCount <= 0) return "instalar";
  if (gridOut > 0.1 || (pv > 0 && pv > load + 0.2)) return "vender";
  if (gridIn > 0.2 || load > ctx.estimatedSourceKw + 0.25) return "optimizar";
  if (ctx.sensorCount > 0 || ctx.relayCount > 0) return "monitorear";
  return "ampliar";
}

export function buildEnergyIntent(ctx: EnergyContext): EnergyIntentAttrs {
  const hoursPerDay = hoursPerDayForSite(ctx.siteType);
  const objective = objectiveFor(ctx);

  return {
    sourceKinds: ctx.sourceKinds,
    contextType: ctx.siteType,
    objective,
    estimatedOps: {
      shiftsPerDay: ctx.siteType === "fabrica" ? 2 : 1,
      hoursPerDay,
      workers: Math.max(1, ctx.roomCount * 2),
      machineGroups: ctx.sourceKinds.filter((k) =>
        ["panel.solar", "turbina.eolica", "hidro", "bateria", "inversor", "sensor", "rele"].includes(k)
      ),
    },
    notes: `Base derivada desde topología + telemetry. Rooms=${ctx.roomCount}, comps=${ctx.componentCount}, source=${ctx.estimatedSourceKw}kW, load=${ctx.estimatedConnectedLoadKw}kW.`,
  };
}

function deriveCircuits(ctx: EnergyContext): CircuitPlan[] {
  const circuits: CircuitPlan[] = [];

  if (ctx.estimatedSourceKw > 0) {
    circuits.push({
      id: "gen-dc-main",
      name: "Generación DC principal",
      loadType: "generacion",
      estimatedKw: round3(Math.max(0.35, ctx.estimatedSourceKw)),
      priority: "alta",
    });
  }

  if (ctx.estimatedInverterKw > 0) {
    circuits.push({
      id: "dist-ac-main",
      name: "Distribución AC principal",
      loadType: "distribucion",
      estimatedKw: round3(Math.max(ctx.estimatedConnectedLoadKw, ctx.estimatedInverterKw)),
      priority: "alta",
    });
  }

  for (const room of ctx.roomHints) {
    circuits.push({
      id: `light-${room.roomId}`,
      name: `Iluminación ${room.roomId}`,
      loadType: "iluminacion",
      estimatedKw: round3(Math.max(0.12, room.baseKw * 0.55)),
      priority: "media",
      roomId: room.roomId,
    });

    circuits.push({
      id: `use-${room.roomId}`,
      name: `Tomas / uso ${room.roomId}`,
      loadType: "maquinas",
      estimatedKw: round3(Math.max(0.18, room.loadKw + room.baseKw * 0.45)),
      priority: "alta",
      roomId: room.roomId,
    });
  }

  if (ctx.sensorCount > 0) {
    circuits.push({
      id: "signals-main",
      name: "Sensores y señales",
      loadType: "sensores",
      estimatedKw: round3(Math.max(0.03, ctx.sensorCount * 0.005)),
      priority: "media",
    });
  }

  if (ctx.estimatedStorageKwh > 0) {
    circuits.push({
      id: "backup-main",
      name: "Respaldo / baterías",
      loadType: "respaldo",
      estimatedKw: round3(Math.max(0.25, Math.min(ctx.estimatedInverterKw || 2.5, 5))),
      priority: "alta",
    });
  }

  return circuits;
}

function derivePhases(peakKw: number): "1P" | "2P" | "3P" {
  if (peakKw >= 10) return "3P";
  if (peakKw >= 6.5) return "2P";
  return "1P";
}

function deriveMainBreakerAmp(peakKw: number, phases: "1P" | "2P" | "3P") {
  const pf = 0.92;
  const volts = phases === "3P" ? 380 : phases === "2P" ? 220 : 220;
  const amps = (peakKw * 1000) / (volts * pf);
  return ceil(amps * 1.25);
}

function materialPriceHint(name: string, qty: number) {
  const unit: Record<string, number> = {
    "Cable solar 6mm²": 22000,
    "Cable potencia AC 4mm²": 18000,
    "Cable señal/control": 8000,
    "Gabinete / tablero": 550000,
    "Interruptor termomagnético": 65000,
    "Protector contra sobretensión": 180000,
    "Kit de puesta a tierra": 280000,
    "Canaleta / ducto": 35000,
    "Sensor energético": 120000,
    "Relé / contactor": 90000,
    "Inversor": 3500000,
    "Batería": 8500000,
  };
  return Math.round((unit[name] || 0) * qty);
}

function deriveMaterials(ctx: EnergyContext, circuits: CircuitPlan[]): MaterialLine[] {
  const lines: MaterialLine[] = [];

  const push = (name: string, qty: number, unit: string, category: string) => {
    if (qty <= 0) return;
    lines.push({
      name,
      qty,
      unit,
      category,
      priceHint: materialPriceHint(name, qty),
      currency: "PYG",
    });
  };

  const cableDcM = Math.max(12, (ctx.counts["panel.solar"] || 0) * 14 + (ctx.counts["turbina.eolica"] || 0) * 8 + (ctx.counts["hidro"] || 0) * 10);
  const cableAcM = Math.max(18, circuits.length * 12 + ctx.roomCount * 8);
  const cableSigM = Math.max(6, ctx.sensorCount * 8 + ctx.relayCount * 5);
  const breakers = Math.max(2, circuits.length);
  const canaletaM = Math.max(8, ctx.roomCount * 6 + ctx.componentCount * 1.2);

  push("Cable solar 6mm²", cableDcM, "m", "cableado");
  push("Cable potencia AC 4mm²", cableAcM, "m", "cableado");
  push("Cable señal/control", cableSigM, "m", "control");
  push("Interruptor termomagnético", breakers, "u", "proteccion");
  push("Protector contra sobretensión", 1, "u", "proteccion");
  push("Kit de puesta a tierra", 1, "kit", "proteccion");
  push("Gabinete / tablero", 1, "u", "tablero");
  push("Canaleta / ducto", canaletaM, "m", "canalizacion");

  if ((ctx.counts["sensor"] || 0) > 0) push("Sensor energético", ctx.counts["sensor"], "u", "sensado");
  if ((ctx.counts["rele"] || 0) > 0) push("Relé / contactor", ctx.counts["rele"], "u", "control");
  if ((ctx.counts["inversor"] || 0) > 0) push("Inversor", ctx.counts["inversor"], "u", "equipos");
  if ((ctx.counts["bateria"] || 0) > 0) push("Batería", ctx.counts["bateria"], "u", "equipos");

  return lines;
}

function deriveSensors(ctx: EnergyContext) {
  return [
    { type: "energia" as const, zone: "tablero.principal", qty: 1 },
    { type: "corriente" as const, zone: "alimentacion.general", qty: 1 },
    { type: "voltaje" as const, zone: "alimentacion.general", qty: 1 },
    { type: "temperatura" as const, zone: "gabinete", qty: 1 },
    ...(ctx.roomCount > 0 ? [{ type: "humedad" as const, zone: "ambiente.general", qty: 1 }] : []),
    ...(ctx.sensorCount > 0 ? [{ type: "puerta" as const, zone: "acceso.tecnico", qty: 1 }] : []),
  ];
}

function deriveRecommendations(ctx: EnergyContext, peakKw: number) {
  const out: string[] = [];

  if (ctx.estimatedSourceKw <= 0) out.push("Agregar al menos una fuente primaria o conexión a red definida.");
  if (ctx.estimatedInverterKw <= 0 && ctx.estimatedSourceKw > 0) out.push("Agregar inversor para desacoplar DC/AC y permitir expansión.");
  if (ctx.estimatedStorageKwh <= 0 && ctx.estimatedSourceKw > 0) out.push("Agregar banco de baterías para respaldo y estabilización.");
  if (ctx.sensorCount <= 0) out.push("Agregar sensado base de energía, temperatura y estado de tablero.");
  if (peakKw >= 8) out.push("Evaluar tablero trifásico y separación de cargas críticas/no críticas.");
  if (ctx.hasGrid) out.push("Preparar medición bidireccional si se prevé inyección o compra/venta local.");
  out.push("Separar iluminación, tomas/uso, señales y respaldo en circuitos distintos.");
  out.push("Reservar al menos 25% de crecimiento para futuras celdas de trabajo o expansión territorial.");

  return out;
}

export function buildEnergyPlan(ctx: EnergyContext): EnergyPlanAttrs {
  const circuits = deriveCircuits(ctx);

  const connectedKw = round3(
    Math.max(
      ctx.estimatedConnectedLoadKw,
      circuits.reduce((sum, c) => sum + c.estimatedKw, 0) * 0.72
    )
  );

  const estimatedPeakKw = round3(
    Math.max(
      connectedKw * 1.18,
      ctx.estimatedTelemetryLoadKw * 1.22,
      ctx.estimatedSourceKw > 0 ? Math.min(ctx.estimatedSourceKw, connectedKw * 1.15) : 0
    )
  );

  const estimatedDailyKwh = round3(
    Math.max(
      connectedKw * hoursPerDayForSite(ctx.siteType) * 0.62,
      ctx.estimatedTelemetryLoadKw * hoursPerDayForSite(ctx.siteType)
    )
  );

  const phases = derivePhases(estimatedPeakKw);
  const mainBreakerAmp = deriveMainBreakerAmp(estimatedPeakKw, phases);

  return {
    summary: {
      connectedKw,
      estimatedPeakKw,
      estimatedDailyKwh,
      growthMarginPct: 25,
    },
    circuits,
    board: {
      mainBreakerAmp,
      phases,
      cabinetType:
        ctx.siteType === "fabrica"
          ? "gabinete industrial"
          : ctx.siteType === "taller"
          ? "tablero mural ampliable"
          : "tablero compacto expandible",
      surgeProtection: true,
      grounding: true,
    },
    sensors: deriveSensors(ctx),
    materials: deriveMaterials(ctx, circuits),
    recommendations: deriveRecommendations(ctx, estimatedPeakKw),
  };
}