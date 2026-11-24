// ==============================
// File: src/goodenergy/ui/editor.tsx
// Isométrico 2.5D — GoodEnergy (PROD)
// - Rooms perimetrales, PUERTA/VENTANA, equipos low-poly + emoji
// - Radial menu + grips (agregar sensor + reemplazar)
// - Topbar con carrusel (guardar/undo/clear/autowire/view/export/import/publish)
// - Paleta “Componentes” + Paleta contextual de reemplazo
// - PreviewTheme "night" al guardar
// - Soporte de initialTopo + onSaved
// - Compatible con EnergyCoreController:
//   ui.autowire / ui.circuit.view / model.save / model.load.request / guardar.escena
// - ✅ Fix UI_NS: manda uiNs en todos los intents para que el controller renderice donde estás mirando
// - ✅ Micelio bridge: escucha scene.import.result + scene.export.result (si vienen del core)
//   y añade botón "📡 Publish" (energy.diagram.publish) para publicar DV diagrama
// - ✅ PRO Local Persist (MMKV): auto-restore + autosave + save on background
//   - Al LIMPIAR: también borra del storage ✅
// ==============================

import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, GestureResponderEvent, ScrollView, AppState } from "react-native";
import Svg, { G, Line, Polygon, Rect, Circle, Text as SvgText, Defs, Pattern, Path, LinearGradient, Stop } from "react-native-svg";
import type { NodeSurfaceProps } from "../../utopy/ui/PortalHost";

import { IsoDefs } from "./iso/Defs";
import { IsoFloor } from "./iso/IsoFloor";
import { IsoWall } from "./iso/IsoWall";
import { IsoRoof } from "./iso/IsoRoof";
import { iso as isoXY } from "./iso/iso.utils";
import { IsoDoor } from "./iso/Isodoor";
import { IsoWindow } from "./iso/isowindow";
import { IsoComp } from "./iso/isoComp";
import { dvEnergyKindUpsert, dvEnergyWireRuleUpsert } from "../core/ge.kind.dv";
import { builtinRegistry, applyRemoteKind, applyRemoteWireRule, type Registry } from "../core/ge.kind.registry";

// ✅ PRO storage (MMKV)
// Create: src/goodenergy/core/mmkv.ts  -> export const geStorage = new MMKV({ id:"ge-mmkv" });
import { geStorage } from "../core/mmkv";

// -----------------------------
// Registry cache (solo WEB)
// -----------------------------
const LS_KINDS_KEY = (ns: string) => `ge:kinds:${ns}`;
const LS_RULES_KEY = (ns: string) => `ge:wireRules:${ns}`;

function safeLS() {
  try {
    const ls = (globalThis as any)?.localStorage;
    if (ls?.getItem && ls?.setItem) return ls as Storage;
  } catch {}
  return null;
}

function loadRegistryFromLS(ns: string): Partial<Registry> | null {
  const ls = safeLS();
  if (!ls) return null;
  try {
    const rawKinds = ls.getItem(LS_KINDS_KEY(ns));
    const rawRules = ls.getItem(LS_RULES_KEY(ns));
    const kinds = rawKinds ? JSON.parse(rawKinds) : null;
    const wireRules = rawRules ? JSON.parse(rawRules) : null;
    const out: any = {};
    if (kinds && typeof kinds === "object") out.kinds = kinds;
    if (Array.isArray(wireRules)) out.wireRules = wireRules;
    return out;
  } catch {
    return null;
  }
}

function saveRegistryToLS(ns: string, reg: Registry) {
  const ls = safeLS();
  if (!ls) return;
  try {
    ls.setItem(LS_KINDS_KEY(ns), JSON.stringify(reg.kinds || {}));
    ls.setItem(LS_RULES_KEY(ns), JSON.stringify(reg.wireRules || []));
  } catch {}
}

// -----------------------------
// ✅ PRO Local Scene Persist (MMKV)
// -----------------------------
type StoredScene = { v: 1; ts: number; topo: any };
const SCENE_KEY = (ns: string) => `ge:scene:${ns}`;

function loadScenePro(ns: string): any | null {
  try {
    const raw = geStorage.getString(SCENE_KEY(ns));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // compat: si antes guardaste directo topo
    if (parsed?.v === 1) return parsed.topo;
    return parsed;
  } catch {
    return null;
  }
}

function saveScenePro(ns: string, topo: any) {
  try {
    const payload: StoredScene = { v: 1, ts: Date.now(), topo };
    geStorage.set(SCENE_KEY(ns), JSON.stringify(payload));
  } catch {}
}

function clearScenePro(ns: string) {
  try {
    geStorage.delete(SCENE_KEY(ns));
  } catch {}
}

type Vec3 = { x: number; y: number; z?: number };
type Mode = "room" | "place" | "select";

type CompType =
  | "puerta"
  | "ventana"
  | "panel.solar"
  | "turbina.eolica"
  | "hidro"
  | "bateria"
  | "inversor"
  | "sensor"
  | "rele"
  | "personalizado"
  | `custom:${string}`
  | (string & {});

type RoomId = string;

type Room = { id: RoomId; x: number; y: number; w: number; d: number; h: number; roof: boolean };
type Comp = {
  id: string;
  kind: CompType;
  roomId: RoomId;
  attach: "floor" | "wall" | "roof";
  x: number;
  y: number;
  params?: Record<string, any>;
};
type Selected = { kind: "room"; id: string } | { kind: "comp"; id: string } | null;

// Para Home/Preview
type Topologia = { rooms: Room[]; comps: Comp[]; routes?: any[]; measurements?: any[]; references?: any[]; investigations?: any[]; availabilities?: any[]; fieldRecords?: any[]; comparisons?: any[]; meta?: Record<string, any> };

const uid = () =>
  (globalThis as any)?.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const TILE_W = 48,
  TILE_H = 24,
  H_SCALE = 22,
  GRID = 1,
  S = 22;

const snap = (n: number, g = GRID) => Math.round(n / g) * g;

function isoProject({ x, y, z = 0 }: Vec3) {
  const sx = (x - y) * (TILE_W / 2);
  const sy = (x + y) * (TILE_H / 2) - z * H_SCALE;
  return { sx, sy };
}
function screenToIso(px: number, py: number, origin: { ox: number; oy: number }) {
  const X = (py - origin.oy) / (TILE_H / 2);
  const Y = (px - origin.ox) / (TILE_W / 2);
  const xi = snap((X + Y) / 2);
  const yi = snap((X - Y) / 2);
  return { x: xi, y: yi, z: 0 };
}
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

function isCustomKind(k: string) {
  return typeof k === "string" && k.startsWith("custom:");
}

function iconFor(t: CompType, reg?: Registry) {
  const base = String(t);
  if (isCustomKind(base)) return "🧩";

  const remote = reg?.kinds?.[base];
  if (remote?.icon) return remote.icon;

  switch (base) {
    case "panel.solar":
      return "🔆";
    case "turbina.eolica":
      return "🌬️";
    case "hidro":
      return "💧";
    case "bateria":
      return "🔋";
    case "inversor":
      return "🔀";
    case "sensor":
      return "🛰️";
    case "rele":
      return "⚙️";
    case "puerta":
      return "🚪";
    case "ventana":
      return "🪟";
    case "toma": return "T";
    case "luz": return "L";
    case "interruptor": return "I";
    case "caja": return "CJ";
    case "tablero": return "TD";
    case "proteccion": return "Q";
    case "circuito": return "C";
    case "motor": return "M";
    case "actuador": return "A";
    case "contacto": return "K";
    case "bornera": return "X";
    default:
      return "🧩";
  }
}

function defaultAttachFor(kind: CompType, reg?: Registry): Comp["attach"] {
  const k = String(kind);
  const remote = reg?.kinds?.[k];
  const a = remote?.attach;
  if (Array.isArray(a) && a.length) {
    if (a.includes("roof")) return "roof";
    if (a.includes("wall")) return "wall";
    return "floor";
  }
  if (k === "panel.solar") return "roof";
  if (["inversor", "rele", "sensor", "puerta", "ventana", "toma", "interruptor", "caja", "tablero", "proteccion", "circuito", "actuador", "contacto", "bornera"].includes(k)) return "wall";
  if (k === "luz") return "roof";
  return "floor";
}

function serialize(rooms: Room[], comps: Comp[], extras: Partial<Topologia> = {}) {
  const ids = new Set(comps.map(c => c.id));
  return { ...extras, rooms, comps, routes: (extras.routes || []).filter(r => ids.has(r.from) && ids.has(r.to)) };
}

export type Iso25DEditorProps = {
  ns: string;
  onEmit: NodeSurfaceProps["onEmit"];
  onClose: () => void;
  width?: number;
  height?: number;
  initialTopo?: Topologia | null;
  onSaved?: (topo: Topologia, theme: "day" | "night") => void;
};

export default function Iso25DEditor({
  ns,
  onEmit,
  onClose,
  width = 360,
  height = 640,
  initialTopo = null,
  onSaved,
}: Iso25DEditorProps) {
  const [mode, setMode] = useState<Mode>("room");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [comps, setComps] = useState<Comp[]>([]);
  const extrasRef = useRef<Partial<Topologia>>({});
  const [placeType, setPlaceType] = useState<CompType>("puerta");

  const [selected, setSelected] = useState<Selected>(null);
  const [radialOpen, setRadialOpen] = useState(false);
  const [radialXY, setRadialXY] = useState({ x: 0, y: 0 });

  // Paleta contextual de reemplazo
  const [replaceOpen, setReplaceOpen] = useState(false);

  const [roomDraftStart, setRoomDraftStart] = useState<Vec3 | null>(null);

  const origin = useMemo(() => ({ ox: width / 2, oy: 120 }), [width]);

  const [registry, setRegistry] = useState<Registry>(() => {
    const base = builtinRegistry();
    const cached = loadRegistryFromLS(ns);
    return {
      kinds: { ...base.kinds, ...(cached?.kinds || {}) },
      wireRules: [...base.wireRules, ...((cached?.wireRules as any[]) || [])],
    };
  });
  useEffect(() => {
    saveRegistryToLS(ns, registry);
  }, [ns, registry]);

  // -----------------------------
  // ✅ UI_NS FIX: siempre mandamos uiNs al controller
  // -----------------------------
  const uiNs = ns; // el editor está “mirando” este ns
  const emit = useCallback(
    (sym: string, say: string, withPayload?: any) => {
      const w =
        withPayload && typeof withPayload === "object"
          ? withPayload
          : withPayload === undefined
          ? {}
          : { value: withPayload };
      onEmit(sym as any, say as any, { ...w, uiNs });
    },
    [onEmit, uiNs]
  );

  // Undo snapshot
  const [lastSnap, setLastSnap] = useState<null | { rooms: Room[]; comps: Comp[] }>(null);
  const snapNow = useCallback(
    () => setLastSnap({ rooms: JSON.parse(JSON.stringify(rooms)), comps: JSON.parse(JSON.stringify(comps)) }),
    [rooms, comps]
  );
  const undo = useCallback(() => {
    if (!lastSnap) return;
    setRooms(lastSnap.rooms);
    setComps(lastSnap.comps);
    setLastSnap(null);
  }, [lastSnap]);

  // -----------------------------
  // ✅ PRO: Hidratación inicial (initialTopo > MMKV) (solo 1 vez)
  // -----------------------------
  const didHydrate = useRef(false);
  useEffect(() => {
    if (didHydrate.current) return;

    if (initialTopo) {
      setRooms((initialTopo as any).rooms ?? []);
      setComps((initialTopo as any).comps ?? []);
      extrasRef.current = { routes: initialTopo.routes, measurements: initialTopo.measurements, references: initialTopo.references, investigations: initialTopo.investigations, availabilities: initialTopo.availabilities, fieldRecords: initialTopo.fieldRecords, comparisons: initialTopo.comparisons, meta: initialTopo.meta };
      didHydrate.current = true;
      return;
    }

    const saved = loadScenePro(ns);
    const topo = saved?.topo ?? saved;
    const roomsIn = topo?.rooms ?? null;
    const compsIn = topo?.comps ?? null;

    if (Array.isArray(roomsIn) && Array.isArray(compsIn)) {
      setRooms(roomsIn);
      setComps(compsIn);
      extrasRef.current = { routes: topo.routes, measurements: topo.measurements, references: topo.references, investigations: topo.investigations, availabilities: topo.availabilities, fieldRecords: topo.fieldRecords, comparisons: topo.comparisons, meta: topo.meta };
    }

    didHydrate.current = true;
  }, [ns, initialTopo]);

  // -----------------------------
  // ✅ PRO: Auto-save (micro debounce)
  // - Importante: no guardar “vacío” antes de hidratar
  // - Si quedás en vacío por limpiar, igual se borra (ver clearAll)
  // -----------------------------
  const lastSavedHash = useRef<string>("");

  useEffect(() => {
    if (!didHydrate.current) return;

    const t = setTimeout(() => {
      const topo = serialize(rooms, comps, extrasRef.current);
      const raw = JSON.stringify(topo);
      // evita writes repetidos
      if (raw === lastSavedHash.current) return;
      lastSavedHash.current = raw;

      // si está vacío, no guardamos “vacío” (porque clearAll ya borra el key)
      if (!rooms.length && !comps.length) return;

      saveScenePro(ns, topo);
    }, 120);

    return () => clearTimeout(t);
  }, [ns, rooms, comps]);

  // -----------------------------
  // ✅ PRO: Guardar al background (y no perder cambios)
  // -----------------------------
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "background" || st === "inactive") {
        // si está vacío, no guardamos: clearAll borra storage
        if (!rooms.length && !comps.length) return;
        saveScenePro(ns, serialize(rooms, comps, extrasRef.current));
      }
    });
    return () => sub.remove();
  }, [ns, rooms, comps]);

  // ✅ escuchar mensajes del core (import/export result) para hidratar UI
  useEffect(() => {
    const g: any = globalThis as any;
    const handler = (msg: any) => {
      const dv = msg?.dv || msg;
      if (dv?.kind === "energy.kind") {
        setRegistry((cur) => applyRemoteKind(cur, dv));
        return;
      }
      if (dv?.kind === "energy.wire.rule") {
        setRegistry((cur) => applyRemoteWireRule(cur, dv));
        return;
      }

      const i = msg?.payload || msg;
      if (!i || i.sym !== "⚡") return;

      const msgNs = i.ns;
      const hintedUiNs = i?.with?.uiNs;
      if (msgNs !== ns && hintedUiNs !== ns) return;

      if (i.say === "scene.import.result" || i.say === "scene.export.result") {
        const json = i?.with?.json;
        const parsed = typeof json === "string" ? safeParse(json) : json;
        const topo = parsed?.topo ?? parsed;
        const roomsIn = topo?.rooms ?? topo?.topologia?.rooms ?? null;
        const compsIn = topo?.comps ?? topo?.topologia?.comps ?? null;

        if (Array.isArray(roomsIn) && Array.isArray(compsIn)) {
          snapNow();
          setRooms(roomsIn);
          setComps(compsIn);
          extrasRef.current = { routes: topo.routes, measurements: topo.measurements, references: topo.references, investigations: topo.investigations, availabilities: topo.availabilities, fieldRecords: topo.fieldRecords, comparisons: topo.comparisons, meta: topo.meta };

          // ✅ PRO: persistimos inmediatamente lo importado/exportado
          const imported = serialize(roomsIn, compsIn, extrasRef.current);
          saveScenePro(ns, imported);
          lastSavedHash.current = JSON.stringify(imported);

          setSelected(null);
          setRadialOpen(false);
          setReplaceOpen(false);
        }
      }

      if (i.say === "ui.toast" && i?.with?.text) {
        try {
          console.log("[GE UI toast]", i.with.text);
        } catch {}
      }
    };

    if (typeof g.__UTOPY_ON_INTENT__ === "function") {
      const off = g.__UTOPY_ON_INTENT__(handler);
      return () => {
        try {
          off?.();
        } catch {}
      };
    }
    return;
  }, [ns, snapNow]);

  function safeParse(s: any) {
    try {
      return JSON.parse(String(s));
    } catch {
      return null;
    }
  }

  // ======= Eventos ======= //
  function onCanvasPress(e: GestureResponderEvent) {
    const { locationX, locationY } = e.nativeEvent;
    const p = screenToIso(locationX, locationY, origin);

    if (replaceOpen) setReplaceOpen(false);

    if (mode === "select") {
      const hit = hitSelect(p);
      setSelected(hit);
      setRadialXY({ x: locationX, y: locationY - 56 });
      setRadialOpen(!!hit);
      return;
    }

    if (mode === "room") {
      setRadialOpen(false);
      if (!roomDraftStart) {
        setRoomDraftStart(p);
      } else {
        snapNow();
        const x0 = Math.min(roomDraftStart.x, p.x);
        const y0 = Math.min(roomDraftStart.y, p.y);
        const w = Math.max(1, Math.abs(p.x - roomDraftStart.x));
        const d = Math.max(1, Math.abs(p.y - roomDraftStart.y));
        const r: Room = { id: uid(), x: x0, y: y0, w, d, h: 3, roof: true };
        setRooms((rs) => [...rs, r]);
        setSelected({ kind: "room", id: r.id });
        setRoomDraftStart(null);
      }
      return;
    }

    if (mode === "place") {
      setRadialOpen(false);
      const r = roomAtPoint(rooms, p);
      if (!r) return;
      snapNow();
      const localX = clamp(p.x - r.x, 0, r.w);
      const localY = clamp(p.y - r.y, 0, r.d);
      const attach = defaultAttachFor(placeType, registry);
      const finalAttach: Comp["attach"] = attach === "roof" && !r.roof ? "floor" : attach;
      const c: Comp = { id: uid(), kind: placeType, roomId: r.id, attach: finalAttach, x: snap(localX), y: snap(localY) };
      setComps((cs) => [...cs, c]);
      setSelected({ kind: "comp", id: c.id });
      setRadialXY({ x: locationX, y: locationY - 56 });
      setRadialOpen(true);
      return;
    }
  }

  function roomAtPoint(list: Room[], p: Vec3): Room | null {
    for (const r of list) if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.d) return r;
    return null;
  }
  function hitSelect(p: Vec3): Selected {
    const r = roomAtPoint(rooms, p);
    if (r) {
      const localX = p.x - r.x,
        localY = p.y - r.y;
      for (const c of comps) {
        if (c.roomId !== r.id) continue;
        if (Math.abs(c.x - localX) <= 0.6 && Math.abs(c.y - localY) <= 0.6) return { kind: "comp", id: c.id };
      }
      return { kind: "room", id: r.id };
    }
    return null;
  }

  function toggleRoof(roomId: RoomId) {
    snapNow();
    setRooms((rs) => rs.map((r) => (r.id === roomId ? { ...r, roof: !r.roof } : r)));
  }

  function nudgeRoom(rid: RoomId, edge: "left" | "right" | "top" | "bottom", delta: number) {
    snapNow();
    setRooms((rs) =>
      rs.map((r) => {
        if (r.id !== rid) return r;
        let { x, y, w, d } = r;
        if (edge === "left") {
          x = x - delta;
          w = w + delta;
        }
        if (edge === "right") w = Math.max(1, w + delta);
        if (edge === "top") {
          y = y - delta;
          d = d + delta;
        }
        if (edge === "bottom") d = Math.max(1, d + delta);
        if (w < 1) {
          x = x + (1 - w);
          w = 1;
        }
        if (d < 1) {
          y = y + (1 - d);
          d = 1;
        }
        return { ...r, x: snap(x), y: snap(y), w: snap(w), d: snap(d) };
      })
    );
  }

  function deleteSelected() {
    if (!selected) return;
    snapNow();
    if (selected.kind === "comp") setComps((cs) => cs.filter((c) => c.id !== selected.id));
    else if (selected.kind === "room") {
      const rid = selected.id;
      setComps((cs) => cs.filter((c) => c.roomId !== rid));
      setRooms((rs) => rs.filter((r) => r.id !== rid));
    }
    setSelected(null);
    setRadialOpen(false);
    setReplaceOpen(false);
  }

  function openReplace() {
    if (!selected) return;
    setReplaceOpen(true);
  }

  function replaceSelectedWith(kind: CompType) {
    if (!selected) return;
    if (selected.kind === "comp") {
      snapNow();
      setComps((cs) =>
        cs.map((c) => {
          if (c.id !== selected.id) return c;
          const nextAttach = defaultAttachFor(kind, registry);
          return { ...c, kind, attach: nextAttach };
        })
      );
      setReplaceOpen(false);
    } else {
      const rid = selected.id;
      snapNow();
      setRooms((rs) =>
        rs.map((r) => {
          if (r.id !== rid) return r;
          if (kind === "puerta") return { ...r, w: Math.max(2, r.w - 1), d: Math.max(2, r.d - 1) };
          if (kind === "ventana") return { ...r, w: r.w + 1, d: r.d + 1 };
          return { ...r, w: r.w + 2, d: r.d + 2 };
        })
      );
      setReplaceOpen(false);
    }
  }

  function addSensorToSelected() {
    if (!selected || selected.kind !== "comp") return;
    const base = comps.find((c) => c.id === selected.id);
    if (!base) return;
    const r = rooms.find((rr) => rr.id === base.roomId);
    if (!r) return;

    snapNow();
    const sensor: Comp = {
      id: uid(),
      kind: "sensor",
      roomId: base.roomId,
      attach: base.attach === "roof" ? "roof" : "wall",
      x: clamp(base.x + 1, 0, r.w),
      y: base.y,
    };
    setComps((cs) => [...cs, sensor]);
    setRadialOpen(false);
  }

  function createPersonalizadoAndReplace() {
    if (!selected) return;
    const newKind = `custom:${uid()}`;

    if (selected.kind === "comp") {
      snapNow();
      setComps((cs) => cs.map((c) => (c.id === selected.id ? { ...c, kind: newKind as any } : c)));
      setReplaceOpen(false);
    } else {
      replaceSelectedWith("personalizado");
    }
  }

  // ✅ LIMPIAR: borra UI + borra storage (lo pediste)
  function clearAll() {
    if (rooms.length || comps.length) snapNow();

    // ✅ borrar persistencia local
    clearScenePro(ns);
    lastSavedHash.current = ""; // resetea dedupe

    setRooms([]);
    setComps([]);
    extrasRef.current = {};
    setSelected(null);
    setRoomDraftStart(null);
    setRadialOpen(false);
    setReplaceOpen(false);
  }

  function saveScene() {
    const topo = serialize(rooms, comps, extrasRef.current);

    // ✅ PRO: guardar local también al “Guardar”
    if (rooms.length || comps.length) {
      saveScenePro(ns, topo);
      lastSavedHash.current = JSON.stringify(topo);
    } else {
      // si guardás vacío, borramos la key (coherente)
      clearScenePro(ns);
      lastSavedHash.current = "";
    }

    const theme: "day" | "night" = "night";
    onSaved?.(topo as any, theme);

    emit("⚡", "guardar.escena", { topologia: topo, meta: { previewTheme: theme } });
    emit("⚡", "ui.preview.theme", { theme });
  }

  // Compat con controller: autowire y ver circuito
  function doAutowire() {
    emit("⚡", "ui.autowire", {});
  }

  function addKindQuick() {
    const title = (globalThis as any)?.prompt?.("Nombre del nuevo componente (kind)") || "";
    const cleanTitle = String(title).trim();
    if (!cleanTitle) return;

    const kindId = `custom:${cleanTitle.toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9\.\-_]/g, "")}`;

    const dv = dvEnergyKindUpsert({
      kindId,
      title: cleanTitle,
      icon: "🧩",
      attach: ["floor", "wall", "roof"],
      ports: [{ id: "sig", role: "out", type: "sig" }],
      official: false,
      scopes: ["public"],
      ttl_ms: 30 * 24 * 60 * 60 * 1000,
      by: "ge:editor",
    });

    emit("⚡", "energy.kind.publish", { dv });
    setRegistry((cur) => applyRemoteKind(cur, dv));
  }

  function viewCircuit() {
    emit("⚡", "ui.circuit.view", {});
  }

  function publishDiagram() {
    emit("⚡", "energy.diagram.publish", { title: "Circuito derivado (manual)" });
  }

  function exportJSON() {
    const json = JSON.stringify(serialize(rooms, comps, extrasRef.current));
    emit("⚡", "model.save", { json });
  }

  function importJSON() {
    emit("⚡", "model.load.request", {});
  }

  function placeAt(ox: number, oy: number, inner: React.ReactNode, z = 0) {
    const t = isoXY(ox, oy, z, S);
    return <G transform={`translate(${origin.ox + t.x}, ${origin.oy + t.y})`}>{inner}</G>;
  }

  function rectIsoPoints(x: number, y: number, w: number, d: number, z = 0) {
    const A = isoXY(x, y, z, S),
      B = isoXY(x + w, y, z, S),
      C = isoXY(x + w, y + d, z, S),
      D = isoXY(x, y + d, z, S);
    return [
      `${origin.ox + A.x},${origin.oy + A.y}`,
      `${origin.ox + B.x},${origin.oy + B.y}`,
      `${origin.ox + C.x},${origin.oy + C.y}`,
      `${origin.ox + D.x},${origin.oy + D.y}`,
    ].join(" ");
  }

  function drawRoom(r: Room) {
    const keyBase = `room-${r.id}`;
    const floor = (
      <G key={`${keyBase}-floor`}>
        <Polygon points={rectIsoPoints(r.x, r.y, r.w, r.d, 0)} fill="url(#floorAO)" opacity={0.6} />
        {placeAt(r.x, r.y, <IsoFloor w={r.w} d={r.d} s={S} />)}
        <Polygon
          points={rectIsoPoints(r.x, r.y, r.w, r.d, 0)}
          fill="none"
          stroke={selected?.kind === "room" && selected.id === r.id ? "#3a6cff" : "#c7d2e4"}
          strokeWidth={selected?.kind === "room" && selected.id === r.id ? 2 : 1}
          opacity={selected?.kind === "room" && selected.id === r.id ? 0.9 : 0.7}
        />
      </G>
    );
    const walls = (
      <G key={`${keyBase}-walls`}>
        {placeAt(r.x, r.y, <IsoWall len={r.w} h={r.h} thick={0.12} dir="x" s={S} />)}
        {placeAt(r.x, r.y + r.d, <IsoWall len={r.w} h={r.h} thick={0.12} dir="x" s={S} />)}
        {placeAt(r.x, r.y, <IsoWall len={r.d} h={r.h} thick={0.12} dir="y" s={S} />)}
        {placeAt(r.x + r.w, r.y, <IsoWall len={r.d} h={r.h} thick={0.12} dir="y" s={S} />)}
      </G>
    );
    const corners = (
      <G key={`${keyBase}-corners`} opacity={0.9}>
        {[
          [r.x, r.y],
          [r.x + r.w, r.y],
          [r.x + r.w, r.y + r.d],
          [r.x, r.y + r.d],
        ].map(([cx, cy], idx) => {
          const P = isoXY(cx, cy, 0, S);
          return <Circle key={`${keyBase}-corner-${idx}`} cx={origin.ox + P.x} cy={origin.oy + P.y} r={3} fill="#0b1728" opacity={0.22} />;
        })}
      </G>
    );
    const roof = r.roof ? (
      <G key={`${keyBase}-roof`}>
        {placeAt(r.x, r.y, <IsoRoof w={r.w} d={r.d} z={0} s={S} />, r.h)}
        <Polygon points={rectIsoPoints(r.x, r.y, r.w, r.d, r.h)} fill="url(#roofGlass)" stroke="#9fb8df" strokeWidth={1} opacity={0.88} />
      </G>
    ) : null;

    const grips =
      selected?.kind === "room" && selected.id === r.id
        ? (() => {
            const A = isoXY(r.x, r.y, 0, S),
              B = isoXY(r.x + r.w, r.y, 0, S),
              C = isoXY(r.x + r.w, r.y + r.d, 0, S),
              D = isoXY(r.x, r.y + r.d, 0, S);
            const midTop = { x: (origin.ox + A.x + origin.ox + B.x) / 2, y: (origin.oy + A.y + origin.oy + B.y) / 2 };
            const midRight = { x: (origin.ox + B.x + origin.ox + C.x) / 2, y: (origin.oy + B.y + origin.oy + C.y) / 2 };
            const midBottom = { x: (origin.ox + C.x + origin.ox + D.x) / 2, y: (origin.oy + C.y + origin.oy + D.y) / 2 };
            const midLeft = { x: (origin.ox + D.x + origin.ox + A.x) / 2, y: (origin.oy + D.y + origin.oy + A.y) / 2 };
            return (
              <G key={`${keyBase}-grips`}>
                <EdgeGrip x={midLeft.x} y={midLeft.y} onPlus={() => nudgeRoom(r.id, "left", +1)} onMinus={() => nudgeRoom(r.id, "left", -1)} />
                <EdgeGrip x={midRight.x} y={midRight.y} onPlus={() => nudgeRoom(r.id, "right", +1)} onMinus={() => nudgeRoom(r.id, "right", -1)} />
                <EdgeGrip x={midTop.x} y={midTop.y} onPlus={() => nudgeRoom(r.id, "top", +1)} onMinus={() => nudgeRoom(r.id, "top", -1)} />
                <EdgeGrip x={midBottom.x} y={midBottom.y} onPlus={() => nudgeRoom(r.id, "bottom", +1)} onMinus={() => nudgeRoom(r.id, "bottom", -1)} />
              </G>
            );
          })()
        : null;

    return [floor, walls, corners, roof, grips].filter(Boolean) as any;
  }

  function nearestWallDir(r: Room, localX: number, localY: number): { dir: "x" | "y"; ox: number; oy: number } {
    const distLeft = localX,
      distRight = r.w - localX,
      distTop = localY,
      distBottom = r.d - localY;
    const min = Math.min(distLeft, distRight, distTop, distBottom);
    if (min === distLeft) return { dir: "y", ox: r.x, oy: r.y };
    if (min === distRight) return { dir: "y", ox: r.x + r.w, oy: r.y };
    if (min === distTop) return { dir: "x", ox: r.x, oy: r.y };
    return { dir: "x", ox: r.x, oy: r.y + r.d };
  }

  function drawComp(c: Comp) {
    const r = rooms.find((rr) => rr.id === c.roomId);
    if (!r) return null;

    const wx = r.x + c.x,
      wy = r.y + c.y;
    let dir: "x" | "y" = "x";
    let worldX = wx,
      worldY = wy,
      z = 0;

    if (c.attach === "roof") z = r.h;
    else if (c.attach === "wall") {
      const near = nearestWallDir(r, c.x, c.y);
      dir = near.dir;
      if (dir === "x") {
        const useTop = Math.abs(c.y - 0) <= Math.abs(r.d - c.y);
        worldY = useTop ? r.y : r.y + r.d;
      } else {
        const useLeft = Math.abs(c.x - 0) <= Math.abs(r.w - c.x);
        worldX = useLeft ? r.x : r.x + r.w;
      }
    }
    if (String(c.kind) === "ventana") z = Math.max(z, r.h * 0.6);
    if (String(c.kind) === "puerta") z = 0;

    const P = isoXY(worldX, worldY, z, S);
    const isSel = selected?.kind === "comp" && selected.id === c.id;

    if (String(c.kind) === "puerta")
      return (
        <G key={`comp-${c.id}`} transform={`translate(${origin.ox + P.x}, ${origin.oy + P.y})`}>
          <IsoDoor w={0.9} h={2.1} dir={dir} s={S} />
          {isSel && <Rect x={-12} y={-12} width={24} height={24} fill="none" stroke="#3a6cff" strokeWidth={1.5} />}
        </G>
      );

    if (String(c.kind) === "ventana")
      return (
        <G key={`comp-${c.id}`} transform={`translate(${origin.ox + P.x}, ${origin.oy + P.y})`}>
          <IsoWindow w={1.2} h={1.0} dir={dir} s={S} />
          {isSel && <Rect x={-12} y={-12} width={24} height={24} fill="none" stroke="#3a6cff" strokeWidth={1.5} />}
        </G>
      );

    return (
      <G key={`comp-${c.id}`} transform={`translate(${origin.ox + P.x}, ${origin.oy + P.y})`}>
        <IsoComp kind={String(c.kind)} dir={dir} s={S} emoji={iconFor(c.kind, registry)} />
        {isSel && <Rect x={-12} y={-12} width={24} height={24} fill="none" stroke="#3a6cff" strokeWidth={1.5} />}
      </G>
    );
  }

  const paletteKinds = useMemo(() => {
    const keys = Object.keys(registry?.kinds || {});
    keys.sort((a, b) => a.localeCompare(b));
    return [...new Set([...keys, "toma", "luz", "interruptor", "caja", "tablero", "proteccion", "circuito", "motor", "sensor", "actuador", "contacto", "bornera", "personalizado"])] as CompType[];
  }, [registry]);

  const replaceKinds = useMemo(() => paletteKinds.slice(0, 10), [paletteKinds]);

  // ===== UI ===== //
  return (
    <View style={s.root}>
      {/* TOPBAR: carrusel de acciones */}
      <View style={s.toolbar} pointerEvents="box-none">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.toolbarRow}>
          <IconBtn label="💾" hint="Guardar" onPress={(e) => { e.stopPropagation?.(); saveScene(); }} />
          <IconBtn label="↩️" hint="Deshacer" onPress={(e) => { e.stopPropagation?.(); undo(); }} />
          <IconBtn label="🧹" hint="Limpiar" onPress={(e) => { e.stopPropagation?.(); clearAll(); }} />
          <IconBtn label="🧠" hint="Auto-wire" onPress={(e) => { e.stopPropagation?.(); doAutowire(); }} />
          <IconBtn label="➕🧩" hint="Add kind" onPress={(e) => { e.stopPropagation?.(); addKindQuick(); }} />
          <IconBtn label="🔌" hint="Ver circuito" onPress={(e) => { e.stopPropagation?.(); viewCircuit(); }} />
          <IconBtn label="📡" hint="Publish" onPress={(e) => { e.stopPropagation?.(); publishDiagram(); }} />
          <IconBtn label="⬇️" hint="Exportar" onPress={(e) => { e.stopPropagation?.(); exportJSON(); }} />
          <IconBtn label="⬆️" hint="Importar" onPress={(e) => { e.stopPropagation?.(); importJSON(); }} />
          <IconBtn label="✖️" hint="Cerrar" onPress={(e) => { e.stopPropagation?.(); saveScene(); onClose(); }} />
        </ScrollView>
      </View>

      {/* Canvas */}
      <Svg width={width} height={height} onPress={radialOpen ? undefined : onCanvasPress}>
        <IsoDefs />
        <Defs>
          <LinearGradient id="floorAO" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#a8b7cc" stopOpacity="0.08" />
            <Stop offset="1" stopColor="#8797b0" stopOpacity="0.06" />
          </LinearGradient>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#f8fbff" stopOpacity="1" />
            <Stop offset="1" stopColor="#f1f6fd" stopOpacity="1" />
          </LinearGradient>
          <Pattern id="roofHatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(30)">
            <Path d="M0 0 L0 8" stroke="#8fb2e6" strokeWidth="0.6" opacity="0.35" />
          </Pattern>
          <LinearGradient id="roofTint" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#d9e7ff" stopOpacity="0.55" />
            <Stop offset="1" stopColor="#c7dbff" stopOpacity="0.45" />
          </LinearGradient>
        </Defs>

        <Rect x={0} y={0} width={width} height={height} fill="url(#sky)" />

        {/* grid iso */}
        <G opacity={0.16}>
          {Array.from({ length: 30 }).map((_, i) => (
            <Line
              key={`g1-${i}`}
              x1={(i - 5) * TILE_W}
              y1={0}
              x2={(i - 5) * TILE_W + height * 2}
              y2={height}
              stroke="#dfe7f3"
              strokeWidth={1}
              transform={`translate(${origin.ox},${origin.oy}) rotate(30)`}
            />
          ))}
          {Array.from({ length: 30 }).map((_, i) => (
            <Line
              key={`g2-${i}`}
              x1={(i - 5) * TILE_W}
              y1={0}
              x2={(i - 5) * TILE_W + height * 2}
              y2={height}
              stroke="#dfe7f3"
              strokeWidth={1}
              transform={`translate(${origin.ox},${origin.oy}) rotate(-30)`}
            />
          ))}
        </G>

        {/* Draft room start */}
        {roomDraftStart && (
          <G key="room-draft">
            <Circle cx={origin.ox + isoProject(roomDraftStart).sx} cy={origin.oy + isoProject(roomDraftStart).sy} r={5} fill="#3a6cff" opacity={0.8} />
            <SvgText x={origin.ox + isoProject(roomDraftStart).sx + 10} y={origin.oy + isoProject(roomDraftStart).sy - 8} fontSize={11} fill="#3a6cff">
              Esquina A
            </SvgText>
          </G>
        )}

        {/* Rooms */}
        {rooms.map((r) => (
          <G key={`roomwrap-${r.id}`}>{drawRoom(r)}</G>
        ))}

        {/* Components */}
        {comps.map(drawComp)}

        {/* Radial menu */}
        {radialOpen && selected && (
          <G transform={`translate(${radialXY.x - 28}, ${radialXY.y - 28})`}>
            <RadialBtn key="replace" label="🔁" onPress={() => openReplace()} />
            <RadialBtn key="delete" label="🗑️" angle={90} onPress={deleteSelected} />
            {selected.kind === "comp" && <RadialBtn key="sensor" label="🛰️" angle={180} onPress={addSensorToSelected} />}
            {selected.kind === "room" && (
              <RadialBtn
                key="roof"
                label="🏠"
                angle={180}
                onPress={() => {
                  toggleRoof(selected.id as RoomId);
                  setRadialOpen(false);
                }}
              />
            )}
          </G>
        )}

        {/* Paleta contextual REEMPLAZAR */}
        {replaceOpen && selected && (
          <G transform={`translate(${radialXY.x + 40}, ${radialXY.y - 40})`} opacity={0.98}>
            <Rect x={-8} y={-8} width={200} height={64} rx={10} ry={10} fill="#0e1521" stroke="#253245" />
            <G transform="translate(0,0)">
              {replaceKinds.map((t, ix) => (
                <G key={`rp-${t}`} transform={`translate(${(ix % 5) * 38}, ${Math.floor(ix / 5) * 32})`}>
                  <Rect
                    x={0}
                    y={0}
                    width={34}
                    height={28}
                    rx={8}
                    ry={8}
                    fill="#121a26"
                    stroke="#24374f"
                    onPress={() => {
                      if (t === "personalizado") createPersonalizadoAndReplace();
                      else replaceSelectedWith(t);
                    }}
                  />
                  <SvgText x={17} y={19} fontSize={14} textAnchor="middle" fill="#eaf2ff">
                    {iconFor(t, registry)}
                  </SvgText>
                </G>
              ))}
            </G>
          </G>
        )}

        {/* Brújula mini */}
        <G transform={`translate(${width - 64}, ${42})`} opacity={0.6}>
          <Circle cx={0} cy={0} r={16} fill="#ffffff" stroke="#c7d2e4" />
          <Path d="M0 -10 L6 10 L0 6 L-6 10 Z" fill="#3a6cff" />
          <SvgText x={0} y={30} fontSize={10} textAnchor="middle" fill="#6c7b91">
            iso
          </SvgText>
        </G>

        {/* Techo glass material */}
        <Defs>
          <Pattern id="roofGlass" patternUnits="userSpaceOnUse" width="8" height="8">
            <Rect x="0" y="0" width="8" height="8" fill="url(#roofTint)" />
            <Rect x="0" y="0" width="8" height="8" fill="url(#roofHatch)" />
          </Pattern>
        </Defs>
      </Svg>

      {/* Barra de MODOS */}
      <View style={s.footer} pointerEvents="box-none">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.footerRow}>
          <FooterButton
            label="Cuarto"
            active={mode === "room"}
            onPress={() => {
              setMode("room");
              setRadialOpen(false);
              setReplaceOpen(false);
            }}
          />
          <FooterButton
            label="Componentes"
            active={mode === "place"}
            onPress={() => {
              setPlaceType("puerta");
              setMode("place");
              setRadialOpen(false);
              setReplaceOpen(false);
            }}
          />
          <FooterButton
            label="Seleccionar"
            active={mode === "select"}
            onPress={() => {
              setMode("select");
              setReplaceOpen(false);
            }}
          />
        </ScrollView>
      </View>

      {/* Paleta de COMPONENTES */}
      <View style={s.footer2} pointerEvents="box-none">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.footerRow}>
          {paletteKinds.map((t) => (
            <TouchableOpacity
              key={`pill-${t}`}
              style={[s.pill, placeType === t && s.pillActive]}
              onPress={(e) => {
                e.stopPropagation?.();
                setPlaceType(t);
                setMode("place");
                setRadialOpen(false);
                setReplaceOpen(false);
              }}
            >
              <Text style={s.pillTxt}>{iconFor(t, registry)}</Text>
              <Text style={s.pillLabel} numberOfLines={1}>{String(t).replace("panel.solar", "solar")}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

// ===== UI bits =====
function FooterButton({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={(e: any) => {
        e.stopPropagation?.();
        onPress();
      }}
      style={[s.fBtn, active && s.fBtnActive]}
    >
      <Text style={s.fBtnTxt}>{label}</Text>
    </TouchableOpacity>
  );
}

function EdgeGrip({ x, y, onPlus, onMinus }: { x: number; y: number; onPlus: () => void; onMinus: () => void }) {
  return (
    <G>
      <Circle cx={x} cy={y} r={10} fill="#ffffff" stroke="#c7d2e4" />
      <SvgText x={x} y={y + 4} fontSize={12} textAnchor="middle" fill="#3a6cff">
        ⇔
      </SvgText>
      <Rect x={x - 20} y={y - 20} width={18} height={18} fill="transparent" onPress={onMinus as any} />
      <Rect x={x + 2} y={y - 20} width={18} height={18} fill="transparent" onPress={onPlus as any} />
    </G>
  );
}

function RadialBtn({ label, onPress, angle = 0 }: { label: string; onPress: () => void; angle?: number }) {
  const r = 48;
  const rad = (angle * Math.PI) / 180;
  const x = Math.cos(rad) * r;
  const y = Math.sin(rad) * r;
  return (
    <G>
      <Circle cx={28 + x} cy={28 + y} r={16} fill="#e9eef5" stroke="#c9d4e1" />
      <SvgText x={28 + x} y={28 + y + 4} fontSize={14} textAnchor="middle">
        {label}
      </SvgText>
      <Rect onPress={onPress as any} x={28 + x - 16} y={28 + y - 16} width={32} height={32} fill="transparent" />
    </G>
  );
}

function IconBtn({ label, onPress, hint }: { label: string; onPress: (e: any) => void; hint?: string }) {
  return (
    <TouchableOpacity onPress={onPress} style={s.iconBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      <Text style={s.iconTxt}>{label}</Text>
      {!!hint && <Text style={s.iconHint}>{hint}</Text>}
    </TouchableOpacity>
  );
}


// ===== Estilos =====
const s = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: "#ffffff" },

  toolbar: { position: "absolute", top: 10, left: 10, right: 10, zIndex: 10 },
  toolbarRow: { paddingHorizontal: 0, gap: 8, alignItems: "center" },

  iconBtn: {
    backgroundColor: "rgba(15,20,26,0.92)",
    borderColor: "#1f2b3b",
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  iconTxt: { color: "#e9eef5", fontSize: 16 },
  iconHint: { color: "#9bb", fontSize: 10, marginTop: 2 },

  footer: { position: "absolute", left: 0, right: 0, bottom: 92, zIndex: 9, paddingVertical: 6 },
  footerRow: { paddingHorizontal: 10, gap: 8, alignItems: "center" },

  fBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: "#111724", borderWidth: 1, borderColor: "#1f2b3b" },
  fBtnActive: { backgroundColor: "#18222c" },
  fBtnTxt: { color: "#d7e4f3", fontWeight: "700" },

  footer2: { position: "absolute", left: 0, right: 0, bottom: 42, zIndex: 9, paddingVertical: 6 },

  pill: {
    width: 74,
    height: 49,
    borderRadius: 12,
    backgroundColor: "#111724",
    borderWidth: 1,
    borderColor: "#1f2b3b",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 2,
  },
  pillActive: { backgroundColor: "#18222c" },
  pillTxt: { color: "#fff", fontSize: 16 },
  pillLabel: { color: "#B8C9CC", fontSize: 9, marginTop: 1, maxWidth: 66 },
});
