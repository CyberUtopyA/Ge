import {test, expect} from '@jest/globals';
import {
  addManualMeasure,
  duplicateComponents,
  insertRouteWaypoint,
  moveComponents,
  simulateFlow,
  simulatePhysical,
  updateRouteWaypoint,
  type PhysicalProject,
} from '../src/goodenergy/physical.model';
import {calculateElectrical} from '../src/goodenergy/physical.calculate';
import {attachReference} from '../src/goodenergy/physical.references';
import {
  parsePhysicalIntent,
  proposeIntent,
} from '../src/goodenergy/physical.intent';

const project: PhysicalProject = {
  rooms: [{id: 'R1', x: 0, y: 0, w: 6, d: 4, h: 3, roof: false}],
  comps: [
    {
      id: 'TD1',
      kind: 'tablero',
      roomId: 'R1',
      attach: 'wall',
      x: 0,
      y: 1,
      params: {sourceReady: true},
    },
    {
      id: 'C1',
      kind: 'circuito',
      roomId: 'R1',
      attach: 'wall',
      x: 1,
      y: 1,
      params: {voltage: 230, conductors: 3, conductorAreaMm2: 2.5},
    },
    {
      id: 'Q1',
      kind: 'proteccion',
      roomId: 'R1',
      attach: 'wall',
      x: 2,
      y: 1,
      params: {circuitId: 'C1', amperes: 10},
    },
    {
      id: 'M1',
      kind: 'motor',
      roomId: 'R1',
      attach: 'floor',
      x: 4,
      y: 1,
      params: {circuitId: 'C1', watts: 1150, runCommand: true},
    },
  ],
  routes: [
    {
      id: 'route:1',
      from: 'Q1',
      to: 'M1',
      kind: 'conduit',
      circuitId: 'C1',
      points: [
        {x: 2, y: 1},
        {x: 3, y: 1},
        {x: 4, y: 1},
      ],
    },
  ],
};

test('moving and editing a route preserves anchored endpoints', () => {
  const moved = moveComponents(project, ['M1'], 0, 1);
  expect(moved.routes?.[0].points[moved.routes[0].points.length - 1]).toEqual({
    x: 4,
    y: 2,
  });
  const inserted = insertRouteWaypoint(moved, 'route:1', 0);
  expect(inserted.routes?.[0].points).toHaveLength(4);
  expect(
    updateRouteWaypoint(inserted, 'route:1', 1, {x: 2.7, y: 1.3}).routes?.[0]
      .points[1],
  ).toEqual({x: 2.75, y: 1.25});
});

test('copying a circuit and its load remaps the semantic relationship', () => {
  const copy = duplicateComponents(project, ['C1', 'M1']);
  const circuit = copy.comps.find(c => c.kind === 'circuito' && c.id !== 'C1');
  const motor = copy.comps.find(c => c.kind === 'motor' && c.id !== 'M1');
  expect(motor?.params?.circuitId).toBe(circuit?.id);
});

test('calculation is incomplete without provider and uses measured route length', () => {
  const raw = calculateElectrical(project);
  expect(raw.circuits[0].currentA).toBe(5);
  expect(raw.circuits[0].voltageDropPct).toBeNull();
  expect(raw.circuits[0].conductorLengthM).toBeNull();
  const measured = addManualMeasure(project, 8.2, 'm', 'route:1');
  const withPolicy = calculateElectrical(measured, {
    id: 'local:example',
    resistivityOhmMm2PerM: 0.0175,
    loopFactor: 2,
    conductorAllowancePct: 10,
    evaluateProtection: () => 'review',
  });
  expect(withPolicy.circuits[0].routeLengthM).toBe(8.2);
  expect(withPolicy.circuits[0].routeBasis).toBe('medido');
  expect(withPolicy.circuits[0].conductorLengthM).toBeCloseTo(27.06);
  expect(withPolicy.circuits[0].voltageDropPct).toBeGreaterThan(0);
  expect(withPolicy.circuits[0].protection).toBe('review');
});

test('fault remains indeterminate until a factor is supplied', () => {
  expect(simulatePhysical(project, 'motor_bloqueado')[0].state).toBe(
    'Parámetros insuficientes',
  );
  expect(simulateFlow(project, 'normal').find(s => s.id === 'M1')?.state).toBe(
    'operando',
  );
  const withFactor = {
    ...project,
    comps: project.comps.map(c =>
      c.id === 'M1' ? {...c, params: {...c.params, blockMultiplier: 3}} : c,
    ),
  };
  expect(simulatePhysical(withFactor, 'motor_bloqueado')[0].state).toBe(
    'Corriente sobre nominal',
  );
});

test('an open contactor stops simulated flow without claiming a physical observation', () => {
  const withContact = {
    ...project,
    comps: [
      ...project.comps,
      {
        id: 'K1',
        kind: 'contacto',
        roomId: 'R1',
        attach: 'wall' as const,
        x: 2,
        y: 2,
        params: {circuitId: 'C1', closed: false},
      },
    ],
  };
  expect(
    simulateFlow(withContact, 'normal').find(s => s.id === 'C1')?.state,
  ).toBe('desenergizado');
  expect(
    simulateFlow(withContact, 'normal').find(s => s.id === 'M1')?.state,
  ).toBe('detenido');
  expect(simulatePhysical(withContact, 'normal')[0].state).toBe('Sin flujo');
  expect(
    simulateFlow(
      {
        ...withContact,
        comps: withContact.comps.map(c =>
          c.id === 'K1' ? {...c, params: {circuitId: 'C1'}} : c,
        ),
      },
      'normal',
    ).find(s => s.id === 'C1')?.state,
  ).toBe('indeterminado');
});

test('selected intent and imported reference stay in the same project', () => {
  const intent = parsePhysicalIntent('creá un circuito para estas tomas');
  const base = {
    ...project,
    comps: [
      ...project.comps,
      {
        id: 'T1',
        kind: 'toma',
        roomId: 'R1',
        attach: 'wall' as const,
        x: 3,
        y: 2,
      },
    ],
  };
  const proposed = proposeIntent(base, intent, {selectedIds: ['T1']});
  expect(proposed.comps.find(c => c.id === 'T1')?.params?.circuitId).toBe(
    proposed.comps.find(c => c.kind === 'circuito' && c.id !== 'C1')?.id,
  );
  const referenced = attachReference(proposed, {
    uri: 'content://site/plan.pdf',
    format: 'pdf',
    source: 'manual:uri',
  });
  expect(referenced.references?.[0].format).toBe('pdf');
  expect(referenced.comps).toHaveLength(proposed.comps.length);
  expect(parsePhysicalIntent('esta pared mide 3,60 m').value).toBe(3.6);
});
