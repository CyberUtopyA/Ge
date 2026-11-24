// src/sandbox/registry.ts
export type EntityFactory = (opts:any)=>import("./scene").Entity;
export type RenderFn = (e:any, ctx:{origin:{ox:number;oy:number}; S:number})=>JSX.Element;

export type EntityDef = {
  id:string; group:"struct"|"comp";
  title:string; icon:string;
  factory:EntityFactory;
  render:RenderFn;          // usa tus IsoFloor/IsoWall/IsoRoof etc.
  snap?: (a:any,b:any)=>any // opcional: snap propio
};

class Registry<T extends EntityDef> {
  private map = new Map<string,T>();
  register(d:T){ this.map.set(d.id,d); return this; }
  get(id:string){ return this.map.get(id); }
  all(){ return Array.from(this.map.values()); }
}

export const EntityRegistry = new Registry<EntityDef>();

// helpers
export function defineStruct(def:Omit<EntityDef,"group">){ 
  return EntityRegistry.register({ ...def, group:"struct" }); 
}
export function defineComp(def:Omit<EntityDef,"group">){ 
  return EntityRegistry.register({ ...def, group:"comp" }); 
}
