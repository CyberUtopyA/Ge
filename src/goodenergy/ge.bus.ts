// ==============================
// File: src/goodenergy/ge.bus.ts
// Modelador GoodEnergy con estructura + energía (2D/3D, selección y mover)
// ==============================
import {
  applyReadingToNode,
  attachSensor,
  detachSensor,
  getNodeSensors,
  getReading,
  getSensor,
  listSensors,
} from "../sensors/registry";
import { hear } from "../utopy/symbol.bus";
import { GeScene, GeNode, rid, exampleScene } from "./ge.model";
import { kv, kvGetJSON, kvSetJSON, setKVPrefix } from "../utopy/storage";

// ===== Estado UI / edición =====
let EDIT_MODE = false;               // Home (false) vs Editor (true)
let PANEL_OPEN = true;               // Inspector abierto/cerrado
let SNAP_ANGLES: null | { degs: number[] } = { degs: [0, 45, 90, 135, 180, -45, -90, -135] };

// Vista interna del editor (no afecta al Home)
let EDIT_VIEW: "2d" | "3d" = "2d";   // ⬅️ clave para que no “rebote” a 2d

// ===== Estado escena =====
let SCENE: GeScene = exampleScene();
// Si preferís arrancar vacío, usa:
// let SCENE: GeScene = { nodes: [], edges: [], meta: { title: "Nueva escena" } } as any;

let VIEW3D = false;                  // Solo para la vista del Home
let SELECTED_ID: string | null = null;
let MODE_DRAW_WALL: null | { x0: number; y0: number } = null;

// 🆕 Booteo de organismo por sesión de edición
let ORG_BOOTED_FOR_SESSION = false;
let ORG_SCENE_ID: string | null = null;

// ===== KVStore (opcional, fallback a memoria) =====
const SCENE_K = "goodenergy.scene";
let __MEM_SCENE: string | null = null;

setKVPrefix("energy:modeler"); // opcional: namespace por app/ns

async function kvGet(k: string) { return await kv.getItem(k); }
async function kvSet(k: string, v: string) { await kv.setItem(k, v); }

// ===== Utilidades =====
function snapAngleDeg(raw: number): number {
  if (!SNAP_ANGLES) return raw;
  let best = raw, err = 999;
  for (const d of SNAP_ANGLES.degs) {
    const e = Math.abs(((raw - d + 540) % 360) - 180);
    if (e < err) { err = e; best = d; }
  }
  return best;
}

type EnergyTpl = { kind: string; label: string; icon?: string; defaultParams?: Record<string, any>; };
const ENERGY_KINDS: Record<string, EnergyTpl> = {
  pv:       { kind: "pv",       label: "PV",       icon: "🔆", defaultParams: { kwp: 3 } },
  inverter: { kind: "inverter", label: "Inverter", icon: "🔁", defaultParams: { max_kw: 3 } },
  battery:  { kind: "battery",  label: "Battery",  icon: "🔋", defaultParams: { kwh: 5, soc: 50 } },
  load:     { kind: "load",     label: "Load",     icon: "💡", defaultParams: { kw: 1.5 } },
  grid:     { kind: "grid",     label: "Grid",     icon: "⚡", defaultParams: {} },
};
function listEnergyKinds(): EnergyTpl[] { return Object.values(ENERGY_KINDS); }
function getEnergyKind(k: string): EnergyTpl | undefined { return ENERGY_KINDS[k]; }
function registerEnergyKind(tpl: EnergyTpl) { ENERGY_KINDS[tpl.kind] = { ...tpl, defaultParams: tpl.defaultParams ?? {} }; }

function setRectByHandle(n: GeNode, handle:"nw"|"ne"|"se"|"sw", dx:number, dy:number) {
  const PX_PER_M = 60;
  const toM = (v:number)=> v / PX_PER_M;

  const w0 = Number(n.params?.w ?? 6), d0 = Number(n.params?.d ?? 4);
  let w = w0, d = d0;
  let x = n.x ?? 0, y = n.y ?? 0;

  if (handle==="ne"){ w += toM(dx); }
  if (handle==="se"){ w += toM(dx); d += toM(dy); }
  if (handle==="sw"){ x += dx; w -= toM(dx); d += toM(dy); }
  if (handle==="nw"){ x += dx; y += dy; w -= toM(dx); d -= toM(dy); }

  w = Math.max(0.2, +w.toFixed(2));
  d = Math.max(0.2, +d.toFixed(2));

  n.x = x; n.y = y;
  n.params = { ...(n.params||{}), w, d };
}

function statsOf(scene: GeScene) {
  const s = { pv_kw: 0, load_kw: 0, soc: null as number | null, grid_in: 0, grid_out: 0 };
  for (const n of scene.nodes) {
    if (n.kind === "pv") s.pv_kw += Number(n.state?.p_kw ?? 0);
    if (n.kind === "load") s.load_kw += Number(n.state?.p_kw ?? 0);
    if (n.kind === "battery") s.soc = Number(n.params?.soc ?? s.soc ?? 0);
    if (n.kind === "grid") {
      s.grid_in += Number(n.state?.p_kw_in ?? 0);
      s.grid_out += Number(n.state?.p_kw_out ?? 0);
    }
  }
  return {
    pv_kw: +s.pv_kw.toFixed(2),
    load_kw: +s.load_kw.toFixed(2),
    soc: s.soc == null ? null : +s.soc,
    grid_in: +s.grid_in.toFixed(2),
    grid_out: +s.grid_out.toFixed(2),
  };
}

function tool(label: string, say: string, withData?: any, sym = "⚡") {
  return { text: label, sym, say, with: withData };
}

function quickAddTools() {
  const energy = listEnergyKinds().map(k =>
    tool(`${k.icon ?? "⚡"} ${k.label} +`, "add-node", {
      kind: k.kind,
      name: k.label.toUpperCase(),
      params: { ...(k.defaultParams || {}) },
      x: 120, y: 120
    })
  );

  // ⬅️ Etiqueta del botón "Ver ..." depende del contexto actual
  const viewLabel = EDIT_MODE
    ? (EDIT_VIEW === "3d" ? "Ver 2D" : "Ver 3D")
    : (VIEW3D ? "Ver 2D" : "Ver 3D");

  return [
    tool("Nuevo (vacío)", "scene.clear", {}),
    tool("Piso +", "add-struct", { kind: "floor", w: 6, d: 4, x: 0, y: 0 }),
    tool("Pared + (dibuja)", "mode.draw.wall", {}),
    tool("Techo +", "add-struct", { kind: "roof.gable", w: 6, d: 4, tilt: 22.5, x: 0, y: 0 }),
    tool("Techo con PV +", "add-roof-with-pv", { w: 6, d: 4, tilt: 22.5 }),
    ...energy,
    { kind: "divider" },
    tool("Snap 45°/90°", "snap.angles.toggle", {}),
    tool(PANEL_OPEN ? "Ocultar Panel" : "Mostrar Panel", "ui.panel.toggle", {}),
    tool("Guardar", "scene.save", {}),
    tool("Cargar", "scene.load", {}),
    { kind: "divider" },
    tool("Simular +1s", "simulate.step", { dt_s: 1 }),
    tool("Reset", "reset"),
    tool(viewLabel, "toggle.view3d", {}), // 👈 usa etiqueta según contexto
  ];
}

function nodeActionsTools(n: GeNode) {
  const sensors = getNodeSensors(n.id);
  return [
    tool("⬅️", "nudge", { dx: -10, dy: 0 }),
    tool("⬆️", "nudge", { dx: 0,  dy: -10 }),
    tool("⬇️", "nudge", { dx: 0,  dy: 10 }),
    tool("➡️", "nudge", { dx: 10, dy: 0 }),
    tool("Adjuntar sensor", "ui.sensor.pick",   { nodeId: n.id }),
    ...(sensors.length ? [tool("Quitar sensor", "ui.sensor.unpick", { nodeId: n.id })] : []),
    tool("Duplicar", "duplicate-node", { id: n.id }),
    tool("Borrar", "delete-node"),
  ];
}
function toolbarItems() {
  const base = quickAddTools();
  if (SELECTED_ID) {
    const n = SCENE.nodes.find(z => z.id === SELECTED_ID);
    if (n) return [...base, { kind: "divider" }, ...nodeActionsTools(n)];
  }
  return base;
}

function applySensors(scene: any) {
  for (const n of scene.nodes || []) {
    const sIds = getNodeSensors(n.id);
    for (const sid of sIds) {
      const s = getSensor(sid);
      const r = s ? getReading(sid) : undefined;
      if (s && r) applyReadingToNode(n, s, r);
    }
  }
}

/** ===== Render coalesced + dedupe ===== */
let __renderScheduled: any = null;
let __lastSig = "";
function scheduleRender(ctx:any) {
  if (__renderScheduled) return;
  __renderScheduled = setTimeout(() => {
    __renderScheduled = null;
    renderBody(ctx);
  }, 16); // ~60 fps
}
function makeSigFromRender(withObj: any) {
  const blocks = Array.isArray(withObj?.blocks) ? withObj.blocks : [];
  const kinds = blocks.map((b:any)=>b?.kind).filter(Boolean).join("|");

  // buscar scene si existe, pero solo usar tamaño, NO contenido
  let nodes = 0, edges = 0, title = "";
  for (const b of blocks) {
    const s = b?.scene;
    if (s?.nodes) nodes = s.nodes.length ?? 0;
    if (s?.edges) edges = s.edges.length ?? 0;
    if (s?.meta?.title) title = String(s.meta.title);
  }

  return [
    kinds,
    `edit:${EDIT_MODE}`,
    `view3d:${VIEW3D}`,
    `editView:${EDIT_VIEW}`,
    `panel:${PANEL_OPEN}`,
    `sel:${SELECTED_ID ?? "-"}`,
    `nodes:${nodes}`,
    `edges:${edges}`,
    `title:${title}`,
  ].join(";");
}

function safeSay(ctx:any, payload:any){
  try {
    // ✅ solo dedupe de renders
    if (payload?.say === "render") {
      const sig = makeSigFromRender(payload?.with || {});
      if (sig === __lastSig) return;
      __lastSig = sig;
    }
  } catch {}
  ctx.say(payload);
}

function render(ctx:any){ scheduleRender(ctx); }

function renderBody(ctx: any) {
  // ✅ NO mutar SCENE en cada render
const SCENE_VIEW: GeScene = JSON.parse(JSON.stringify(SCENE));
applySensors(SCENE_VIEW);

const selected = SELECTED_ID ? SCENE_VIEW.nodes.find(n => n.id === SELECTED_ID) || null : null;


  // 🟣 En edición: modal 3D + panel opcional
  if (EDIT_MODE) {
    if (!ORG_BOOTED_FOR_SESSION) {
      ORG_BOOTED_FOR_SESSION = true;
      ORG_SCENE_ID = `scene-${SCENE?.nodes?.length || 0}-${Date.now().toString(36)}`;
      ctx.say({
        sym: "🧬",
        ns: "energy:modeler",
        say: "organism.boot",
        with: {
          sceneId: ORG_SCENE_ID,
          caps: ["cad","export","sim","plans"],
          expects: ["stl","step","ifc","gcode","plan","sim","file","note"],
        }
      });
    }

    safeSay(ctx, {
      sym: "⚡",
      say: "render",
      ns: "energy:modeler",
      with: {
        blocks: [
          { kind: "title", text: "GoodEnergy — Modelador" },
          { kind: "toolbar", items: toolbarItems() as any[] },
          {
            kind: "modal.3d",
            title: "Editor 3D",
            scene: SCENE_VIEW,
            with: { selected: SELECTED_ID, interactive: true, mode: EDIT_VIEW }, // ⬅️ refleja el modo actual del editor
          },
          ...(PANEL_OPEN ? [{ kind: "energy.inspector", node: selected }] : []),
        ],
      },
    });
    return;
  }

  // 🟢 En home
  safeSay(ctx, {
    sym: "⚡",
    say: "render",
    ns: "energy:modeler",
    with: {
      blocks: [
        { kind: "title", text: "GoodEnergy — Casa" },
        {
          kind: "energy.viewport",
          scene: SCENE_VIEW,
          with: {
            mode: VIEW3D ? "3d" : "2d",
            selected: null,
            interactive: false,
            hints: { drawWall: false },
          },
        },
        { kind: "energy.stats", stats: statsOf(SCENE) },
        { kind: "floating.edit.button" },
      ],
    },
  });
}

function setPos(id: string, x: number, y: number) {
  const n = SCENE.nodes.find((z) => z.id === id);
  if (n) { n.x = x; n.y = y; }
}

function simulateStep(scene: GeScene, env: { dt_s?: number }): GeScene {
  const dt = Math.max(1, Number(env.dt_s ?? 1));
  const s: GeScene = JSON.parse(JSON.stringify(scene));
  const irr = 0.8;

  s.nodes.forEach((n) => {
    if (n.kind === "pv") {
      const kwp = Number(n.params?.kwp ?? 3);
      (n.state ||= {}).p_kw = +(kwp * irr).toFixed(3);
    }
    if (n.kind === "load") {
      const kw = Number(n.params?.kw ?? 1.5);
      (n.state ||= {}).p_kw = +kw.toFixed(3);
    }
  });

  const byId = Object.fromEntries(s.nodes.map((n) => [n.id, n]));
  const inEdges = (id: string) => s.edges.filter((e) => e.to === id && e.enabled !== false);
  const outEdges = (id: string) => s.edges.filter((e) => e.from === id && e.enabled !== false);

  s.nodes.forEach((n) => {
    if (n.kind !== "inverter") return;
    const inputs  = inEdges(n.id).map((e) => byId[e.from]);
    const outputs = outEdges(n.id).map((e) => byId[e.to]);
    const pIn   = sumKw(inputs);
    const pLoad = sumKw(outputs.filter((x) => x.kind === "load"));
    const bat   = outputs.find((x) => x.kind === "battery");
    const gridF = inputs.find((x) => x.kind === "grid");
    const gridT = outputs.find((x) => x.kind === "grid");

    let surplus = pIn - pLoad;
    if (bat) {
      const cap = Number(bat.params?.kwh ?? 5);
      const soc = Number(bat.params?.soc ?? 50);
      const eNow = (soc / 100) * cap;
      const eNext = eNow + Math.max(-cap, Math.min(cap, surplus)) * (dt / 3600);
      const socNext = Math.max(0, Math.min(100, (eNext / cap) * 100));
      bat.params!.soc = +socNext.toFixed(2);
      if (surplus > 0 && socNext >= 99.9 && gridT) (gridT.state ||= {}).p_kw_out = +surplus.toFixed(3);
      if (surplus < 0 && gridF) (gridF.state ||= {}).p_kw_in  = +(-surplus).toFixed(3);
    } else {
      if (surplus < 0 && gridF) (gridF.state ||= {}).p_kw_in  = +(-surplus).toFixed(3);
      if (surplus > 0 && gridT) (gridT.state ||= {}).p_kw_out = +surplus.toFixed(3);
    }
    (n.state ||= {}).p_in_kw   = +pIn.toFixed(3);
    (n.state ||= {}).p_load_kw = +pLoad.toFixed(3);
  });

  applySensors(s);
  return s;
}
function sumKw(nodes: GeNode[]) {
  let sum = 0;
  for (const n of nodes) if (n.state?.p_kw) sum += Number(n.state.p_kw);
  return sum;
}

function ensureRoofWithPv(w = 6, d = 4, tilt = 22.5) {
  const roofId = rid();
  SCENE.nodes.push({ id: roofId, kind: "roof.gable", name: "Techo", params: { w, d, tilt }, x: 0, y: 0 });
  const pv1: GeNode = { id: rid(), kind: "pv", name: "PV A", params: { kwp: 3 }, x: 40,  y: -20, parentId: roofId, zIndex: 1 };
  const pv2: GeNode = { id: rid(), kind: "pv", name: "PV B", params: { kwp: 3 }, x: 120, y: -20, parentId: roofId, zIndex: 1 };
  SCENE.nodes.push(pv1, pv2);
  return roofId;
}

// ================== Instalación ==================
export function installGoodEnergyModeler(ctx: any) {
  // Decorar ctx.say para autocompletar ns según sym
  const _say = ctx.say?.bind(ctx);
  ctx.say = (intent: any) => {
    if (intent && !intent.ns) {
      if (intent.sym === "📡") intent.ns = "energy:sensors";
      else if (intent.sym === "⚡") intent.ns = "energy:modeler";
      else intent.ns = "energy:basic";
    }
    return _say(intent);
  };

  // ======= UI extra =======
  hear("⚡", "ui.panel.toggle", (_i,c)=>{ PANEL_OPEN = !PANEL_OPEN; render(c); });

  hear("⚡", "snap.angles.toggle", (_i, c) => {
    SNAP_ANGLES = SNAP_ANGLES ? null : { degs: [0, 45, 90, 135, 180, -45, -90, -135] };
    render(c);
  });

  // ======= Guardar / Cargar =======
  hear("⚡", "scene.save", async (_i, c) => {
    try {
      await kvSet(SCENE_K, JSON.stringify(SCENE));
      ctx.say({ sym:"⚡", say:"render", with:{ blocks:[ { kind:"note", text:"✅ Escena guardada." } ] }});
    } catch {
      ctx.say({ sym:"⚡", say:"render", with:{ blocks:[ { kind:"note", text:"⚠️ No se pudo guardar (KVStore no disponible)." } ] }});
    } 
  });

  hear("⚡", "scene.load", async (_i, c) => {
    try {
      const raw = await kvGet(SCENE_K);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.nodes && parsed?.edges) { SCENE = parsed; SELECTED_ID = null; }
        ctx.say({ sym:"⚡", say:"render", with:{ blocks:[ { kind:"note", text:"📦 Escena cargada." } ] }});
      } else {
        ctx.say({ sym:"⚡", say:"render", with:{ blocks:[ { kind:"note", text:"ℹ️ No hay escena guardada." } ] }});
      }
    } catch {
      ctx.say({ sym:"⚡", say:"render", with:{ blocks:[ { kind:"note", text:"⚠️ Error al cargar escena." } ] }});
    }
    render(c);
  });

  // ======= Modo Home / Editor =======
  hear("⚡", "ui.edit.open",  (_i, c) => {
    EDIT_MODE = true;
    ORG_BOOTED_FOR_SESSION = false;
    ORG_SCENE_ID = null;
    render(c);
  });

  hear("⚡", "ui.edit.close", (_i, c) => {
    EDIT_MODE = false;
    SELECTED_ID = null;
    MODE_DRAW_WALL = null;
    ORG_BOOTED_FOR_SESSION = false;
    ORG_SCENE_ID = null;
    render(c);
  });

  // Sensores attach/detach
  hear("📡", "sensor.attach", (i, c) => {
    const w = i?.with || {};
    if (w.nodeId && w.sensorId) attachSensor(w.nodeId, w.sensorId);
    applySensors(SCENE); render(c);
  });
  hear("📡", "sensor.detach", (i, c) => {
    const w = i?.with || {};
    if (w.nodeId && w.sensorId) detachSensor(w.nodeId, w.sensorId);
    applySensors(SCENE); render(c);
  });

  // abrir (no resetea vistas)
  hear("⚡", "abrir", async (_i, c) => render(c));

  // ⬅️ Alternar 2D/3D según contexto
  hear("⚡", "toggle.view3d", async (_i, c) => {
    if (EDIT_MODE) {
      EDIT_VIEW = (EDIT_VIEW === "2d" ? "3d" : "2d");
    } else {
      VIEW3D = !VIEW3D;
    }
    render(c);
  });

  // set view (editor)
  hear("⚡", "ui.set.view", (i, c) => {
    const m = String(i?.with?.mode || "");
    if (m === "2d" || m === "3d") {
      EDIT_VIEW = m;
      render(c);
    }
  });

  // selección (solo edición)
  hear("⚡", "select", async (i, c) => {
    if (!EDIT_MODE) return;
    SELECTED_ID = String(i?.with?.id || "") || null;
    render(c);
  });

  // nudge
  hear("⚡", "nudge", async (i, c) => {
    if (!EDIT_MODE || !SELECTED_ID) return;
    const dx = Number(i?.with?.dx || 0);
    const dy = Number(i?.with?.dy || 0);
    const n = SCENE.nodes.find((z) => z.id === SELECTED_ID);
    if (!n) return;
    setPos(n.id, (n.x ?? 0) + dx, (n.y ?? 0) + dy);
    render(c);
  });

  // delete
  hear("⚡", "delete-node", async (_i, c) => {
    if (!EDIT_MODE || !SELECTED_ID) return;
    SCENE.nodes = SCENE.nodes.filter((z) => z.id !== SELECTED_ID);
    SCENE.edges = SCENE.edges.filter((e) => e.from !== SELECTED_ID && e.to !== SELECTED_ID);
    SELECTED_ID = null; render(c);
  });

  // duplicar
  hear("⚡", "duplicate-node", (i, c) => {
    if (!EDIT_MODE) return;
    const id = String(i?.with?.id || SELECTED_ID || "");
    const n = SCENE.nodes.find(z => z.id === id);
    if (!n) return;
    const copy: GeNode = JSON.parse(JSON.stringify(n));
    copy.id = rid(); copy.x = (n.x ?? 0) + 30; copy.y = (n.y ?? 0) + 30;
    SCENE.nodes.push(copy);
    SELECTED_ID = copy.id!;
    render(c);
  });

  // add-node energía
  hear("⚡", "add-node", async (i, c) => {
    if (!EDIT_MODE) return;
    const p = i?.with || {};
    const tpl = getEnergyKind(p.kind);
    const node: GeNode = {
      id: p.id || rid(),
      kind: p.kind || "pv",
      name: p.name || tpl?.label?.toUpperCase() || (p.kind || "node").toUpperCase(),
      params: { ...(tpl?.defaultParams || {}), ...(p.params || {}) },
      x: p.x ?? 120,
      y: p.y ?? 120,
    };
    SCENE.nodes.push(node);
    SELECTED_ID = node.id!;
    render(c);
  });

  // registrar tipo energía
  hear("⚡", "energy.kind.register", (i, c) => {
    if (!EDIT_MODE) return;
    const tpl = i?.with?.tpl as EnergyTpl | undefined;
    if (tpl?.kind) registerEnergyKind(tpl);
    render(c);
  });

  // add-struct
  hear("⚡", "add-struct", async (i, c) => {
    if (!EDIT_MODE) return;
    const w = i?.with || {};
    const kind = String(w.kind || "");
    const id = w.id || rid();

    if (kind === "floor") {
      SCENE.nodes.push({
        id, kind: "floor", name: "Piso",
        params: { w: Number(w.w ?? 6), d: Number(w.d ?? 4) }, // m
        x: Number(w.x ?? 0), y: Number(w.y ?? 0),
      });
    } else if (kind === "wall") {
      SCENE.nodes.push({
        id, kind: "wall", name: "Pared",
        params: {
          len: Number(w.len ?? 3),
          thick: Number(w.thick ?? 0.12),
          h: Number(w.h ?? 2.4),
          rot: Number(w.rot ?? 0),
        },
        x: Number(w.x ?? 0), y: Number(w.y ?? 0),
      });
    } else if (kind === "roof.gable") {
      SCENE.nodes.push({
        id, kind: "roof.gable", name: "Techo",
        params: { w: Number(w.w ?? 6), d: Number(w.d ?? 4), tilt: Number(w.tilt ?? 22.5) }, // m
        x: Number(w.x ?? 0), y: Number(w.y ?? 0),
      });
    }
    SELECTED_ID = id; render(c);
  });

  // draw.wall (2D)
  hear("⚡", "mode.draw.wall", (_i, c) => {
    if (!EDIT_MODE) return;
    MODE_DRAW_WALL = { x0: 0, y0: 0 }; render(c);
  });
  hear("⚡", "draw.wall.start", (i, c) => {
    if (!EDIT_MODE) return;
    MODE_DRAW_WALL = { x0: +i?.with?.x, y0: +i?.with?.y }; render(c);
  });
  hear("⚡", "draw.wall.move", (_i, _c) => { /* ghost opcional (UI) */ });

  hear("⚡", "draw.wall.end", (i, c) => {
    if (!EDIT_MODE || !MODE_DRAW_WALL) return;
    const x0 = MODE_DRAW_WALL.x0, y0 = MODE_DRAW_WALL.y0;
    const x1 = +i?.with?.x, y1 = +i?.with?.y;
    const dx = x1 - x0, dy = y1 - y0;

    // ángulo con snapping
    let rot = (Math.atan2(dy, dx) * 180) / Math.PI;
    rot = snapAngleDeg(rot);

    // longitud en metros (60 px = 1 m)
    const PX_PER_M = 60;
    const len_px = Math.hypot(dx, dy);
    const len = Math.max(0.1, len_px / PX_PER_M);

    const newId = rid();
    SCENE.nodes.push({
      id: newId,
      kind: "wall",
      name: "Pared",
      params: { len, thick: 0.12, h: 2.4, rot },
      x: x0,
      y: y0,
    });

    SELECTED_ID = newId;
    MODE_DRAW_WALL = null;
    render(c);
  });

  // Taps en el canvas
  hear("⚡", "ui.tap.empty", (_i, c) => {
    if (!EDIT_MODE) return;
    SELECTED_ID = null;
    render(c);
  });

  hear("⚡", "ui.tap.node", (i, c) => {
    if (!EDIT_MODE) return;
    const id = String(i?.with?.id || "");
    if (SCENE.nodes.some(n => n.id === id)) {
      SELECTED_ID = id;
      render(c);
    }
  });

  // Drag incremental de nodos (desde el canvas)
  hear("⚡", "ui.drag.move", (i, c) => {
    if (!EDIT_MODE) return;
    const id = String(i?.with?.id || SELECTED_ID || "");
    if (!id) return;
    const n = SCENE.nodes.find(z => z.id === id);
    if (!n) return;
    const dx = Number(i?.with?.dx || 0);
    const dy = Number(i?.with?.dy || 0);
    n.x = (n.x ?? 0) + dx;
    n.y = (n.y ?? 0) + dy;
    render(c);
  });

  hear("⚡", "ui.drag.end", (_i, c) => {
    if (!EDIT_MODE) return;
    // Hook para snap a grid en soltar si lo querés luego
    render(c);
  });

  // Editar parámetros desde el inspector
  hear("⚡", "set-param", (i, c) => {
    if (!EDIT_MODE) return;
    const nodeId = String(i?.with?.nodeId || SELECTED_ID || "");
    const key = String(i?.with?.key || "");
    const value = i?.with?.value;
    const n = SCENE.nodes.find(z => z.id === nodeId);
    if (!n || !key) return;
    n.params = { ...(n.params || {}), [key]: value };
    render(c);
  });

  // Reemplazar/actualizar escena parcialmente
  hear("⚡", "scene.update", (i, c) => {
    if (!EDIT_MODE) return;
    const s = i?.with?.scene;
    if (!s || !Array.isArray(s.nodes) || !Array.isArray(s.edges)) return;
    SCENE = s;
    if (SELECTED_ID && !SCENE.nodes.some(n => n.id === SELECTED_ID)) {
      SELECTED_ID = null;
    }
    render(c);
  });

  // Limpiar escena (nuevo)
  hear("⚡", "scene.clear", (_i, c) => {
    if (!EDIT_MODE) return;
    SCENE = { nodes: [], edges: [], meta: { title: "Nueva escena" } } as GeScene;
    SELECTED_ID = null;
    render(c);
  });

  // Crear techo y PV de una
  hear("⚡", "add-roof-with-pv", (i, c) => {
    if (!EDIT_MODE) return;
    const w = Number(i?.with?.w ?? 6);
    const d = Number(i?.with?.d ?? 4);
    const tilt = Number(i?.with?.tilt ?? 22.5);
    const roofId = ensureRoofWithPv(w, d, tilt);
    SELECTED_ID = roofId;
    render(c);
  });

  // Simulación
  hear("⚡", "simulate.step", (i, c) => {
    const dt_s = Number(i?.with?.dt_s ?? 1);
    SCENE = simulateStep(SCENE, { dt_s });
    render(c);
  });

  // Reset rápido (estado de vista + selección)
  hear("⚡", "reset", (_i, c) => {
    VIEW3D = false;
    EDIT_VIEW = "2d";
    SELECTED_ID = null;
    MODE_DRAW_WALL = null;
    render(c);
  });

  // Modales de sensores
  hear("⚡", "ui.sensor.pick", (i, c) => {
    const nodeId = String(i?.with?.nodeId || SELECTED_ID || "");
    if (!nodeId) return;
    const sensors = listSensors().map(s => ({ id: s.id, label: s.label || s.id }));
    ctx.say({
      sym: "⚡",
      say: "render",
      ns: "energy:modeler",
      with: { blocks: [{ kind: "modal.sensor.pick", nodeId, sensors }] },
    });
  });

  hear("⚡", "ui.sensor.unpick", (i, c) => {
    const nodeId = String(i?.with?.nodeId || SELECTED_ID || "");
    if (!nodeId) return;
    const sensors = getNodeSensors(nodeId);
    ctx.say({
      sym: "⚡",
      say: "render",
      ns: "energy:modeler",
      with: { blocks: [{ kind: "modal.sensor.detach", nodeId, sensors }] },
    });
  });

  // Render inicial
  render(ctx);
}

export default installGoodEnergyModeler;
