import {test, expect} from '@jest/globals';
import {addManualMeasure, electricalProjection, emptyPhysicalProject} from '../src/goodenergy/physical.model';
import {
  addPhysicalSystemElement, availabilityDV, availabilityIssues,
  connectPhysicalElements, createInvestigation, getPhysicalTools,
  investigationDV, linkPhysicalReference, physicalRelationDV,
  projectPhysicalLivingNode, recordFinding, registerPhysicalExperience,
} from '../src/goodenergy/physical.system';
import {parsePhysicalIntent} from '../src/goodenergy/physical.intent';
import {setPhysicalAvailabilityAuthorityProvider, verifyPhysicalAvailabilityAuthority} from '../src/goodenergy/physical.capabilities';

test('an external experience adds a physical source and flow without changing core kinds', () => {
  registerPhysicalExperience({
    id: 'test.future', label: 'Futura', description: 'Prueba', prompts: [],
    tools: [{kind: 'experimental.receiver', label: 'Receptor', role: 'source', resource: 'unknown', capabilities: ['produce']}],
  });
  const tool = getPhysicalTools('test.future').find(t => t.kind === 'experimental.receiver')!;
  let project = addPhysicalSystemElement(emptyPhysicalProject(), tool, 'test.future');
  const source = project.comps[0];
  project = addPhysicalSystemElement(project, getPhysicalTools('test.future').find(t => t.kind === 'almacenamiento')!, 'test.future');
  project = connectPhysicalElements(project, source.id, project.comps[1].id, 'unknown');
  expect(source.physical?.capabilityIds).toContain('produce');
  expect(project.routes?.[0].kind).toBe('flow');
  expect(project.routes?.[0].physical?.epistemic).toBe('propuesto');
  expect(connectPhysicalElements(project, source.id, project.comps[1].id, 'unknown').routes).toHaveLength(1);
});

test('research keeps inference separate from an evidenced observed finding', () => {
  let project = createInvestigation(emptyPhysicalProject(), 'Plantas', 'Podrían generar energía');
  const id = project.investigations![0].id;
  project = recordFinding(project, id, 'Posible producción', 'inferido', ['photo:1']);
  expect(investigationDV(project, 'site', project.investigations![0])).toBeNull();
  project = addManualMeasure(project, 0.2, 'V', 'montaje:1');
  project = {...project, investigations: project.investigations!.map(i => ({...i, measurementIds: [project.measurements![0].id]}))};
  expect(investigationDV(project, 'site', project.investigations![0])).toBeNull();
  project = recordFinding(project, id, 'Tensión medida', 'observado', ['photo:2']);
  const dv = investigationDV(project, 'site', project.investigations![0]);
  expect(dv?.attrs.findings).toHaveLength(1);
  expect(dv?.attrs.findings[0].epistemic).toBe('observado');
});

test('availability needs its own observed source measurement, evidence and authority', () => {
  let project = addPhysicalSystemElement(emptyPhysicalProject(), getPhysicalTools('energia')[0], 'energia');
  const sourceId = project.comps[0].id;
  project = addManualMeasure(project, 2, 'kWh', sourceId, undefined, 'available');
  const item = {
    id: 'available:1', sourceId, resource: 'energy', quantity: 2, unit: 'kWh',
    availableFrom: Date.now(), availableUntil: Date.now() + 3600000,
    authority: 'authority:owner', evidence: ['meter:1'],
    measurementIds: [project.measurements![0].id], epistemic: 'observado' as const,
    createdAt: Date.now(),
  };
  expect(availabilityIssues(project, item)).toEqual([]);
  expect(availabilityDV(project, 'site', item)?.attrs.quantity).toBe(2);
  expect(availabilityDV(project, 'site', {...item, epistemic: 'inferido'})).toBeNull();
  expect(availabilityDV(project, 'site', {...item, availableUntil: Date.now() - 1})).toBeNull();
  expect(availabilityDV(project, 'site', {...item, sourceId: 'other'})).toBeNull();
});

test('starting intents select projections without performing a physical action', () => {
  expect(parsePhysicalIntent('Quiero automatizar el riego').experience).toBe('agricultura');
  expect(parsePhysicalIntent('Estoy investigando generación mediante plantas').experience).toBe('investigacion');
  expect(parsePhysicalIntent('Tengo excedente, quiero hacerlo disponible').kind).toBe('availability');
  expect(parsePhysicalIntent('Quiero hacer la instalación de esta casa').experience).toBe('electricidad');
});

test('an agricultural water pump is not an electrical load by name alone', () => {
  const pump = getPhysicalTools('agricultura').find(t => t.kind === 'bomba')!;
  const project = addPhysicalSystemElement(emptyPhysicalProject(), pump, 'agricultura');
  expect(electricalProjection(project).unassigned).toHaveLength(0);
});

test('a physical availability never gains exchange authority from a text reference', async () => {
  const project = emptyPhysicalProject();
  const availability = {
    id: 'a', sourceId: 'source', resource: 'energy', quantity: 1, unit: 'kWh',
    availableFrom: 1, availableUntil: Date.now() + 1000, authority: 'self typed',
    evidence: ['photo'], measurementIds: [], epistemic: 'observado' as const, createdAt: 1,
  };
  setPhysicalAvailabilityAuthorityProvider(null);
  expect(await verifyPhysicalAvailabilityAuthority(project, availability, 'offer')).toBe(false);
  setPhysicalAvailabilityAuthorityProvider({id: 'test', verify: ({action}) => action === 'discover'});
  expect(await verifyPhysicalAvailabilityAuthority(project, availability, 'offer')).toBe(false);
  expect(await verifyPhysicalAvailabilityAuthority(project, availability, 'discover')).toBe(true);
  setPhysicalAvailabilityAuthorityProvider(null);
});

test('external node relationships carry references and emerge only with verified continuity', async () => {
  let project = addPhysicalSystemElement(emptyPhysicalProject(), getPhysicalTools('energia')[0], 'energia');
  const sourceId = project.comps[0].id;
  project = linkPhysicalReference(project, sourceId, 'node:future:receiver', 'abastece');
  const relation = project.routes![0];
  expect(physicalRelationDV(project, 'site', relation)).toBeNull();
  project = {...project, routes: [{...relation, physical: {resource: 'abastece', epistemic: 'observado', evidence: ['acta:1']}}]};
  expect(physicalRelationDV(project, 'site', project.routes![0])?.attrs.to).toBe('node:future:receiver');
  project = addManualMeasure(project, 2, 'kWh', sourceId, undefined, 'available');
  project = {...project, measurements: [{...project.measurements![0], evidence: 'meter:1'}]};
  expect(await projectPhysicalLivingNode(project, sourceId)).toBeNull();
  expect((await projectPhysicalLivingNode(project, sourceId, async () => 'authority:verified'))?.relations).toContain(relation.id);
});
