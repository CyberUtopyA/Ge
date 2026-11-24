import React from "react";
import { G, Rect, Polygon, Line, Text as SvgText } from "react-native-svg";
import { iso } from "./iso.utils";

type Dir = "x" | "y";

/** Caja genérica low-poly (para batería, caja de control, “personalizado”) */
function IsoBox({
  w = 0.9, d = 0.6, h = 0.7, s = 20, label,
}: { w?:number; d?:number; h?:number; s?:number; label?:string }) {
  const p0 = iso(0,0,0,s), p1 = iso(w,0,0,s), p2 = iso(w,d,0,s), p3 = iso(0,d,0,s);
  const t0 = iso(0,0,h,s), t1 = iso(w,0,h,s), t2 = iso(w,d,h,s), t3 = iso(0,d,h,s);
  return (
    <G>
      {/* caras */}
      <Polygon points={`${p0.x},${p0.y} ${p1.x},${p1.y} ${t1.x},${t1.y} ${t0.x},${t0.y}`} fill="#b7c6e2"/>
      <Polygon points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${t2.x},${t2.y} ${t1.x},${t1.y}`} fill="#a5b7d8"/>
      <Polygon points={`${t0.x},${t0.y} ${t1.x},${t1.y} ${t2.x},${t2.y} ${t3.x},${t3.y}`} fill="#dbe5f6"/>
      {/* borde */}
      <Polygon points={`${p0.x},${p0.y} ${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`} fill="none" stroke="#8ea4c9" />
      {label ? <SvgText x={t3.x+8} y={t3.y-2} fontSize={10} fill="#3a4d6d">{label}</SvgText> : null}
    </G>
  );
}

/** Batería: caja + bornes */
export function IsoBattery({ s=20 }: { s?:number }) {
  return (
    <G>
      <IsoBox s={s} w={0.9} d={0.6} h={0.7} label="BAT" />
      {/* bornes */}
      <Rect x={iso(0.15,0.15,0.75,s).x-2} y={iso(0.15,0.15,0.75,s).y-2} width={4} height={4} fill="#e45b5b" />
      <Rect x={iso(0.65,0.15,0.75,s).x-2} y={iso(0.65,0.15,0.75,s).y-2} width={4} height={4} fill="#5bb0e4" />
    </G>
  );
}

/** Inversor de pared: “slim” orientable */
export function IsoInverter({ dir="x", s=20 }: { dir?:Dir; s?:number }) {
  const w = dir==="x" ? 0.9 : 0.18, d = dir==="x" ? 0.18 : 0.9, h = 0.55;
  return (
    <G>
      <IsoBox s={s} w={w} d={d} h={h} label="INV" />
      {/* lamas/vent */}
      {[0.2,0.35,0.5,0.65].map((t,i)=>{
        const a = iso(0.08, t*(dir==="x"?d:w), h*0.5, s);
        const b = iso(dir==="x"?w-0.08:0.08, t*(dir==="x"?d:w), h*0.5, s);
        return <Line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#7c93b8" strokeWidth={1}/>;
      })}
    </G>
  );
}

/** Panel solar (pensado para techo/plano) */
export function IsoPanel({ w=1.6, d=1.0, s=20 }: { w?:number; d?:number; s?:number }) {
  const p0 = iso(0,0,0,s), p1 = iso(w,0,0,s), p2 = iso(w,d,0,s), p3 = iso(0,d,0,s);
  return (
    <G>
      <Polygon points={`${p0.x},${p0.y} ${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`} fill="#244069"/>
      {[...Array(4)].map((_,i)=>{
        const t=(i+1)/(5);
        const a=iso(w*t,0,0,s), b=iso(w*t,d,0,s);
        return <Line key={`v${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#5b78a5" strokeWidth={1}/>;
      })}
      {[...Array(2)].map((_,i)=>{
        const t=(i+1)/(3);
        const a=iso(0,d*t,0,s), b=iso(w,d*t,0,s);
        return <Line key={`h${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#5b78a5" strokeWidth={1}/>;
      })}
    </G>
  );
}

/** Relé / carga: cajita pequeña */
export function IsoRelay({ s=20 }: { s?:number }) {
  return <IsoBox s={s} w={0.5} d={0.4} h={0.4} label="REL" />;
}

/** Sensor: “placa” pequeña de pared/techo */
export function IsoSensor({ s=20 }: { s?:number }) {
  const p0 = iso(0,0,0,s), p1 = iso(0.5,0,0,s), p2 = iso(0.5,0.2,0,s), p3 = iso(0,0.2,0,s);
  return (
    <G>
      <Polygon points={`${p0.x},${p0.y} ${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`} fill="#e9f2ff" />
      <Line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="#9ab4d8"/>
    </G>
  );
}

/** Turbina eólica (mini) */
export function IsoTurbine({ s=20 }: { s?:number }) {
  const base = iso(0,0,0,s), top = iso(0,0,1.6,s);
  return (
    <G>
      <Line x1={base.x} y1={base.y} x2={top.x} y2={top.y} stroke="#a5b7d8" strokeWidth={2}/>
      <Line x1={top.x} y1={top.y} x2={top.x+8} y2={top.y-4} stroke="#a5b7d8" />
      <Line x1={top.x} y1={top.y} x2={top.x-8} y2={top.y-4} stroke="#a5b7d8" />
      <Line x1={top.x} y1={top.y} x2={top.x} y2={top.y+10} stroke="#a5b7d8" />
    </G>
  );
}

/** Hidro (mini “caja” azul) */
export function IsoHidro({ s=20 }: { s?:number }) {
  return <IsoBox s={s} w={0.7} d={0.5} h={0.5} label="H2O" />;
}

/** Selección por tipo + emoji overlay */
export function IsoComp({
  kind, dir="x", s=20, emoji,
}: { kind: string; dir?:Dir; s?:number; emoji?:string }) {
  let inner: React.ReactNode = null;
  if (kind === "bateria") inner = <IsoBattery s={s} />;
  else if (kind === "inversor") inner = <IsoInverter s={s} dir={dir} />;
  else if (kind === "panel.solar") inner = <IsoPanel s={s} />;
  else if (kind === "rele") inner = <IsoRelay s={s} />;
  else if (kind === "sensor") inner = <IsoSensor s={s} />;
  else if (kind === "turbina.eolica") inner = <IsoTurbine s={s} />;
  else if (kind === "hidro") inner = <IsoHidro s={s} />;
  else inner = <IsoBox s={s} w={0.8} d={0.5} h={0.5} label={kind.slice(0, 3).toUpperCase()} />;

  return (
    <G>
      {inner}
      {emoji ? <SvgText x={0} y={-10} fontSize={12}>{emoji}</SvgText> : null}
    </G>
  );
}
