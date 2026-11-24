import {
  electricalProjection,
  PhysicalProject,
  PhysicalRoute,
} from './physical.model';

/** Context and normative decisions come from a provider; GE supplies only arithmetic. */
export type ElectricalCalculationPolicy = {
  id: string;
  resistivityOhmMm2PerM?: number;
  loopFactor?: number;
  maxVoltageDropPct?: number;
  conductorAllowancePct?: number;
  evaluateProtection?: (input: {
    currentA: number;
    ratedA: number;
    circuitId: string;
  }) => 'compatible' | 'review' | 'incompatible';
};
let activeCalculationPolicy: ElectricalCalculationPolicy | null = null;
export function setElectricalCalculationPolicy(
  policy: ElectricalCalculationPolicy | null,
) {
  activeCalculationPolicy = policy;
}
export function getElectricalCalculationPolicy() {
  return activeCalculationPolicy;
}
export type CircuitCalculation = {
  circuitId: string;
  name: string;
  loadCount: number;
  declaredPowerW: number | null;
  voltageV: number | null;
  currentA: number | null;
  routeLengthM: number | null;
  routeBasis: 'medido' | 'calculado';
  conduitLengthM: number | null;
  conductorLengthM: number | null;
  voltageDropV: number | null;
  voltageDropPct: number | null;
  protection: 'compatible' | 'review' | 'incompatible' | 'incomplete';
  phase?: string;
  missing: string[];
  policyId?: string;
};

export function pathLength(route: PhysicalRoute) {
  return route.points
    .slice(1)
    .reduce(
      (total, p, i) =>
        total + Math.hypot(p.x - route.points[i].x, p.y - route.points[i].y),
      0,
    );
}

export function calculateElectrical(
  project: PhysicalProject,
  policy?: ElectricalCalculationPolicy,
) {
  const projection = electricalProjection(project);
  const circuits: CircuitCalculation[] = projection.rows.map(row => {
    const missing: string[] = [];
    const powers = row.loads.map(load => Number(load.params?.watts));
    const declaredPowerW =
      row.loads.length && powers.every(p => Number.isFinite(p) && p >= 0)
        ? powers.reduce((a, b) => a + b, 0)
        : null;
    if (declaredPowerW === null) missing.push('potencia de cada carga');
    const voltageV =
      Number(row.circuit.params?.voltage) > 0
        ? Number(row.circuit.params?.voltage)
        : null;
    if (voltageV === null) missing.push('tensión');
    const currentA =
      declaredPowerW !== null && voltageV !== null
        ? declaredPowerW / voltageV
        : null;
    const routes = (project.routes || []).filter(
      route =>
        route.circuitId === row.circuit.id &&
        route.kind === 'conduit' &&
        !route.board,
    );
    const measuredRoutes = new Set<string>();
    const routeLengthM = routes.length
      ? routes.reduce((sum, route) => {
          const measure = [...(project.measurements || [])]
            .reverse()
            .find(
              m =>
                m.reference === route.id &&
                m.unit === 'm' &&
                m.basis === 'medido',
            );
          if (measure) measuredRoutes.add(route.id);
          return sum + (measure ? measure.value : pathLength(route));
        }, 0)
      : null;
    if (routeLengthM === null) missing.push('recorrido');
    const conduitLengthM = routeLengthM;
    const conductors = Number(row.circuit.params?.conductors);
    if (!Number.isInteger(conductors) || conductors <= 0)
      missing.push('cantidad de conductores');
    const allowance = policy?.conductorAllowancePct;
    const conductorLengthM =
      routeLengthM !== null &&
      Number.isInteger(conductors) &&
      conductors > 0 &&
      allowance !== undefined &&
      allowance >= 0
        ? routeLengthM * conductors * (1 + allowance / 100)
        : null;
    if (conductorLengthM === null && routeLengthM !== null && conductors > 0)
      missing.push('margen de conductor (provider)');
    const area = Number(row.circuit.params?.conductorAreaMm2);
    if (!(area > 0)) missing.push('sección de conductor');
    const rho = policy?.resistivityOhmMm2PerM,
      factor = policy?.loopFactor;
    const voltageDropV =
      currentA !== null &&
      routeLengthM !== null &&
      area > 0 &&
      rho !== undefined &&
      rho > 0 &&
      factor !== undefined &&
      factor > 0
        ? (currentA * routeLengthM * factor * rho) / area
        : null;
    if (voltageDropV === null) missing.push('provider de caída de tensión');
    const voltageDropPct =
      voltageDropV !== null && voltageV !== null
        ? (voltageDropV / voltageV) * 100
        : null;
    const ratedA = Number(row.protection?.params?.amperes);
    if (!(ratedA > 0)) missing.push('protección');
    const protection =
      currentA !== null && ratedA > 0 && policy?.evaluateProtection
        ? policy.evaluateProtection({
            currentA,
            ratedA,
            circuitId: row.circuit.id,
          })
        : 'incomplete';
    if (protection === 'incomplete') missing.push('policy de protección');
    return {
      circuitId: row.circuit.id,
      name: row.circuit.name || row.circuit.id,
      loadCount: row.loads.length,
      declaredPowerW,
      voltageV,
      currentA,
      routeLengthM,
      routeBasis:
        routes.length && measuredRoutes.size === routes.length
          ? ('medido' as const)
          : ('calculado' as const),
      conduitLengthM,
      conductorLengthM,
      voltageDropV,
      voltageDropPct,
      protection,
      phase: row.circuit.params?.phase,
      missing: [...new Set(missing)],
      policyId: policy?.id,
    };
  });
  const knownPowerW = circuits.reduce(
    (sum, c) => sum + (c.declaredPowerW || 0),
    0,
  );
  const completePower =
    circuits.every(c => c.declaredPowerW !== null) &&
    projection.unassigned.length === 0;
  const phaseTotals: Record<string, number> = {};
  for (const c of circuits)
    if (c.phase && c.declaredPowerW !== null)
      phaseTotals[c.phase] = (phaseTotals[c.phase] || 0) + c.declaredPowerW;
  const phaseValues = Object.values(phaseTotals);
  const phaseAverage =
    phaseValues.reduce((sum, value) => sum + value, 0) / phaseValues.length;
  const phaseImbalancePct =
    phaseValues.length > 1 &&
    phaseAverage > 0 &&
    circuits.every(c => c.phase && c.declaredPowerW !== null)
      ? ((Math.max(...phaseValues) - Math.min(...phaseValues)) / phaseAverage) *
        100
      : null;
  return {
    circuits,
    knownPowerW,
    completePower,
    unassignedCount: projection.unassigned.length,
    phaseTotals,
    phaseImbalancePct,
    policyId: policy?.id,
  };
}
