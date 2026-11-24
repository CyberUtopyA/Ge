// ===============================================
// File: src/goodenergy/telemetry.bridge.ts
// Emisor de telemetría para GoodEnergy via Resonancia (spore)
// - publishTelemetry(ns, t): envía 1 muestra
// - startTelemetryBridge({ ns, intervalMs, provider }): loop periódico
//   * provider(): Promise<Telemetry> | Telemetry (lee de sensores reales)
//   * si no pasas provider => usa un "demo" que varía PV/Load
// ===============================================
import { spore } from "../utopy/spore";

export type Telemetry = {
  source?: string;
  epistemic?: "observado" | "calculado" | "simulado" | "inferido" | "propuesto" | "ejecutado";
  pv_kw?: number;     // generación PV kW
  load_kw?: number;   // consumo kW
  soc?: number;       // %
  grid_in?: number;   // kW desde red a casa
  grid_out?: number;  // kW desde casa a red
};

export async function publishTelemetry(ns: string, t: Telemetry) {
  await spore.sayIntent({ sym: "⚡", say: "telemetry.update", ns, with: t });
}

// Demo simple (por si no pasas provider real)
function demoProviderFactory() {
  let t = 0;
  let soc = 50;
  return (): Telemetry => {
    t += 1;
    // curva PV (hasta ~3 kW) y load (~0.6–2.2 kW)
    const pv_kw = Math.max(0, 3 * Math.sin((t / 20) * Math.PI));
    const load_kw = 0.6 + 1.6 * Math.abs(Math.sin((t / 17) * Math.PI));
    const delta = pv_kw - load_kw; // excedente(+)/déficit(-)
    // grid in/out aprox
    const grid_in = delta < 0 ? Math.abs(delta) * 0.7 : 0;
    const grid_out = delta > 0 ? delta * 0.7 : 0;
    // SoC simple
    soc = Math.max(5, Math.min(95, soc + delta * 0.2));
    return { pv_kw: +pv_kw.toFixed(2), load_kw: +load_kw.toFixed(2), soc: +soc.toFixed(0), grid_in: +grid_in.toFixed(2), grid_out: +grid_out.toFixed(2) };
  };
}

type StartOpts = {
  ns: string;
  intervalMs?: number;
  // Devuelve la muestra desde sensores reales (Modbus/MQTT/BLE/HTTP/lo-que-sea)
  provider?: (() => Telemetry | Promise<Telemetry>);
};

let __loops: Record<string, boolean> = {};

export function startTelemetryBridge(opts: StartOpts) {
  const ns = opts.ns || "energy:core";
  const intervalMs = Math.max(500, opts.intervalMs ?? 2000);
  if (__loops[ns]) return; // idempotente
  __loops[ns] = true;

  const provider = opts.provider ?? demoProviderFactory();

  const tick = async () => {
    try {
      const t = await Promise.resolve(provider());
      await publishTelemetry(ns, opts.provider ? t : { ...t, source: "demo", epistemic: "simulado" });
    } catch (e) {
      console.warn("[telemetry] error:", e);
    }
  };

  // primer disparo rápido + intervalo
  tick();
  const id = setInterval(tick, intervalMs);

  // expón para debug/parar si hiciera falta
  (globalThis as any).__GE_TLM__ = (globalThis as any).__GE_TLM__ || {};
  (globalThis as any).__GE_TLM__[ns] = { stop: () => { clearInterval(id); __loops[ns] = false; } };
}
