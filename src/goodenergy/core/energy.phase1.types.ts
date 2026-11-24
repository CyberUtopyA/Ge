export type Room = {
  id: string;
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  roof: boolean;
};

export type Comp = {
  id: string;
  kind: string;
  roomId: string;
  attach: "floor" | "wall" | "roof";
  x: number;
  y: number;
  params?: Record<string, any>;
};

export type Topologia = {
  rooms: Room[];
  comps: Comp[];
};

export type Telemetry = {
  pv_kw?: number;
  load_kw?: number;
  soc?: number;
  grid_in?: number;
  grid_out?: number;
  ts?: number;
};

export type GeoHint = {
  lat: number;
  lng: number;
  radius_km?: number;
};

export type EnergyCounts = Record<string, number>;

export type RoomEnergyHint = {
  roomId: string;
  componentCount: number;
  sourceKw: number;
  loadKw: number;
  baseKw: number;
};

export type EnergyContext = {
  ns: string;
  siteId: string;
  topo: Topologia | null;
  telemetry: Telemetry;
  geo?: GeoHint;

  roomCount: number;
  componentCount: number;
  counts: EnergyCounts;
  roomHints: RoomEnergyHint[];

  siteType: "taller" | "fabrica" | "territorio" | "estacion" | "microgrid";
  sourceKinds: string[];

  estimatedSourceKw: number;
  estimatedStorageKwh: number;
  estimatedInverterKw: number;
  estimatedConnectedLoadKw: number;
  estimatedTelemetryLoadKw: number;
  estimatedTelemetryPvKw: number;

  sensorCount: number;
  relayCount: number;
  hasGrid: boolean;
};

export type EnergyIntentAttrs = {
  territoryId?: string;
  workCellId?: string;
  demandId?: string;
  fabricationPackId?: string;
  sourceKinds: string[];
  contextType: "taller" | "fabrica" | "territorio" | "estacion" | "microgrid";
  objective: "instalar" | "ampliar" | "optimizar" | "monitorear" | "vender";
  estimatedOps?: {
    shiftsPerDay?: number;
    hoursPerDay?: number;
    workers?: number;
    machineGroups?: string[];
  };
  notes?: string;
};

export type CircuitLoadType =
  | "maquinas"
  | "iluminacion"
  | "sensores"
  | "ventilacion"
  | "ti"
  | "respaldo"
  | "generacion"
  | "distribucion";

export type CircuitPlan = {
  id: string;
  name: string;
  loadType: CircuitLoadType;
  estimatedKw: number;
  priority: "alta" | "media" | "baja";
  roomId?: string;
};

export type MaterialLine = {
  code?: string;
  name: string;
  qty: number;
  unit: string;
  category: string;
  priceHint?: number;
  currency?: string;
};

export type EnergyPlanAttrs = {
  territoryId?: string;
  workCellId?: string;
  basedOnIntentId?: string;
  summary: {
    connectedKw: number;
    estimatedPeakKw: number;
    estimatedDailyKwh: number;
    growthMarginPct: number;
  };
  circuits: CircuitPlan[];
  board: {
    mainBreakerAmp?: number;
    phases?: "1P" | "2P" | "3P";
    cabinetType?: string;
    surgeProtection?: boolean;
    grounding?: boolean;
  };
  sensors: Array<{
    type: "corriente" | "voltaje" | "energia" | "temperatura" | "humedad" | "puerta" | "humo";
    zone: string;
    qty: number;
  }>;
  materials: MaterialLine[];
  recommendations?: string[];
};

export type EnergyOfferItem = {
  name: string;
  qty?: number;
  unit?: string;
  priceHint?: number;
  currency?: string;
};

export type EnergyOfferAttrs = {
  sellerId: string;
  sellerName?: string;
  basedOnPlanId?: string;
  offerType: "materiales" | "instalacion" | "mantenimiento" | "monitoreo" | "kit";
  items: EnergyOfferItem[];
  serviceArea?: string;
  leadTimeDays?: number;
  notes?: string;
};

export type AnyDV = {
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
    by?: string;
    [k: string]: any;
  };
};

export type Phase1Seller = {
  id: string;
  name?: string;
  location?: { lat: number; lng: number };
  serviceAreaKm?: number;
};

export type EnergyPhase1Artifacts = {
  context: EnergyContext;
  intent: EnergyIntentAttrs;
  plan: EnergyPlanAttrs;
  offers: EnergyOfferAttrs[];
  intentDV: AnyDV;
  planDV: AnyDV;
  offerDVs: AnyDV[];
};