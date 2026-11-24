// Política del nodo Modeler: qué puede renderizar/aceptar según contexto.
import type { SharedContext } from "../utopy/context.bus";

export type RenderPolicy = {
  allowKinds: Set<string>;   // kinds de bloques permitidos
  nsDefault: string;         // ns por defecto
};

export function policyFor(ctx: SharedContext): RenderPolicy {
  // Si el topic es "interior" deja futuro "interior.plan" etc.
  const mode = ctx.topic || "energy";
  if (mode === "interior" || mode === "architecture") {
    return {
      allowKinds: new Set(["title","note","toolbar","energy.graph"]), // amplía cuando agregues interior.*
      nsDefault: "design:modeler"
    };
  }
  return {
    allowKinds: new Set(["title","note","toolbar","energy.graph"]),
    nsDefault: "energy:modeler"
  };
}

export function canRender(kind:string, pol:RenderPolicy) {
  return pol.allowKinds.has(kind);
}
