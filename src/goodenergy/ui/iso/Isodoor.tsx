import React from "react";
import { G, Polygon, Polyline } from "react-native-svg";
import { iso, poly } from "./iso.utils";

/** Puerta: panel delgado con hueco (se sugiere anclar sobre pared) */
export const IsoDoor = ({
  w = 0.9,      // ancho “en planta”
  h = 2.1,      // alto
  t = 0.04,     // espesor
  dir = "x",    // misma convención que pared
  ox = 0, oy = 0, z = 0,
  s = 20,
}: {
  w?: number; h?: number; t?: number;
  dir?: "x"|"y"; ox?: number; oy?: number; z?: number; s?: number;
}) => {
  const alongX = dir === "x";

  // base
  const b0 = iso(ox, oy, z, s);
  const b1 = iso(ox + (alongX ? w : 0), oy + (alongX ? 0 : w), z, s);
  const b2 = iso(ox + (alongX ? w : 0) + (alongX ? 0 : t), oy + (alongX ? t : w + t), z, s);
  const b3 = iso(ox + (alongX ? 0 : 0) + (alongX ? 0 : t), oy + (alongX ? t : t), z, s);

  // top
  const t0 = iso(ox, oy, z + h, s);
  const t1 = iso(ox + (alongX ? w : 0), oy + (alongX ? 0 : w), z + h, s);
  const t2 = iso(ox + (alongX ? w : 0) + (alongX ? 0 : t), oy + (alongX ? t : w + t), z + h, s);
  const t3 = iso(ox + (alongX ? 0 : 0) + (alongX ? 0 : t), oy + (alongX ? t : t), z + h, s);

  // caras (simple cristal azulado)
  const front = [b0, b1, t1, t0];
  const side  = [b1, b2, t2, t1];
  const topL  = [t0, t1, t2, t3];

  return (
    <G>
      <Polygon points={poly(front)} fill="url(#wallFront)" opacity={0.85}/>
      <Polygon points={poly(side)}  fill="url(#wallSide)"  opacity={0.85}/>
      <Polygon points={poly(topL)}  fill="url(#edgeGlow)"  opacity={0.12}/>
      {/* Línea del “hueco” (marco) */}
      <Polyline
        points={poly([t0,t1,t2,t3,t0])}
        fill="none" stroke="#9ed0ff" strokeOpacity={0.35} strokeWidth={1.5}
      />
    </G>
  );
};
