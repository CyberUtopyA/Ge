import {
  addManualMeasure,
  electricalProjection,
  emptyPhysicalProject,
  simulatePhysical,
  type PhysicalProject,
} from '../src/goodenergy/physical.model';
import {
  measurementDV,
  projectLivingPhysicalNode,
} from '../src/goodenergy/physical.capabilities';
import {
  parsePhysicalIntent,
  proposeIntent,
} from '../src/goodenergy/physical.intent';
import {test, expect} from '@jest/globals';

const project: PhysicalProject = {
  rooms: [{id: 'room:1', x: 0, y: 0, w: 6, d: 4, h: 3, roof: false}],
  comps: [
    {
      id: 'TD1',
      kind: 'tablero',
      roomId: 'room:1',
      attach: 'wall',
      x: 0,
      y: 1,
      name: 'TD1',
      params: {sourceReady: true},
    },
    {
      id: 'C1',
      kind: 'circuito',
      roomId: 'room:1',
      attach: 'wall',
      x: 1,
      y: 1,
      name: 'C1',
      params: {voltage: 230},
    },
    {
      id: 'Q1',
      kind: 'proteccion',
      roomId: 'room:1',
      attach: 'wall',
      x: 1,
      y: 2,
      name: 'Q1',
      params: {circuitId: 'C1', amperes: 10},
    },
    {
      id: 'M1',
      kind: 'motor',
      roomId: 'room:1',
      attach: 'floor',
      x: 3,
      y: 2,
      name: 'M1',
      params: {circuitId: 'C1', watts: 1150, blockMultiplier: 3},
    },
  ],
};

test('projects a circuit and marks a blocked motor as simulated', () => {
  expect(electricalProjection(project).rows[0].amperes).toBe(5);
  const event = simulatePhysical(project, 'motor_bloqueado')[0];
  expect(event.state).toBe('Corriente sobre nominal');
  expect(event.epistemic).toBe('simulado');
});

test('does not invent a current when voltage or protection is absent', () => {
  const incomplete = {
    ...project,
    comps: project.comps.filter(c => c.id !== 'Q1'),
  };
  expect(simulatePhysical(incomplete, 'normal')[0].state).toBe(
    'Parámetros insuficientes',
  );
});

test('records a referenced manual measurement as a physical DV', () => {
  const measured = addManualMeasure(project, 3.5, 'm', 'room:1', 0.02);
  const dv = measurementDV('site:1', measured.measurements![0]);
  expect(dv?.attrs).toMatchObject({
    reference: 'room:1',
    origin: 'manual',
    epistemic: 'observado',
    uncertainty: 0.02,
  });
  expect(addManualMeasure(emptyPhysicalProject(), NaN, 'm', 'missing')).toEqual(
    emptyPhysicalProject(),
  );
});

test('intent proposes elements without claiming execution', () => {
  const parsed = parsePhysicalIntent('Poné tres tomas acá');
  const next = proposeIntent(project, parsed);
  expect(next.comps.filter(c => c.kind === 'toma')).toHaveLength(3);
  expect(next.comps[next.comps.length - 1]?.params?.epistemic).toBe(
    'propuesto',
  );
  const air = proposeIntent(
    project,
    parsePhysicalIntent('Hacé un circuito para el aire'),
  );
  const newCircuit = air.comps.find(
    c => c.kind === 'circuito' && c.id !== 'C1',
  );
  expect(air.comps.find(c => c.kind === 'aire')?.params?.circuitId).toBe(
    newCircuit?.id,
  );
});

test('physical node requires provenance, authority, relation and evidence', () => {
  const continuity = {
    reference: {id: 'motor:1', kind: 'motor', provenance: 'adapter:1'},
    authority: 'mandate:1',
    state: {running: true},
    capabilities: ['observe' as const],
    relations: ['C1'],
    evidence: ['sample:1'],
    observedAt: 42,
  };
  expect(projectLivingPhysicalNode(continuity)?.id).toBe('ge:physical:motor:1');
  expect(projectLivingPhysicalNode({...continuity, evidence: []})).toBeNull();
});
