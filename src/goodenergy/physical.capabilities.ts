import type {Epistemic, PhysicalMeasure, PhysicalAvailability, PhysicalProject} from './physical.model';

export type GeCapability =
  | 'discover'
  | 'exchange'
  | 'observe'
  | 'actuate'
  | 'persist'
  | 'verify'
  | 'synchronize'
  | 'replicate'
  | 'measure'
  | 'authorize'
  | 'produce'
  | 'consume'
  | 'store'
  | 'transform'
  | 'transfer'
  | (string & {});
export type CapabilityGuarantees = {
  available: boolean;
  localContinuity?: boolean;
  durability?: 'volatile' | 'session' | 'durable';
  latencyMs?: number;
  provenance?: string;
};
export type PhysicalAdapterManifest = {
  id: string;
  version: string;
  capabilities: Partial<Record<GeCapability, CapabilityGuarantees>>;
  conformance?: string[];
  wireProtocol?: string;
  discover?: () => Promise<PhysicalReference[]>;
};
export type PhysicalAvailabilityAuthorityProvider = {
  id: string;
  verify: (input: {
    project: PhysicalProject;
    availability: PhysicalAvailability;
    action: 'discover' | 'offer';
  }) => Promise<boolean> | boolean;
};
let availabilityAuthorityProvider: PhysicalAvailabilityAuthorityProvider | null = null;
export function setPhysicalAvailabilityAuthorityProvider(provider: PhysicalAvailabilityAuthorityProvider | null) {
  availabilityAuthorityProvider = provider;
}
export function getPhysicalAvailabilityAuthorityProvider() {
  return availabilityAuthorityProvider;
}
export async function verifyPhysicalAvailabilityAuthority(
  project: PhysicalProject, availability: PhysicalAvailability, action: 'discover' | 'offer',
) {
  if (!availabilityAuthorityProvider) return false;
  try {return !!(await availabilityAuthorityProvider.verify({project, availability, action}));}
  catch {return false;}
}
export type PhysicalReference = {
  id: string;
  kind: string;
  label?: string;
  provenance?: string;
};
export type SignalSample = {
  reference: string;
  source: string;
  ts: number;
  value: unknown;
  unit?: string;
  context?: string;
  evidence?: string;
  epistemic: Epistemic;
};
export type PhysicalContinuity = {
  reference: PhysicalReference;
  authority?: string;
  state?: Record<string, unknown>;
  capabilities: GeCapability[];
  relations: string[];
  evidence: string[];
  observedAt?: number;
};
export type LivingNodeProjection = {
  id: string;
  reference: PhysicalReference;
  authority: string;
  state: Record<string, unknown>;
  capabilities: GeCapability[];
  relations: string[];
  evidence: string[];
  observedAt: number;
};

/** A node emerges from continuity; discovery and publication need no central registry. */
export function projectLivingPhysicalNode(
  input: PhysicalContinuity,
): LivingNodeProjection | null {
  if (
    !input.reference.id ||
    !input.reference.provenance ||
    !input.authority ||
    !input.state ||
    !input.capabilities.length ||
    !input.relations.length ||
    !input.evidence.length ||
    !input.observedAt
  )
    return null;
  return {
    id: `ge:physical:${input.reference.id}`,
    reference: input.reference,
    authority: input.authority,
    state: input.state,
    capabilities: input.capabilities,
    relations: input.relations,
    evidence: input.evidence,
    observedAt: input.observedAt,
  };
}

/** A significant, referenced measurement is a DV; arbitrary raw samples are not. */
export function measurementDV(siteId: string, measurement: PhysicalMeasure) {
  if (
    !measurement.reference ||
    !Number.isFinite(measurement.value) ||
    !measurement.unit ||
    !measurement.origin ||
    !measurement.ts
  )
    return null;
  return {
    id: `dv:ge:physical.measurement:${siteId}:${measurement.id}`,
    kind: 'ge.physical.measurement',
    labels: ['Medición física'],
    traits: ['ge:physical', 'ge:measurement'],
    attrs: {
      ...measurement,
      siteId,
      continuity: 'referenced',
      epistemic: measurement.epistemic,
    },
    meta: {
      ns: 'energy:physical',
      scopes: ['local'],
      ts: measurement.ts,
      source: measurement.origin,
      by: 'ge:measure',
      pinned: true,
    },
  };
}
