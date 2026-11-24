import { hear } from "../utopy/symbol.bus";
import { registerSensor, attachSensor, detachSensor, pushReading } from "./registry";
import type { SensorDef, SensorReading } from "../utopy/types.simbiosis";

// Instala handlers de intents de sensores
export function installSensorsBus(_ctx: any) {
    const _say = _ctx.say?.bind(_ctx);
  _ctx.say = (intent: any) => {
    if (intent && !intent.ns) {
      if (intent.sym === "📡") intent.ns = "energy:sensors";
      else if (intent.sym === "⚡") intent.ns = "energy:modeler";
      else intent.ns = "energy:basic";
    }
    return _say(intent);
  };

  hear("📡", "sensor.register", (i) => {
    const s: SensorDef | undefined = i?.with?.sensor;
    if (s?.id) registerSensor(s);
  });

  // Vincular/desvincular un sensor a un nodo
  hear("📡", "sensor.attach", (i) => {
    const nodeId = i?.with?.nodeId; const sensorId = i?.with?.sensorId;
    if (nodeId && sensorId) attachSensor(nodeId, sensorId);
  });
  hear("📡", "sensor.detach", (i) => {
    const nodeId = i?.with?.nodeId; const sensorId = i?.with?.sensorId;
    if (nodeId && sensorId) detachSensor(nodeId, sensorId);
  });

  // Push de lectura (producido por adaptadores)
  hear("📡", "sensor.reading", (i) => {
    const sensorId = i?.with?.sensorId;
    const reading: SensorReading | undefined = i?.with?.reading;
    if (sensorId && reading) pushReading(sensorId, reading);
  });

  // Poll (opcional): tu adaptador puede responder con sensor.reading
  hear("📡", "sensor.poll", (_i) => { /* noop en base; adapters responden */ });
}
export { attachSensor, detachSensor };

