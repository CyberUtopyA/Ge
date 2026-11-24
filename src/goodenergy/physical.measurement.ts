import {
  PhysicalProject,
  PhysicalMeasure,
  Origin,
  physicalId,
} from './physical.model';

export type MeasurementReading = {
  value: number;
  unit: string;
  ts: number;
  uncertainty?: number;
  evidence?: string;
  property?: string;
};
export type MeasurementProvider = {
  id: string;
  origin: Origin;
  measure: (reference: string) => Promise<MeasurementReading | null>;
};
let measurementProviders: MeasurementProvider[] = [];
export function setMeasurementProviders(providers: MeasurementProvider[]) {
  measurementProviders = [...providers];
}
export function getMeasurementProviders() {
  return measurementProviders;
}
export function recordProviderMeasure(
  project: PhysicalProject,
  provider: MeasurementProvider,
  reference: string,
  reading: MeasurementReading,
): PhysicalProject {
  if (
    !reference.trim() ||
    !Number.isFinite(reading.value) ||
    reading.value < 0 ||
    !reading.unit.trim() ||
    !Number.isFinite(reading.ts)
  )
    return project;
  const measure: PhysicalMeasure = {
    id: physicalId('measure'),
    value: reading.value,
    unit: reading.unit.trim(),
    origin: provider.origin,
    ts: reading.ts,
    reference,
    property: reading.property?.trim() || undefined,
    uncertainty: reading.uncertainty,
    evidence: reading.evidence,
    epistemic: 'observado',
    basis: 'medido',
  };
  return {...project, measurements: [...(project.measurements || []), measure]};
}
