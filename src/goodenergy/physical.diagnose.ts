import {
  PhysicalComparison, PhysicalMeasure, PhysicalProject, physicalId,
} from './physical.model';

export type DiagnosticHypothesis = {
  text: string;
  epistemic: 'inferido';
  evidenceIds: string[];
  missing: string[];
};
export type DiagnosticReport = {
  contextId: string;
  reference?: string;
  observed: PhysicalMeasure[];
  hypotheses: DiagnosticHypothesis[];
  missing: string[];
};
export type DiagnosticProvider = {
  id: string;
  contextId: string;
  evaluate: (project: PhysicalProject, reference?: string) => DiagnosticReport;
};
const providers = new Map<string, DiagnosticProvider>();
export function registerDiagnosticProvider(provider: DiagnosticProvider) {
  if (!provider.id || !provider.contextId) throw new Error('Provider diagnóstico incompleto');
  providers.set(provider.contextId, provider);
}
export function diagnosePhysical(project: PhysicalProject, contextId: string, reference?: string): DiagnosticReport {
  const provider = providers.get(contextId);
  if (provider) return provider.evaluate(project, reference);
  const observed = (project.measurements || []).filter(m => m.epistemic === 'observado' && (!reference || m.reference === reference));
  return {contextId, reference, observed, hypotheses: [], missing: observed.length ? ['provider diagnóstico del contexto'] : ['medición observada', 'provider diagnóstico del contexto']};
}

const latest = (measures: PhysicalMeasure[], property: string) =>
  measures.filter(m => m.property === property).sort((a, b) => b.ts - a.ts)[0];

registerDiagnosticProvider({
  id: 'ge.hvac.basic', contextId: 'refrigeracion',
  evaluate(project, reference) {
    const camera = project.comps.find(c => c.id === reference && c.kind === 'camara.frio') ||
      project.comps.find(c => c.kind === 'camara.frio');
    const selectedReference = camera?.id || reference;
    const observed = (project.measurements || []).filter(m => m.epistemic === 'observado' && (!selectedReference || m.reference === selectedReference));
    const temp = latest(observed, 'temperature');
    const target = Number(camera?.params?.targetTemperatureC);
    const hasTarget = camera?.params?.targetTemperatureC !== undefined && Number.isFinite(target);
    const missing: string[] = [];
    const hypotheses: DiagnosticHypothesis[] = [];
    if (!temp || !['°c', 'c', 'celsius'].includes(temp.unit.toLowerCase())) missing.push('temperatura observada de la cámara');
    if (!hasTarget) missing.push('meta térmica declarada');
    if (temp && hasTarget && temp.value > target && ['°c', 'c', 'celsius'].includes(temp.unit.toLowerCase())) {
      hypotheses.push({
        text: `Temperatura ${temp.value} ${temp.unit} sobre la meta propuesta ${target} °C; la causa aún no está determinada.`,
        epistemic: 'inferido', evidenceIds: [temp.id],
        missing: ['presión del circuito', 'estado observado del compresor', 'consumo/corriente observados', 'flujo de aire o agua'],
      });
      missing.push(...hypotheses[0].missing);
    }
    if (temp && hasTarget && temp.value <= target && ['°c', 'c', 'celsius'].includes(temp.unit.toLowerCase())) {
      hypotheses.push({text: 'La última temperatura observada cumple la meta declarada; aún falta continuidad temporal.', epistemic: 'inferido', evidenceIds: [temp.id], missing: ['serie temporal de temperatura']});
      missing.push('serie temporal de temperatura');
    }
    return {contextId: 'refrigeracion', reference: selectedReference, observed, hypotheses, missing: [...new Set(missing)]};
  },
});

registerDiagnosticProvider({
  id: 'ge.agro.basic', contextId: 'agricultura',
  evaluate(project, reference) {
    const soil = project.comps.find(c => c.id === reference && c.kind === 'suelo') || project.comps.find(c => c.kind === 'suelo');
    const selectedReference = soil?.id || reference;
    const observed = (project.measurements || []).filter(m => m.epistemic === 'observado' && (!selectedReference || m.reference === selectedReference));
    const moisture = latest(observed, 'humidity');
    const target = Number(soil?.params?.targetHumidityPct);
    const hasTarget = soil?.params?.targetHumidityPct !== undefined && Number.isFinite(target);
    const missing = [!moisture ? 'humedad observada del suelo' : '', !hasTarget ? 'meta de humedad declarada' : ''].filter(Boolean);
    const hypotheses: DiagnosticHypothesis[] = [];
    if (moisture && hasTarget && moisture.unit === '%' && moisture.value < target) {
      hypotheses.push({text: 'Humedad observada bajo la meta; riego sería una propuesta, su ejecución requiere autorización.', epistemic: 'inferido', evidenceIds: [moisture.id], missing: ['disponibilidad de agua', 'estado de bomba', 'restricciones de riego']});
      missing.push(...hypotheses[0].missing);
    }
    return {contextId: 'agricultura', reference: selectedReference, observed, hypotheses, missing: [...new Set(missing)]};
  },
});

export function comparisonIssues(project: PhysicalProject, beforeId: string, afterId: string, action: string, evidence: string[]) {
  const before = (project.measurements || []).find(m => m.id === beforeId);
  const after = (project.measurements || []).find(m => m.id === afterId);
  const issues: string[] = [];
  if (!before || !after || before.id === after.id) issues.push('dos mediciones distintas');
  if (before && after) {
    if (before.reference !== after.reference) issues.push('misma referencia física');
    if (!before.property || before.property !== after.property) issues.push('misma variable');
    if (before.unit.toLowerCase() !== after.unit.toLowerCase()) issues.push('misma unidad');
    if (before.epistemic !== 'observado' || after.epistemic !== 'observado') issues.push('mediciones observadas');
    if (after.ts <= before.ts) issues.push('orden temporal');
  }
  if (!action.trim()) issues.push('intervención descrita');
  if (!evidence.length) issues.push('evidencia de intervención');
  return issues;
}
export function createComparison(project: PhysicalProject, beforeId: string, afterId: string, action: string, evidence: string[], outcomeReference?: string) {
  if (comparisonIssues(project, beforeId, afterId, action, evidence).length) return project;
  const item: PhysicalComparison = {
    id: physicalId('comparison'), beforeId, afterId, action: action.trim(),
    evidence: evidence.filter(Boolean), outcomeReference: outcomeReference?.trim() || undefined,
    ts: Date.now(),
  };
  return {...project, comparisons: [...(project.comparisons || []), item]};
}
export function comparisonDV(project: PhysicalProject, siteId: string, item: PhysicalComparison) {
  if (comparisonIssues(project, item.beforeId, item.afterId, item.action, item.evidence).length) return null;
  const before = project.measurements!.find(m => m.id === item.beforeId)!;
  const after = project.measurements!.find(m => m.id === item.afterId)!;
  return {
    id: `dv:ge:comparison:${siteId}:${item.id}`, kind: 'ge.physical.comparison',
    labels: ['Antes y después'], traits: ['ge:physical', 'ge:evidence', 'ge:comparison'],
    attrs: {...item, siteId, reference: before.reference, property: before.property, unit: before.unit,
      before: {id: before.id, value: before.value, ts: before.ts, epistemic: before.epistemic},
      after: {id: after.id, value: after.value, ts: after.ts, epistemic: after.epistemic},
      delta: after.value - before.value, deltaEpistemic: 'calculado'},
    meta: {ns: 'energy:physical', scopes: ['local'], ts: item.ts, source: 'ge:field', pinned: true},
  };
}
