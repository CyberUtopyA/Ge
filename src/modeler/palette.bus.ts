// ============================================================
// UTOPÝ — PaletteBus: modelador simbiótico contextual
// ============================================================

import { hear } from "../utopy/symbol.bus";
import { adhesionHub } from "./adhesion.hub";
import type { AdhesionGrant } from "../utopy/types.simbiosis";

// Render dinámico del toolbar según adhesiones
function renderToolbar(ctx: any) {
  const items = adhesionHub.getPalette().map(p => ({
    text: p.icon ? `${p.icon} ${p.label}` : p.label,
    sym: p.sym,
    say: p.say,
    with: p.with,
  }));

  ctx.say({
    sym: "⚡",
    say: "render",
    ns: "energy:modeler",
    with: {
      blocks: [
        { kind: "toolbar", items },
      ],
    },
  });
}

// Instalador simbiótico de la paleta dinámica
export function installDynamicPalette(ctx: any) {
  // 🔗 escuchar adhesiones nuevas
  hear("🔗", "adhesion.grant", (i, c) => {
    const grant = (i?.with || i) as AdhesionGrant;
    adhesionHub.mergeGrant(grant);
    renderToolbar(c);
  });

  // 🔍 permitir consulta manual
  hear("🔗", "adhesion.ask", (_i, c) => {
    const grant: AdhesionGrant = {
      from: c.me || "utopy:modeler",
      ns: "energy:modeler",
      capabilities: [
        {
          id: "energy.blocks",
          provides: ["energy.viewport", "energy.stats", "toolbar", "title"],
          verbs: ["render", "toggle.view3d"],
          palette: [
            {
              id: "pv.panel",
              label: "Panel Solar",
              sym: "⚡",
              say: "add-node",
              with: { kind: "pv", name: "PV", params: { kwp: 3 }, x: 60, y: 60 },
              icon: "☀️",
              category: "solar",
            },
            {
              id: "battery.node",
              label: "Batería",
              sym: "⚡",
              say: "add-node",
              with: { kind: "battery", name: "Bat 5kWh", params: { kwh: 5, soc: 50 }, x: 220, y: 160 },
              icon: "🔋",
              category: "storage",
            },
          ],
        },
      ],
    };
    adhesionHub.mergeGrant(grant);
    renderToolbar(c);
  });

  // 🔄 sincronizar cuando se actualice el hub
  adhesionHub.onChange(() => renderToolbar(ctx));
}
