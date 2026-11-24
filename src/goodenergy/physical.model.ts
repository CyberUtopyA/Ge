/** GE physical meaning layered onto the existing rooms/comps scene. Coordinates are metres. */
export type Epistemic =
  | 'observado'
  | 'calculado'
  | 'simulado'
  | 'inferido'
  | 'propuesto'
  | 'ejecutado';
export type MeasureBasis = 'medido' | 'calculado' | 'estimado' | 'propuesto';
export type Origin =
  | 'manual'
  | 'camera'
  | 'sensor'
  | 'depth'
  | 'laser'
  | 'plan'
  | 'instrument'
  | (string & {});
export type PhysicalRoom = {
  id: string;
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  roof: boolean;
  name?: string;
};
export type PhysicalComp = {
  id: string;
  kind: string;
  roomId: string;
  attach: 'floor' | 'wall' | 'roof';
  x: number;
  y: number;
  params?: Record<string, any>;
  name?: string;
  rotation?: number;
  groupId?: string;
  physical?: {
    role: string;
    resource?: string;
    capabilityIds?: string[];
    epistemic?: Epistemic;
    evidence?: string[];
    sourceManifest?: string;
  };
  board?: {
    boardId: string;
    x: number;
    y: number;
    role?: 'fuerza' | 'mando' | 'automatizacion';
  };
};
export type PhysicalRoute = {
  id: string;
  from: string;
  to: string;
  points: Array<{x: number; y: number}>;
  circuitId?: string;
  kind: 'conduit' | 'wire' | 'relation' | 'flow';
  physical?: {resource?: string; epistemic?: Epistemic; evidence?: string[]};
  board?: {boardId: string; points: Array<{x: number; y: number}>};
};
export type PhysicalMeasure = {
  id: string;
  value: number;
  unit: string;
  origin: Origin;
  ts: number;
  reference: string;
  property?: string;
  uncertainty?: number;
  evidence?: string;
  epistemic: Epistemic;
  basis?: MeasureBasis;
};
export type PhysicalReferenceAsset = {
  id: string;
  uri: string;
  format: 'image' | 'pdf' | 'svg' | 'dxf' | 'dwg' | 'mo' | (string & {});
  source: string;
  importedAt: number;
  title?: string;
  roomId?: string;
};
export type PhysicalProject = {
  rooms: PhysicalRoom[];
  comps: PhysicalComp[];
  routes?: PhysicalRoute[];
  measurements?: PhysicalMeasure[];
  references?: PhysicalReferenceAsset[];
  investigations?: PhysicalInvestigation[];
  availabilities?: PhysicalAvailability[];
  fieldRecords?: PhysicalFieldRecord[];
  comparisons?: PhysicalComparison[];
  meta?: {boardType?: string; title?: string; [key: string]: any};
};
export type PhysicalInvestigation = {
  id: string;
  title: string;
  hypothesis: string;
  conditions?: string;
  startedAt: number;
  componentIds: string[];
  variableReferences: string[];
  measurementIds: string[];
  findings: Array<{id: string; text: string; epistemic: Epistemic; evidence: string[]; ts: number}>;
};
export type PhysicalAvailability = {
  id: string;
  sourceId: string;
  resource: string;
  quantity: number;
  unit: string;
  availableFrom: number;
  availableUntil: number;
  constraints?: string;
  authority?: string;
  evidence: string[];
  measurementIds: string[];
  locationReference?: string;
  epistemic: Epistemic;
  createdAt: number;
};
export type PhysicalFieldRecord = {
  id: string;
  reference: string;
  statement: string;
  epistemic: Epistemic;
  evidence: string[];
  outcomeReference?: string;
  ts: number;
};
export type PhysicalComparison = {
  id: string;
  beforeId: string;
  afterId: string;
  action: string;
  evidence: string[];
  outcomeReference?: string;
  ts: number;
};

export const emptyPhysicalProject = (): PhysicalProject => ({
  rooms: [],
  comps: [],
  routes: [],
  measurements: [],
  references: [],
  investigations: [],
  availabilities: [],
  fieldRecords: [],
  comparisons: [],
  meta: {title: 'Mi instalación'},
});
export const physicalId = (prefix: string) =>
  `${prefix}:${Date.now().toString(36)}:${Math.random()
    .toString(36)
    .slice(2, 7)}`;
export const snapPhysical = (n: number, step = 0.25) =>
  Math.round(n / step) * step;

export function normalizePhysicalProject(value: any): PhysicalProject {
  return {
    rooms: Array.isArray(value?.rooms) ? value.rooms : [],
    comps: Array.isArray(value?.comps) ? value.comps : [],
    routes: Array.isArray(value?.routes) ? value.routes : [],
    measurements: Array.isArray(value?.measurements) ? value.measurements : [],
    references: Array.isArray(value?.references) ? value.references : [],
    investigations: Array.isArray(value?.investigations) ? value.investigations : [],
    availabilities: Array.isArray(value?.availabilities) ? value.availabilities : [],
    fieldRecords: Array.isArray(value?.fieldRecords) ? value.fieldRecords : [],
    comparisons: Array.isArray(value?.comparisons) ? value.comparisons : [],
    meta:
      value?.meta && typeof value.meta === 'object'
        ? value.meta
        : {title: 'Mi instalación'},
  };
}

export function componentPoint(
  project: PhysicalProject,
  component: PhysicalComp,
) {
  const room = project.rooms.find(r => r.id === component.roomId);
  return {x: (room?.x || 0) + component.x, y: (room?.y || 0) + component.y};
}

const CIRCUIT_COLORS = [
  '#E18A55',
  '#4D8FB7',
  '#9A6BB5',
  '#4B9B79',
  '#C96D89',
  '#B5953F',
];
export function circuitColor(id?: string) {
  if (!id) return '#9AAC9F';
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return CIRCUIT_COLORS[hash % CIRCUIT_COLORS.length];
}

export function componentCircuitId(component: PhysicalComp) {
  return component.kind === 'circuito'
    ? component.id
    : String(component.params?.circuitId || '');
}

/** Move one or several semantic elements; route endpoints follow their references. */
export function moveComponents(
  project: PhysicalProject,
  ids: string[],
  dx: number,
  dy: number,
): PhysicalProject {
  const moved = new Set(ids);
  const comps = project.comps.map(comp => {
    if (!moved.has(comp.id)) return comp;
    const p = componentPoint(project, comp);
    const x = snapPhysical(p.x + dx),
      y = snapPhysical(p.y + dy);
    const room = project.rooms.find(
      r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.d,
    );
    return room
      ? {
          ...comp,
          roomId: room.id,
          x: snapPhysical(x - room.x),
          y: snapPhysical(y - room.y),
        }
      : comp;
  });
  const next = {...project, comps};
  const byId = new Map(comps.map(c => [c.id, c]));
  return {
    ...next,
    routes: (project.routes || []).map(route => {
      if (!moved.has(route.from) && !moved.has(route.to)) return route;
      const points = [...route.points];
      const from = byId.get(route.from),
        to = byId.get(route.to);
      if (from && moved.has(from.id)) points[0] = componentPoint(next, from);
      if (to && moved.has(to.id))
        points[points.length - 1] = componentPoint(next, to);
      return {...route, points};
    }),
  };
}

export function duplicateComponents(
  project: PhysicalProject,
  ids: string[],
): PhysicalProject {
  const selected = project.comps.filter(c => ids.includes(c.id));
  if (!selected.length) return project;
  const idMap = new Map(selected.map(c => [c.id, physicalId(c.kind)]));
  const comps = selected.map(c => {
    const room = project.rooms.find(r => r.id === c.roomId);
    return {
      ...c,
      id: idMap.get(c.id)!,
      name: `${c.name || c.kind} copia`,
      x: Math.max(0, Math.min(room?.w ?? Infinity, snapPhysical(c.x + 0.5))),
      y: Math.max(0, Math.min(room?.d ?? Infinity, snapPhysical(c.y + 0.5))),
      params: {
        ...c.params,
        circuitId:
          idMap.get(String(c.params?.circuitId)) || c.params?.circuitId,
      },
    };
  });
  const next = {...project, comps: [...project.comps, ...comps]};
  const copies = new Map(comps.map(c => [c.id, c]));
  const routes = (project.routes || [])
    .filter(r => idMap.has(r.from) && idMap.has(r.to))
    .map(r => {
      const from = idMap.get(r.from)!,
        to = idMap.get(r.to)!;
      const points = r.points.map(p => ({
        x: snapPhysical(p.x + 0.5),
        y: snapPhysical(p.y + 0.5),
      }));
      points[0] = componentPoint(next, copies.get(from)!);
      points[points.length - 1] = componentPoint(next, copies.get(to)!);
      return {
        ...r,
        id: physicalId('route'),
        from,
        to,
        points,
        circuitId: r.circuitId
          ? idMap.get(r.circuitId) || r.circuitId
          : undefined,
      };
    });
  return {
    ...project,
    comps: [...project.comps, ...comps],
    routes: [...(project.routes || []), ...routes],
  };
}

export function updateRouteWaypoint(
  project: PhysicalProject,
  routeId: string,
  index: number,
  point: {x: number; y: number},
): PhysicalProject {
  return {
    ...project,
    routes: (project.routes || []).map(route =>
      route.id === routeId && index > 0 && index < route.points.length - 1
        ? {
            ...route,
            points: route.points.map((p, i) =>
              i === index
                ? {x: snapPhysical(point.x), y: snapPhysical(point.y)}
                : p,
            ),
          }
        : route,
    ),
  };
}

export function insertRouteWaypoint(
  project: PhysicalProject,
  routeId: string,
  segment: number,
): PhysicalProject {
  return {
    ...project,
    routes: (project.routes || []).map(route => {
      if (
        route.id !== routeId ||
        segment < 0 ||
        segment >= route.points.length - 1
      )
        return route;
      const a = route.points[segment],
        b = route.points[segment + 1];
      const points = [...route.points];
      points.splice(segment + 1, 0, {
        x: snapPhysical((a.x + b.x) / 2),
        y: snapPhysical((a.y + b.y) / 2),
      });
      return {...route, points};
    }),
  };
}

const LOAD_KINDS = ['toma', 'luz', 'motor', 'bomba', 'aire', 'carga'];
export function electricalProjection(project: PhysicalProject) {
  const comps = project.comps;
  const electrical = (c: PhysicalComp) =>
    !c.physical || (c.physical.sourceManifest === 'electricidad' && c.physical.resource === 'electricity');
  const loads = comps.filter(c => electrical(c) && LOAD_KINDS.includes(c.kind));
  const circuits = comps.filter(c => electrical(c) && c.kind === 'circuito');
  const boards = comps.filter(c => electrical(c) && c.kind === 'tablero');
  const protections = comps.filter(c => electrical(c) && c.kind === 'proteccion');
  const rows = circuits.map(circuit => {
    const circuitLoads = loads.filter(
      load => load.params?.circuitId === circuit.id,
    );
    const watts = circuitLoads.reduce(
      (sum, load) => sum + (Number(load.params?.watts) || 0),
      0,
    );
    const voltage = Number(circuit.params?.voltage) || 0;
    const protection = protections.find(
      p => p.params?.circuitId === circuit.id,
    );
    return {
      circuit,
      loads: circuitLoads,
      watts,
      amperes: voltage > 0 && watts > 0 ? watts / voltage : null,
      protection,
      voltage: voltage || null,
    };
  });
  return {
    boards,
    rows,
    unassigned: loads.filter(
      load => !circuits.some(c => c.id === load.params?.circuitId),
    ),
    connectedWatts: rows.reduce((sum, row) => sum + row.watts, 0),
  };
}

export type Scenario =
  | 'normal'
  | 'motor_bloqueado'
  | 'fase_perdida'
  | 'sensor_ausente'
  | 'sobrecarga'
  | 'circuito_abierto';
function faultFactor(
  row: ReturnType<typeof electricalProjection>['rows'][number],
  scenario: Scenario,
): number | null {
  if (scenario === 'sobrecarga') {
    const factor = Number(row.circuit.params?.overloadFactor);
    return factor > 1 ? factor : null;
  }
  if (scenario === 'motor_bloqueado') {
    const motor = row.loads.find(l =>
      ['motor', 'bomba', 'aire'].includes(l.kind),
    );
    if (!motor) return 1;
    const factor = Number(motor.params?.blockMultiplier);
    return factor > 1 ? factor : null;
  }
  return 1;
}
export function simulatePhysical(project: PhysicalProject, scenario: Scenario) {
  const projection = electricalProjection(project);
  const events: Array<{
    reference: string;
    state: string;
    epistemic: Epistemic;
    detail: string;
  }> = [];
  for (const row of projection.rows) {
    const ref = row.circuit.name || row.circuit.id;
    if (
      projection.boards[0]?.params?.sourceReady !== true ||
      !row.voltage ||
      !row.protection ||
      row.amperes === null ||
      !Number(row.protection.params?.amperes) ||
      row.loads.some(load => !(Number(load.params?.watts) > 0))
    ) {
      events.push({
        reference: ref,
        state: 'Parámetros insuficientes',
        epistemic: 'simulado',
        detail: 'Definí fuente, tensión, potencia de cada carga y protección.',
      });
      continue;
    }
    const rated = Number(row.protection.params?.amperes);
    const current = row.amperes;
    const contactors = project.comps.filter(
      c => c.kind === 'contacto' && c.params?.circuitId === row.circuit.id,
    );
    if (contactors.some(c => c.params?.closed === undefined)) {
      events.push({
        reference: ref,
        state: 'Parámetros insuficientes',
        epistemic: 'simulado',
        detail: 'Falta el estado propuesto de un contactor.',
      });
      continue;
    }
    const factor = faultFactor(row, scenario);
    if (factor === null) {
      events.push({
        reference: ref,
        state: 'Parámetros insuficientes',
        epistemic: 'simulado',
        detail: 'Falta el factor de falla declarado para este escenario.',
      });
      continue;
    }
    const estimated = current * factor;
    const open =
      scenario === 'circuito_abierto' ||
      contactors.some(c => c.params?.closed === false);
    events.push({
      reference: ref,
      state: open
        ? 'Sin flujo'
        : estimated > rated
        ? 'Corriente sobre nominal'
        : 'Flujo estimado',
      epistemic: 'simulado',
      detail: open
        ? 'Circuito interrumpido.'
        : `${estimated.toFixed(
            1,
          )} A estimados · protección nominal ${rated} A. La actuación real requiere curva y condiciones verificadas.`,
    });
  }
  if (scenario === 'fase_perdida' || scenario === 'sensor_ausente') {
    events.push({
      reference: 'Sistema',
      state: 'Estado incierto',
      epistemic: 'simulado',
      detail:
        scenario === 'fase_perdida'
          ? 'Faltan fases y topología para calcular efectos.'
          : 'La señal ausente no confirma el estado físico.',
    });
  }
  if (!projection.rows.length)
    events.push({
      reference: 'Instalación',
      state: 'Sin circuitos',
      epistemic: 'simulado',
      detail: 'Agregá un circuito para explorar el flujo.',
    });
  return events;
}

export type SimulatedElementState = {
  id: string;
  label: string;
  state:
    | 'energizado'
    | 'desenergizado'
    | 'proteccion_posible'
    | 'abierto'
    | 'cerrado'
    | 'detenido'
    | 'operando'
    | 'entrada_activa'
    | 'salida_activa'
    | 'indeterminado';
  epistemic: 'simulado';
  detail: string;
};
export function simulateFlow(project: PhysicalProject, scenario: Scenario) {
  const projection = electricalProjection(project);
  const states: SimulatedElementState[] = [];
  const board = projection.boards[0];
  if (board)
    states.push({
      id: board.id,
      label: board.name || 'Tablero',
      state:
        scenario === 'fase_perdida' || board.params?.sourceReady !== true
          ? 'indeterminado'
          : 'energizado',
      epistemic: 'simulado',
      detail:
        board.params?.sourceReady === true
          ? 'Fuente declarada para el modelo.'
          : 'Fuente sin declarar.',
    });
  for (const row of projection.rows) {
    const hasPower =
      row.voltage !== null &&
      row.loads.length > 0 &&
      row.loads.every(load => Number(load.params?.watts) > 0);
    const complete =
      !!board &&
      board.params?.sourceReady === true &&
      !!row.protection &&
      Number(row.protection.params?.amperes) > 0 &&
      hasPower;
    const opened = scenario === 'circuito_abierto';
    const contactors = project.comps.filter(
      c => c.kind === 'contacto' && c.params?.circuitId === row.circuit.id,
    );
    const contactUnknown = contactors.some(c => c.params?.closed === undefined);
    const contactOpen = contactors.some(c => c.params?.closed === false);
    const factor = faultFactor(row, scenario);
    const possibleTrip =
      complete &&
      factor !== null &&
      row.amperes !== null &&
      row.amperes * factor > Number(row.protection?.params?.amperes);
    if (row.protection)
      states.push({
        id: row.protection.id,
        label: row.protection.name || 'Protección',
        state:
          !complete || factor === null
            ? 'indeterminado'
            : possibleTrip
            ? 'proteccion_posible'
            : opened
            ? 'abierto'
            : 'cerrado',
        epistemic: 'simulado',
        detail: possibleTrip
          ? 'Posible actuación; faltan curva y condiciones reales.'
          : !complete || factor === null
          ? 'Parámetros insuficientes.'
          : 'Estado derivado del escenario.',
      });
    const circuitState =
      !complete || factor === null || contactUnknown
        ? 'indeterminado'
        : opened || contactOpen
        ? 'desenergizado'
        : possibleTrip
        ? 'proteccion_posible'
        : scenario === 'fase_perdida'
        ? 'indeterminado'
        : 'energizado';
    states.push({
      id: row.circuit.id,
      label: row.circuit.name || 'Circuito',
      state: circuitState,
      epistemic: 'simulado',
      detail: contactUnknown
        ? 'Falta estado propuesto del contactor.'
        : complete
        ? 'Flujo de escenario.'
        : 'Faltan fuente, protección, tensión o potencia.',
    });
    for (const load of row.loads) {
      let state: SimulatedElementState['state'] = circuitState;
      if (['motor', 'bomba', 'aire'].includes(load.kind))
        state =
          circuitState === 'energizado'
            ? load.params?.runCommand === true
              ? 'operando'
              : load.params?.runCommand === false
              ? 'detenido'
              : 'indeterminado'
            : circuitState === 'desenergizado'
            ? 'detenido'
            : 'indeterminado';
      if (load.kind === 'sensor')
        state =
          scenario === 'sensor_ausente'
            ? 'indeterminado'
            : load.params?.active === true
            ? 'entrada_activa'
            : 'indeterminado';
      states.push({
        id: load.id,
        label: load.name || load.kind,
        state,
        epistemic: 'simulado',
        detail:
          state === 'indeterminado'
            ? 'Falta estado de mando o parámetros.'
            : 'Resultado del escenario.',
      });
    }
  }
  for (const component of project.comps.filter(c =>
    ['contacto', 'rele', 'sensor', 'actuador'].includes(c.kind),
  )) {
    if (states.some(s => s.id === component.id)) continue;
    const state: SimulatedElementState['state'] =
      component.kind === 'sensor'
        ? scenario === 'sensor_ausente'
          ? 'indeterminado'
          : component.params?.active === true
          ? 'entrada_activa'
          : 'indeterminado'
        : component.kind === 'actuador'
        ? component.params?.active === true
          ? 'salida_activa'
          : 'indeterminado'
        : component.params?.closed === true
        ? 'cerrado'
        : component.params?.closed === false
        ? 'abierto'
        : 'indeterminado';
    states.push({
      id: component.id,
      label: component.name || component.kind,
      state,
      epistemic: 'simulado',
      detail: 'Estado de mando propuesto para el escenario.',
    });
  }
  return states;
}

export function addManualMeasure(
  project: PhysicalProject,
  value: number,
  unit: string,
  reference: string,
  uncertainty?: number,
  property?: string,
): PhysicalProject {
  if (!Number.isFinite(value) || value < 0 || !unit.trim() || !reference.trim())
    return project;
  if (
    uncertainty !== undefined &&
    (!Number.isFinite(uncertainty) || uncertainty < 0)
  )
    return project;
  return {
    ...project,
    measurements: [
      ...(project.measurements || []),
      {
        id: physicalId('measure'),
        value,
        unit: unit.trim(),
        origin: 'manual',
        ts: Date.now(),
        reference: reference.trim(),
        property: property?.trim() || undefined,
        uncertainty,
        epistemic: 'observado',
        basis: 'medido',
      },
    ],
  };
}
