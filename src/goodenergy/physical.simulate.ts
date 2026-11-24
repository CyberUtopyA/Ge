import type {PhysicalMeasure, PhysicalProject} from './physical.model';

export type PhysicalSimulationEvent = {
  reference: string;
  state: 'calculable' | 'incompleto';
  detail: string;
  epistemic: 'simulado';
  missing: string[];
};
export type PhysicalSimulationProvider = {
  id: string;
  contextId: string;
  simulate: (project: PhysicalProject, hours: number) => PhysicalSimulationEvent[];
};
const providers = new Map<string, PhysicalSimulationProvider>();
export function registerPhysicalSimulationProvider(provider: PhysicalSimulationProvider) {
  if (!provider.id || !provider.contextId) throw new Error('Provider simulación incompleto');
  providers.set(provider.contextId, provider);
}
export function simulatePhysicalSystem(project: PhysicalProject, contextId: string, hours: number): PhysicalSimulationEvent[] {
  if (!Number.isFinite(hours) || hours <= 0) return [{reference: contextId, state: 'incompleto', detail: 'Definí una duración válida.', epistemic: 'simulado', missing: ['duración']}];
  const provider = providers.get(contextId);
  return provider ? provider.simulate(project, hours) : [{reference: contextId, state: 'incompleto', detail: 'Este contexto necesita un provider de simulación.', epistemic: 'simulado', missing: ['provider de simulación']}];
}
const latest = (project: PhysicalProject, reference: string, property: string): PhysicalMeasure | undefined =>
  (project.measurements || []).filter(m => m.reference === reference && m.property === property && m.epistemic === 'observado').sort((a, b) => b.ts - a.ts)[0];

registerPhysicalSimulationProvider({
  id: 'ge.hvac.thermal.basic', contextId: 'refrigeracion',
  simulate(project, hours) {
    const camera = project.comps.find(c => c.kind === 'camara.frio');
    const compressor = project.comps.find(c => c.kind === 'compresor');
    const temp = camera && latest(project, camera.id, 'temperature');
    const rate = Number(compressor?.params?.coolingRateCPerHour);
    const missing = [
      !camera ? 'cámara' : '',
      !temp || !['°c', 'c', 'celsius'].includes(temp.unit.toLowerCase()) ? 'temperatura observada' : '',
      !compressor || compressor.physical?.epistemic !== 'observado' || compressor.params?.operatingState !== 'running' ? 'compresor observado en operación' : '',
      !(rate > 0) || !Number.isFinite(rate) ? 'tasa térmica declarada' : '',
    ].filter(Boolean);
    if (missing.length) return [{reference: camera?.name || 'Cámara', state: 'incompleto', detail: 'Faltan parámetros para simular el cambio térmico.', epistemic: 'simulado', missing}];
    const projected = temp!.value - rate * hours;
    return [{reference: camera!.name || camera!.id, state: 'calculable', detail: `${temp!.value.toFixed(1)} → ${projected.toFixed(1)} °C en ${hours} h, según tasa declarada. Sin modelar pérdidas ni aperturas.`, epistemic: 'simulado', missing: ['pérdidas térmicas', 'aperturas', 'curva real del equipo']}];
  },
});

registerPhysicalSimulationProvider({
  id: 'ge.agro.irrigation.basic', contextId: 'agricultura',
  simulate(project, hours) {
    const soil = project.comps.find(c => c.kind === 'suelo');
    const irrigation = project.comps.find(c => c.kind === 'riego');
    const pump = project.comps.find(c => c.kind === 'bomba' && c.physical?.sourceManifest === 'agricultura');
    const humidity = soil && latest(project, soil.id, 'humidity');
    const rate = Number(irrigation?.params?.moistureGainPctPerHour);
    const missing = [
      !soil ? 'suelo' : '',
      !humidity || humidity.unit !== '%' ? 'humedad observada' : '',
      !irrigation || !(rate > 0) || !Number.isFinite(rate) ? 'tasa de riego declarada' : '',
      !pump || pump.physical?.epistemic !== 'observado' || pump.params?.operatingState !== 'running' ? 'bomba observada en operación' : '',
      !(project.measurements || []).some(m => m.property === 'available' && m.epistemic === 'observado' && m.unit === 'L' && project.comps.some(c => c.id === m.reference && c.kind === 'reservorio')) ? 'agua observada en reservorio' : '',
    ].filter(Boolean);
    if (missing.length) return [{reference: soil?.name || 'Suelo', state: 'incompleto', detail: 'Faltan parámetros para simular riego.', epistemic: 'simulado', missing}];
    const projected = Math.min(100, humidity!.value + rate * hours);
    return [{reference: soil!.name || soil!.id, state: 'calculable', detail: `${humidity!.value.toFixed(1)} → ${projected.toFixed(1)} % en ${hours} h, según tasa declarada. No ejecuta la bomba.`, epistemic: 'simulado', missing: ['infiltración', 'evaporación', 'calibración de riego']}];
  },
});
