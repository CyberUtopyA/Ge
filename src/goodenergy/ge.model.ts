  // ==============================
// GoodEnergy — Model (nodos/escena)
// ==============================

/** Kinds estructurales del modelador (2D/3D) */
export type GeStructKind = "floor" | "wall" | "roof.gable";

/** Kinds de energía (base + extensibles en runtime) */
export type GeEnergyKind =
  | "pv"
  | "inverter"
  | "battery"
  | "load"
  | "grid"
  | (string & {}); // extensible (e.g., "microhydro", "wind", etc.)

/** Kind unificado de nodo (estructura + energía + extensibles) */
export type GeNodeKind = GeStructKind | GeEnergyKind;

/** Nodo genérico */
export type GeNode = {
  id: string;
  kind: GeNodeKind;
  name: string;

  /** Parámetros “lentos” (config) */
  params?: Record<string, any>;

  /** Estado “rápido” (lecturas, simulación) */
  state?: Record<string, any>;

  /** Posición 2D (en píxeles o unidades del viewport) */
  x?: number;
  y?: number;

  /** (Opcional) Jerarquía: render sobre/relativo a otro nodo (e.g., PV sobre techo) */
  parentId?: string;

  /** (Opcional) Orden visual */
  zIndex?: number;
};

/** Arista de conexión (flujo) */
export type GeEdge = {
  id: string;
  from: string;
  to: string;
  enabled?: boolean;
};

/** Escena */
export type GeScene = {
  nodes: GeNode[];
  edges: GeEdge[];
  meta?: Record<string, any>;
};

/** ID aleatorio corto */
export const rid = () => Math.random().toString(36).slice(2);

/** Type-guards útiles */
export function isStructKind(k: GeNodeKind): k is GeStructKind {
  return k === "floor" || k === "wall" || k === "roof.gable";
}
export function isEnergyKind(k: GeNodeKind): k is GeEnergyKind {
  return !isStructKind(k); // por defecto: todo lo demás lo tratamos como energía
}

/** Helpers de creación (inmutables) */
export function makeNode(
  kind: GeNodeKind,
  opts: Partial<Omit<GeNode, "kind" | "id" | "name">> & { id?: string; name?: string } = {}
): GeNode {
  return {
    id: opts.id || rid(),
    kind,
    name: opts.name || String(kind).toUpperCase(),
    params: { ...(opts.params || {}) },
    state: { ...(opts.state || {}) },
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    parentId: opts.parentId,
    zIndex: opts.zIndex,
  };
}

// —— Estructuras ————————————————————————————————————————————

export function makeFloor(w = 6, d = 4, x = 0, y = 0) {
  return makeNode("floor", {
    name: "Piso",
    params: { w: Number(w), d: Number(d) },
    x: Number(x),
    y: Number(y),
  });
}

export function makeWall(
  len = 3,
  thick = 0.12,
  h = 2.4,
  rotDeg = 0,
  x = 0,
  y = 0
) {
  return makeNode("wall", {
    name: "Pared",
    params: {
      len: Number(len),
      thick: Number(thick),
      h: Number(h),
      rot: Number(rotDeg), // grados
    },
    x: Number(x),
    y: Number(y),
  });
}

export function makeRoofGable(w = 6, d = 4, tilt = 22.5, x = 0, y = 0) {
  return makeNode("roof.gable", {
    name: "Techo",
    params: { w: Number(w), d: Number(d), tilt: Number(tilt) },
    x: Number(x),
    y: Number(y),
  });
}

// —— Energías (base) ————————————————————————————————————————

export function makePv(kwp = 3, x = 0, y = 0) {
  return makeNode("pv", {
    name: "PV " + kwp + "kWp",
    params: { kwp: Number(kwp) },
    x: Number(x),
    y: Number(y),
  });
}

export function makeInverter(max_kw = 3, x = 0, y = 0) {
  return makeNode("inverter", {
    name: "Inversor " + max_kw + "kW",
    params: { max_kw: Number(max_kw) },
    x: Number(x),
    y: Number(y),
  });
}

export function makeBattery(kwh = 5, soc = 50, x = 0, y = 0) {
  return makeNode("battery", {
    name: "Batería " + kwh + "kWh",
    params: { kwh: Number(kwh), soc: Number(soc) },
    x: Number(x),
    y: Number(y),
  });
}

export function makeLoad(kw = 1.5, x = 0, y = 0) {
  return makeNode("load", {
    name: "Cargas",
    params: { kw: Number(kw) },
    x: Number(x),
    y: Number(y),
  });
}

export function makeGrid(x = 0, y = 0) {
  return makeNode("grid", {
    name: "Red",
    x: Number(x),
    y: Number(y),
  });
}

/** Clonar un nodo (nuevo id, offsets opcionales) */
export function cloneNode(n: GeNode, dx = 30, dy = 30): GeNode {
  const c = JSON.parse(JSON.stringify(n)) as GeNode;
  c.id = rid();
  c.x = (n.x ?? 0) + dx;
  c.y = (n.y ?? 0) + dy;
  return c;
}

/** Agregar un techo y 2 PV montados (“demo rápida”) */
export function addRoofWithPv(scene: GeScene, w = 6, d = 4, tilt = 22.5) {
  const roof = makeRoofGable(w, d, tilt, 0, 0);
  const pvA = makePv(3, 40, -20);
  const pvB = makePv(3, 120, -20);
  pvA.parentId = roof.id;
  pvB.parentId = roof.id;
  pvA.zIndex = (roof.zIndex ?? 0) + 1;
  pvB.zIndex = (roof.zIndex ?? 0) + 1;

  scene.nodes.push(roof, pvA, pvB);
  return roof.id;
}

// —— Escena de ejemplo ——————————————————————————————————————

export function exampleScene(): GeScene {
  // Estructuras base
  const floor = makeFloor(6, 4, 0, 0);
  const wall1 = makeWall(3, 0.12, 2.4, 0, 0, 0);

  // Energía
  const pv = makePv(3, 50, 60);
  const inv = makeInverter(3, 220, 60);
  const bat = makeBattery(5, 50, 220, 160);
  const grd = makeGrid(420, 60);
  const lod = makeLoad(1.5, 420, 160);

  const edges: GeEdge[] = [
    { id: rid(), from: pv.id, to: inv.id, enabled: true },
    { id: rid(), from: inv.id, to: lod.id, enabled: true },
    { id: rid(), from: inv.id, to: bat.id, enabled: true },
    { id: rid(), from: grd.id, to: inv.id, enabled: true },
  ];

  return {
    nodes: [floor, wall1, pv, inv, bat, grd, lod],
    edges,
    meta: { title: "Casa base" },
  };
}
