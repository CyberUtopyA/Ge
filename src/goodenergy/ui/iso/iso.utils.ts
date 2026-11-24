// Utilidades de proyección isométrica + helpers de geometría/snap

export const iso = (x: number, y: number, z: number = 0, s = 20) => {
  // isométrica clásica (2:1)
  const X = (x - y) * s;
  const Y = (x + y) * s * 0.5 - z * s;
  return { x: X, y: Y };
};

export const poly = (pts: { x: number; y: number }[]) =>
  pts.map((p) => `${p.x},${p.y}`).join(" ");

export const edge = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  `${a.x},${a.y} ${b.x},${b.y}`;

// ---------------- Sandbox geom ----------------

export type Vec2 = { x: number; y: number };
export type Vec3 = { x: number; y: number; z?: number };
export type Floor = { id: string; pts: Vec3[] };

const EPS = 1e-6;

export function rectFromPts(pts: Vec3[]) {
  if (!pts || pts.length !== 4) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minx = Math.min(...xs),
    maxx = Math.max(...xs);
  const miny = Math.min(...ys),
    maxy = Math.max(...ys);
  const allXok = pts.every(
    (p) => Math.abs(p.x - minx) < EPS || Math.abs(p.x - maxx) < EPS
  );
  const allYok = pts.every(
    (p) => Math.abs(p.y - miny) < EPS || Math.abs(p.y - maxy) < EPS
  );
  if (!(allXok && allYok)) return null;
  return { ox: minx, oy: miny, w: maxx - minx, d: maxy - miny };
}

export function edgesFromFloors(
  floors: Floor[]
): Array<{ a: Vec2; b: Vec2; floorId: string }> {
  const edges: Array<{ a: Vec2; b: Vec2; floorId: string }> = [];
  for (const f of floors) {
    const P = f.pts;
    for (let i = 0; i < P.length; i++) {
      const a = P[i],
        b = P[(i + 1) % P.length];
      edges.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, floorId: f.id });
    }
  }
  return edges;
}

function dist2(a: Vec2, b: Vec2) {
  const dx = a.x - b.x,
    dy = a.y - b.y;
  return dx * dx + dy * dy;
}

// proyección de P al segmento AB
function projectPointToSeg(p: Vec2, a: Vec2, b: Vec2) {
  const abx = b.x - a.x,
    aby = b.y - a.y;
  const apx = p.x - a.x,
    apy = p.y - a.y;
  const ab2 = abx * abx + aby * aby || EPS;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
  return { x: a.x + t * abx, y: a.y + t * aby, t };
}

/** Encuentra el punto del borde más cercano y lo devuelve; null si no hay floors */
export function snapToFloorEdge(p: Vec2, floors: Floor[], maxSnap = 0.75) {
  if (!floors.length) return null;
  const edges = edgesFromFloors(floors);
  let best: { x: number; y: number } | null = null;
  let bestD2 = Infinity;
  for (const e of edges) {
    const pr = projectPointToSeg(p, e.a, e.b);
    const d2 = dist2(p, pr);
    if (d2 < bestD2) {
      bestD2 = d2;
      best = pr;
    }
  }
  if (Math.sqrt(bestD2) <= maxSnap) return best;
  return null;
}

/** Sugiere el segundo punto de pared: proyecta al borde y aplica snap de 0/90/45 */
export function suggestWallEnd(
  a: Vec2,
  rawEnd: Vec2,
  floors: Floor[],
  allow45 = true
) {
  const snap = snapToFloorEdge(rawEnd, floors, 1.0);
  if (!snap) return null;

  // snap angular
  let dx = snap.x - a.x;
  let dy = snap.y - a.y;
  const ang = Math.atan2(dy, dx); // rad
  const deg = ((ang * 180) / Math.PI + 360) % 360;
  const angles = allow45
    ? [0, 45, 90, 135, 180, 225, 270, 315]
    : [0, 90, 180, 270];
  let bestA = angles[0],
    bestDiff = 999;
  for (const A of angles) {
    const diff = Math.min(Math.abs(deg - A), 360 - Math.abs(deg - A));
    if (diff < bestDiff) {
      bestDiff = diff;
      bestA = A;
    }
  }
  const len = Math.hypot(dx, dy);
  const rad = (bestA * Math.PI) / 180;
  return { x: a.x + Math.cos(rad) * len, y: a.y + Math.sin(rad) * len };
}
