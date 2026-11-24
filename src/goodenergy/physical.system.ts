import {projectLivingPhysicalNode, type GeCapability} from './physical.capabilities';
import {
  Epistemic,
  PhysicalAvailability,
  PhysicalComp,
  PhysicalFieldRecord,
  PhysicalInvestigation,
  PhysicalProject,
  PhysicalRoute,
  physicalId,
} from './physical.model';

export type PhysicalTool = {
  kind: string;
  label: string;
  role: string;
  resource?: string;
  capabilities: GeCapability[];
};
export type PhysicalExperienceManifest = {
  id: string;
  label: string;
  description: string;
  prompts: string[];
  tools: PhysicalTool[];
};

const common: PhysicalTool[] = [
  {kind: 'fuente', label: 'Fuente', role: 'source', capabilities: ['produce']},
  {kind: 'transformacion', label: 'Transformación', role: 'transform', capabilities: ['transform']},
  {kind: 'almacenamiento', label: 'Almacenamiento', role: 'store', capabilities: ['store']},
  {kind: 'consumo', label: 'Consumo', role: 'consume', capabilities: ['consume']},
  {kind: 'transferencia', label: 'Transferencia', role: 'transfer', capabilities: ['transfer']},
  {kind: 'capacidad', label: 'Capacidad', role: 'capacity', capabilities: ['observe']},
  {kind: 'restriccion', label: 'Restricción', role: 'constraint', capabilities: ['verify']},
];
const experiences = new Map<string, PhysicalExperienceManifest>();
export function registerPhysicalExperience(manifest: PhysicalExperienceManifest) {
  if (!manifest.id || !manifest.tools.every(t => t.kind && t.role))
    throw new Error('Manifest físico incompleto');
  experiences.set(manifest.id, manifest);
}
export function getPhysicalExperiences() {
  return [...experiences.values()];
}
export function getPhysicalExperience(id: string) {
  return experiences.get(id) || experiences.get('energia')!;
}
export function getPhysicalTools(experienceId: string) {
  const tools = [...common, ...getPhysicalExperience(experienceId).tools];
  return [...new Map(tools.map(t => [t.kind, t])).values()];
}

registerPhysicalExperience({
  id: 'energia', label: 'Energía',
  description: 'Fuentes, transformación, almacenamiento, consumo y disponibilidad.',
  prompts: ['Quiero saber cuánta energía solar puedo generar acá', 'Tengo excedente'],
  tools: [
    {kind: 'panel.solar', label: 'Captación solar', role: 'source', resource: 'energy', capabilities: ['produce', 'measure']},
    {kind: 'bateria', label: 'Batería', role: 'store', resource: 'energy', capabilities: ['store']},
    {kind: 'inversor', label: 'Inversor', role: 'transform', resource: 'energy', capabilities: ['transform']},
  ],
});
registerPhysicalExperience({
  id: 'agricultura', label: 'Agricultura',
  description: 'Suelo, agua, energía, infraestructura y acciones propuestas.',
  prompts: ['Quiero automatizar el riego', 'Quiero medir la humedad del suelo'],
  tools: [
    {kind: 'suelo', label: 'Suelo', role: 'state', resource: 'soil', capabilities: ['observe', 'measure']},
    {kind: 'reservorio', label: 'Reservorio', role: 'store', resource: 'water', capabilities: ['store']},
    {kind: 'bomba', label: 'Bomba', role: 'transform', resource: 'water', capabilities: ['actuate', 'transfer']},
    {kind: 'riego', label: 'Riego', role: 'consume', resource: 'water', capabilities: ['consume']},
  ],
});
registerPhysicalExperience({
  id: 'ganaderia', label: 'Ganadería',
  description: 'Recursos, condiciones e infraestructura física.',
  prompts: ['Quiero controlar el agua de los bebederos'],
  tools: [
    {kind: 'bebedero', label: 'Bebedero', role: 'consume', resource: 'water', capabilities: ['observe']},
    {kind: 'ventilacion', label: 'Ventilación', role: 'transform', resource: 'air', capabilities: ['actuate']},
    {kind: 'frio', label: 'Frío', role: 'transform', resource: 'heat', capabilities: ['observe']},
  ],
});
registerPhysicalExperience({
  id: 'investigacion', label: 'Investigación',
  description: 'Montaje, hipótesis, variables, medidas y resultados con procedencia.',
  prompts: ['Quiero estudiar si este sistema produce energía'],
  tools: [
    {kind: 'montaje', label: 'Montaje', role: 'transform', capabilities: ['observe', 'measure']},
    {kind: 'variable', label: 'Variable', role: 'state', capabilities: ['measure']},
  ],
});
registerPhysicalExperience({
  id: 'refrigeracion', label: 'Refrigeración',
  description: 'Ciclo térmico, ambiente, tuberías, control, energía y medidas en el mismo proyecto.',
  prompts: ['Esta cámara debería estar a 2 grados', 'Mostrame el circuito frigorífico'],
  tools: [
    {kind: 'camara.frio', label: 'Cámara', role: 'state', resource: 'heat', capabilities: ['observe', 'store']},
    {kind: 'compresor', label: 'Compresor', role: 'transform', resource: 'refrigerant', capabilities: ['transform', 'consume']},
    {kind: 'condensador', label: 'Condensador', role: 'transform', resource: 'heat', capabilities: ['transform', 'transfer']},
    {kind: 'expansion', label: 'Expansión', role: 'transform', resource: 'refrigerant', capabilities: ['transform']},
    {kind: 'evaporador', label: 'Evaporador', role: 'transform', resource: 'heat', capabilities: ['transfer']},
    {kind: 'ventilacion', label: 'Ventilación', role: 'transfer', resource: 'air', capabilities: ['transfer', 'actuate']},
    {kind: 'bomba.hvac', label: 'Bomba', role: 'transfer', resource: 'fluid', capabilities: ['transfer', 'actuate']},
    {kind: 'sensor.hvac', label: 'Sensor', role: 'state', capabilities: ['observe', 'measure']},
    {kind: 'control.hvac', label: 'Control', role: 'actuate', capabilities: ['actuate']},
    {kind: 'tuberia.hvac', label: 'Tubería', role: 'transfer', resource: 'refrigerant', capabilities: ['transfer']},
  ],
});
registerPhysicalExperience({
  id: 'electricidad', label: 'Electricidad',
  description: 'Croquis, circuitos, cantidades, unifilar y tablero.',
  prompts: ['Quiero hacer la instalación de esta casa'],
  tools: [
    {kind: 'tablero', label: 'Tablero', role: 'transform', resource: 'electricity', capabilities: ['transfer']},
    {kind: 'toma', label: 'Toma', role: 'consume', resource: 'electricity', capabilities: ['consume']},
  ],
});

export function addPhysicalSystemElement(
  project: PhysicalProject,
  tool: PhysicalTool,
  experienceId: string,
): PhysicalProject {
  const index = project.comps.filter(c => c.kind === tool.kind).length + 1;
  const comp: PhysicalComp = {
    id: physicalId(tool.kind), kind: tool.kind, name: `${tool.label} ${index}`,
    roomId: '', attach: 'floor', x: 0, y: 0,
    params: {epistemic: 'propuesto'},
    physical: {
      role: tool.role, resource: tool.resource, capabilityIds: tool.capabilities,
      epistemic: 'propuesto', evidence: [], sourceManifest: experienceId,
    },
  };
  return {...project, comps: [...project.comps, comp]};
}
export function connectPhysicalElements(
  project: PhysicalProject,
  from: string,
  to: string,
  resource?: string,
): PhysicalProject {
  if (from === to || !project.comps.some(c => c.id === from) || !project.comps.some(c => c.id === to))
    return project;
  if ((project.routes || []).some(r => r.kind === 'flow' && r.from === from && r.to === to && r.physical?.resource === resource))
    return project;
  const route: PhysicalRoute = {
    id: physicalId('flow'), from, to, points: [], kind: 'flow',
    physical: {resource, epistemic: 'propuesto', evidence: []},
  };
  return {...project, routes: [...(project.routes || []), route]};
}
export function linkPhysicalReference(project: PhysicalProject, from: string, externalReference: string, relation: string) {
  if (!project.comps.some(c => c.id === from) || !externalReference.trim() || !relation.trim()) return project;
  const route: PhysicalRoute = {
    id: physicalId('relation'), from, to: externalReference.trim(), points: [], kind: 'relation',
    physical: {resource: relation.trim(), epistemic: 'propuesto', evidence: []},
  };
  return {...project, routes: [...(project.routes || []), route]};
}
export function physicalRelationDV(project: PhysicalProject, siteId: string, relation: PhysicalRoute) {
  if (!['flow', 'relation'].includes(relation.kind) ||
    !project.comps.some(c => c.id === relation.from) || !relation.to ||
    !relation.physical?.resource || !relation.physical.evidence?.length ||
    !['observado', 'ejecutado'].includes(relation.physical.epistemic || 'propuesto')) return null;
  return {
    id: `dv:ge:relation:${siteId}:${relation.id}`, kind: 'ge.physical.relation',
    labels: ['Relación física'], traits: ['ge:physical', 'ge:relation'],
    attrs: {siteId, relationId: relation.id, from: relation.from, to: relation.to,
      relation: relation.physical.resource, evidence: relation.physical.evidence,
      epistemic: relation.physical.epistemic},
    meta: {ns: 'energy:physical', scopes: ['public'], ts: Date.now(), source: 'ge:physical', pinned: true},
  };
}
export async function projectPhysicalLivingNode(
  project: PhysicalProject, componentId: string,
  verifyAuthority?: (componentId: string) => Promise<string | null>,
) {
  const component = project.comps.find(c => c.id === componentId);
  if (!component?.physical || !verifyAuthority) return null;
  const authority = await verifyAuthority(componentId);
  if (!authority) return null;
  const observed = (project.measurements || []).filter(m => m.reference === componentId && m.epistemic === 'observado');
  const relations = (project.routes || []).filter(r => r.from === componentId || r.to === componentId).map(r => r.id);
  const evidence = [...new Set([...(component.physical.evidence || []), ...observed.map(m => m.evidence).filter((v): v is string => !!v)])];
  const state = Object.fromEntries(observed.filter(m => m.property).map(m => [m.property!, {value: m.value, unit: m.unit, ts: m.ts, epistemic: m.epistemic}]));
  return projectLivingPhysicalNode({
    reference: {id: componentId, kind: component.kind, label: component.name, provenance: component.physical.sourceManifest || 'ge:physical'},
    authority, state: Object.keys(state).length ? state : undefined,
    capabilities: (component.physical.capabilityIds || []) as GeCapability[],
    relations, evidence, observedAt: observed.length ? Math.max(...observed.map(m => m.ts)) : undefined,
  });
}
export function createInvestigation(project: PhysicalProject, title: string, hypothesis: string) {
  if (!title.trim() || !hypothesis.trim()) return project;
  const investigation: PhysicalInvestigation = {
    id: physicalId('investigation'), title: title.trim(), hypothesis: hypothesis.trim(),
    startedAt: Date.now(), componentIds: [], variableReferences: [],
    measurementIds: [], findings: [],
  };
  return {...project, investigations: [...(project.investigations || []), investigation]};
}
export function recordFinding(
  project: PhysicalProject, investigationId: string, text: string,
  epistemic: Epistemic, evidence: string[],
) {
  if (!text.trim()) return project;
  return {...project, investigations: (project.investigations || []).map(item =>
    item.id === investigationId ? {...item, findings: [...item.findings, {
      id: physicalId('finding'), text: text.trim(), epistemic, evidence, ts: Date.now(),
    }]} : item,
  )};
}
export function investigationDV(project: PhysicalProject, siteId: string, investigation: PhysicalInvestigation) {
  const findings = investigation.findings.filter(f => f.evidence.length && (f.epistemic === 'observado' || f.epistemic === 'ejecutado'));
  if (!findings.length || !investigation.measurementIds.some(id =>
    (project.measurements || []).some(m => m.id === id && m.epistemic === 'observado'))
  ) return null;
  return {
    id: `dv:ge:investigation:${siteId}:${investigation.id}`, kind: 'ge.physical.investigation',
    labels: [investigation.title], traits: ['ge:physical', 'ge:research'],
    attrs: {...investigation, findings},
    meta: {ns: 'energy:physical', scopes: ['local'], ts: Date.now(), source: 'ge:research', pinned: true},
  };
}
export function availabilityIssues(project: PhysicalProject, item: PhysicalAvailability) {
  const issues: string[] = [];
  if (!project.comps.some(c => c.id === item.sourceId)) issues.push('fuente');
  if (!item.resource.trim() || !Number.isFinite(item.quantity) || !(item.quantity > 0) || !item.unit.trim()) issues.push('cantidad y unidad');
  if (!Number.isFinite(item.availableFrom) || !Number.isFinite(item.availableUntil) || !(item.availableFrom > 0) || !(item.availableUntil > item.availableFrom) || item.availableUntil <= Date.now()) issues.push('ventana temporal');
  if (!item.authority?.trim()) issues.push('authority');
  if (!item.evidence.length) issues.push('evidencia');
  if (!item.measurementIds.some(id => (project.measurements || []).some(m =>
    m.id === id && m.reference === item.sourceId && m.property === 'available' &&
    m.unit.toLowerCase() === item.unit.toLowerCase() && m.value >= item.quantity &&
    m.epistemic === 'observado')))
    issues.push('medición de disponibilidad de la misma fuente, unidad y cantidad');
  if (!['observado', 'ejecutado'].includes(item.epistemic)) issues.push('estado físico verificado');
  return issues;
}
export function availabilityDV(project: PhysicalProject, siteId: string, item: PhysicalAvailability) {
  if (availabilityIssues(project, item).length) return null;
  return {
    id: `dv:ge:availability:${siteId}:${item.id}`, kind: 'ge.physical.availability',
    labels: ['Capacidad física disponible'], traits: ['ge:physical', 'ge:capacity', 'node:capability'],
    attrs: {...item, siteId, capability: 'exchange'},
    meta: {ns: 'energy:physical', scopes: ['public'], ts: Date.now(), source: 'ge:physical', pinned: true},
  };
}

export function addFieldRecord(
  project: PhysicalProject, reference: string, statement: string,
  epistemic: Epistemic, evidence: string[], outcomeReference?: string,
) {
  if (!reference.trim() || !statement.trim()) return project;
  const record: PhysicalFieldRecord = {
    id: physicalId('field'), reference: reference.trim(), statement: statement.trim(),
    epistemic, evidence: evidence.filter(Boolean),
    outcomeReference: outcomeReference?.trim() || undefined, ts: Date.now(),
  };
  return {...project, fieldRecords: [...(project.fieldRecords || []), record]};
}

export function fieldRecordDV(siteId: string, record: PhysicalFieldRecord) {
  if (!record.evidence.length || !['observado', 'ejecutado'].includes(record.epistemic)) return null;
  return {
    id: `dv:ge:field:${siteId}:${record.id}`, kind: 'ge.physical.field.record',
    labels: [record.statement], traits: ['ge:physical', 'ge:evidence'],
    attrs: {...record, siteId},
    meta: {ns: 'energy:physical', scopes: ['local'], ts: record.ts, source: 'ge:field', pinned: true},
  };
}
