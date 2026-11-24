// src/modeler/modeler.ts
// Modelador GoodEnergy (simbiosis, sin IA obligatoria)
// - Intenciones principales: ⚡/abrir, ⚡/add-node, ⚡/connect, ⚡/simulate.step, ⚡/reset
// - Soporta sugerencias opcionales: 🧠/ideas (cuando exista un proveedor de inspiración)
// - Renderiza por bloques universales (title, toolbar, energy.graph)

import { hear } from '../utopy/symbol.bus';
import { GeScene, GeNode, rid, exampleScene } from '../goodenergy/ge.model';

// Estado local del modeler (puedes persistir en tu store si quieres)
let SCENE: GeScene = exampleScene();

// ---- helpers ---------------------------------------------------------------

const render = (ctx: any) =>
  ctx.say({
    sym: '⚡',
    say: 'render',
    ns: 'energy:modeler',
    with: {
      blocks: [
        {
          kind: 'title',
          text: `GoodEnergy — Modelador (${SCENE.meta?.mode || 'energía'})`,
        },
        {
          kind: 'toolbar',
          items: [
            {
              text: 'Add PV',
              sym: '⚡',
              say: 'add-node',
              with: { kind: 'pv', name: 'PV', params: { kwp: 3 } },
            },
            {
              text: 'Add Inverter',
              sym: '⚡',
              say: 'add-node',
              with: { kind: 'inverter', name: 'INV', params: { max_kw: 3 } },
            },
            { text: 'Panel', sym: '⚡', say: 'ui.panel.toggle' }, // mostrar/ocultar inspector (ver §6)
            { text: 'Snap 45°', sym: '⚡', say: 'snap.angles.toggle' },
            { text: 'Guardar', sym: '⚡', say: 'model.save' },
            { text: 'Cargar', sym: '⚡', say: 'model.load' },
            {
              text: 'Export STL',
              sym: '🧬',
              say: 'export',
              with: { format: 'stl' },
              ns: 'modeler',
            },
            {
              text: 'Export STEP',
              sym: '🧬',
              say: 'export',
              with: { format: 'step' },
              ns: 'modeler',
            },
            {
              text: 'Export IFC',
              sym: '🧬',
              say: 'export',
              with: { format: 'ifc' },
              ns: 'modeler',
            },
            {
              text: 'Add Battery',
              sym: '⚡',
              say: 'add-node',
              with: {
                kind: 'battery',
                name: 'BAT',
                params: { kwh: 5, soc: 50 },
              },
            },
            {
              text: 'Add Load',
              sym: '⚡',
              say: 'add-node',
              with: { kind: 'load', name: 'LOAD', params: { kw: 1.5 } },
            },
            {
              text: 'Simular +1s',
              sym: '⚡',
              say: 'simulate.step',
              with: { dt_s: 1 },
            },
            { text: 'Reset', sym: '⚡', say: 'reset' },
            // botón opcional para inspiración (si instalas un router IA más adelante)
            {
              text: 'Ideas',
              sym: '🧠',
              say: 'inspirar',
              with: {
                ns: 'energy:modeler',
                mode: 'energy',
                prompt: 'Optimizar sistema doméstico básico con PV + batería',
                scene: SCENE,
                user: 'me',
              },
            },
          ],
        },
        { kind: 'energy.graph', scene: SCENE },
      ],
    },
  });

// ---- instalación de handlers ----------------------------------------------

export function installGoodEnergyModeler(ctx: any) {
  // abrir panel principal del modeler
  hear('⚡', 'abrir', async (_i, c) => render(c));

  // agregar nodo (with = { kind, name, params?, x?, y? })
  hear('⚡', 'add-node', async (i, c) => {
    const p = i?.with || {};
    const node: GeNode = {
      id: p.id || rid(),
      kind: p.kind || 'pv',
      name: p.name || 'Nuevo',
      params: p.params || {},
      x: p.x ?? 120,
      y: p.y ?? 120,
    };
    SCENE.nodes.push(node);
    render(c);
  });

  // conectar nodos (with = { from, to })
  hear('⚡', 'connect', async (i, c) => {
    const w = i?.with || {};
    if (!w.from || !w.to) return;
    SCENE.edges.push({ id: rid(), from: w.from, to: w.to, enabled: true });
    render(c);
  });

  // alternar una arista (with = { id })
  hear('⚡', 'toggle-edge', async (i, c) => {
    const id = i?.with?.id as string;
    const e = SCENE.edges.find(e => e.id === id);
    if (e) e.enabled = !e.enabled;
    render(c);
  });

  // actualizar parámetro de un nodo (with = { nodeId, key, value })
  hear('⚡', 'set-param', async (i, c) => {
    const w = i?.with || {};
    const n = SCENE.nodes.find(n => n.id === w.nodeId);
    if (n) n.params = { ...(n.params || {}), [w.key]: w.value };
    render(c);
  });

  // preset base (escena ejemplo)
  hear('⚡', 'preset.base', async (_i, c) => {
    SCENE = exampleScene();
    render(c);
  });

  // simulación de un paso (with = { irradiance_kwm2?, tempC?, dt_s? })
  hear('⚡', 'simulate.step', async (i, c) => {
    SCENE = simulateStep(SCENE, i?.with || {});
    render(c);
  });

  // reset total
  hear('⚡', 'reset', async (_i, c) => {
    SCENE = exampleScene();
    render(c);
  });

  // Sugerencias opcionales de IA (si instalas un router que emita 🧠/ideas)
  hear('🧠', 'ideas', async (i, c) => {
    const list = (i?.with?.suggestions || []) as any[];
    let apply = false;

    for (const s of list) {
      if (s.kind === 'advice') {
        c.say({
          sym: '🧠',
          say: 'render',
          ns: 'energy:modeler',
          with: { blocks: [{ kind: 'note', text: s.text }] },
        });
      }
      if (s.kind === 'add-nodes' && Array.isArray(s.nodes)) {
        SCENE.nodes.push(...s.nodes);
        apply = true;
      }
      if (s.kind === 'add-edges' && Array.isArray(s.edges)) {
        SCENE.edges.push(...s.edges);
        apply = true;
      }
      if (s.kind === 'update' && Array.isArray(s.nodes)) {
        for (const u of s.nodes) {
          const n = SCENE.nodes.find((x: any) => x.id === u.id);
          if (n) Object.assign(n, { ...u, id: n.id });
        }
        apply = true;
      }
    }

    if (apply) {
      c.say({
        sym: '⚡',
        say: 'render',
        ns: 'energy:modeler',
        with: { blocks: [{ kind: 'energy.graph', scene: SCENE }] },
      });
    }
  });

  // en el primer attach, muestra el modeler
  render(ctx);
}

// ---- simulador simple ------------------------------------------------------

function simulateStep(
  scene: GeScene,
  env: { irradiance_kwm2?: number; tempC?: number; dt_s?: number },
): GeScene {
  const dt = Math.max(1, Number(env.dt_s ?? 1)); // segundos
  const s: GeScene = JSON.parse(JSON.stringify(scene)); // clon inmutable

  // 1) producción PV y cargas
  const irr = Math.max(0, Number(env.irradiance_kwm2 ?? 0.8)); // 0..1 aprox
  s.nodes.forEach(n => {
    if (n.kind === 'pv') {
      const kwp = Number(n.params?.kwp ?? 3);
      (n.state ||= {}).p_kw = +(kwp * irr).toFixed(3);
    }
    if (n.kind === 'load') {
      const kw = Number(n.params?.kw ?? 1.5);
      (n.state ||= {}).p_kw = +kw.toFixed(3);
    }
  });

  // 2) balance en inversores
  const byId = Object.fromEntries(s.nodes.map(n => [n.id, n]));
  const inEdges = (id: string) =>
    s.edges.filter(e => e.to === id && e.enabled !== false);
  const outEdges = (id: string) =>
    s.edges.filter(e => e.from === id && e.enabled !== false);

  s.nodes.forEach(n => {
    if (n.kind !== 'inverter') return;
    const inputs = inEdges(n.id).map(e => byId[e.from]);
    const outputs = outEdges(n.id).map(e => byId[e.to]);
    const pIn = sumKw(inputs);
    const pLoad = sumKw(outputs.filter(x => x.kind === 'load'));
    const bat = outputs.find(x => x.kind === 'battery');
    const gridFrom = inputs.find(x => x.kind === 'grid');
    const gridTo = outputs.find(x => x.kind === 'grid');

    let surplus = pIn - pLoad; // kW

    if (bat) {
      const cap = Number(bat.params?.kwh ?? 5);
      const soc = Number(bat.params?.soc ?? 50);
      const eNow = (soc / 100) * cap; // kWh
      const eNext = eNow + Math.max(-cap, Math.min(cap, surplus)) * (dt / 3600);
      const socNext = Math.max(0, Math.min(100, (eNext / cap) * 100));
      bat.params!.soc = +socNext.toFixed(2);

      if (surplus > 0 && socNext >= 99.9 && gridTo) {
        (gridTo.state ||= {}).p_kw_out = +surplus.toFixed(3);
      }
      if (surplus < 0 && gridFrom) {
        (gridFrom.state ||= {}).p_kw_in = +(-surplus).toFixed(3);
      }
    } else {
      if (surplus < 0 && gridFrom)
        (gridFrom.state ||= {}).p_kw_in = +(-surplus).toFixed(3);
      if (surplus > 0 && gridTo)
        (gridTo.state ||= {}).p_kw_out = +surplus.toFixed(3);
    }

    (n.state ||= {}).p_in_kw = +pIn.toFixed(3);
    (n.state ||= {}).p_load_kw = +pLoad.toFixed(3);
  });

  return s;
}

function sumKw(nodes: GeNode[]) {
  let sum = 0;
  for (const n of nodes) {
    if (n.kind === 'pv' || n.kind === 'load') {
      sum += Number(n.state?.p_kw ?? 0); // valores positivos
    }
  }
  return sum;
}
