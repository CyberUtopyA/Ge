// src/goodenergy/ui/register.native.tsx
import React, { useState, useEffect } from "react";
import { View, Text, Button, ScrollView } from "react-native";
import Svg, { Rect, Line, Text as SvgText } from "react-native-svg";
import { UPortal } from "../../utopy/ui/UniversalPortal";

const NS = "energy:modeler";

// ------------------------------- Hook: portal -> blocks
export function useEnergyPortal() {
  const [blocks, setBlocks] = useState<any[]>([]);

  useEffect(() => {
    // Handler acepta (any[] | null) y normaliza a []
    const handler = (incoming: any[] | null) => setBlocks(incoming ?? []);

    const portalAny = UPortal as any;
    let off: any;

    if (portalAny && typeof portalAny.register === "function") {
      off = portalAny.register(NS, handler as any);
    } else if (portalAny && typeof portalAny.on === "function") {
      // fallback por si tu UniversalPortal usa 'on'
      off = portalAny.on(NS, handler as any);
    } else if (portalAny && typeof portalAny.use === "function") {
      // otro fallback posible
      off = portalAny.use(NS, handler as any);
    } else {
      console.warn("[EnergyHost] UniversalPortal no expone register/on/use");
    }

    // cleanup defensivo (evita TS2349)
    return () => {
      try {
        if (typeof off === "function") off();
        else if (off && typeof off.unsubscribe === "function") off.unsubscribe();
        else if (portalAny && typeof portalAny.unregister === "function") portalAny.unregister(NS);
      } catch {}
    };
  }, []);

  return blocks;
}

// ------------------------------- Simple graph view
export function EnergyGraphView({
  scene,
  onAction,
}: {
  scene: any;
  onAction: (sym: string, say: string, withData?: any) => void;
}) {
  const { nodes = [], edges = [] } = scene || {};
  const idx: Record<string, any> = Object.fromEntries(nodes.map((n: any) => [n.id, n]));

  const width = 360,
    height = 420;

  return (
    <View style={{ borderWidth: 1, borderColor: "#333", borderRadius: 12, overflow: "hidden" }}>
      <Svg width={width} height={height} style={{ backgroundColor: "#0b0f14" }}>
        {edges.map((e: any, i: number) => {
          const a = idx[e.from],
            b = idx[e.to];
          if (!a || !b) return null;
          const x1 = (a.x ?? 80) + 60,
            y1 = (a.y ?? 80) + 15,
            x2 = (b.x ?? 260) + 60,
            y2 = (b.y ?? 80) + 15;
          return (
            <React.Fragment key={e.id || i}>
              <Line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={e.enabled === false ? "#666" : "#6cf"}
                strokeWidth={2}
                onPress={() => onAction("⚡", "toggle-edge", { id: e.id })}
              />
              <SvgText x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 4} fill="#9ad" fontSize="10">
                →
              </SvgText>
            </React.Fragment>
          );
        })}
        {nodes.map((n: any, i: number) => {
          const x = n.x ?? 80,
            y = n.y ?? 80;
          const color =
            n.kind === "pv"
              ? "#f1c40f"
              : n.kind === "battery"
              ? "#2ecc71"
              : n.kind === "grid"
              ? "#e74c3c"
              : n.kind === "inverter"
              ? "#9b59b6"
              : n.kind === "load"
              ? "#3498db"
              : "#bdc3c7";

          const p = n.state?.p_kw ?? n.params?.kw ?? n.params?.kwp ?? "";
          const sub =
            typeof p === "number"
              ? `${p.toFixed(2)} kW`
              : n.kind === "battery"
              ? `SOC ${(n.params?.soc ?? 0)}%`
              : "";

          return (
            <React.Fragment key={n.id || i}>
              <Rect x={x} y={y} rx={8} ry={8} width={120} height={32} fill={color} />
              <SvgText x={x + 8} y={y + 20} fill="#000" fontWeight="700">
                {n.name}
              </SvgText>
              {sub ? (
                <SvgText x={x} y={y + 46} fill="#9ad" fontSize="11">
                  {sub}
                </SvgText>
              ) : null}
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

// ------------------------------- Host de pantalla: monta blocks
export function EnergyHost({
  onEmit,
}: {
  onEmit: (sym: string, say: string, withData?: any) => void;
}) {
  const blocks = useEnergyPortal();

  if (!blocks || blocks.length === 0) {
    return (
      <ScrollView style={{ padding: 12 }}>
        <Text style={{ color: "#9fb3c8" }}>Cargando interfaz de energía…</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ padding: 12 }}>
      {blocks.map((b: any, i: number) => {
        if (b.kind === "title")
          return (
            <Text key={i} style={{ fontSize: 20, fontWeight: "700", color: "#fff", marginBottom: 8 }}>
              {b.text}
            </Text>
          );

        if (b.kind === "toolbar")
          return (
            <View key={i} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {b.items?.map((it: any, j: number) => (
                <View key={j} style={{ marginRight: 8, marginBottom: 8 }}>
                  <Button title={it.text} onPress={() => onEmit(it.sym, it.say, it.with)} />
                    
                </View>
              ))}
            </View>
          );

        if (b.kind === "energy.graph")
          return <EnergyGraphView key={i} scene={b.scene} onAction={(sym, say, withD) => onEmit(sym, say, withD)} />;

        if (b.kind === "note")
          return (
            <View key={i} style={{ padding: 10, backgroundColor: "#2a343e", borderRadius: 10, marginVertical: 6 }}>
              <Text style={{ color: "#d9e3ee" }}>{b.text}</Text>
            </View>
          );

        return (
          <Text key={i} style={{ color: "#9fb3c8" }}>
            {JSON.stringify(b)}
          </Text>
        );
      })}
    </ScrollView>
  );
}
