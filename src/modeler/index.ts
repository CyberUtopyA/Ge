// src/modeler/index.ts
import { micelioOnDV } from "../utopy/micelio.client";
import { spore } from "../utopy/spore";
import { installModelerAdhesion } from "./adhesion";
import { installOrganismBridge } from "./organismbridge";

const manifest = {
  id: "modeler@core",
  ws: ["wss://seed.mterra.space/utopy"],
  auth: { token: "utopy-resonancia" },
  utopy: { transports: { gossip: { wsSeeds: ["wss://seed.mterra.space/utopy"] } } },
};

let __MODELER_INSTALLED = false;
let __UNSUB_DV: null | (() => void) = null;

export async function bootModeler() {
  await spore.init(manifest, { ns: "public" });

  const ctx = {
    me: () => spore.getState().id,
    say: (i: any) => spore.sayIntent(i),
    call: (k: string, p?: any) => spore.call(k as any, p),
  };

  spore
    .call("node.capability", {
      id: spore.getState().id,
      capabilities: ["modeler.core", "modeler.organism", "modeler.sim", "modeler.export"],
      ws: "wss://seed.mterra.space/utopy",
      scope: "public",
      meta: { ns: "modeler:core" },
    })
    .catch(() => {});

  if (!__MODELER_INSTALLED) {
    installModelerAdhesion(ctx as any);

    installOrganismBridge(ctx as any, {
      ns: "energy:modeler",
      toUI: (blocks) => {
        ctx.say({
          sym: "⚡",
          ns: "energy:modeler",
          say: "render",
          with: { append: true, blocks },
        });
      },
      sceneIdGetter: () => null,
    });

    // ✅ Listener DV (una sola vez)
    if (__UNSUB_DV) __UNSUB_DV();
    __UNSUB_DV = micelioOnDV((dv) => {
      const traits = Array.isArray(dv?.traits) ? dv.traits : [];
      const isElectric = traits.includes("ge:diagram.electric");
      if (!isElectric) return;

      const graph = dv?.attrs?.graph;
      const title = graph?.meta?.title || dv?.attrs?.title || "Diagrama (GE)";
      const siteId = dv?.attrs?.siteId || "—";
      const rev = dv?.attrs?.rev || dv?.meta?.ts || "—";

      ctx.say({
        sym: "⚡",
        ns: "energy:modeler",
        say: "render",
        with: {
          append: true,
          blocks: [
            { kind: "title", text: `⚡ ${title} · ${siteId} · ${rev}` },
            {
              kind: "energy.viewport",
              scene: graph || { nodes: [], edges: [], meta: { title: "SIN graph en attrs.graph" } },
              with: { mode: "2d", interactive: false, selected: null, hints: { drawWall: false } },
            },
            { kind: "note", text: `DV recibido: ${dv.id}` },
          ],
        },
      });
    });

    __MODELER_INSTALLED = true;
  }

  await ctx.say({ sym: "🧬", say: "abrir", ns: "modeler:core" });
}

export { ModelerSurface } from "./Surface";
