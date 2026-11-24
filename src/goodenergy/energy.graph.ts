// src/sandbox/energy.graph.ts
import { SandboxScene, Comp, Edge } from "./scene";

export function addEdge(scene:SandboxScene, fromComp:Comp, outPort:string, toComp:Comp, inPort:string){
  const id = `e_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
  const e:Edge = { id, from:fromComp.id, out:outPort, to:toComp.id, inp:inPort, enabled:true };
  scene.edges.push(e);
  return e;
}

export function portsOf(c:Comp){ return c.ports || []; }

// regla simple: dc→dc, ac→ac, grid↔grid, etc.
export function compatible(a:{kind:string;dir:string}, b:{kind:string;dir:string}){
  if (a.kind!==b.kind) return false;
  if (a.kind==="grid") return true; // grid/io
  if (a.dir==="out" && b.dir!=="in") return false;
  if (a.dir==="in"  && b.dir!=="out") return false;
  return true;
}
