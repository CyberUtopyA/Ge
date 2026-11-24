// ==============================
// File: src/utopy/ui/PortalHost.tsx
// UPortal opcional + Registro de renderers
// - Si mountPortal = false, NO se suscribe a intents "render"
// - energy:modeler: básicos (preview/text/stats/botón editar)
// - energy:core: note + title + toolbar + viewer (energy.graph / energy.viewport)
// ==============================
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, ViewProps, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { spore } from "../spore";
// arriba de todo:
import Svg, { Line as SvgLine, Circle as SvgCircle, Text as SvgText } from "react-native-svg";
// ===== Tipos expuestos =====
export type NodeSurfaceProps = {
  ns: string;
  onEmit: (sym: string, say: string, withData?: any) => Promise<void>;
};

type Props = ViewProps & {
  ns: string;
  Surface: React.ComponentType<NodeSurfaceProps>;
  /** Si es false, NO monta el portal (no escucha intents "render"). */
  mountPortal?: boolean;
};

// ===== Registro de renderers por ns/kind =====
type UBlock = any;
type Renderer = React.FC<{ block: UBlock; ns: string; onEmit: NodeSurfaceProps["onEmit"] }>;
type NSRegistry = Record<string, Record<string, Renderer>>;

// ✅ Persistente incluso con Fast Refresh
const REG_KEY = "__UTOPY_NS_REGISTRY__";
const __REGISTRY: NSRegistry =
  ((globalThis as any)[REG_KEY] ||= {}) as NSRegistry;

export function registerNSRenderer(ns: string, renderers: Record<string, Renderer>) {
  const key = String(ns || "").trim();
  __REGISTRY[key] = { ...(__REGISTRY[key] || {}), ...renderers };
}

export const UPortal: React.FC<{ ns: string; onEmit: NodeSurfaceProps["onEmit"] }> = ({ ns, onEmit }) => {
  const [blocks, setBlocks] = useState<UBlock[]>([]);
  const blocksRef = useRef<UBlock[]>([]);
  blocksRef.current = blocks;

  const lastSigRef = useRef<string>("");

  useEffect(() => {
    const unsub = spore.on("intent", (msg: any) => {
      // ✅ 1) ignorar ACK/echo/etc
      if (msg?.ack || msg?.kind === "ack") return;

      // ✅ 2) ignorar mensajes enviados por mí (eco del seed)
      const myId = (spore as any)?.id || (spore as any)?.me || (spore as any)?.clientId;
      const senderId = msg?.id || msg?.from || msg?.peerId;
      if (myId && senderId && String(senderId) === String(myId)) return;

      const i = msg?.payload || msg;
      if (!i || String(i.ns).trim() !== String(ns).trim() || i.say !== "render") return;

      const payload = i?.with || {};
      const append = !!payload?.append;
      const nextBlocks: UBlock[] = payload?.blocks || [];

      // ✅ 3) dedupe: si es el mismo render, ignorar (mata loops)
      let sig = "";
      try {
        sig = JSON.stringify({ ns: String(ns).trim(), append, blocks: nextBlocks });
      } catch {
        sig = String(Date.now());
      }
      if (sig === lastSigRef.current) return;
      lastSigRef.current = sig;

      if (__DEV__) {
        const kinds = (nextBlocks || []).map((b: any) => String(b?.kind || "").trim()).filter(Boolean);
        console.log("[UPortal] render ns:", ns, "kinds:", kinds);
      }

      if (append) setBlocks([...(blocksRef.current || []), ...nextBlocks]);
      else setBlocks(nextBlocks);
    });

    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [ns]);

  const nsKey = String(ns || "").trim();
  const nsRenderers = __REGISTRY[nsKey] || {};
  if (!blocks?.length) return null;

  return (
    <View style={{ position: "relative" }}>
      {blocks.map((block, idx) => {
        const kind = String(block?.kind || "unknown").trim(); // ✅ normalize
        const R = nsRenderers[kind];
        if (!R) {
          if (__DEV__) console.log("[UPortal] no renderer for", nsKey, "kind:", kind);
          return (
            <View key={`up-block-${idx}`} style={styles.unknown}>
              <Text style={{ color: "#f88" }}>Sin renderer para kind: {kind}</Text>
            </View>
          );
        }
        return <R key={`up-block-${idx}`} block={block} ns={nsKey} onEmit={onEmit} />;
      })}
    </View>
  );
};


// ===== NodeHost (portal opcional) =====
export default function NodeHost({ ns, Surface, style, mountPortal = true, ...rest }: Props) {
  const onEmit = useCallback(
    async (sym: string, say: string, withData?: any) => {
      await spore.sayIntent({ sym, say, with: withData, ns });
    },
    [ns]
  );

  return (
    <View style={[{ flex: 1 }, style]} {...rest}>
      <Surface ns={ns} onEmit={onEmit} />
      {mountPortal && <UPortal ns={ns} onEmit={onEmit} />}
    </View>
  );
}

/* ------------------------------------------------------------------
   Renderers registrados
   - energy:modeler: básicos (preview/text/stats/botón editar)
   - energy:core: note + title + toolbar + viewer (energy.graph / energy.viewport)
------------------------------------------------------------------- */

// ⚙️ energy:modeler — básicos
registerNSRenderer("energy:modeler", {
  title: ({ block }) => (
    <View style={{ padding: 8 }}>
      <Text style={{ color: "#fff", fontWeight: "700" }}>{block?.text ?? "—"}</Text>
    </View>
  ),
    note: ({ block }) => (
    <View style={styles.note}>
      <Text style={{ color: "#eaf2ff", fontWeight: "700" }}>{block?.text ?? "—"}</Text>
    </View>
  ),


  "energy.viewport": ({ block }) => (
    <View style={styles.viewport}>
      <Text style={{ color: "#8aa" }}>
        Vista previa — {block?.scene?.meta?.title ?? "…"} · nodos:{block?.scene?.nodes?.length ?? 0} · edges:{block?.scene?.edges?.length ?? 0}
      </Text>
      <ScrollView horizontal style={{ marginTop: 6 }}>
        <Text style={{ color: "#567" }}>{JSON.stringify(block?.with || {}, null, 2)}</Text>
      </ScrollView>
    </View>
  ),

  "energy.stats": ({ block }) => {
    const s = block?.stats || {};
    return (
      <View style={{ flexDirection: "row", gap: 12, paddingVertical: 6 }}>
        <Text style={{ color: "#9bb" }}>PV: {s?.pv_kw ?? 0} kW</Text>
        <Text style={{ color: "#9bb" }}>Load: {s?.load_kw ?? 0} kW</Text>
        <Text style={{ color: "#9bb" }}>SoC: {s?.soc ?? 0}%</Text>
        <Text style={{ color: "#9bb" }}>Grid→In: {s?.grid_in ?? 0} kW</Text>
        <Text style={{ color: "#9bb" }}>Grid←Out: {s?.grid_out ?? 0} kW</Text>
      </View>
    );
  },

  "floating.edit.button": ({ onEmit, ns }) => (
    <View style={{ position: "absolute", left: "50%", top: "42%", marginLeft: -28 }}>
      <TouchableOpacity onPress={() => onEmit("⚡", "ui.editor.open", { ns })} style={styles.fab}>
        <Text style={{ fontSize: 20 }}>✏️</Text>
      </TouchableOpacity>
    </View>
  ),
});

// 🧭 energy:core — notas + TÍTULO / TOOLBAR / VIEWERS
registerNSRenderer("energy:core", {
  // Nota tipo toast
  note: ({ block }) => (
    <View style={styles.note}>
      <Text style={{ color: "#eaf2ff", fontWeight: "700" }}>{block?.text ?? "—"}</Text>
    </View>
  ),

  // Título
  title: ({ block }) => (
    <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6 }}>
      <Text style={{ color: "#eaf2ff", fontWeight: "800", fontSize: 16 }}>
        {block?.text ?? "—"}
      </Text>
    </View>
  ),

  // Toolbar con intents
  // shape: { kind:"toolbar", items:[{ text, sym, say, with? }, ...] }
  toolbar: ({ block, onEmit, ns }) => {
    const items: Array<{ text: string; sym?: string; say?: string; with?: any }> = block?.items || [];
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 as any, paddingHorizontal: 12, paddingBottom: 8 }}>
        {items.map((it, idx) => (
          <TouchableOpacity
            key={`tb-${idx}`}
            onPress={() => {
              if (it?.sym && it?.say) onEmit(it.sym, it.say, it.with);
              if (it?.say === "ui.close") onEmit("⚡", "render", { ns, blocks: [] });
            }}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "#2a3b55",
              backgroundColor: "#121a26",
            }}
          >
            <Text style={{ color: "#eaf2ff", fontWeight: "700" }}>{it?.text ?? "…"}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  },

  // Visor #1: energy.graph (por compat con emisores que usen esta clave)
  // Visor #1: energy.graph — diagrama SVG con auto-layout por columnas
"energy.graph": ({ block }) => {
  const scene = block?.scene || { nodes: [], edges: [], meta: {} };
  const title = scene?.meta?.title || "Circuito";

  // Normalizar nodos/edges
  const nodes: Array<{ id: string; kind?: string; name?: string }> = scene?.nodes || [];
  const edges: Array<{ from?: string; to?: string; a?: string; b?: string; type?: string }> = scene?.edges || [];

  // 1) Agrupar por "rol"
  const roleOf = (k?: string) => {
    if (!k) return "otros";
    if (["panel.solar", "turbina.eolica", "hidro"].includes(k)) return "fuentes";
    if (["inversor"].includes(k)) return "inversor";
    if (["bateria"].includes(k)) return "almacen";
    if (["sensor", "rele"].includes(k)) return "io";
    return "otros";
  };

  const buckets = {
    fuentes: [] as any[],    // x = 120
    inversor: [] as any[],   // x = 360
    almacen: [] as any[],    // x = 560
    io: [] as any[],         // x = 760
    otros: [] as any[],      // x = 920 (si aparece algo raro)
  };

  nodes.forEach((n) => buckets[roleOf(n.kind) as keyof typeof buckets].push(n));

  // 2) Asignar posiciones (layout en columnas)
  const colX: Record<string, number> = { fuentes: 120, inversor: 360, almacen: 560, io: 760, otros: 920 };
  const rowY = (idx: number, total: number) => {
    // distribuir verticalmente en 220px de alto
    if (total <= 1) return 120;
    const padTop = 30, padBot = 210;
    const span = padBot - padTop;
    return Math.round(padTop + (idx / (total - 1)) * span);
  };

  const pos: Record<string, { x: number; y: number; kind?: string; name?: string }> = {};
  Object.keys(buckets).forEach((bKey) => {
    const arr = (buckets as any)[bKey] as any[];
    arr.forEach((n, i) => {
      pos[n.id] = { x: colX[bKey], y: rowY(i, arr.length), kind: n.kind, name: n.name };
    });
  });

  // 3) Mapear edges (admite {a,b} o {from,to})
  const lines = edges
    .map((e, i) => {
      const a = e.a || e.from;
      const b = e.b || e.to;
      if (!a || !b || !pos[a] || !pos[b]) return null;
      return { key: `e-${i}`, a: pos[a], b: pos[b], type: e.type || "sig" };
    })
    .filter(Boolean) as Array<{ key: string; a: any; b: any; type: string }>;

  // 4) color por tipo de arista
  const colorFor = (t: string) => (t === "dc" ? "#6cf" : t === "ac" ? "#9f6" : "#f9c");

  // 5) render
  return (
    <View
      style={{
        marginHorizontal: 12,
        marginBottom: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#1c2533",
        backgroundColor: "#0c1119",
        overflow: "hidden",
      }}
    >
      <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: "#1c2533" }}>
        <Text style={{ color: "#eaf2ff", fontWeight: "800" }}>{title}</Text>
        <Text style={{ color: "#9bb", marginTop: 4 }}>
          nodos: {nodes.length} · edges: {lines.length}
        </Text>
      </View>

      <View style={{ height: 260, paddingVertical: 4 }}>
        <Svg width="100%" height="100%" viewBox="0 0 1040 260">
          {/* líneas */}
          {lines.map((l) => (
            <SvgLine
              key={l.key}
              x1={l.a.x}
              y1={l.a.y}
              x2={l.b.x}
              y2={l.b.y}
              stroke={colorFor(l.type)}
              strokeWidth={2}
              strokeOpacity={0.9}
            />
          ))}

          {/* nodos */}
          {nodes.map((n, idx) => {
            const p = pos[n.id];
            if (!p) return null;
            const r = 16;
            const fill =
              p.kind === "inversor" ? "#334" :
              p.kind === "bateria" ? "#233" :
              p.kind === "panel.solar" || p.kind === "turbina.eolica" || p.kind === "hidro" ? "#243" :
              p.kind === "sensor" || p.kind === "rele" ? "#242" : "#333";

            const stroke =
              p.kind === "inversor" ? "#6cf" :
              p.kind === "bateria" ? "#9f6" :
              p.kind === "sensor" || p.kind === "rele" ? "#f9c" : "#ccd";

            const label = (p.name || n.kind || n.id).toString().slice(0, 18);
            return (
              <React.Fragment key={`n-${n.id}-${idx}`}>
                <SvgCircle cx={p.x} cy={p.y} r={r} fill={fill} stroke={stroke} strokeWidth={2} />
                <SvgText
                  x={p.x}
                  y={p.y + r + 14}
                  fill="#cfe7ff"
                  fontSize="12"
                  fontWeight="600"
                  textAnchor="middle"
                >
                  {label}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      </View>
    </View>
  );
},


  // Visor #2: energy.viewport (el controller headless emite esta por defecto)
  "energy.viewport": ({ block }) => {
    const scene = block?.scene || { nodes: [], edges: [], meta: {} };
    const title = scene?.meta?.title || "Circuito";
    return (
      <View
        style={{
          marginHorizontal: 12,
          marginBottom: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "#1c2533",
          backgroundColor: "#0c1119",
          overflow: "hidden",
        }}
      >
        <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: "#1c2533" }}>
          <Text style={{ color: "#eaf2ff", fontWeight: "800" }}>{title}</Text>
          <Text style={{ color: "#9bb", marginTop: 4 }}>
            nodos: {scene?.nodes?.length ?? 0} · edges: {scene?.edges?.length ?? 0}
          </Text>
        </View>
        <ScrollView style={{ maxHeight: 260, padding: 12 }}>
          <Text style={{ color: "#7ea" }}>{JSON.stringify(scene, null, 2)}</Text>
        </ScrollView>
      </View>
    );
  },
});

// ===== estilos locales =====
const styles = StyleSheet.create({
  unknown: {
    padding: 8,
    borderColor: "#233",
    borderWidth: 1,
    borderRadius: 8,
    marginVertical: 6,
    backgroundColor: "#0f0f1a",
  },
  viewport: {
    height: 220,
    borderColor: "#1c2533",
    borderWidth: 1,
    borderRadius: 12,
    marginVertical: 8,
    backgroundColor: "#0c1119",
    overflow: "hidden",
    padding: 8,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 30,
    backgroundColor: "#e9eef5",
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  note: {
    padding: 10,
    marginVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1c2533",
    backgroundColor: "#0f1520",
  },
});
