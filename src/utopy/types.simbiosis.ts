// ============================================================
// UTOPÝ — Tipos simbióticos universales (ADN contextual vivo)
// ============================================================
export type NodeCapability = {
  id: string;
  provides?: string[];
  verbs?: string[];
  ns?: string;
  note?: string;
  assets?: AssetDef[]; // ya lo tienes

  // paleta: cómo se representa visualmente en un modeler
  palette?: Array<{
    id: string;             // "pv.panel" | "wind.turbine" | "thermal.tank"
    label: string;          // texto visible
    sym: string;            // símbolo que emite
    say: string;            // verbo que ejecuta
    with?: any;             // payload opcional
    icon?: string;          // emoji o símbolo
    category?: string;      // clasificación (solar, wind, grid, etc.)
  }>;

  // plantillas: propuestas de escena o estructuras básicas
  templates?: Array<{
    id: string;             // "solar.basic.home"
    label: string;
    produce: "scene.patch" | "scene.full";
    with?: any;             // parámetros
  }>;

  // editores visuales o de parámetros
  editors?: Array<{
    id: string;
    for: string[];          // kinds/nodos que edita
    verbs: string[];        // acciones que comprende
  }>;
};

// Adhesión simbiótica: lo que un nodo comunica a la red
export type AdhesionGrant = {
  from: string;                    // nodo emisor
  ns?: string;
  capabilities?: NodeCapability[]; // lista de capacidades
  assets?: AssetDef[];             // ATENCIÓN: ahora permitido a nivel grant
  note?: string;
};
// Adhesión simbiótica extendida (resonador)
export type SymbioticResonance = {
  sym: string;
  say: string;
  with?: any;
  ns?: string;
};
export type CapabilityId = string;


/** Sobre general de advertise */
export type CapabilityAdvertise = {
  nodeId: string;               // quién publica
  ns?: string;                  // sugerencia de namespace
  capabilities: CapabilityId[]; // e.g., ["energy.asset", "energy.simulate"]
  assets?: EnergyAssetDescriptor[]; // descriptores concretos
  meta?: Record<string, any>;
};

export type AssetVerb = {
  say: string;
  sym?: string;    // ej: "⚡"
  with?: any;
};

export type AssetDef = {
  id: string;
  kind: string;           // ej: "energy.pv" | "wind.turbine" | ...
  label?: string;
  icon?: string;          // emoji o nombre
  verbs?: AssetVerb[];
  render?: any;           // renderer externo
  meta?: Record<string, any>;
  // NOTA: AssetDef NO requiere display
};

export type EnergyAssetDescriptor = {
  id: string;
  kind: string;
  label?: string;
  icon?: string;
  verbs?: AssetVerb[];
  render?: any;
  meta?: Record<string, any>;
  /** UI/marketplace descriptor requerido por el Modeler/Palette */
  display: {
    name: string;         // <— requerido
    icon?: string;        // opcional
    color?: string;       // opcional (tint)
  };
};
// —— Sensores (descriptor + lecturas) ————————————————————————————————
export type SensorReading = {
  ts: number;                  // epoch ms
  value: any;                  // payload libre (número, objeto, etc.)
  meta?: Record<string, any>;
};

export type SensorDef = {
  id: string;                  // "sensor:bms:bat1" | "sensor:meter:main"
  kind: string;                // "power.meter" | "bms" | "inverter"
  label?: string;              // visible
  transport?: "sim" | "ws" | "ble" | "serial" | "custom";
  // mapea "keys" del sensor → campos del nodo (params.* o state.*)
  // ej: { "soc":"params.soc", "p_kw":"state.p_kw" }
  mapping?: Record<string, string>;
  meta?: Record<string, any>;  // datos extra (url, mac, etc.)
};

export type NodeSensorLink = {
  nodeId: string;
  sensorId: string;
  mapping?: Record<string,string>; // override por nodo
};

// Intents estándar de sensores
export type SensorIntents =
  | { sym:"📡"; say:"sensor.attach"; with:{ nodeId:string; sensorId:string; mapping?:Record<string,string> } }
  | { sym:"📡"; say:"sensor.detach"; with:{ nodeId:string; sensorId:string } }
  | { sym:"📡"; say:"sensor.reading"; with:{ sensorId:string; reading:SensorReading } }
  | { sym:"📡"; say:"sensor.poll"; with:{ sensorId:string } }
  | { sym:"📡"; say:"sensor.register"; with:{ sensor:SensorDef } };
