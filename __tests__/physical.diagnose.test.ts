import {test, expect} from '@jest/globals';
import {addManualMeasure, emptyPhysicalProject} from '../src/goodenergy/physical.model';
import {addPhysicalSystemElement, getPhysicalTools} from '../src/goodenergy/physical.system';
import {comparisonDV, createComparison, diagnosePhysical} from '../src/goodenergy/physical.diagnose';
import {parsePhysicalIntent} from '../src/goodenergy/physical.intent';

test('HVAC reports an inferred discrepancy and missing evidence, never an observed fault', () => {
  const tool = getPhysicalTools('refrigeracion').find(t => t.kind === 'camara.frio')!;
  let project = addPhysicalSystemElement(emptyPhysicalProject(), tool, 'refrigeracion');
  const camera = project.comps[0];
  project = {...project, comps: [{...camera, params: {targetTemperatureC: 2}}]};
  project = addManualMeasure(project, 8.1, '°C', camera.id, undefined, 'temperature');
  const report = diagnosePhysical(project, 'refrigeracion', camera.id);
  expect(report.hypotheses[0].epistemic).toBe('inferido');
  expect(report.hypotheses[0].evidenceIds).toContain(project.measurements![0].id);
  expect(report.missing).toContain('presión del circuito');
  expect(parsePhysicalIntent('Esta cámara debería estar a 2 grados').kind).toBe('target');
});

test('before/after requires matching observed measurements and intervention evidence', () => {
  let project = emptyPhysicalProject();
  project = addManualMeasure(project, 8.1, '°C', 'camera:1', undefined, 'temperature');
  project = addManualMeasure(project, 2.4, '°C', 'camera:1', undefined, 'temperature');
  project = {...project, measurements: project.measurements!.map((m, i) => i === 1 ? {...m, ts: project.measurements![0].ts + 1000} : m)};
  const [before, after] = project.measurements!;
  expect(createComparison(project, before.id, after.id, 'Mantenimiento', [])).toBe(project);
  project = createComparison(project, before.id, after.id, 'Mantenimiento', ['photo:after']);
  const dv = comparisonDV(project, 'site', project.comparisons![0]);
  expect(dv?.attrs.delta).toBeCloseTo(-5.7);
  expect(dv?.attrs.deltaEpistemic).toBe('calculado');
  expect(createComparison(project, after.id, before.id, 'Mantenimiento', ['photo:after'])).toBe(project);
});

test('a future diagnostic provider can be registered without changing GE', () => {
  const report = diagnosePhysical(emptyPhysicalProject(), 'future.energy');
  expect(report.hypotheses).toEqual([]);
  expect(report.missing).toContain('provider diagnóstico del contexto');
});
