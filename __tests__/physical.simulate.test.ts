import {test, expect} from '@jest/globals';
import {emptyPhysicalProject, addManualMeasure, type PhysicalProject} from '../src/goodenergy/physical.model';
import {simulatePhysicalSystem} from '../src/goodenergy/physical.simulate';

test('generic simulation needs a provider for a future context', () => {
  const event = simulatePhysicalSystem(emptyPhysicalProject(), 'future.energy', 1)[0];
  expect(event.state).toBe('incompleto');
  expect(event.missing).toContain('provider de simulación');
});

test('HVAC simulation uses only declared rate and observed equipment state', () => {
  let project: PhysicalProject = {
    ...emptyPhysicalProject(),
    comps: [
      {id: 'camera', kind: 'camara.frio', roomId: '', attach: 'floor' as const, x: 0, y: 0, name: 'Cámara'},
      {id: 'compressor', kind: 'compresor', roomId: '', attach: 'floor' as const, x: 0, y: 0,
        params: {coolingRateCPerHour: 1, operatingState: 'running'},
        physical: {role: 'transform', resource: 'refrigerant', epistemic: 'observado' as const}},
    ],
  };
  expect(simulatePhysicalSystem(project, 'refrigeracion', 1)[0].state).toBe('incompleto');
  project = addManualMeasure(project, 8.1, '°C', 'camera', undefined, 'temperature');
  const result = simulatePhysicalSystem(project, 'refrigeracion', 1)[0];
  expect(result.state).toBe('calculable');
  expect(result.epistemic).toBe('simulado');
  expect(result.detail).toContain('7.1');
});
