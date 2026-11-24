import React from "react";
import { G, Polygon, Line } from "react-native-svg";
import { iso, poly } from "./iso.utils";

export const IsoRoof = ({
  w = 6,
  d = 4,
  z = 2.6,
  s = 20,
  panel = 0.8, // distancia entre “hendiduras”
}: {
  w?: number;
  d?: number;
  z?: number;
  s?: number;
  panel?: number;
}) => {
  const p0 = iso(0, 0, z, s);
  const p1 = iso(w, 0, z, s);
  const p2 = iso(w, d, z, s);
  const p3 = iso(0, d, z, s);

  // hendiduras horizontales sutiles
  const grooves: JSX.Element[] = [];
  for (let ix = 0; ix <= w; ix += panel) {
    const a = iso(ix, 0, z, s);
    const b = iso(ix, d, z, s);
    grooves.push(
      <Line
        key={`rx-${ix.toFixed(2)}`}
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke="#90b7e8"
        strokeOpacity={0.11}
        strokeWidth={1}
      />
    );
  }

  return (
    <G>
      <Polygon points={poly([p0, p1, p2, p3])} fill="url(#roofGrad)" />
      {grooves}
      <Polygon
        points={poly([p0, p1, p2, p3])}
        fill="none"
        stroke="#9ed0ff"
        strokeOpacity={0.2}
        strokeWidth={2}
      />
    </G>
  );
};
