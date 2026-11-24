// src/goodenergy/adhesion.ts
// Adhesión del HOST: recibe grants, registra renderers y muestra bloques.

import type { AdhesionGrant } from "../utopy/types.simbiosis";
import { hear } from "../utopy/symbol.bus";
import { UPortal } from "../utopy/ui/UniversalPortal";

// Tipo local mínimo para bloques (no dependemos de tipos externos)
export type PortalBlock = { kind: string; [k: string]: any };

// Registro local de renderers (kind -> función)
const renderers = new Map<string, (b: PortalBlock, ctx: any) => void>();

// API para que el host registre cómo renderizar cada bloque
export function registerBlockRenderer(kind: string, fn: (b: PortalBlock, ctx: any) => void) {
  renderers.set(kind, fn);
}

export function installGoodEnergyAdhesion(ctx: any) {
  // 1) Recibir adhesión de cualquier nodo y loguear (opcional)
  hear("🔗", "adhesion.grant", (i) => {
    const g = i?.with as AdhesionGrant;
    if (!g) return;
    console.log("[HOST] grant from", g.from, g.capabilities?.map((c) => c.id));
    // aquí podrías persistir permisos/capacidades si hace falta
  });

  // 2) Consumir renders genéricos
  hear("⚡", "render", (i) => {
    const payload = i?.with || {};
    const blocks: PortalBlock[] = Array.isArray(payload.blocks) ? payload.blocks : [];
    const targetNs = payload.ns || i?.ns || "energy:modeler";

    // 2a) Si hay UniversalPortal, montamos los bloques para que PortalHost los pinte
    try {
      if (UPortal && typeof (UPortal as any).mount === "function") {
        (UPortal as any).mount(blocks, targetNs);
      }
    } catch (e) {
      console.warn("[HOST] UPortal mount falló:", e);
    }

    // 2b) Renderers opcionales por bloque (hook para hosts que quieran interceptar)
    for (const b of blocks) {
      const r = renderers.get(b.kind);
      if (r) {
        try {
          r(b, ctx);
        } catch (e) {
          console.warn("[HOST] renderer error for", b.kind, e);
        }
      } else {
        // Si no hay renderer registrado, dejamos que el PortalHost lo maneje
        // (no es error). Solo log informativo:
        // console.log("[HOST] no renderer for", b.kind);
      }
    }
  });

  // 3) “Ask” de adhesión (opcional, para descubrir nodos cercanos)
  try {
    ctx.say?.({ sym: "🔗", say: "adhesion.ask" });
  } catch {}
}

// Renderer ejemplo para web/RN: energy.graph → Energy3D
// En tu App registra esto si quieres un “hook” adicional al portal.
export function registerDefaultGoodEnergyRenderers(Energy3DComp: any) {
  registerBlockRenderer("title", (b) => {
    console.log("TITLE:", b.text);
  });
  registerBlockRenderer("note", (b) => {
    console.log("NOTE:", b.text);
  });
  registerBlockRenderer("toolbar", (b) => {
    console.log("TOOLBAR items=", b.items?.length);
  });
  registerBlockRenderer("energy.graph", (b) => {
    // En web podrías montar <Energy3DComp scene={b.scene}/> desde un portal propio.
    try {
      (globalThis as any).__PORTAL__?.mount?.({
        kind: "energy.graph",
        props: { scene: b.scene, Comp: Energy3DComp },
      });
    } catch {
      console.log("[HOST] energy.graph scene:", b.scene);
    }
  });
}
