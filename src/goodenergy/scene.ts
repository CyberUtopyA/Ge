// src/sandbox/scene.ts
export type Vec3 = { x:number; y:number; z?:number };

export type Floor   = { id:string; kind:"floor";  level:number; pts:Vec3[]; synthetic?:boolean };
export type Roof    = { id:string; kind:"roof";   level:number; pts:Vec3[]; h:number };
export type Wall    = { id:string; kind:"wall";   level:number; a:Vec3; b:Vec3; h:number; thick?:number };
export type Column  = { id:string; kind:"column"; level:number; p:Vec3; w:number; d:number; h:number };
export type Beam    = { id:string; kind:"beam";   level:number; a:Vec3; b:Vec3; w:number; h:number };

export type CompPortKind = "dc"|"ac"|"grid"|"batt"|"load"|"ctrl";
export type CompPort = { id:string; name:string; kind:CompPortKind; dir:"in"|"out"|"io"; maxA?:number; maxV?:number };
export type Comp = {
  id:string; kind:"comp"; level:number;
  type:string; // p.ej. "pv.3kw", "wind.2kw", "hydro.800w", "inverter.3kw", "battery.5kwh", "load.generic"
  p:Vec3; props?:Record<string,any>; ports?:CompPort[];
};

export type Edge = { id:string; from:string; out:string; to:string; inp:string; enabled?:boolean };

export type Entity = Floor|Roof|Wall|Column|Beam|Comp;

export type SandboxScene = {
  id:string;
  title?:string;
  level:number;          // nivel activo (z-index lógico)
  entities:Entity[];
  edges:Edge[];
  meta?:Record<string,any>;
  ver:1;
};

export function emptyScene(id="scene@sandbox"):SandboxScene {
  return { id, level:0, entities:[], edges:[], ver:1, meta:{} };
}

export function serialize(scene:SandboxScene){
  return scene; // ya es POJO
}
