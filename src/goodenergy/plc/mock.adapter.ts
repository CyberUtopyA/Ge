import type { PlcAdapter, PlcCapabilityAttrs, PlcSnapshot, PlcWriteRequest, PlcWriteResult } from "./plc.types";

export function createMockPlcAdapter(plcId = "plc:mock:1"): PlcAdapter {
  let lineEnabled = true;
  let extractorOn = false;
  let baseSoc = 72;

  const capability: PlcCapabilityAttrs = {
    plcId,
    readTags: [
      "voltage",
      "current",
      "power_kw",
      "energy_kwh",
      "temp_c",
      "humidity_pct",
      "pv_kw",
      "load_kw",
      "soc",
      "grid_in",
      "grid_out",
      "line_enabled",
      "extractor_on",
    ],
    writableTags: ["line_enabled", "extractor_on"],
    actions: ["enable_line", "disable_line", "extractor_on", "extractor_off", "reset_alarm"],
    safetyMode: "guarded_write",
  };

  async function read(): Promise<PlcSnapshot> {
    const t = Date.now() / 1000;
    const pv = Math.max(0, 2.2 + Math.sin(t / 13) * 1.1);
    const load = Math.max(0.4, 1.8 + Math.sin(t / 9) * 0.7 + (extractorOn ? 0.45 : 0));
    const power = lineEnabled ? load : 0;
    const gridIn = lineEnabled ? Math.max(0, load - pv) : 0;
    const gridOut = lineEnabled ? Math.max(0, pv - load) : 0;
    const current = lineEnabled ? 7 + Math.sin(t / 11) * 3 + (extractorOn ? 2 : 0) : 0;
    const temp = 34 + Math.sin(t / 15) * 6 + (extractorOn ? 2 : 0);

    baseSoc = Math.max(15, Math.min(98, baseSoc + (gridOut > 0 ? 0.2 : -0.08)));

    return {
      plcId,
      source: "mock",
      ts: Date.now(),
      status: temp >= 75 ? "alert" : temp >= 60 ? "warn" : "ok",
      tags: {
        voltage: lineEnabled ? 223 : 0,
        current: Number(current.toFixed(2)),
        power_kw: Number(power.toFixed(3)),
        energy_kwh: Number((120 + t / 200).toFixed(3)),
        temp_c: Number(temp.toFixed(2)),
        humidity_pct: 58,
        pv_kw: Number(pv.toFixed(3)),
        load_kw: Number(load.toFixed(3)),
        soc: Number(baseSoc.toFixed(2)),
        grid_in: Number(gridIn.toFixed(3)),
        grid_out: Number(gridOut.toFixed(3)),
        line_enabled: lineEnabled,
        extractor_on: extractorOn,
      },
    };
  }

  async function write(req: PlcWriteRequest): Promise<PlcWriteResult> {
    switch (req.command) {
      case "enable_line":
        lineEnabled = true;
        return { ok: true, message: "Línea habilitada" };
      case "disable_line":
        lineEnabled = false;
        return { ok: true, message: "Línea deshabilitada" };
      case "extractor_on":
        extractorOn = true;
        return { ok: true, message: "Extractor encendido" };
      case "extractor_off":
        extractorOn = false;
        return { ok: true, message: "Extractor apagado" };
      case "reset_alarm":
        return { ok: true, message: "Alarmas lógicas reiniciadas" };
      default:
        return { ok: false, message: `Comando no soportado: ${req.command}` };
    }
  }

  return {
    id: plcId,
    source: "mock",
    read,
    write,
    async getCapability() {
      return capability;
    },
  };
}