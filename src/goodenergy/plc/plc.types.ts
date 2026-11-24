export type PlcSource = "s7" | "modbus" | "opcua" | "gpio" | "edge" | "mock";

export type PlcTagValue = number | string | boolean | null;

export type PlcTags = Record<string, PlcTagValue>;

export type PlcTelemetryAttrs = {
  plcId: string;
  lineId?: string;
  stationId?: string;
  source: PlcSource;
  tags: PlcTags;
  status: "ok" | "warn" | "alert" | "offline";
};

export type PlcAlarmAttrs = {
  plcId: string;
  epistemic?: "observado" | "simulado";
  alarmCode?: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  relatedTag?: string;
  relatedWorkCellId?: string;
  requiresAck?: boolean;
};

export type PlcCapabilityAttrs = {
  plcId: string;
  readTags: string[];
  writableTags: string[];
  actions: string[];
  safetyMode: "read_only" | "guarded_write" | "local_only";
};

export type PlcCommandAttrs = {
  plcId: string;
  command: string;
  params?: Record<string, unknown>;
  basedOnPlanId?: string;
  requestedBy?: string;
  approval?: {
    required: boolean;
    approvedBy?: string;
  };
};

export type PlcAckAttrs = {
  plcId: string;
  commandId?: string;
  result: "accepted" | "rejected" | "executed" | "failed";
  message?: string;
};

export type PlcSnapshot = {
  plcId: string;
  source: PlcSource;
  ts: number;
  status?: "ok" | "warn" | "alert" | "offline";
  lineId?: string;
  stationId?: string;
  tags: PlcTags;
};

export type PlcWriteRequest = {
  plcId: string;
  command: string;
  params?: Record<string, unknown>;
};

export type PlcWriteResult = {
  ok: boolean;
  message?: string;
};

export type PlcAdapter = {
  id: string;
  source: PlcSource;
  read(): Promise<PlcSnapshot | null>;
  write?(req: PlcWriteRequest): Promise<PlcWriteResult>;
  getCapability?(): Promise<PlcCapabilityAttrs>;
};

export type PlcTagAlias = {
  canonical: string;
  aliases: string[];
};

export type PlcNormalizedMetrics = {
  voltage?: number;
  current?: number;
  powerKw?: number;
  energyKwh?: number;
  temperatureC?: number;
  humidityPct?: number;
  pvKw?: number;
  loadKw?: number;
  soc?: number;
  gridInKw?: number;
  gridOutKw?: number;
  lineEnabled?: boolean;
  extractorOn?: boolean;
};

export type PlcStoreEntry = {
  ns: string;
  plcId: string;
  source: PlcSource;
  ts: number;
  status: "ok" | "warn" | "alert" | "offline";
  tags: PlcTags;
  normalized: PlcNormalizedMetrics;
};
