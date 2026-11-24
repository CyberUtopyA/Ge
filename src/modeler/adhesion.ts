// Adhesión del nodo Modeler: publica capacidades y gestiona render local.
import type { AdhesionGrant, NodeCapability } from "../utopy/types.simbiosis";
import { policyFor, canRender } from "./policy";
import { getContext, onContextChange } from "../utopy/context.bus";
import { installGoodEnergyModeler } from "./modeler"; // tus handlers del modelador

export function installModelerAdhesion(ctx:any) {
  // 1) Publica capacidades
  const caps: NodeCapability[] = [
    {
      id: "energy.blocks",
      provides: ["title","note","toolbar","energy.graph"],
      verbs: ["abrir","render","add-node","connect","simulate.step","reset"],
      ns: "energy:modeler",
      note: "Blocks & verbs del modelador de energía"
    }
  ];
  const grant: AdhesionGrant = {
    from: ctx?.getState?.()?.id || "goodenergy@modeler",
    ns: "energy:modeler",
    capabilities: caps
  };
  // avisa a la red para que hosts se adhieran
  ctx.say({ sym:"🔗", say:"adhesion.grant", with: grant });

  // 2) Reacciona a consultas de adhesión
  ctx.on?.("adhesion.ask", (msg:any) => {
    ctx.say({ sym:"🔗", say:"adhesion.grant", with: grant, replyTo: msg?.id });
  });

  // 3) Aplicar política cuando cambie el contexto
  const un = onContextChange((_c)=>{ /* por ahora no filtramos nada activo */ });
  (ctx as any).__un_ctx__ = un;

  // 4) Instala el modelador (si aún no lo hiciste)
  try { installGoodEnergyModeler?.(ctx); } catch {}

  // 5) Filtra renders salientes por política (defensa)
  const safeSay = ctx.say?.bind(ctx);
  ctx.say = (intent:any) => {
    if (intent?.say === "render" && intent?.with?.blocks) {
      const pol = policyFor(getContext());
      const filtered = (intent.with.blocks as any[]).filter(b => canRender(b.kind, pol));
      intent = { ...intent, with:{ ...intent.with, blocks: filtered } };
    }
    return safeSay?.(intent);
  };
}
