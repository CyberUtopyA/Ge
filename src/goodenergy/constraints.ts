// src/sandbox/constraints.ts
import { Vec3, Wall, Entity, Floor } from "./scene";

export const EPS = 1e-6;
export const GRID = 1;

export function snap45(a:Vec3, p:Vec3){
  const dx = p.x - a.x, dy = p.y - a.y;
  // proyecta al eje X, Y o línea 45° más cercana
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax < ay*0.5) return { x:a.x, y:a.y + Math.sign(dy)*Math.round(ay) };
  if (ay < ax*0.5) return { x:a.x + Math.sign(dx)*Math.round(ax), y:a.y };
  // 45°
  const m = Math.max(ax, ay);
  const sx = Math.sign(dx), sy = Math.sign(dy);
  return { x:a.x + sx*Math.round(m), y:a.y + sy*Math.round(m) };
}

export function onBoundary(p:Vec3, ents:Entity[], tol=1e-3){
  const polys = ents.filter(e=> e.kind==="floor" || e.kind==="roof") as (Floor & {pts:Vec3[]})[];
  for(const poly of polys){
    const pts = poly.pts.map(q=>({x:q.x,y:q.y,z:0}));
    for(let i=0;i<pts.length;i++){
      const a=pts[i], b=pts[(i+1)%pts.length];
      if (pointOnSeg(a,p,b,tol)) return true;
    }
  }
  return false;
}

export function pointOnSeg(a:Vec3,p:Vec3,b:Vec3,tol=1e-3){
  const cross = Math.abs((p.y - a.y)*(b.x - a.x) - (p.x - a.x)*(b.y - a.y));
  if (cross > tol) return false;
  const dot = (p.x - a.x)*(b.x - a.x) + (p.y - a.y)*(b.y - a.y);
  if (dot < -tol) return false;
  const len2 = (b.x - a.x)**2 + (b.y - a.y)**2;
  return dot <= len2 + tol;
}

export function wallIntersects(w:Wall, ents:Entity[]){
  const walls = ents.filter(e=> e.kind==="wall") as Wall[];
  for (const o of walls){
    if (o.id===w.id) continue;
    if (segmentsIntersect(w.a,w.b,o.a,o.b)) return true;
  }
  return false;
}

function segmentsIntersect(a:Vec3,b:Vec3,c:Vec3,d:Vec3){
  const o1 = orient(a,b,c), o2 = orient(a,b,d), o3 = orient(c,d,a), o4 = orient(c,d,b);
  if (o1*o2<0 && o3*o4<0) return true;
  return false;
}
function orient(a:Vec3,b:Vec3,c:Vec3){ return Math.sign((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)); }
