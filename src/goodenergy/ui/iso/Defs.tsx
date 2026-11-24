import React from "react";
import { Defs, LinearGradient, Stop } from "react-native-svg";

export const IsoDefs = () => (
  <Defs>
    {/* Piso */}
    <LinearGradient id="floorGrad" x1="0" y1="0" x2="1" y2="1">
      <Stop offset="0" stopOpacity="1" stopColor="#ecf3ff" />
      <Stop offset="1" stopOpacity="1" stopColor="#e6eefb" />
    </LinearGradient>

    {/* Pared (frontal) */}
    <LinearGradient id="wallFront" x1="0" y1="0" x2="0" y2="1">
      <Stop offset="0" stopColor="#a9bce0" />
      <Stop offset="1" stopColor="#97aacf" />
    </LinearGradient>

    {/* Pared (lateral) */}
    <LinearGradient id="wallSide" x1="0" y1="0" x2="1" y2="0">
      <Stop offset="0" stopColor="#93a7cc" />
      <Stop offset="1" stopColor="#869abc" />
    </LinearGradient>

    {/* Techo */}
    <LinearGradient id="roofGrad" x1="0" y1="0" x2="0" y2="1">
      <Stop offset="0" stopColor="#d5e6ff" stopOpacity={0.55} />
      <Stop offset="1" stopColor="#c7dcff" stopOpacity={0.45} />
    </LinearGradient>

    {/* Borde suave/“halo” */}
    <LinearGradient id="edgeGlow" x1="0" y1="0" x2="0" y2="1">
      <Stop offset="0" stopColor="#9ed0ff" stopOpacity={0.7} />
      <Stop offset="1" stopColor="#9ed0ff" stopOpacity={0} />
    </LinearGradient>
  </Defs>
);
