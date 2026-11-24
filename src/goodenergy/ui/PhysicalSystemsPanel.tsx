import React, {useState} from 'react';
import {ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {
  Epistemic, PhysicalAvailability, PhysicalProject, physicalId,
} from '../physical.model';
import {
  addPhysicalSystemElement, availabilityIssues, connectPhysicalElements,
  createInvestigation, getPhysicalExperience, getPhysicalExperiences,
  getPhysicalTools, linkPhysicalReference, recordFinding,
} from '../physical.system';
import {getPhysicalAvailabilityAuthorityProvider} from '../physical.capabilities';

type Props = {
  project: PhysicalProject;
  onChange: (next: PhysicalProject) => void;
  experienceId: string;
  onExperience: (id: string) => void;
  onOpenMarket: (availability: PhysicalAvailability) => void;
  onMeasureSource: (sourceId: string) => void;
  onOpenElectrical: () => void;
  onSimulate: () => void;
  onObserve: () => void;
  onPublishInvestigation: (id: string) => Promise<boolean>;
  onPublishAvailability: (id: string) => Promise<boolean>;
  onPublishRelation: (id: string) => Promise<boolean>;
};
const epistemics: Epistemic[] = ['observado', 'calculado', 'simulado', 'inferido', 'propuesto', 'ejecutado'];
const field = (label: string, value: string, onChangeText: (value: string) => void, placeholder?: string) => (
  <View style={s.fieldWrap}>
    <Text style={s.label}>{label}</Text>
    <TextInput style={s.input} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#97A8A0" />
  </View>
);
const button = (label: string, onPress: () => void, selected = false) => (
  <TouchableOpacity key={label} onPress={onPress} style={[s.pill, selected && s.selected]} accessibilityRole="button">
    <Text style={[s.pillText, selected && s.selectedText]}>{label}</Text>
  </TouchableOpacity>
);

export default function PhysicalSystemsPanel({project, onChange, experienceId, onExperience, onOpenMarket, onMeasureSource, onOpenElectrical, onSimulate, onObserve, onPublishInvestigation, onPublishAvailability, onPublishRelation}: Props) {
  const experience = getPhysicalExperience(experienceId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [resource, setResource] = useState('');
  const [externalReference, setExternalReference] = useState('');
  const [relationName, setRelationName] = useState('');
  const [title, setTitle] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [finding, setFinding] = useState('');
  const [findingEvidence, setFindingEvidence] = useState('');
  const [findingEpistemic, setFindingEpistemic] = useState<Epistemic>('propuesto');
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('kWh');
  const [windowHours, setWindowHours] = useState('1');
  const [authority, setAuthority] = useState('');
  const [availabilityEvidence, setAvailabilityEvidence] = useState('');
  const [status, setStatus] = useState('');
  const [systemView, setSystemView] = useState('fisico');
  const selected = project.comps.find(c => c.id === selectedId);
  const investigations = project.investigations || [];
  const investigation = investigations[investigations.length - 1];
  const sources = project.comps.filter(c =>
    ['source', 'store', 'capacity'].includes(c.physical?.role || '') ||
    (c.physical?.capabilityIds || []).some(id => ['produce', 'store'].includes(id)),
  );
  const availabilities = project.availabilities || [];
  const selectedAvailability = availabilities[availabilities.length - 1];
  const visibleSystemComps = project.comps.filter(c => {
    if (!c.physical) return false;
    if (experienceId !== 'refrigeracion' || systemView === 'fisico') return true;
    if (systemView === 'frigorifico') return c.physical.sourceManifest === 'refrigeracion';
    if (systemView === 'control') return c.physical.role === 'actuate' || c.physical.capabilityIds?.includes('observe');
    if (systemView === 'energia') return ['energy', 'electricity'].includes(c.physical.resource || '') || c.physical.capabilityIds?.includes('consume');
    return true;
  });
  const updateSelected = (patch: Record<string, any>, physicalPatch?: Record<string, any>) => {
    if (!selected?.physical) return;
    const physical = selected.physical;
    onChange({...project, comps: project.comps.map(c => c.id === selected.id
      ? {...c, ...patch, physical: {...physical, ...physicalPatch}}
      : c)});
  };
  const createAvailability = () => {
    const n = Number(quantity.replace(',', '.'));
    const hours = Number(windowHours.replace(',', '.'));
    const source = project.comps.find(c => c.id === sourceId);
    if (!source || !Number.isFinite(n) || !(n > 0) || !Number.isFinite(hours) || !(hours > 0) || !unit.trim() || !(resource.trim() || source.physical?.resource)) {
      setStatus('Elegí fuente, cantidad, unidad y duración válidas.');
      return;
    }
    const now = Date.now();
    const item: PhysicalAvailability = {
      id: physicalId('availability'), sourceId: source.id, resource: resource.trim() || source.physical?.resource || '',
      quantity: n, unit: unit.trim(), availableFrom: now,
      availableUntil: now + hours * 3600000, authority: authority.trim(),
      evidence: availabilityEvidence.trim() ? [availabilityEvidence.trim()] : [],
      measurementIds: [], epistemic: 'propuesto', createdAt: now,
    };
    onChange({...project, availabilities: [...(project.availabilities || []), item]});
    setStatus('Disponibilidad propuesta. Vinculá una medida observada y evidencia antes de compartir.');
  };
  const updateAvailability = (patch: Partial<PhysicalAvailability>) => {
    if (!selectedAvailability) return;
    onChange({...project, availabilities: (project.availabilities || []).map(a => a.id === selectedAvailability.id ? {...a, ...patch} : a)});
  };
  const updateRelation = (id: string, patch: Record<string, any>) => onChange({
    ...project, routes: (project.routes || []).map(r => r.id === id ? {...r, physical: {...r.physical, ...patch}} : r),
  });
  return <View style={s.root}>
    <Text style={s.kicker}>MISMO MODELO FÍSICO · OTRA PROYECCIÓN</Text>
    <Text style={s.title}>Sistemas vivos</Text>
    <Text style={s.muted}>Una fuente puede producir, transformar, almacenar, transferir o consumir cualquier recurso. Lo no medido sigue siendo propuesta.</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
      {getPhysicalExperiences().map(manifest => button(manifest.label, () => onExperience(manifest.id), experienceId === manifest.id))}
    </ScrollView>
    <Text style={s.subtitle}>{experience.label}</Text>
    <Text style={s.muted}>{experience.description}</Text>
    {experienceId === 'refrigeracion' && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
      {['fisico', 'frigorifico', 'control', 'energia', 'estado'].map(mode => button(mode.toUpperCase(), () => {setSystemView(mode); if (mode === 'estado') onObserve();}, systemView === mode))}
      {button('ELÉCTRICO', onOpenElectrical)}
      {button('SIMULAR', onSimulate)}
    </ScrollView>}
    <Text style={s.label}>AGREGAR CAPACIDAD O ELEMENTO</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
      {getPhysicalTools(experienceId).map(tool => button(`+ ${tool.label}`, () => {
        onChange(addPhysicalSystemElement(project, tool, experienceId));
        setStatus(`${tool.label} propuesto. Definí su estado y relación.`);
      }))}
    </ScrollView>
    {visibleSystemComps.map(comp => <TouchableOpacity key={comp.id} style={[s.card, selectedId === comp.id && s.cardActive]} onPress={() => setSelectedId(comp.id)}>
      <Text style={s.cardTitle}>{comp.name || comp.kind}</Text>
      <Text style={s.muted}>{comp.physical?.role} · {comp.physical?.resource || 'recurso por declarar'} · {(comp.physical?.epistemic || 'propuesto').toUpperCase()}</Text>
      <Text style={s.small}>Capacidades: {(comp.physical?.capabilityIds || []).join(', ') || 'sin declarar'}</Text>
    </TouchableOpacity>)}
    {!!selected && <View style={s.card}>
      <Text style={s.subtitle}>Estado físico · {selected.name}</Text>
      {field('Nombre', selected.name || '', v => updateSelected({name: v}))}
      {field('Recurso abierto (agua, energía, aire...)', selected.physical?.resource || '', v => updateSelected({}, {resource: v}))}
      {field('Capacidad declarada', String(selected.params?.capacity ?? ''), v => updateSelected({params: {...selected.params, capacity: v ? Number(v.replace(',', '.')) : undefined}}), 'Sin dato')}
      {field('Unidad', String(selected.params?.capacityUnit || ''), v => updateSelected({params: {...selected.params, capacityUnit: v}}))}
      {experienceId === 'refrigeracion' && selected.kind === 'camara.frio' && field('Meta térmica propuesta (°C)', String(selected.params?.targetTemperatureC ?? ''), v => updateSelected({params: {...selected.params, targetTemperatureC: v ? Number(v.replace(',', '.')) : undefined}}))}
      {experienceId === 'agricultura' && selected.kind === 'suelo' && field('Meta de humedad propuesta (%)', String(selected.params?.targetHumidityPct ?? ''), v => updateSelected({params: {...selected.params, targetHumidityPct: v ? Number(v.replace(',', '.')) : undefined}}))}
      {field('Referencia de evidencia', (selected.physical?.evidence || []).join(', '), v => updateSelected({}, {evidence: v.split(',').map(x => x.trim()).filter(Boolean)}))}
      <Text style={s.label}>ESTADO DEL CONOCIMIENTO</Text>
      <ScrollView horizontal contentContainerStyle={s.row}>
        {epistemics.map(e => button(e, () => updateSelected({}, {epistemic: e}), selected.physical?.epistemic === e))}
      </ScrollView>
      {!!project.rooms.length && <ScrollView horizontal contentContainerStyle={s.row}>
        {project.rooms.map(room => button(`Situar: ${room.name || room.id}`, () => updateSelected({roomId: room.id, x: 0.5, y: 0.5}), selected.roomId === room.id))}
      </ScrollView>}
    </View>}
    <View style={s.card}>
      <Text style={s.subtitle}>Flujos y relaciones físicas</Text>
      <Text style={s.muted}>Elegí origen y destino. La flecha describe una relación propuesta; no afirma que haya flujo observado.</Text>
      <ScrollView horizontal contentContainerStyle={s.row}>
        {project.comps.filter(c => c.physical).map(c => button(`De: ${c.name}`, () => setLinkFrom(c.id), linkFrom === c.id))}
      </ScrollView>
      {field('Recurso transferido', resource, setResource, 'Ej. agua, energía, calor')}
      {!!linkFrom && <ScrollView horizontal contentContainerStyle={s.row}>
        {project.comps.filter(c => c.physical && c.id !== linkFrom).map(c => button(`→ ${c.name}`, () => {
          onChange(connectPhysicalElements(project, linkFrom, c.id, resource.trim() || undefined));
          setLinkFrom(null);
        }))}
      </ScrollView>}
      {!!linkFrom && <>
        {field('Referencia externa de Nodo Vivo', externalReference, setExternalReference, 'ID de nodo, DV o recurso')}
        {field('Relación', relationName, setRelationName, 'Ej. ubicado en, abastece, mantiene')}
        {button('Vincular referencia sin copiar sus datos', () => {
          const next = linkPhysicalReference(project, linkFrom, externalReference, relationName);
          if (next === project) {setStatus('Elegí origen, referencia y relación.'); return;}
          onChange(next); setExternalReference(''); setRelationName(''); setLinkFrom(null);
        })}
      </>}
      {!!(project.routes || []).filter(r => r.kind === 'flow').length && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        {(project.routes || []).filter(r => r.kind === 'flow').map(route => <View key={`visual:${route.id}`} style={s.visualFlow}>
          <View style={s.visualNode}>
            <Text style={s.visualRole}>{project.comps.find(c => c.id === route.from)?.physical?.role || 'origen'}</Text>
            <Text style={s.cardTitle}>{project.comps.find(c => c.id === route.from)?.name || 'Origen'}</Text>
          </View>
          <View style={s.visualArrow}><Text style={s.pillText}>→</Text><Text style={s.small}>{route.physical?.resource || 'recurso pendiente'}</Text></View>
          <View style={s.visualNode}>
            <Text style={s.visualRole}>{project.comps.find(c => c.id === route.to)?.physical?.role || 'destino'}</Text>
            <Text style={s.cardTitle}>{project.comps.find(c => c.id === route.to)?.name || 'Destino'}</Text>
          </View>
        </View>)}
      </ScrollView>}
      {(project.routes || []).filter(r => r.kind === 'flow' || r.kind === 'relation').map(route => <View key={route.id} style={s.relationCard}>
        <View style={s.flow}>
          <Text style={s.small}>{project.comps.find(c => c.id === route.from)?.name || 'Origen'} → {project.comps.find(c => c.id === route.to)?.name || route.to} · {route.physical?.resource || 'recurso pendiente'} · {(route.physical?.epistemic || 'propuesto').toUpperCase()}</Text>
          {button('Quitar', () => onChange({...project, routes: (project.routes || []).filter(r => r.id !== route.id)}))}
        </View>
        {field('Evidencia de la relación', (route.physical?.evidence || []).join(', '), v => updateRelation(route.id, {evidence: v.split(',').map(x => x.trim()).filter(Boolean)}))}
        <View style={s.flow}>
          {button('Confirmar observación', () => route.physical?.evidence?.length ? updateRelation(route.id, {epistemic: 'observado'}) : setStatus('Agregá evidencia antes de confirmar la relación.'))}
          {button('Compartir en Micelio', async () => setStatus(await onPublishRelation(route.id) ? 'Relación significativa enviada a Micelio.' : 'Falta observación/evidencia o falló la publicación.'))}
        </View>
      </View>)}
    </View>
    {experienceId === 'investigacion' && <View style={s.card}>
      <Text style={s.subtitle}>Investigación</Text>
      {field('Título del experimento', title, setTitle)}
      {field('Hipótesis', hypothesis, setHypothesis)}
      {button('Crear experimento', () => {
        const next = createInvestigation(project, title, hypothesis);
        if (next === project) setStatus('Necesitás título e hipótesis.');
        else {onChange(next); setTitle(''); setHypothesis('');}
      })}
      {!!investigation && <>
        <Text style={s.cardTitle}>{investigation.title}</Text>
        <Text style={s.muted}>Hipótesis · {investigation.hypothesis}</Text>
        {field('Condiciones del montaje', investigation.conditions || '', v => onChange({...project, investigations: (project.investigations || []).map(i => i.id === investigation.id ? {...i, conditions: v} : i)}))}
        <Text style={s.label}>ELEMENTOS DEL MONTAJE</Text>
        <ScrollView horizontal contentContainerStyle={s.row}>
          {project.comps.map(c => button(c.name || c.kind, () => onChange({...project, investigations: (project.investigations || []).map(i => i.id === investigation.id ? {...i, componentIds: i.componentIds.includes(c.id) ? i.componentIds.filter(id => id !== c.id) : [...i.componentIds, c.id]} : i)}), investigation.componentIds.includes(c.id)))}
        </ScrollView>
        <Text style={s.label}>VARIABLES Y MEDIDAS</Text>
        <ScrollView horizontal contentContainerStyle={s.row}>
          {(project.measurements || []).map(m => button(`${m.value} ${m.unit} · ${m.reference.slice(-5)}`, () => onChange({...project, investigations: (project.investigations || []).map(i => i.id === investigation.id ? {...i, measurementIds: i.measurementIds.includes(m.id) ? i.measurementIds.filter(id => id !== m.id) : [...i.measurementIds, m.id], variableReferences: [...new Set([...i.variableReferences, m.reference])]} : i)}), investigation.measurementIds.includes(m.id)))}
        </ScrollView>
        {field('Resultado o nota', finding, setFinding)}
        {field('Referencia de evidencia', findingEvidence, setFindingEvidence)}
        <ScrollView horizontal contentContainerStyle={s.row}>
          {epistemics.map(e => button(e, () => setFindingEpistemic(e), findingEpistemic === e))}
        </ScrollView>
        {button('Registrar resultado', () => {onChange(recordFinding(project, investigation.id, finding, findingEpistemic, findingEvidence ? [findingEvidence] : [])); setFinding(''); setFindingEvidence('');})}
        {investigation.findings.map(f => <Text key={f.id} style={s.muted}>{f.epistemic.toUpperCase()} · {f.text} · {f.evidence.length ? 'con evidencia' : 'sin evidencia'}</Text>)}
        {button('Compartir DV significativo', async () => setStatus(await onPublishInvestigation(investigation.id) ? 'Resultado significativo registrado.' : 'Necesitás una medida observada y un resultado observado o ejecutado con evidencia.'))}
      </>}
    </View>}
    <View style={s.card}>
      <Text style={s.subtitle}>Capacidad disponible</Text>
      <Text style={s.muted}>Describí disponibilidad física de cualquier recurso. Market energético gestiona ofertas de energía; otras capacidades se comparten como DV significativo.</Text>
      <ScrollView horizontal contentContainerStyle={s.row}>
        {sources.map(c => button(c.name || c.kind, () => {setSourceId(c.id); setResource(c.physical?.resource || '');}, sourceId === c.id))}
      </ScrollView>
      {!!sourceId && button('Medir disponibilidad de esta fuente', () => onMeasureSource(sourceId))}
      {field('Recurso disponible', resource, setResource, 'Ej. energy, water, cold_storage')}
      {field('Cantidad', quantity, setQuantity, 'Ej. 2,5')}
      {field('Unidad', unit, setUnit, 'kWh')}
      {field('Ventana desde ahora (horas)', windowHours, setWindowHours)}
      {field('Referencia de authority', authority, setAuthority)}
      {field('Evidencia u origen', availabilityEvidence, setAvailabilityEvidence)}
      {button('Registrar disponibilidad propuesta', createAvailability)}
      {!!selectedAvailability && <>
        <Text style={s.cardTitle}>{selectedAvailability.quantity} {selectedAvailability.unit} · {selectedAvailability.resource}</Text>
        <Text style={s.muted}>{selectedAvailability.epistemic.toUpperCase()} · {new Date(selectedAvailability.availableFrom).toLocaleString()} → {new Date(selectedAvailability.availableUntil).toLocaleString()}</Text>
        <Text style={s.label}>VINCULAR MEDICIÓN OBSERVADA</Text>
        <ScrollView horizontal contentContainerStyle={s.row}>
          {(project.measurements || []).filter(m => m.epistemic === 'observado' && m.reference === selectedAvailability.sourceId).map(m => button(`${m.value} ${m.unit} · ${m.reference.slice(-5)}`, () => updateAvailability({measurementIds: selectedAvailability.measurementIds.includes(m.id) ? selectedAvailability.measurementIds.filter(id => id !== m.id) : [...selectedAvailability.measurementIds, m.id]}), selectedAvailability.measurementIds.includes(m.id)))}
        </ScrollView>
        {field('Restricciones', selectedAvailability.constraints || '', v => updateAvailability({constraints: v}))}
        {field('Referencia de lugar/contexto', selectedAvailability.locationReference || '', v => updateAvailability({locationReference: v}))}
        {button('Confirmar estado observado', () => {
          if (!selectedAvailability.evidence.length || !selectedAvailability.measurementIds.length) {setStatus('Vinculá evidencia y una medición antes de confirmar.'); return;}
          updateAvailability({epistemic: 'observado'});
        })}
        <Text style={s.muted}>Pendiente: {availabilityIssues(project, selectedAvailability).join(', ') || 'datos completos para solicitar publicación'}</Text>
        {button('Compartir capacidad en Micelio', async () => setStatus(await onPublishAvailability(selectedAvailability.id) ? 'Capacidad significativa enviada a Micelio.' : !getPhysicalAvailabilityAuthorityProvider() ? 'Falta conectar un provider de Authority/Mandate para compartir esta capacidad.' : 'Faltan datos verificables, Authority rechazó o no se pudo publicar.'))}
        {['energy', 'electricity'].includes(selectedAvailability.resource.toLowerCase()) && button('Continuar en Market existente', () => {
          const issues = availabilityIssues(project, selectedAvailability);
          if (selectedAvailability.unit.toLowerCase() !== 'kwh') issues.push('Market energético requiere kWh');
          if (issues.length) {setStatus(`Antes de ir a Market: ${issues.join(', ')}.`); return;}
          onOpenMarket(selectedAvailability);
        })}
      </>}
    </View>
    {!!status && <Text style={s.status}>{status}</Text>}
  </View>;
}

const s = StyleSheet.create({
  root: {gap: 10, paddingBottom: 24},
  kicker: {color: '#688E78', fontSize: 10, letterSpacing: 1.4, fontWeight: '800'},
  title: {fontSize: 27, fontWeight: '800', color: '#193D32'},
  subtitle: {fontSize: 18, fontWeight: '800', color: '#193D32'},
  muted: {fontSize: 13, color: '#5D756A', lineHeight: 19},
  small: {fontSize: 12, color: '#5D756A'},
  label: {fontSize: 10, color: '#628476', letterSpacing: 1, fontWeight: '800', marginTop: 8},
  row: {gap: 8, paddingVertical: 3, paddingRight: 12},
  pill: {paddingHorizontal: 12, paddingVertical: 10, borderRadius: 15, backgroundColor: '#ECF3EA', alignSelf: 'flex-start'},
  selected: {backgroundColor: '#265D45'},
  pillText: {fontSize: 12, color: '#28533F', fontWeight: '700'},
  selectedText: {color: '#FFFFFF'},
  card: {padding: 14, borderRadius: 18, borderWidth: 1, borderColor: '#DDE9DE', backgroundColor: '#FFFFFF', gap: 8},
  cardActive: {borderColor: '#5B9D70'},
  cardTitle: {fontSize: 15, fontWeight: '800', color: '#244437'},
  fieldWrap: {gap: 5},
  input: {borderWidth: 1, borderColor: '#DDE7DD', borderRadius: 12, backgroundColor: '#F8FAF5', paddingHorizontal: 12, paddingVertical: 9, color: '#183C31'},
  flow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 5},
  relationCard: {borderTopWidth: 1, borderColor: '#E4ECE2', paddingTop: 9, gap: 6},
  visualFlow: {flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F8EF', borderRadius: 16, padding: 9},
  visualNode: {minWidth: 100, maxWidth: 140, padding: 8, borderRadius: 12, backgroundColor: '#FFFFFF'},
  visualRole: {fontSize: 10, color: '#659277', textTransform: 'uppercase', fontWeight: '800'},
  visualArrow: {alignItems: 'center', minWidth: 70},
  status: {fontSize: 12, color: '#9B6A31', backgroundColor: '#FFF7E8', padding: 10, borderRadius: 12},
});
