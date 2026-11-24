import React from "react";
import { G, Polygon, Line, Defs, LinearGradient, Stop } from "react-native-svg";
import { iso, poly } from "./iso.utils";

/**
 * Ventana low-poly alineada a pared isométrica
 * - Se dibuja centrada en el anclaje que viene del editor (translate externo).
 * - No eleva Z: respeta la Z del translate => no se ve alzado 2D.
 * - Pequeña “profundidad” hacia el interior para dar volumen.
 */
export const IsoWindow = ({
  w = 1.2,        // ancho del vano (en metros)
  h = 1.0,        // alto del vano
  dir = "x",      // pared paralela: "x" = horizontal, "y" = vertical
  s = 22,         // escala iso
  frameT = 0.08,  // espesor del marco (borde)
  depth = 0.10,   // profundidad hacia el interior (perpendicular a la pared)
  inset = 0.12,   // retranqueo del vidrio desde el marco
  bars = true,    // travesaños opcionales
}: {
  w?: number;
  h?: number;
  dir?: "x" | "y";
  s?: number;
  frameT?: number;
  depth?: number;
  inset?: number;
  bars?: boolean;
}) => {
  // ids únicos para degradés (si hay muchas ventanas)
  const uid = React.useMemo(() => Math.random().toString(36).slice(2, 8), []);
  const gidGlass = `win_glass_${uid}`;
  const gidEdge  = `win_edge_${uid}`;
  const gidWood  = `win_wood_${uid}`;
  const gidShade = `win_shade_${uid}`;

  // La ventana se centra sobre el origen que entrega el editor (translate externo).
  // Definimos geometry local:
  //  dir === "x": pared horizontal => variamos X, profundidad en +Y
  //  dir === "y": pared vertical   => variamos Y, profundidad en +X

  const half = w / 2;

  // helpers para proyectar según orientación
  const P = (lx: number, ly: number, lz: number) => {
    // reinterpretamos los ejes locales según la pared
    if (dir === "x") {
      // x local => mundo X, y local => mundo Y (profundidad)
      return iso(lx, ly, lz, s);
    } else {
      // rotamos ejes: x local => mundo Y, y local => mundo X (profundidad)
      return iso(ly, lx, lz, s);
    }
  };

  // Rectángulo frontal (apoyado en la cara de la pared), centrado
  const F0 = P(-half, 0, 0);
  const F1 = P(+half, 0, 0);
  const F2 = P(+half, 0, h);
  const F3 = P(-half, 0, h);

  // Rectángulo “trasero” (borde interior) con pequeña profundidad
  const B0 = P(-half, depth, 0);
  const B1 = P(+half, depth, 0);
  const B2 = P(+half, depth, h);
  const B3 = P(-half, depth, h);

  // Rebaje del marco (hace el hueco del vidrio) — sobre cara frontal
  const I0 = P(-half + frameT, 0, 0 + frameT);
  const I1 = P(+half - frameT, 0, 0 + frameT);
  const I2 = P(+half - frameT, 0, h - frameT);
  const I3 = P(-half + frameT, 0, h - frameT);

  // El mismo rebaje pero al plano interior (para caras laterales low-poly)
  const I0b = P(-half + frameT, depth, 0 + frameT);
  const I1b = P(+half - frameT, depth, 0 + frameT);
  const I2b = P(+half - frameT, depth, h - frameT);
  const I3b = P(-half + frameT, depth, h - frameT);

  // Vidrio dentro del rebaje (ligero inset adicional)
  const G0 = P(-half + frameT + inset, 0, 0 + frameT + inset);
  const G1 = P(+half - frameT - inset, 0, 0 + frameT + inset);
  const G2 = P(+half - frameT - inset, 0, h - frameT - inset);
  const G3 = P(-half + frameT + inset, 0, h - frameT - inset);

  // Bordes de brillo (superior + lateral “expuesto”)
  const brightTop  = [F0, F1];
  const brightSide = dir === "x" ? [F0, F3] : [F0, F1]; // lado visible cambia según pared

  // Centro del vidrio para travesaños
  const midX = (G0.x + G1.x) / 2;
  const midY = (G0.y + G3.y) / 2;

  return (
    <G>
      <Defs>
        {/* sombra interior bajo el marco (contra la pared) */}
        <LinearGradient id={gidShade} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#000" stopOpacity={0.18} />
          <Stop offset="1" stopColor="#000" stopOpacity={0.00} />
        </LinearGradient>
        {/* madera pintada fría */}
        <LinearGradient id={gidWood} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#9fb3cf" />
          <Stop offset="1" stopColor="#8aa0c2" />
        </LinearGradient>
        {/* vidrio */}
        <LinearGradient id={gidGlass} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#e8f5ff" stopOpacity={0.96} />
          <Stop offset="0.55" stopColor="#b9d2f5" stopOpacity={0.86} />
          <Stop offset="1" stopColor="#a6c4ee" stopOpacity={0.76} />
        </LinearGradient>
        {/* filo brillante */}
        <LinearGradient id={gidEdge} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#ffffff" stopOpacity={0.85} />
          <Stop offset="1" stopColor="#d2e3ff" stopOpacity={0.00} />
        </LinearGradient>
      </Defs>

      {/* sombra pegada a pared (proyección del marco hacia adentro) */}
      <Polygon points={poly([B0, B1, B2, B3])} fill={`url(#${gidShade})`} opacity={0.35} />

      {/* laterales del marco (low-poly, dan volumen) */}
      {/* izquierda */}
      <Polygon points={poly([F0, B0, B3, F3])} fill="#7b8fb1" opacity={0.9} />
      {/* arriba */}
      <Polygon points={poly([F0, F1, B1, B0])} fill="#90a4c6" opacity={0.95} />
      {/* derecha */}
      <Polygon points={poly([F1, F2, B2, B1])} fill="#6f85a8" opacity={0.9} />
      {/* abajo */}
      <Polygon points={poly([F3, B3, B2, F2])} fill="#6880a6" opacity={0.9} />

      {/* marco frontal */}
      <Polygon points={poly([F0, F1, F2, F3])} fill={`url(#${gidWood})`} />

      {/* rebaje del vidrio (bisel) */}
      <Polygon points={poly([I0, I1, I2, I3])} fill="#0a1220" opacity={0.22} />
      {/* cara interior del rebaje para continuidad de volumen */}
      <Polygon points={poly([I0, I1, I1b, I0b])} fill="#6f85a8" opacity={0.75} />
      <Polygon points={poly([I1, I2, I2b, I1b])} fill="#6880a6" opacity={0.75} />
      <Polygon points={poly([I2, I3, I3b, I2b])} fill="#617ca4" opacity={0.75} />
      <Polygon points={poly([I3, I0, I0b, I3b])} fill="#6e86ad" opacity={0.75} />

      {/* vidrio */}
      <Polygon points={poly([G0, G1, G2, G3])} fill={`url(#${gidGlass})`} opacity={0.98} />

      {/* brillos sutiles */}
      <Line x1={brightTop[0].x} y1={brightTop[0].y} x2={brightTop[1].x} y2={brightTop[1].y} stroke={`url(#${gidEdge})`} strokeWidth={2} />
      <Line x1={brightSide[0].x} y1={brightSide[0].y} x2={brightSide[1].x} y2={brightSide[1].y} stroke={`url(#${gidEdge})`} strokeWidth={1.5} />

      {/* travesaños opcionales */}
      {bars && (
        <>
          {/* vertical */}
          <Line x1={midX} y1={G0.y} x2={midX} y2={G3.y} stroke="#9eb5d6" strokeWidth={1.1} opacity={0.72} />
          {/* horizontal */}
          <Line x1={G0.x} y1={midY} x2={G1.x} y2={midY} stroke="#9eb5d6" strokeWidth={1.1} opacity={0.72} />
        </>
      )}

      {/* filete interno del vidrio para contraste */}
      <Polygon points={poly([G0, G1, G2, G3])} fill="none" stroke="#dfeaff" strokeWidth={0.8} opacity={0.6} />
    </G>
  );
};
