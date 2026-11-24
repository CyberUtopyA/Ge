import React from "react";
import { G, Polygon, Line, Rect } from "react-native-svg";
import { iso, poly } from "./iso.utils";

export const IsoFloor = ({ w = 6, d = 4, s = 20 }: { w?: number; d?: number; s?: number }) => {
  const p0 = iso(0, 0, 0, s);
  const p1 = iso(w, 0, 0, s);
  const p2 = iso(w, d, 0, s);
  const p3 = iso(0, d, 0, s);

  const grid: JSX.Element[] = [];
  // planks verticales (en dirección X) — sutiles
  for (let ix = 0; ix <= w; ix += 0.5) {
    const a = iso(ix, 0, 0, s);
    const b = iso(ix, d, 0, s);
    grid.push(
      <Line key={`pl-${ix.toFixed(2)}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#1f2c41" strokeWidth={1} opacity={0.22} />
    );
  }

  return (
    <G>
      {/* AO alrededor del piso (suave) */}
      <Polygon points={poly([p0, p1, p2, p3])} fill="url(#floorGrad)" opacity={1} />
      <Polygon points={poly([p0, p1, p2, p3])} fill="url(#woodPlanks)" opacity={0.35} />
      {grid}

      {/* bordes con leve brillo para lectura */}
      <Polygon points={poly([p0, p1, p2, p3])} fill="none" stroke="#a5c4ff" strokeOpacity={0.18} strokeWidth={2} />
      {/* leve viñeta interior */}
      <Rect x={Math.min(p0.x, p3.x)} y={Math.min(p1.y, p0.y)} width={Math.abs(p1.x - p0.x)} height={Math.abs(p2.y - p1.y)} fill="none" />
    </G>
  );
};
