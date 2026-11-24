// ==============================
// File: src/goodenergy/index.ts
// Boot de GoodEnergy (sandbox + core + PLC + seed vivo)
// ==============================

import { handleActionRun } from "../utopy/ge.action.run";
import { spore, sporeMT } from "../utopy/spore";
import { dispatch } from "../utopy/symbol.bus";
import { bootstrapEnergyCoreController } from "./energy.core";
import { installGoodEnergyModeler } from "./ge.bus";
import { bootstrapDefaultUtopyHardware } from "./hardware/edge.bootstrap";
import { createMockPlcAdapter } from "./plc/mock.adapter";
import { bootstrapPlcRuntime } from "./plc/plc.runtime";

// Re-export de la Surface unificada
export { GoodEnergySurface } from "./ui/GoodEnergy.surface";

export const goodEnergyManifest = {
  id: "goodenergy@core",
  ws: ["wss://seed.mterra.space/utopy"],
  auth: { token: "utopy-resonancia" },
  utopy: {
    transports: {
      gossip: { wsSeeds: ["wss://seed.mterra.space/utopy"] },
    },
  },
};

// ===== Estado Sandbox (memoria de sesión) =====
type Vec3 = { x: number; y: number; z?: number };
type Floor = { id: string; kind: "floor"; pts: Vec3[] };
type Roof = { id: string; kind: "roof"; pts: Vec3[]; h: number };
type Wall = { id: string; kind: "wall"; a: Vec3; b: Vec3; h: number };
type Comp = { id: string; kind: "comp"; type: string; p: Vec3; props?: Record<string, any> };
type Entity = Floor | Roof | Wall | Comp;

const uid = () => Math.random().toString(36).slice(2, 9);

let __GE_PREPARED = false;
let __GE_STARTED = false;
let __GE_ACTION_RUN_BOUND = false;

let __SANDBOX_SCENE: Entity[] = [];
let __CFG = { snap45: true, wallsMustStartOnFloorEdge: true };

function ensureDefaultFloor() {
  const hasFloor = __SANDBOX_SCENE.some((e) => e.kind === "floor");
  if (!hasFloor) {
    const f: Floor = {
      id: uid(),
      kind: "floor",
      pts: [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 6, y: 4 },
        { x: 0, y: 4 },
      ],
    };
    __SANDBOX_SCENE = [f];
  }
}

function serialize(ents: Entity[]) {
  const floors = ents
    .filter((e): e is Floor => e.kind === "floor")
    .map((f) => ({ id: f.id, pts: f.pts }));

  const roofs = ents
    .filter((e): e is Roof => e.kind === "roof")
    .map((r) => ({ id: r.id, h: r.h, pts: r.pts }));

  const walls = ents
    .filter((e): e is Wall => e.kind === "wall")
    .map((w) => ({ id: w.id, a: w.a, b: w.b, h: w.h }));

  const comps = ents
    .filter((e): e is Comp => e.kind === "comp")
    .map((c) => ({ id: c.id, type: c.type, p: c.p, props: c.props || {} }));

  return { floors, roofs, walls, comps };
}

async function openEditorUI() {
  ensureDefaultFloor();
  const topologia = serialize(__SANDBOX_SCENE);

  await spore.sayIntent({
    sym: "⚡",
    ns: "energy:modeler",
    say: "render",
    with: {
      blocks: [
        { kind: "title", text: "GoodEnergy — Sandbox 2.5D" },
        { kind: "ui.open.editor", with: { topologia, cfg: __CFG } },
      ],
    },
  });
}

let __LAST_SAVE_HASH = "";
let __LAST_SAVE_TS = 0;

const hashTopo = (topologia: any) => {
  try {
    return JSON.stringify(topologia);
  } catch {
    return String(Date.now());
  }
};

function topoToScene(topologia: any) {
  const rooms = Array.isArray(topologia?.rooms) ? topologia.rooms : [];
  const comps = Array.isArray(topologia?.comps) ? topologia.comps : [];

  const nodes = [
    ...rooms.map((r: any) => ({
      id: String(r.id || uid()),
      kind: "room",
      name: `room:${r.id || "?"}`,
    })),
    ...comps.map((c: any) => ({
      id: String(c.id || uid()),
      kind: c.type || "comp",
      name: c.type || "comp",
    })),
  ];

  return { meta: { title: "Topología (Sandbox)" }, nodes, edges: [], topologia };
}

async function onGuardarEscena(topologia: ReturnType<typeof serialize>) {
  const now = Date.now();
  const h = hashTopo(topologia);

  if (h === __LAST_SAVE_HASH) return;
  if (now - __LAST_SAVE_TS < 400) return;

  __LAST_SAVE_HASH = h;
  __LAST_SAVE_TS = now;

  const next: Entity[] = [];
  (topologia.floors || []).forEach((f: any) =>
    next.push({ id: f.id, kind: "floor", pts: f.pts })
  );
  (topologia.roofs || []).forEach((r: any) =>
    next.push({ id: r.id, kind: "roof", pts: r.pts as any, h: r.h })
  );
  (topologia.walls || []).forEach((w: any) =>
    next.push({ id: w.id, kind: "wall", a: w.a, b: w.b, h: w.h })
  );
  (topologia.comps || []).forEach((c: any) =>
    next.push({ id: c.id, kind: "comp", type: c.type, p: c.p, props: c.props })
  );

  __SANDBOX_SCENE = next;

  const scene = topoToScene(topologia || {});
  await spore.sayIntent({
    sym: "⚡",
    ns: "energy:modeler",
    say: "render",
    with: {
      append: false,
      blocks: [
        { kind: "title", text: "✅ Guardado: Sandbox 2.5D" },
        { kind: "energy.graph", scene },
        { kind: "energy.viewport", scene },
        { kind: "note", text: "✅ Escena guardada (sin loop)" },
      ],
    },
  });

  await spore.sayIntent({
    sym: "⚡",
    ns: "energy:modeler",
    say: "energy.graph.update",
    with: { topologia },
  });
}

export function prepareGoodEnergy() {
  (globalThis as any).__utopy_manifest = goodEnergyManifest;

  if (__GE_PREPARED) return goodEnergyManifest;
  __GE_PREPARED = true;

  spore.on("intent", async (msg: any) => {
    const me = spore.getState?.().id;
    if (msg?.id && me && msg.id === me) return;

    const i = msg?.payload || msg;
    if (!i?.sym || !i?.say) return;

    if (i.sym === "⚡" && i.say === "sandbox.open") {
      await openEditorUI();
      return;
    }

    if (i.sym === "⚡" && i.say === "sandbox.reset") {
      __SANDBOX_SCENE = [];
      ensureDefaultFloor();
      await openEditorUI();
      return;
    }

    if (i.sym === "⚡" && i.say === "sandbox.cfg") {
      __CFG = { ...__CFG, ...(i.with || {}) };
      await spore.sayIntent({
        sym: "⚡",
        ns: "energy:modeler",
        say: "editor.cfg.apply",
        with: { cfg: __CFG },
      });
      return;
    }

    if (i.sym === "⚡" && i.say === "guardar.escena") {
      const topo = i.with?.topologia || {};
      await onGuardarEscena(topo);
      return;
    }

    const ctx = {
      me: spore.getState().id,
      say: (x: any) => spore.sayIntent(x),
      store: undefined,
    };
    dispatch(i, ctx);
  });

  return goodEnergyManifest;
}

async function bindGeActionRunOnce() {
  if (__GE_ACTION_RUN_BOUND) return;
  __GE_ACTION_RUN_BOUND = true;

  spore.on("action.run", async (msg: any) => {
    try {
      await handleActionRun({
        msg,
        getDV: async (id: string) => {
          const base = "https://seed.mterra.space/micelio";
          const res = await fetch(`${base}/dv/${encodeURIComponent(id)}`);
          if (!res.ok) return null;
          return await res.json();
        },
        publishDV: async (dv: any) => {
          await sporeMT.sayIntent({
            sym: "🧬",
            say: "dv.upsert",
            ns: "mt",
            with: { dv, ns: dv?.meta?.ns || "mt:market" },
            ts: Date.now(),
          });
        },
        say: async (verb: string, payload?: any) => spore.call(verb, payload),
      });
    } catch (e) {
      console.warn("GE action.run error", e);
    }
  });
}

export async function startGoodEnergy(ns = "energy:core") {
  if (__GE_STARTED) return;
  __GE_STARTED = true;

  const ctx = {
    me: spore.getState().id,
    say: (i: any) => spore.sayIntent(i),
    store: undefined,
  };

  spore
    .call("node.capability", {
      id: spore.getState().id,
      capabilities: [
        "energy.core",
        "energy.sim",
        "energy.scene",
        "energy.modeler",
        "energy.plan",
        "energy.plc",
        "energy.fabrication",
        "utopy.hardware.seed",
      ],
      ws: "wss://seed.mterra.space/utopy",
      scope: "public",
      meta: { ns },
    })
    .catch(() => {});

  installGoodEnergyModeler(ctx);

  // FASE 1 + base core
  bootstrapEnergyCoreController(ns);

  // FASE 2
  await bootstrapPlcRuntime(createMockPlcAdapter("plc:mock:main"), {
    ns,
    siteId: "ge:site:default",
    pollMs: 3000,
    scopes: ["public"],
  });

  // FASE 4
  await bootstrapDefaultUtopyHardware(ns);

  // action.run GE/MO
  await bindGeActionRunOnce();

  // abrir home
  await spore.sayIntent({ sym: "⚡", say: "abrir", ns });
}