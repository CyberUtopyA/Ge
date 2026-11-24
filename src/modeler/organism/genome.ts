export type Unit = "m" | "mm" | "deg" | "W" | "V" | "A";
export type Space = "planar-2d" | "cartesian-3d" | "geo-latlon";

export type Trait =
  | { t: "material"; name: string; density?: number }
  | { t: "structural"; maxLoad?: number; safetyFactor?: number }
  | { t: "electrical"; powerW?: number; voltage?: number }
  | { t: "printable"; shell?: number; infill?: number; nozzle?: number; layer?: number }
  | { t: "robotic"; task?: "lay-brick" | "place-panel" | "route-cable"; tool?: string }
  | { t: "semantic"; tag: string }
  | { t: "source"; from?: "scan" | "user" | "import"; ref?: string };

export type UNode = {
  id: string;
  kind: string; // "floor" | "wall.seg" | "roof.gable" | "pv" | ...
  name?: string;
  pose?: { x: number; y: number; z?: number; rotZ?: number; rotX?: number; rotY?: number };
  geom?: { shape: "box" | "plane" | "polyline" | "mesh"; params?: Record<string, number>; meshRef?: string };
  params?: Record<string, any>;
  traits?: Trait[];
  meta?: Record<string, any>;
};

export type UEdge = {
  id: string;
  from: string;
  to: string;
  kind: string; // "wall.seg" | "wire" | "pipe" | ...
  traits?: Trait[];
  params?: Record<string, any>;
};

export type UScene = {
  id: string;
  space: Space;
  unit: Unit;
  nodes: UNode[];
  edges: UEdge[];
  version?: string;
  provenance?: { createdBy?: string; createdAt?: string; history?: any[] };
};

export type Signal = { ns: string; type: string; payload?: any; meta?: Record<string, any>; };

export type Secretion =
  | { kind: "file"; format: "stl" | "step" | "ifc" | "gcode"; name: string; data: string | Uint8Array }
  | { kind: "report"; name: string; data: any }
  | { kind: "plan"; name: string; steps: Array<{ op: string; args?: any }> }
  | { kind: "sim"; domain: "energy" | "struct"; data: any };

export type Tissue = {
  name: string;
  capabilities: string[];
  receptors: Array<{ when: (s: Signal) => boolean; react: (args: TissueCtx) => Promise<void> }>;
  onGraft?: (ctx: TissueCtx) => Promise<void> | void;
  onUngraft?: (ctx: TissueCtx) => Promise<void> | void;
};

export type TissueCtx = {
  readScene: () => UScene | null;
  mutateScene: (mut: (s: UScene) => void) => void;
  secrete: (sec: Secretion) => void;
  genome: { pxPerM: number };
};

export const PX_PER_M = 60;
