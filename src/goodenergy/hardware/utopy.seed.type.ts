export type UtopyTileKind =
  | "compute"
  | "power"
  | "sense"
  | "storage"
  | "radio"
  | "plc"
  | "gateway"
  | "inference"
  | "security"
  | "custom";

export type UtopyTileCapability =
  | "sense.energy"
  | "sense.env"
  | "sense.motion"
  | "route.signal"
  | "store.buffer"
  | "compute.logic"
  | "compute.infer"
  | "control.relay"
  | "control.power"
  | "bridge.plc"
  | "bridge.modbus"
  | "bridge.opcua"
  | "bridge.ws"
  | "security.verify"
  | "custom";

export type UtopyTileHealth = "ok" | "warn" | "alert" | "offline";

export type UtopyTileProfile = {
  tileId: string;
  seedId: string;
  kind: UtopyTileKind;
  capabilities: UtopyTileCapability[];
  role?: string;
  location?: {
    zone?: string;
    x?: number;
    y?: number;
    z?: number;
  };
  neighbors?: string[];
  metadata?: Record<string, any>;
};

export type UtopyTileState = {
  tileId: string;
  loadPct: number;
  temperatureC?: number;
  powerW?: number;
  health: UtopyTileHealth;
  trust: number; // 0..1
  lastSeen: number;
  memory?: {
    localFacts?: number;
    recentTasks?: number;
  };
};

export type UtopyTileSignal = {
  signalId: string;
  tileId: string;
  type: "energy" | "env" | "status" | "task" | "neighbor" | "health" | "custom";
  payload: Record<string, any>;
  confidence?: number;
  ts: number;
};

export type UtopyTask = {
  taskId: string;
  seedId: string;
  kind:
    | "measure.energy"
    | "monitor.env"
    | "route.data"
    | "run.logic"
    | "run.inference"
    | "control.output"
    | "bridge.telemetry"
    | "custom";
  requiredCapabilities: UtopyTileCapability[];
  preferredKinds?: UtopyTileKind[];
  zone?: string;
  priority?: "low" | "medium" | "high" | "critical";
  payload?: Record<string, any>;
  createdAt: number;
};

export type UtopyAssignment = {
  assignmentId: string;
  seedId: string;
  taskId: string;
  assignedTileId: string;
  score: number;
  rationale: string[];
  ts: number;
};

export type UtopyOutcome = {
  outcomeId: string;
  seedId: string;
  taskId: string;
  tileId: string;
  status: "accepted" | "running" | "done" | "failed";
  result?: Record<string, any>;
  ts: number;
};

export type UtopyLink = {
  a: string;
  b: string;
  type: "power" | "signal" | "mesh" | "data";
  weight?: number;
};

export type UtopySeedState = {
  seedId: string;
  ns: string;
  tiles: Record<string, UtopyTileProfile>;
  states: Record<string, UtopyTileState>;
  links: UtopyLink[];
  assignments: Record<string, UtopyAssignment>;
  outcomes: Record<string, UtopyOutcome>;
};