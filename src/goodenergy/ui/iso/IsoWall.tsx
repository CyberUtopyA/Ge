import React from "react";
import { G, Polygon, Polyline, Rect } from "react-native-svg";
import { iso, poly } from "./iso.utils";

/**
 * len: largo pared (en metros del mundo)
 * h: alto
 * thick: espesor visual
 * dir: "x" | "y" (paralela al eje)
 * ox, oy: origen local en planta
 */
export const IsoWall = ({
  len = 3,
  h = 2.6,
  thick = 0.12,
  dir = "x",
  ox = 0,
  oy = 0,
  s = 20,
}: {
  len?: number;
  h?: number;
  thick?: number;
  dir?: "x" | "y";
  ox?: number;
  oy?: number;
  s?: number;
}) => {
  const alongX = dir === "x";

  // base (z=0)
  const b0 = iso(ox, oy, 0, s);
  const b1 = iso(ox + (alongX ? len : 0), oy + (alongX ? 0 : len), 0, s);
  const b2 = iso(ox + (alongX ? len : 0) + (alongX ? 0 : thick), oy + (alongX ? thick : len + thick), 0, s);
  const b3 = iso(ox + (alongX ? 0 : 0) + (alongX ? 0 : thick), oy + (alongX ? thick : thick), 0, s);

  // top (z=h)
  const t0 = iso(ox, oy, h, s);
  const t1 = iso(ox + (alongX ? len : 0), oy + (alongX ? 0 : len), h, s);
  const t2 = iso(ox + (alongX ? len : 0) + (alongX ? 0 : thick), oy + (alongX ? thick : len + thick), h, s);
  const t3 = iso(ox + (alongX ? 0 : 0) + (alongX ? 0 : thick), oy + (alongX ? thick : thick), h, s);

  const front = [b0, b1, t1, t0];
  const side  = [b1, b2, t2, t1];
  const top   = [t0, t1, t2, t3];

  // zócalo (madera)
  const baseH = 0.12;
  const zb0 = iso(ox, oy, baseH, s);
  const zb1 = iso(ox + (alongX ? len : 0), oy + (alongX ? 0 : len), baseH, s);
  const zocalo = [b0, b1, zb1, zb0];

  return (
    <G>
      {/* caras principales */}
      <Polygon points={poly(front)} fill="url(#wallFront)" />
      <Polygon points={poly(side)}  fill="url(#wallSide)" />

      {/* tapa superior + brillo sutil */}
      <Polygon points={poly(top)} fill="url(#edgeGlow)" opacity={0.18} />
      <Polyline points={poly([t0, t1, t2, t3, t0])} fill="none" stroke="#9ed0ff" strokeOpacity={0.25} strokeWidth={1.5} />

      {/* zócalo de madera */}
      <Polygon points={poly(zocalo)} fill="url(#wood)" opacity={0.85} />

      {/* highlight en el borde visible */}
      <Polyline points={poly([b0, t0])} fill="none" stroke="url(#wallHighlight)" strokeWidth={2} />
    </G>
  );
};
