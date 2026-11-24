// ==============================
// File: src/goodenergy/ui/TopGalaxyBar.tsx
// GoodEnergy — Top bar transparente con planeta + rayos + menú Home
// Requisitos: react-native-svg
// ==============================
import React, { useEffect, useMemo, useState } from "react";
import { View, TouchableOpacity, Text, StyleSheet, useWindowDimensions, Platform } from "react-native";
import Svg, { Defs, RadialGradient, Stop, G, Circle, Path } from "react-native-svg";

type Route = "home" | "buy" | "sell";

export default function TopGalaxyBar({
  active = "home",
  onSelect,
}: {
  active?: Route;
  onSelect: (r: Route) => void;
}) {
  const [tick, setTick] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const { width } = useWindowDimensions();

  // centro horizontal siempre en el medio de pantalla
  const CX = Math.floor(width / 2);
  const CY = -10;        // planeta asomando “desde arriba”
  const R_PLANET = 64;   // radio planeta
  const R_GLOW = 96;     // glow más amplio

  useEffect(() => {
    const t = setInterval(() => setTick((n) => (n + 1) % 1000), 700);
    return () => clearInterval(t);
  }, []);

  // rayos eléctricos: paths desde el borde del planeta
  const bolts = useMemo(() => {
    const N = 6;
    return Array.from({ length: N }).map((_, i) => {
      const a = (Math.PI * (i * 0.9 + (tick % 7) * 0.07)) % (Math.PI * 2);
      const x0 = CX + Math.cos(a) * R_PLANET;
      const y0 = CY + Math.sin(a) * R_PLANET;
      const x1 = x0 + (Math.cos(a) * 18) + jitter(6);
      const y1 = y0 + (Math.sin(a) * 18) + jitter(6);
      const x2 = x1 + jitter(10);
      const y2 = y1 + jitter(10);
      return `M ${x0},${y0} L ${x1},${y1} L ${x2},${y2}`;
    });
  }, [tick, CX]);

  return (
    <View pointerEvents="box-none" style={s.wrap}>
      {/* el SVG no captura toques, sólo visual */}
      <Svg width={width} height={120} pointerEvents="none">
        <Defs>
          {/* brillo azulado */}
          <RadialGradient id="planetGlow" cx="50%" cy="10%" r="60%">
            <Stop offset="0%" stopColor="#82b1ff" stopOpacity="0.85" />
            <Stop offset="55%" stopColor="#4a7bd6" stopOpacity="0.65" />
            <Stop offset="95%" stopColor="#0d1830" stopOpacity="0.0" />
          </RadialGradient>
          {/* relleno planeta */}
          <RadialGradient id="planetCore" cx="50%" cy="40%" r="60%">
            <Stop offset="0%" stopColor="#9fd1ff" stopOpacity="0.95" />
            <Stop offset="60%" stopColor="#3b5aa8" stopOpacity="0.95" />
            <Stop offset="100%" stopColor="#1a2a57" stopOpacity="0.95" />
          </RadialGradient>
        </Defs>

        {/* glow amplio */}
        <G>
          <Circle cx={CX} cy={CY} r={R_GLOW} fill="url(#planetGlow)" />
        </G>

        {/* planeta “cortado a la mitad” asomando por arriba */}
        <G>
          <Circle cx={CX} cy={CY} r={R_PLANET} fill="url(#planetCore)" />
          {/* anillo sutil */}
          <Circle cx={CX} cy={CY} r={R_PLANET + 2} fill="none" stroke="#a5c4ff" strokeOpacity={0.35} strokeWidth={1.5} />
        </G>

        {/* rayos eléctricos */}
        <G>
          {bolts.map((d, i) => (
            <Path
              key={`b-${i}`}
              d={d}
              stroke="#b7d4ff"
              strokeWidth={1.6}
              strokeOpacity={0.8 - (i * 0.1)}
              fill="none"
            />
          ))}
        </G>
      </Svg>

      {/* Botón central Home + menú (sí captura toques) */}
      <View pointerEvents="box-none" style={s.centerHit}>
        <TouchableOpacity
          onPress={() => setMenuOpen((v) => !v)}
          style={s.homeBtn}
          activeOpacity={0.9}
        >
          <Text style={s.homeIcon}>🏠</Text>
          <Text style={s.homeHint}>{labelFor(active)}</Text>
        </TouchableOpacity>

        {menuOpen && (
          <View style={s.menuRow}>
            <MenuPill
              label="Casa"
              icon="🏠"
              active={active === "home"}
              onPress={() => {
                setMenuOpen(false);
                onSelect("home");
              }}
            />
            <MenuPill
              label="Comprar"
              icon="⚡"
              active={active === "buy"}
              onPress={() => {
                setMenuOpen(false);
                onSelect("buy");
              }}
            />
            <MenuPill
              label="Vender"
              icon="🔆"
              active={active === "sell"}
              onPress={() => {
                setMenuOpen(false);
                onSelect("sell");
              }}
            />
          </View>
        )}
      </View>
    </View>
  );
}

function MenuPill({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={[s.pill, active && s.pillActive]}>
      <Text style={s.pillTxt}>{icon}</Text>
      <Text style={s.pillLbl}>{label}</Text>
    </TouchableOpacity>
  );
}

function labelFor(r: "home" | "buy" | "sell") {
  if (r === "home") return "Home";
  if (r === "buy") return "Comprar";
  return "Vender";
}

function jitter(n: number) {
  "worklet"; // harmless in RN
  return (Math.random() - 0.5) * n * 2;
}

const s = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    // totalmente transparente
    zIndex: 1000,
    ...(Platform.OS === "android" ? { elevation: 20 } : {}),
  },
  centerHit: {
    position: "absolute",
    top: 18,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  homeBtn: {
    minWidth: 86,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(10,16,28,0.65)",
    borderWidth: 1,
    borderColor: "rgba(150,200,255,0.25)",
    alignItems: "center",
  },
  homeIcon: { fontSize: 20, marginBottom: 2 },
  homeHint: { color: "#eaf2ff", fontWeight: "800", fontSize: 12 },
  menuRow: {
    marginTop: 8,
    flexDirection: "row",
    // RN <0.73 no soporta gap; fallback con margin en pills si hace falta
    // @ts-ignore
    gap: 8,
    backgroundColor: "rgba(10,16,28,0.75)",
    borderWidth: 1,
    borderColor: "rgba(150,200,255,0.22)",
    borderRadius: 12,
    padding: 6,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    // @ts-ignore
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "rgba(16,24,40,0.7)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(120,170,255,0.25)",
    marginHorizontal: 2, // por si gap no existe
  },
  pillActive: {
    backgroundColor: "rgba(24,37,55,0.9)",
    borderColor: "rgba(160,200,255,0.45)",
  },
  pillTxt: { fontSize: 14 },
  pillLbl: { color: "#eaf2ff", fontWeight: "800", fontSize: 12 },
});
