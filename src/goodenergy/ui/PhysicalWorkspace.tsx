import React, {useMemo, useRef, useState} from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, {Circle, Line, Rect, Text as SvgText} from 'react-native-svg';
import {
  PhysicalProject,
  PhysicalComp,
  PhysicalAvailability,
  Scenario,
  addManualMeasure,
  componentPoint,
  electricalProjection,
  circuitColor,
  componentCircuitId,
  duplicateComponents,
  moveComponents,
  insertRouteWaypoint,
  updateRouteWaypoint,
  physicalId,
  simulatePhysical,
  simulateFlow,
  snapPhysical,
} from '../physical.model';
import {parsePhysicalIntent, proposeIntent} from '../physical.intent';
import {getPhysicalSpeechAdapter} from '../physical.interaction';
import BoardEditor from './BoardEditor';
import ElectricalViews from './ElectricalViews';
import PhysicalSystemsPanel from './PhysicalSystemsPanel';
import {addFieldRecord, addPhysicalSystemElement, getPhysicalTools} from '../physical.system';
import {createComparison, diagnosePhysical} from '../physical.diagnose';
import {
  calculateElectrical,
  getElectricalCalculationPolicy,
  pathLength,
} from '../physical.calculate';
import {
  attachReference,
  getReferenceImportAdapters,
} from '../physical.references';
import {Image} from 'react-native';
import {
  getMeasurementProviders,
  recordProviderMeasure,
} from '../physical.measurement';

type Props = {
  project: PhysicalProject;
  onChange: (project: PhysicalProject) => void;
  onOpen25D: () => void;
  onLegacy: () => void;
  onOpenMarket: (availability: PhysicalAvailability) => void;
  onPublishInvestigation: (id: string) => Promise<boolean>;
  onPublishAvailability: (id: string) => Promise<boolean>;
  onPublishRelation: (id: string) => Promise<boolean>;
};
type Section = 'medir' | 'diagramar' | 'simular' | 'observar' | 'actuar';
type Projection =
  | 'croquis'
  | 'unifilar'
  | 'cargas'
  | 'tablero'
  | 'referencia'
  | 'estado'
  | 'sistema';
const palette = [
  ['toma', 'Toma', 'T'],
  ['luz', 'Luz', 'L'],
  ['interruptor', 'Interruptor', 'I'],
  ['caja', 'Caja', 'CJ'],
  ['tablero', 'Tablero', 'TD'],
  ['proteccion', 'Protección', 'Q'],
  ['circuito', 'Circuito', 'C'],
  ['motor', 'Motor', 'M'],
  ['sensor', 'Sensor', 'S'],
  ['actuador', 'Actuador', 'A'],
  ['contacto', 'Contactor', 'K'],
  ['bornera', 'Bornera', 'X'],
] as const;
const kindLabel = (kind: string) =>
  palette.find(row => row[0] === kind)?.[1] || kind;
const kindMark = (kind: string) =>
  palette.find(row => row[0] === kind)?.[2] || '•';
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

export default function PhysicalWorkspace({
  project,
  onChange,
  onOpen25D,
  onLegacy,
  onOpenMarket,
  onPublishInvestigation,
  onPublishAvailability,
  onPublishRelation,
}: Props) {
  const [section, setSection] = useState<Section>('diagramar');
  const [projection, setProjection] = useState<Projection>('croquis');
  const [experienceId, setExperienceId] = useState('electricidad');
  const [tool, setTool] = useState<string>('seleccionar');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedWallSide, setSelectedWallSide] = useState<'ancho' | 'largo'>(
    'ancho',
  );
  const [visibleKind, setVisibleKind] = useState<string | null>(null);
  const [size, setSize] = useState({width: 340, height: 330});
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({x: 0, y: 0});
  const [draft, setDraft] = useState<{x: number; y: number} | null>(null);
  const [routeStart, setRouteStart] = useState<string | null>(null);
  const [routePoints, setRoutePoints] = useState<Array<{x: number; y: number}>>(
    [],
  );
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [isolatedGroupId, setIsolatedGroupId] = useState<string | null>(null);
  const [measureValue, setMeasureValue] = useState('');
  const [measureUnit, setMeasureUnit] = useState('m');
  const [measureProperty, setMeasureProperty] = useState('dimension');
  const [measureUncertainty, setMeasureUncertainty] = useState('');
  const [referenceUri, setReferenceUri] = useState('');
  const [referenceFormat, setReferenceFormat] = useState<
    'image' | 'pdf' | 'svg' | 'dxf' | 'dwg' | 'mo'
  >('image');
  const [referenceOverlayId, setReferenceOverlayId] = useState<string | null>(
    null,
  );
  const [intentText, setIntentText] = useState('');
  const [recordReference, setRecordReference] = useState('');
  const [recordStatement, setRecordStatement] = useState('');
  const [recordEvidence, setRecordEvidence] = useState('');
  const [recordOutcomeReference, setRecordOutcomeReference] = useState('');
  const [recordEpistemic, setRecordEpistemic] = useState<'observado' | 'inferido' | 'propuesto' | 'ejecutado'>('observado');
  const [didDiagnose, setDidDiagnose] = useState(false);
  const [beforeId, setBeforeId] = useState('');
  const [afterId, setAfterId] = useState('');
  const [comparisonAction, setComparisonAction] = useState('');
  const [comparisonEvidence, setComparisonEvidence] = useState('');
  const [hint, setHint] = useState(
    'Dibujá un ambiente o tocá el croquis para colocar un elemento.',
  );
  const [scenario, setScenario] = useState<Scenario>('normal');
  const [didSimulate, setDidSimulate] = useState(false);
  const [depth, setDepth] = useState<'simple' | 'tecnico' | 'profundo'>(
    'simple',
  );
  const touch = useRef<{
    x: number;
    y: number;
    hit: string | null;
    routeId?: string;
    pointIndex?: number;
  } | null>(null);
  const electrical = useMemo(() => electricalProjection(project), [project]);
  const diagnostic = useMemo(() => diagnosePhysical(project, experienceId, selectedId || undefined), [project, experienceId, selectedId]);
  const calculation = useMemo(
    () =>
      calculateElectrical(
        project,
        getElectricalCalculationPolicy() || undefined,
      ),
    [project],
  );
  const selected = project.comps.find(c => c.id === selectedId);
  const selectedRoom = project.rooms.find(r => r.id === selectedRoomId);
  const selectedRoute = (project.routes || []).find(
    r => r.id === selectedRouteId,
  );
  const referenceOverlay = (project.references || []).find(
    r => r.id === referenceOverlayId && r.format === 'image',
  );
  const visibleComps = isolatedGroupId
    ? project.comps.filter(c => !c.board && c.groupId === isolatedGroupId)
    : project.comps.filter(
        c => !c.board && (!visibleKind || c.kind === visibleKind),
      );
  const visibleIds = new Set(visibleComps.map(c => c.id));
  const scale =
    Math.min((size.width - 34) / 12, (size.height - 30) / 10) * zoom;
  const px = (x: number) => 17 + (x - pan.x) * scale;
  const py = (y: number) => 15 + (y - pan.y) * scale;
  const world = (x: number, y: number) => ({
    x: snapPhysical(pan.x + (x - 17) / scale),
    y: snapPhysical(pan.y + (y - 15) / scale),
  });
  const fitProject = () => {
    if (!project.rooms.length) {
      setZoom(1);
      setPan({x: 0, y: 0});
      return;
    }
    const minX = Math.min(...project.rooms.map(r => r.x)),
      minY = Math.min(...project.rooms.map(r => r.y));
    const maxX = Math.max(...project.rooms.map(r => r.x + r.w)),
      maxY = Math.max(...project.rooms.map(r => r.y + r.d));
    setPan({x: minX - 0.5, y: minY - 0.5});
    setZoom(
      Math.max(
        0.55,
        Math.min(2.5, Math.min(11 / (maxX - minX + 1), 9 / (maxY - minY + 1))),
      ),
    );
  };
  const hitAt = (x: number, y: number) =>
    [...visibleComps].reverse().find(c => {
      const p = componentPoint(project, c);
      return Math.hypot(px(p.x) - x, py(p.y) - y) < 22;
    }) || null;
  const hitRoute = (x: number, y: number) => {
    let best: {routeId: string; pointIndex: number; distance: number} | null =
      null;
    for (const route of project.routes || []) {
      if (route.kind !== 'conduit') continue;
      route.points.forEach((p, index) => {
        if (index === 0 || index === route.points.length - 1) return;
        const distance = Math.hypot(px(p.x) - x, py(p.y) - y);
        if (distance < 20 && (!best || distance < best.distance))
          best = {routeId: route.id, pointIndex: index, distance};
      });
    }
    return best as {
      routeId: string;
      pointIndex: number;
      distance: number;
    } | null;
  };
  const routeAt = (x: number, y: number) => {
    let best: {id: string; distance: number} | null = null;
    for (const route of project.routes || []) {
      if (route.kind !== 'conduit') continue;
      for (let i = 0; i < route.points.length - 1; i++) {
        const a = route.points[i],
          b = route.points[i + 1];
        const ax = px(a.x),
          ay = py(a.y),
          bx = px(b.x),
          by = py(b.y);
        const t = Math.max(
          0,
          Math.min(
            1,
            ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) /
              (Math.hypot(bx - ax, by - ay) ** 2 || 1),
          ),
        );
        const distance = Math.hypot(
          x - (ax + t * (bx - ax)),
          y - (ay + t * (by - ay)),
        );
        if (distance < 17 && (!best || distance < best.distance))
          best = {id: route.id, distance};
      }
    }
    return best as {id: string; distance: number} | null;
  };
  const roomAt = (x: number, y: number) =>
    project.rooms.find(
      r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.d,
    );
  const routeLength = (project.routes || [])
    .filter(r => r.kind === 'conduit' && !r.board)
    .reduce((sum, route) => sum + pathLength(route), 0);
  const area = project.rooms.reduce((sum, room) => sum + room.w * room.d, 0);

  const addAt = (kind: string, x: number, y: number) => {
    const room = roomAt(x, y);
    if (!room) {
      setHint('Primero dibujá un ambiente. Elegí Pared/ambiente y arrastrá.');
      return;
    }
    const index = project.comps.filter(c => c.kind === kind).length + 1;
    const comp: PhysicalComp = {
      id: physicalId(kind),
      kind,
      roomId: room.id,
      attach: kind === 'luz' ? 'roof' : 'wall',
      x: snapPhysical(x - room.x),
      y: snapPhysical(y - room.y),
      name: `${kindMark(kind)}${index}`,
      params: {epistemic: 'propuesto'},
    };
    onChange({...project, comps: [...project.comps, comp]});
    setSelectedId(comp.id);
    setHint(
      `${kindLabel(kind)} ${
        comp.name
      } agregado. Tocá para editar o arrastrá para mover.`,
    );
  };
  const completeGesture = (endX: number, endY: number) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const a = world(start.x, start.y),
      b = world(endX, endY);
    if (tool === 'mover_vista') {
      setPan(p => ({
        x: p.x - (endX - start.x) / scale,
        y: p.y - (endY - start.y) / scale,
      }));
      return;
    }
    if (tool === 'editar_recorrido') {
      if (start.routeId && start.pointIndex !== undefined) {
        setSelectedRouteId(start.routeId);
        setSelectedRoomId(null);
        if (Math.hypot(start.x - endX, start.y - endY) > 7)
          onChange(
            updateRouteWaypoint(project, start.routeId, start.pointIndex, b),
          );
      } else {
        const nearest = routeAt(endX, endY);
        if (nearest) {
          setSelectedRouteId(nearest.id);
          setSelectedRoomId(null);
        }
      }
      return;
    }
    if (tool === 'ambiente') {
      const x = Math.min(a.x, b.x),
        y = Math.min(a.y, b.y);
      const w = Math.max(1, Math.abs(a.x - b.x)),
        d = Math.max(1, Math.abs(a.y - b.y));
      onChange({
        ...project,
        rooms: [
          ...project.rooms,
          {
            id: physicalId('room'),
            x,
            y,
            w,
            d,
            h: 3,
            roof: false,
            name: `Ambiente ${project.rooms.length + 1}`,
          },
        ],
      });
      setHint(`Ambiente de ${fmt(w)} × ${fmt(d)} m creado.`);
      return;
    }
    if (tool === 'recorrido') {
      const hit = hitAt(endX, endY);
      if (!routeStart) {
        if (hit) {
          setRouteStart(hit.id);
          setRoutePoints([componentPoint(project, hit)]);
          setHint('Tocá puntos del recorrido y luego el elemento de destino.');
        } else setHint('Tocá un elemento para iniciar el recorrido.');
        return;
      }
      if (hit && hit.id !== routeStart) {
        const from = project.comps.find(c => c.id === routeStart);
        if (from) {
          const p = componentPoint(project, from),
            q = componentPoint(project, hit);
          onChange({
            ...project,
            routes: [
              ...(project.routes || []),
              {
                id: physicalId('route'),
                from: from.id,
                to: hit.id,
                points: routePoints.length ? [...routePoints, q] : [p, q],
                kind: 'conduit',
                circuitId: from.params?.circuitId || hit.params?.circuitId,
              },
            ],
          });
          setHint('Recorrido unido. La longitud aparece en Medir.');
        }
        setRouteStart(null);
        setRoutePoints([]);
      } else if (!hit) {
        setRoutePoints(points => [...points, b]);
        setHint('Punto agregado. Seguí el recorrido o tocá un destino.');
      } else setHint('Elegí otro elemento como destino.');
      return;
    }
    if (tool !== 'seleccionar') {
      addAt(tool, b.x, b.y);
      return;
    }
    if (start.hit) {
      const comp = project.comps.find(c => c.id === start.hit);
      if (!comp) return;
      if (multiSelect) {
        if (Math.hypot(start.x - endX, start.y - endY) < 9) {
          setSelectedIds(ids =>
            ids.includes(comp.id)
              ? ids.filter(id => id !== comp.id)
              : [...ids, comp.id],
          );
          setSelectedId(comp.id);
          return;
        }
        onChange(
          moveComponents(
            project,
            selectedIds.includes(comp.id) ? selectedIds : [comp.id],
            b.x - a.x,
            b.y - a.y,
          ),
        );
        setSelectedId(comp.id);
        return;
      }
      if (Math.hypot(start.x - endX, start.y - endY) > 9) {
        onChange(moveComponents(project, [comp.id], b.x - a.x, b.y - a.y));
      }
      setSelectedId(comp.id);
      setSelectedIds([comp.id]);
      setSelectedRoomId(null);
      setSelectedRouteId(null);
    } else {
      setSelectedId(null);
      if (!multiSelect) setSelectedIds([]);
      const room = roomAt(b.x, b.y);
      setSelectedRoomId(room?.id || null);
      setSelectedRouteId(null);
      if (room) {
        const dWidth = Math.min(
          Math.abs(b.y - room.y),
          Math.abs(b.y - room.y - room.d),
        );
        const dLength = Math.min(
          Math.abs(b.x - room.x),
          Math.abs(b.x - room.x - room.w),
        );
        setSelectedWallSide(dWidth <= dLength ? 'ancho' : 'largo');
      }
    }
  };
  const applyIntent = () => {
    const intent = parsePhysicalIntent(intentText);
    if (intent.kind === 'target' && intent.value !== undefined) {
      const camera = project.comps.find(c => c.id === selectedId && c.kind === 'camara.frio') || project.comps.find(c => c.kind === 'camara.frio');
      if (camera) onChange({...project, comps: project.comps.map(c => c.id === camera.id ? {...c, params: {...c.params, targetTemperatureC: intent.value}} : c)});
      else {
        const tool = getPhysicalTools('refrigeracion').find(t => t.kind === 'camara.frio')!;
        const next = addPhysicalSystemElement(project, tool, 'refrigeracion');
        onChange({...next, comps: next.comps.map(c => c.id === next.comps[next.comps.length - 1].id ? {...c, params: {...c.params, targetTemperatureC: intent.value}} : c)});
      }
      setExperienceId('refrigeracion'); setSection('diagramar'); setProjection('sistema');
      setHint('Meta térmica registrada como propuesta; todavía falta medir la temperatura real.');
    } else if (intent.kind === 'diagnose') {
      setSection('observar'); setDidDiagnose(true);
      setHint('El diagnóstico usa evidencia observada y presenta hipótesis inferidas.');
    } else if (intent.kind === 'compare') {
      setSection('observar'); setDidDiagnose(false);
      setHint('Elegí dos medidas observadas de la misma variable y referencia.');
    } else if (intent.kind === 'context' || intent.kind === 'availability') {
      setExperienceId(intent.experience || 'energia');
      setSection('diagramar');
      setProjection(intent.experience === 'electricidad' ? 'croquis' : 'sistema');
      setHint(intent.kind === 'availability'
        ? 'Describí la capacidad disponible, vinculá evidencia y continuá en Market.'
        : 'Contexto abierto. Agregá elementos y medidas progresivamente.');
    } else if (intent.kind === 'measure_set' && intent.value && intent.unit) {
      const value = intent.unit === 'cm' ? intent.value / 100 : intent.value;
      if (selectedRouteId) {
        onChange(addManualMeasure(project, value, 'm', selectedRouteId));
        setHint('Recorrido registrado como MEDIDO.');
      } else if (selectedRoomId) {
        const key = selectedWallSide === 'ancho' ? 'w' : 'd';
        onChange(
          addManualMeasure(
            {
              ...project,
              rooms: project.rooms.map(r =>
                r.id === selectedRoomId ? {...r, [key]: value} : r,
              ),
            },
            value,
            'm',
            `${selectedRoomId}:wall:${selectedWallSide}`,
          ),
        );
        setHint('Pared registrada como MEDIDA.');
      } else {
        setSection('medir');
        setMeasureValue(String(intent.value));
        setMeasureUnit(intent.unit);
        setHint('Seleccioná una referencia para guardar la medida.');
      }
    } else if (intent.kind === 'measure' || intent.kind === 'calculate') {
      setSection('medir');
      setHint(
        intent.kind === 'calculate'
          ? 'Revisá caño y conductor calculados; GE señala lo que falta.'
          : 'Elegí una referencia y registrá una medida.',
      );
    } else if (intent.kind === 'view') {
      setSection('diagramar');
      setProjection(intent.view || 'croquis');
      setHint('Vista derivada del mismo proyecto.');
    } else if (intent.kind === 'isolate') {
      setSection('diagramar');
      setProjection('croquis');
      setVisibleKind(intent.filter || null);
      setHint('Vista filtrada. Tocá Mostrar todo para volver.');
    } else if (intent.kind === 'simulate') {
      setSection('simular');
      setScenario(intent.scenario as Scenario);
      setDidSimulate(true);
      setHint(
        'Escenario simulado; verificá los parámetros antes de usar el resultado.',
      );
    } else if (['place', 'circuit', 'board'].includes(intent.kind)) {
      if (!project.rooms.length)
        setHint('Primero dibujá un ambiente para ubicar lo solicitado.');
      else {
        onChange(
          proposeIntent(project, intent, {
            roomId: selectedRoomId || undefined,
            selectedIds: selectedIds.length
              ? selectedIds
              : selectedId
              ? [selectedId]
              : [],
          }),
        );
        setSection('diagramar');
        setHint(
          'Propuesta agregada al croquis. Revisá su posición y relaciones.',
        );
      }
    } else
      setHint(
        'Probá: ‘Poné tres tomas acá’ o ‘Hacé un circuito para el aire’.',
      );
    setIntentText('');
  };
  const setParam = (key: string, value: string) => {
    if (!selected) return;
    onChange({
      ...project,
      comps: project.comps.map(c =>
        c.id === selected.id
          ? {
              ...c,
              params: {
                ...c.params,
                [key]: value === '' ? undefined : Number(value),
              },
            }
          : c,
      ),
    });
  };

  return (
    <View style={s.root}>
      <View style={s.brand}>
        <View>
          <Text style={s.eyebrow}>GOOD ENERGY</Text>
          <Text style={s.brandTitle}>Energía que cobra sentido.</Text>
        </View>
        <View style={s.live}>
          <View style={s.liveDot} />
          <Text style={s.liveText}>GE vivo</Text>
        </View>
      </View>
      <Text style={s.intro}>
        Medí, diagramá y explorá cualquier sistema físico desde un mismo lugar.
      </Text>
      <View style={s.primary}>
        {(['medir', 'diagramar', 'simular'] as Section[]).map((item, i) => (
          <TouchableOpacity
            accessibilityRole="button"
            key={item}
            style={[s.primaryButton, section === item && s.primaryActive]}
            onPress={() => setSection(item)}>
            <Text
              style={[
                s.primaryNumber,
                section === item && s.primaryNumberActive,
              ]}>
              0{i + 1}
            </Text>
            <Text
              style={[s.primaryText, section === item && s.primaryTextActive]}>
              {item.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={s.secondary}>
        {(['observar', 'actuar'] as Section[]).map(item => (
          <TouchableOpacity
            key={item}
            onPress={() => setSection(item)}
            style={s.secondaryButton}>
            <Text
              style={[s.secondaryText, section === item && s.secondaryCurrent]}>
              {item === 'observar' ? '◉  Observar' : '↗  Actuar'}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={onLegacy} style={s.secondaryButton}>
          <Text style={s.secondaryText}>Más ···</Text>
        </TouchableOpacity>
      </View>
      <View style={s.intent}>
        <TextInput
          accessibilityLabel="Escribí lo que necesitás"
          placeholder="Ej. Poné tres tomas acá"
          placeholderTextColor="#9AA9A9"
          style={s.intentInput}
          value={intentText}
          onChangeText={setIntentText}
          onSubmitEditing={applyIntent}
        />
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Dictar intención"
          onPress={async () => {
            const adapter = getPhysicalSpeechAdapter();
            if (!adapter) {
              setHint(
                'La voz estará disponible cuando se conecte un adapter de micrófono.',
              );
              return;
            }
            try {
              const result = await adapter.listen();
              setIntentText(result.text);
              setHint(
                'Revisá la intención reconocida y tocá la flecha para aplicarla.',
              );
            } catch {
              setHint('No se pudo escuchar. Podés escribir la intención.');
            }
          }}
          style={s.intentGo}>
          <Text style={s.micText}>◉</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={applyIntent}
          style={s.intentGo}>
          <Text style={s.intentGoText}>→</Text>
        </TouchableOpacity>
      </View>
      <Text style={s.hint}>{hint}</Text>
      {section === 'diagramar' && (
        <>
          <View style={s.sectionHead}>
            <View>
              <Text style={s.kicker}>UN SOLO PROYECTO</Text>
              <Text style={s.sectionTitle}>Croquis vivo</Text>
            </View>
            <TouchableOpacity onPress={onOpen25D} style={s.outline}>
              <Text style={s.outlineText}>Ver en 2.5D ↗</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.tabRow}>
            {(
              [
                'croquis',
                'sistema',
                'unifilar',
                'cargas',
                'tablero',
                'referencia',
                'estado',
              ] as Projection[]
            ).map(view => (
              <TouchableOpacity
                key={view}
                onPress={() => setProjection(view)}
                style={[s.tab, projection === view && s.tabActive]}>
                <Text
                  style={[s.tabText, projection === view && s.tabTextActive]}>
                  {view === 'croquis'
                    ? 'Croquis 2D'
                    : view === 'sistema'
                    ? 'Sistema'
                    : view === 'unifilar'
                    ? 'Unifilar'
                    : view === 'cargas'
                    ? 'Cargas'
                    : view === 'referencia'
                    ? 'Referencia'
                    : view === 'tablero'
                    ? 'Tablero'
                    : 'Estado'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {projection === 'sistema' && (
            <PhysicalSystemsPanel
              project={project}
              onChange={onChange}
              experienceId={experienceId}
              onExperience={setExperienceId}
              onOpenMarket={onOpenMarket}
              onMeasureSource={sourceId => {
                setSelectedId(sourceId);
                setSelectedRoomId(null);
                setSelectedRouteId(null);
                setMeasureProperty('available');
                const source = project.comps.find(c => c.id === sourceId);
                setMeasureUnit(source?.params?.capacityUnit || (['energy', 'electricity'].includes(source?.physical?.resource || '') ? 'kWh' : ''));
                setSection('medir');
                setHint('Medí la cantidad realmente disponible de esta fuente.');
              }}
              onOpenElectrical={() => setProjection('unifilar')}
              onSimulate={() => setSection('simular')}
              onObserve={() => setSection('observar')}
              onPublishInvestigation={onPublishInvestigation}
              onPublishAvailability={onPublishAvailability}
              onPublishRelation={onPublishRelation}
            />
          )}
          {projection === 'croquis' && (
            <>
              <View
                style={s.canvasWrap}
                onLayout={e =>
                  setSize({width: e.nativeEvent.layout.width, height: 330})
                }
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={e => {
                  const {locationX: x, locationY: y} = e.nativeEvent;
                  const waypoint =
                    tool === 'editar_recorrido' ? hitRoute(x, y) : null;
                  touch.current = {
                    x,
                    y,
                    hit: hitAt(x, y)?.id || null,
                    routeId: waypoint?.routeId,
                    pointIndex: waypoint?.pointIndex,
                  };
                  setDraft({x, y});
                }}
                onResponderMove={e =>
                  setDraft({
                    x: e.nativeEvent.locationX,
                    y: e.nativeEvent.locationY,
                  })
                }
                onResponderRelease={e => {
                  setDraft(null);
                  completeGesture(
                    e.nativeEvent.locationX,
                    e.nativeEvent.locationY,
                  );
                }}>
                {referenceOverlay && (
                  <Image
                    source={{uri: referenceOverlay.uri}}
                    resizeMode="contain"
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: 0,
                      bottom: 0,
                      opacity: 0.3,
                    }}
                  />
                )}
                <Svg width={size.width} height={330} pointerEvents="none">
                  {Array.from(
                    {length: Math.ceil(size.width / scale) + 3},
                    (_, i) => Math.floor(pan.x) + i,
                  ).map(x => (
                    <Line
                      key={`grid-x-${x}`}
                      x1={px(x)}
                      y1={0}
                      x2={px(x)}
                      y2={330}
                      stroke="#E8EFEB"
                      strokeWidth={1}
                    />
                  ))}
                  {Array.from(
                    {length: Math.ceil(330 / scale) + 3},
                    (_, i) => Math.floor(pan.y) + i,
                  ).map(y => (
                    <Line
                      key={`grid-y-${y}`}
                      x1={0}
                      y1={py(y)}
                      x2={size.width}
                      y2={py(y)}
                      stroke="#E8EFEB"
                      strokeWidth={1}
                    />
                  ))}
                  {project.rooms.map(r => (
                    <React.Fragment key={r.id}>
                      <Rect
                        x={px(r.x)}
                        y={py(r.y)}
                        width={r.w * scale}
                        height={r.d * scale}
                        fill={
                          referenceOverlay
                            ? 'rgba(245,250,246,0.46)'
                            : '#F5FAF6'
                        }
                        stroke="#648979"
                        strokeWidth={3}
                      />
                      <SvgText
                        x={px(r.x) + 7}
                        y={py(r.y) + 17}
                        fontSize={11}
                        fill="#60766B">
                        {r.name || 'Ambiente'}
                      </SvgText>
                      <SvgText
                        x={px(r.x + r.w) - 5}
                        y={py(r.y + r.d) - 6}
                        textAnchor="end"
                        fontSize={10}
                        fill="#8AA198">
                        {fmt(r.w)} × {fmt(r.d)} m
                      </SvgText>
                    </React.Fragment>
                  ))}
                  {(project.routes || [])
                    .filter(
                      route =>
                        route.kind === 'conduit' &&
                        visibleIds.has(route.from) &&
                        visibleIds.has(route.to),
                    )
                    .map(route =>
                      route.points
                        .slice(1)
                        .map((p, i) => (
                          <Line
                            key={`${route.id}:${i}`}
                            x1={px(route.points[i].x)}
                            y1={py(route.points[i].y)}
                            x2={px(p.x)}
                            y2={py(p.y)}
                            stroke={circuitColor(route.circuitId)}
                            strokeWidth={selectedRouteId === route.id ? 5 : 3}
                            strokeDasharray="5 3"
                          />
                        )),
                    )}
                  {selectedRoute?.kind === 'conduit' &&
                    selectedRoute.points
                      .slice(1, -1)
                      .map((p, i) => (
                        <Circle
                          key={`waypoint:${i}`}
                          cx={px(p.x)}
                          cy={py(p.y)}
                          r={7}
                          fill="#FFFFFF"
                          stroke={circuitColor(selectedRoute.circuitId)}
                          strokeWidth={2}
                        />
                      ))}
                  {visibleComps.map(c => {
                    const p = componentPoint(project, c);
                    return (
                      <React.Fragment key={c.id}>
                        <Circle
                          cx={px(p.x)}
                          cy={py(p.y)}
                          r={17}
                          fill={
                            selectedIds.includes(c.id) || selectedId === c.id
                              ? '#DDF1E2'
                              : '#FFFFFF'
                          }
                          stroke={
                            componentCircuitId(c)
                              ? circuitColor(componentCircuitId(c))
                              : selectedId === c.id
                              ? '#1F6949'
                              : '#688F7C'
                          }
                          strokeWidth={2}
                        />
                        <Line
                          x1={px(p.x)}
                          y1={py(p.y)}
                          x2={
                            px(p.x) +
                            13 * Math.cos(((c.rotation || 0) * Math.PI) / 180)
                          }
                          y2={
                            py(p.y) -
                            13 * Math.sin(((c.rotation || 0) * Math.PI) / 180)
                          }
                          stroke="#4A8665"
                          strokeWidth={2}
                        />
                        <SvgText
                          x={px(p.x)}
                          y={py(p.y) + 4}
                          textAnchor="middle"
                          fontSize={10}
                          fontWeight="bold"
                          fill="#164D3B">
                          {kindMark(c.kind)}
                        </SvgText>
                        <SvgText
                          x={px(p.x)}
                          y={py(p.y) + 29}
                          textAnchor="middle"
                          fontSize={9}
                          fill="#566D61">
                          {c.name || c.kind}
                        </SvgText>
                      </React.Fragment>
                    );
                  })}
                  {draft &&
                    touch.current?.hit &&
                    tool === 'seleccionar' &&
                    Math.hypot(
                      draft.x - touch.current.x,
                      draft.y - touch.current.y,
                    ) > 8 && (
                      <Circle
                        cx={draft.x}
                        cy={draft.y}
                        r={20}
                        fill="#DDF1E2"
                        stroke="#26734B"
                        strokeWidth={2}
                        opacity={0.65}
                      />
                    )}
                  {draft && touch.current && tool === 'ambiente' && (
                    <Rect
                      x={Math.min(touch.current.x, draft.x)}
                      y={Math.min(touch.current.y, draft.y)}
                      width={Math.abs(touch.current.x - draft.x)}
                      height={Math.abs(touch.current.y - draft.y)}
                      fill="#DFF0E3"
                      fillOpacity={0.55}
                      stroke="#448E63"
                      strokeDasharray="5 3"
                    />
                  )}
                </Svg>
                {!project.rooms.length && (
                  <View pointerEvents="none" style={s.emptyCanvas}>
                    <Text style={s.emptyTitle}>Tu espacio empieza acá</Text>
                    <Text style={s.emptyText}>
                      Elegí “Ambiente” y arrastrá para dibujarlo.
                    </Text>
                  </View>
                )}
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.tools}>
                {[
                  ['seleccionar', 'Mover'],
                  ['mover_vista', 'Desplazar vista'],
                  ['ambiente', 'Ambiente'],
                  ['recorrido', 'Unir'],
                  ['editar_recorrido', 'Editar ruta'],
                ].map(([id, label]) => (
                  <TouchableOpacity
                    key={id}
                    onPress={() => setTool(id)}
                    style={[s.tool, tool === id && s.toolActive]}>
                    <Text style={[s.toolText, tool === id && s.toolTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.tools}>
                <TouchableOpacity
                  style={s.tool}
                  onPress={() =>
                    setZoom(z => Math.max(0.5, Number((z / 1.25).toFixed(2))))
                  }>
                  <Text style={s.toolText}>− Zoom</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.tool} onPress={fitProject}>
                  <Text style={s.toolText}>Encuadrar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.tool}
                  onPress={() =>
                    setZoom(z => Math.min(3, Number((z * 1.25).toFixed(2))))
                  }>
                  <Text style={s.toolText}>+ Zoom</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.tool, multiSelect && s.toolActive]}
                  onPress={() => {
                    setMultiSelect(!multiSelect);
                    setTool('seleccionar');
                    setSelectedIds([]);
                  }}>
                  <Text style={[s.toolText, multiSelect && s.toolTextActive]}>
                    Selección múltiple
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.tool}
                  onPress={() => {
                    const next = duplicateComponents(
                      project,
                      selectedIds.length
                        ? selectedIds
                        : selectedId
                        ? [selectedId]
                        : [],
                    );
                    if (next !== project) onChange(next);
                  }}>
                  <Text style={s.toolText}>Copiar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.tool}
                  onPress={() => {
                    const x = project.rooms.length
                      ? Math.max(...project.rooms.map(r => r.x + r.w)) + 0.5
                      : 0;
                    onChange({
                      ...project,
                      rooms: [
                        ...project.rooms,
                        {
                          id: physicalId('room'),
                          x,
                          y: 0,
                          w: 4,
                          d: 3,
                          h: 3,
                          roof: false,
                          name: `Ambiente ${project.rooms.length + 1}`,
                        },
                      ],
                    });
                    setPan({x: x - 0.5, y: 0});
                    setZoom(1);
                    setHint(
                      'Ambiente 4 × 3 m propuesto. Ajustá sus cotas con una medida real.',
                    );
                  }}>
                  <Text style={s.toolText}>+ Ambiente 4×3</Text>
                </TouchableOpacity>
                {visibleKind && (
                  <TouchableOpacity
                    style={s.tool}
                    onPress={() => setVisibleKind(null)}>
                    <Text style={s.toolText}>Mostrar todo</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
              {!!electrical.rows.length && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.tools}>
                  {electrical.rows.map(row => (
                    <View key={row.circuit.id} style={s.smallPill}>
                      <View
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: 5,
                          backgroundColor: circuitColor(row.circuit.id),
                        }}
                      />
                      <Text style={s.smallPillText}>
                        {row.circuit.name || row.circuit.id}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              )}
              <Text style={s.toolLabel}>AGREGAR AL CROQUIS</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.tools}>
                {palette.map(([id, label, mark]) => (
                  <TouchableOpacity
                    key={id}
                    onPress={() => setTool(id)}
                    style={[s.palette, tool === id && s.paletteActive]}>
                    <Text style={s.paletteMark}>{mark}</Text>
                    <Text style={s.paletteText}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {selected && (
                <View style={s.inspector}>
                  <View style={s.inspectorHead}>
                    <View>
                      <Text style={s.kicker}>ELEMENTO</Text>
                      <Text style={s.inspectorTitle}>
                        {selected.name || kindLabel(selected.kind)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        onChange({
                          ...project,
                          comps: project.comps.filter(
                            c => c.id !== selected.id,
                          ),
                          routes: (project.routes || []).filter(
                            r => r.from !== selected.id && r.to !== selected.id,
                          ),
                        });
                        setSelectedId(null);
                      }}>
                      <Text style={s.delete}>Quitar</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={s.muted}>
                    Propuesto · {kindLabel(selected.kind)}
                  </Text>
                  {['toma', 'luz', 'motor'].includes(selected.kind) && (
                    <>
                      <Text style={s.fieldLabel}>Potencia nominal (W)</Text>
                      <TextInput
                        keyboardType="numeric"
                        placeholder="Sin dato"
                        style={s.field}
                        value={
                          selected.params?.watts === undefined
                            ? ''
                            : String(selected.params.watts)
                        }
                        onChangeText={v => setParam('watts', v)}
                      />
                      <Text style={s.fieldLabel}>Circuito</Text>
                      <ScrollView horizontal contentContainerStyle={s.tools}>
                        {project.comps
                          .filter(c => c.kind === 'circuito')
                          .map(c => (
                            <TouchableOpacity
                              key={c.id}
                              style={[
                                s.smallPill,
                                selected.params?.circuitId === c.id &&
                                  s.smallPillActive,
                              ]}
                              onPress={() =>
                                onChange({
                                  ...project,
                                  comps: project.comps.map(item =>
                                    item.id === selected.id
                                      ? {
                                          ...item,
                                          params: {
                                            ...item.params,
                                            circuitId: c.id,
                                          },
                                        }
                                      : item,
                                  ),
                                })
                              }>
                              <Text style={s.smallPillText}>{c.name}</Text>
                            </TouchableOpacity>
                          ))}
                      </ScrollView>
                    </>
                  )}
                  {selected.kind === 'proteccion' && (
                    <>
                      <Text style={s.fieldLabel}>Corriente nominal (A)</Text>
                      <TextInput
                        keyboardType="numeric"
                        placeholder="Sin dato"
                        style={s.field}
                        value={
                          selected.params?.amperes === undefined
                            ? ''
                            : String(selected.params.amperes)
                        }
                        onChangeText={v => setParam('amperes', v)}
                      />
                    </>
                  )}
                  {selected.kind === 'circuito' && (
                    <>
                      <Text style={s.fieldLabel}>Tensión nominal (V)</Text>
                      <TextInput
                        keyboardType="numeric"
                        style={s.field}
                        value={
                          selected.params?.voltage === undefined
                            ? ''
                            : String(selected.params.voltage)
                        }
                        onChangeText={v => setParam('voltage', v)}
                      />
                    </>
                  )}
                </View>
              )}
              {selected && (
                <View style={s.inspector}>
                  <Text style={s.fieldLabel}>Nombre</Text>
                  <TextInput
                    style={s.field}
                    value={selected.name || ''}
                    onChangeText={name =>
                      onChange({
                        ...project,
                        comps: project.comps.map(c =>
                          c.id === selected.id ? {...c, name} : c,
                        ),
                      })
                    }
                  />
                  <ScrollView horizontal contentContainerStyle={s.tools}>
                    <TouchableOpacity
                      style={s.smallPill}
                      onPress={() =>
                        onChange({
                          ...project,
                          comps: project.comps.map(c =>
                            c.id === selected.id
                              ? {...c, rotation: ((c.rotation || 0) + 90) % 360}
                              : c,
                          ),
                        })
                      }>
                      <Text style={s.smallPillText}>Rotar 90°</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.smallPill}
                      onPress={() =>
                        onChange({
                          ...project,
                          comps: project.comps.map(c =>
                            c.id === selected.id ? {...c, x: 0} : c,
                          ),
                        })
                      }>
                      <Text style={s.smallPillText}>Alinear al muro</Text>
                    </TouchableOpacity>
                  </ScrollView>
                  <ScrollView horizontal contentContainerStyle={s.tools}>
                    <TouchableOpacity
                      style={s.smallPill}
                      onPress={() => {
                        const groupId =
                          selected.kind === 'circuito'
                            ? selected.id
                            : selected.params?.circuitId;
                        if (!groupId) {
                          setHint(
                            'Vinculá el elemento a un circuito para agruparlo.',
                          );
                          return;
                        }
                        onChange({
                          ...project,
                          comps: project.comps.map(c =>
                            c.id === groupId || c.params?.circuitId === groupId
                              ? {...c, groupId}
                              : c,
                          ),
                        });
                        setHint(
                          'Circuito agrupado. Podés aislarlo para revisar sus elementos.',
                        );
                      }}>
                      <Text style={s.smallPillText}>Agrupar circuito</Text>
                    </TouchableOpacity>
                    {selected.groupId && (
                      <TouchableOpacity
                        style={s.smallPill}
                        onPress={() =>
                          setIsolatedGroupId(
                            isolatedGroupId === selected.groupId
                              ? null
                              : selected.groupId || null,
                          )
                        }>
                        <Text style={s.smallPillText}>
                          {isolatedGroupId ? 'Mostrar todo' : 'Aislar grupo'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </ScrollView>
                  {[
                    'motor',
                    'bomba',
                    'aire',
                    'sensor',
                    'actuador',
                    'contacto',
                    'rele',
                  ].includes(selected.kind) && (
                    <View>
                      <Text style={s.fieldLabel}>
                        Estado para simular · PROPUESTO
                      </Text>
                      <TouchableOpacity
                        style={s.smallPill}
                        onPress={() => {
                          const key = ['motor', 'bomba', 'aire'].includes(
                            selected.kind,
                          )
                            ? 'runCommand'
                            : ['contacto', 'rele'].includes(selected.kind)
                            ? 'closed'
                            : 'active';
                          onChange({
                            ...project,
                            comps: project.comps.map(c =>
                              c.id === selected.id
                                ? {
                                    ...c,
                                    params: {
                                      ...c.params,
                                      [key]: c.params?.[key] !== true,
                                    },
                                  }
                                : c,
                            ),
                          });
                        }}>
                        <Text style={s.smallPillText}>
                          {['motor', 'bomba', 'aire'].includes(selected.kind)
                            ? selected.params?.runCommand === true
                              ? 'Marcha declarada'
                              : selected.params?.runCommand === false
                              ? 'Detenido propuesto'
                              : 'Sin declarar'
                            : ['contacto', 'rele'].includes(selected.kind)
                            ? selected.params?.closed === true
                              ? 'Contacto cerrado'
                              : selected.params?.closed === false
                              ? 'Contacto abierto'
                              : 'Sin declarar'
                            : selected.params?.active === true
                            ? 'Activo'
                            : selected.params?.active === false
                            ? 'Inactivo'
                            : 'Sin declarar'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {['motor', 'bomba', 'aire'].includes(selected.kind) && (
                    <>
                      <Text style={s.fieldLabel}>
                        Factor de corriente con motor bloqueado
                      </Text>
                      <TextInput
                        style={s.field}
                        keyboardType="decimal-pad"
                        placeholder="Sin dato · requiere fabricante/provider"
                        value={
                          selected.params?.blockMultiplier === undefined
                            ? ''
                            : String(selected.params.blockMultiplier)
                        }
                        onChangeText={v => setParam('blockMultiplier', v)}
                      />
                    </>
                  )}
                  {selected.kind === 'proteccion' && (
                    <>
                      <Text style={s.fieldLabel}>Protege al circuito</Text>
                      <ScrollView horizontal contentContainerStyle={s.tools}>
                        {project.comps
                          .filter(c => c.kind === 'circuito')
                          .map(c => (
                            <TouchableOpacity
                              key={c.id}
                              style={[
                                s.smallPill,
                                selected.params?.circuitId === c.id &&
                                  s.smallPillActive,
                              ]}
                              onPress={() =>
                                onChange({
                                  ...project,
                                  comps: project.comps.map(item =>
                                    item.id === selected.id
                                      ? {
                                          ...item,
                                          params: {
                                            ...item.params,
                                            circuitId: c.id,
                                          },
                                        }
                                      : item,
                                  ),
                                })
                              }>
                              <Text style={s.smallPillText}>{c.name}</Text>
                            </TouchableOpacity>
                          ))}
                      </ScrollView>
                    </>
                  )}
                </View>
              )}
              {selectedRoom && (
                <View style={s.inspector}>
                  <View style={s.inspectorHead}>
                    <Text style={s.inspectorTitle}>
                      {selectedRoom.name || 'Ambiente'}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        const removed = new Set(
                          project.comps
                            .filter(c => c.roomId === selectedRoom.id)
                            .map(c => c.id),
                        );
                        onChange({
                          ...project,
                          rooms: project.rooms.filter(
                            r => r.id !== selectedRoom.id,
                          ),
                          comps: project.comps.filter(
                            c => c.roomId !== selectedRoom.id,
                          ),
                          routes: (project.routes || []).filter(
                            r => !removed.has(r.from) && !removed.has(r.to),
                          ),
                        });
                        setSelectedRoomId(null);
                      }}>
                      <Text style={s.delete}>Quitar</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={s.fieldLabel}>Nombre</Text>
                  <TextInput
                    style={s.field}
                    value={selectedRoom.name || ''}
                    onChangeText={name =>
                      onChange({
                        ...project,
                        rooms: project.rooms.map(r =>
                          r.id === selectedRoom.id ? {...r, name} : r,
                        ),
                      })
                    }
                  />
                  <Text style={s.fieldLabel}>
                    Ancho {fmt(selectedRoom.w)} m · Largo {fmt(selectedRoom.d)}{' '}
                    m
                  </Text>
                  <ScrollView horizontal contentContainerStyle={s.tools}>
                    {[
                      ['w', -0.25, 'Ancho −'],
                      ['w', 0.25, 'Ancho +'],
                      ['d', -0.25, 'Largo −'],
                      ['d', 0.25, 'Largo +'],
                    ].map(([axis, delta, label], i) => (
                      <TouchableOpacity
                        key={i}
                        style={s.smallPill}
                        onPress={() =>
                          onChange({
                            ...project,
                            rooms: project.rooms.map(r =>
                              r.id === selectedRoom.id
                                ? {
                                    ...r,
                                    [axis as string]: Math.max(
                                      1,
                                      snapPhysical(
                                        Number(r[axis as 'w' | 'd']) +
                                          Number(delta),
                                      ),
                                    ),
                                  }
                                : r,
                            ),
                          })
                        }>
                        <Text style={s.smallPillText}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <Text style={s.fieldLabel}>
                    Cota de pared · {selectedWallSide}
                  </Text>
                  <View style={{flexDirection: 'row', gap: 8}}>
                    <TextInput
                      style={[s.field, {flex: 1}]}
                      keyboardType="decimal-pad"
                      placeholder="Ej. 3,60 m"
                      value={measureValue}
                      onChangeText={setMeasureValue}
                    />
                    <TouchableOpacity
                      style={s.smallPill}
                      onPress={() => {
                        const value = Number(measureValue.replace(',', '.'));
                        if (!(value > 0)) {
                          setHint('Ingresá una longitud válida.');
                          return;
                        }
                        const next = {
                          ...project,
                          rooms: project.rooms.map(r =>
                            r.id === selectedRoom.id
                              ? {
                                  ...r,
                                  [selectedWallSide === 'ancho' ? 'w' : 'd']:
                                    value,
                                }
                              : r,
                          ),
                        };
                        onChange(
                          addManualMeasure(
                            next,
                            value,
                            'm',
                            `${selectedRoom.id}:wall:${selectedWallSide}`,
                          ),
                        );
                        setMeasureValue('');
                        setHint('Cota medida y ambiente actualizados.');
                      }}>
                      <Text style={s.smallPillText}>Guardar medida</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              {selectedRoute && selectedRoute.kind === 'conduit' && (
                <View style={s.inspector}>
                  <View style={s.inspectorHead}>
                    <View>
                      <Text style={s.kicker}>CANALIZACIÓN</Text>
                      <Text style={s.inspectorTitle}>
                        {fmt(pathLength(selectedRoute))} m dibujados
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        onChange({
                          ...project,
                          routes: (project.routes || []).filter(
                            r => r.id !== selectedRoute.id,
                          ),
                        });
                        setSelectedRouteId(null);
                      }}>
                      <Text style={s.delete}>Quitar</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={s.muted}>
                    Arrastrá los puntos blancos para editar el recorrido.
                  </Text>
                  <ScrollView horizontal contentContainerStyle={s.tools}>
                    <TouchableOpacity
                      style={s.smallPill}
                      onPress={() => {
                        const lengths = selectedRoute.points
                          .slice(1)
                          .map((p, i) =>
                            Math.hypot(
                              p.x - selectedRoute.points[i].x,
                              p.y - selectedRoute.points[i].y,
                            ),
                          );
                        const index = lengths.indexOf(Math.max(...lengths));
                        onChange(
                          insertRouteWaypoint(project, selectedRoute.id, index),
                        );
                        setTool('editar_recorrido');
                      }}>
                      <Text style={s.smallPillText}>+ Punto</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.smallPill}
                      onPress={() => {
                        if (selectedRoute.points.length <= 2) return;
                        onChange({
                          ...project,
                          routes: (project.routes || []).map(r =>
                            r.id === selectedRoute.id
                              ? {
                                  ...r,
                                  points: r.points.filter(
                                    (_, i) => i !== r.points.length - 2,
                                  ),
                                }
                              : r,
                          ),
                        });
                      }}>
                      <Text style={s.smallPillText}>− Punto</Text>
                    </TouchableOpacity>
                  </ScrollView>
                  <Text style={s.fieldLabel}>Circuito del recorrido</Text>
                  <ScrollView horizontal contentContainerStyle={s.tools}>
                    {project.comps
                      .filter(c => c.kind === 'circuito')
                      .map(c => (
                        <TouchableOpacity
                          key={c.id}
                          style={[
                            s.smallPill,
                            selectedRoute.circuitId === c.id &&
                              s.smallPillActive,
                          ]}
                          onPress={() =>
                            onChange({
                              ...project,
                              routes: (project.routes || []).map(r =>
                                r.id === selectedRoute.id
                                  ? {...r, circuitId: c.id}
                                  : r,
                              ),
                            })
                          }>
                          <Text style={s.smallPillText}>{c.name}</Text>
                        </TouchableOpacity>
                      ))}
                  </ScrollView>
                  <Text style={s.fieldLabel}>Longitud medida en obra</Text>
                  <View style={{flexDirection: 'row', gap: 8}}>
                    <TextInput
                      style={[s.field, {flex: 1}]}
                      keyboardType="decimal-pad"
                      placeholder="Ej. 8,20 m"
                      value={measureValue}
                      onChangeText={setMeasureValue}
                    />
                    <TouchableOpacity
                      style={s.smallPill}
                      onPress={() => {
                        const value = Number(measureValue.replace(',', '.'));
                        if (!(value > 0)) {
                          setHint('Ingresá una longitud válida.');
                          return;
                        }
                        onChange(
                          addManualMeasure(
                            project,
                            value,
                            'm',
                            selectedRoute.id,
                          ),
                        );
                        setMeasureValue('');
                        setHint(
                          'Recorrido medido. El cálculo usará esta longitud.',
                        );
                      }}>
                      <Text style={s.smallPillText}>Guardar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              {routeStart && (
                <TouchableOpacity
                  onPress={() => {
                    setRouteStart(null);
                    setRoutePoints([]);
                  }}
                  style={s.smallPill}>
                  <Text style={s.smallPillText}>Cancelar recorrido</Text>
                </TouchableOpacity>
              )}
              {isolatedGroupId && (
                <TouchableOpacity
                  onPress={() => setIsolatedGroupId(null)}
                  style={s.smallPill}>
                  <Text style={s.smallPillText}>
                    Mostrar toda la instalación
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
          {(projection === 'unifilar' || projection === 'cargas') && (
            <ElectricalViews
              mode={projection}
              project={project}
              onChange={onChange}
              onOpenBoard={() => setProjection('tablero')}
              onSimulate={() => {
                setSection('simular');
                setDidSimulate(false);
              }}
            />
          )}
          {projection === 'tablero' && (
            <BoardEditor
              project={project}
              onChange={onChange}
              onOpenCroquis={() => {
                setProjection('croquis');
                setTool('ambiente');
              }}
              onSimulate={() => {
                setSection('simular');
                setDidSimulate(false);
              }}
            />
          )}
          {projection === 'referencia' && (
            <View style={s.sheet}>
              <Text style={s.kicker}>CONTEXTO DE OBRA</Text>
              <Text style={s.sectionTitle}>Traé una referencia</Text>
              <Text style={s.muted}>
                La imagen o el plano queda debajo del croquis. Los elementos GE
                conservan su propia identidad.
              </Text>
              <ScrollView horizontal contentContainerStyle={s.tools}>
                {(['image', 'pdf', 'svg', 'dxf', 'dwg', 'mo'] as const).map(
                  format => (
                    <TouchableOpacity
                      key={format}
                      style={[
                        s.smallPill,
                        referenceFormat === format && s.smallPillActive,
                      ]}
                      onPress={() => setReferenceFormat(format)}>
                      <Text style={s.smallPillText}>
                        {format.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ),
                )}
              </ScrollView>
              <TextInput
                style={s.field}
                placeholder="URI o ruta de la referencia"
                placeholderTextColor="#98A79A"
                value={referenceUri}
                onChangeText={setReferenceUri}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={s.simButton}
                onPress={() => {
                  const next = attachReference(project, {
                    uri: referenceUri,
                    format: referenceFormat,
                    source: 'manual:uri',
                    roomId: selectedRoomId || undefined,
                  });
                  if (next === project) {
                    setHint('Ingresá una URI válida.');
                    return;
                  }
                  onChange(next);
                  setReferenceUri('');
                  setHint('Referencia vinculada al proyecto.');
                }}>
                <Text style={s.simButtonText}>Agregar referencia →</Text>
              </TouchableOpacity>
              {getReferenceImportAdapters().map(adapter => (
                <TouchableOpacity
                  key={adapter.id}
                  style={s.smallPill}
                  onPress={async () => {
                    try {
                      const picked = await adapter.pick?.();
                      if (picked) onChange(attachReference(project, picked));
                    } catch {
                      setHint('El adapter no pudo importar la referencia.');
                    }
                  }}>
                  <Text style={s.smallPillText}>Elegir con {adapter.id}</Text>
                </TouchableOpacity>
              ))}
              {(project.references || []).map(asset => (
                <View key={asset.id} style={s.row}>
                  <View style={{flex: 1}}>
                    <Text style={s.rowTitle}>
                      {asset.title || asset.format}
                    </Text>
                    <Text style={s.muted}>
                      {asset.format.toUpperCase()} · {asset.source}
                    </Text>
                  </View>
                  {asset.format === 'image' && (
                    <TouchableOpacity
                      onPress={() => {
                        setReferenceOverlayId(asset.id);
                        setProjection('croquis');
                      }}>
                      <Text style={s.outlineText}>Ver de fondo</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => {
                      onChange({
                        ...project,
                        references: (project.references || []).filter(
                          r => r.id !== asset.id,
                        ),
                      });
                      if (referenceOverlayId === asset.id)
                        setReferenceOverlayId(null);
                    }}>
                    <Text style={s.delete}>Quitar</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <Text style={s.note}>
                PDF, SVG, DXF, DWG y MO se adjuntan como contexto. Su
                interpretación requiere el adapter correspondiente.
              </Text>
            </View>
          )}
          {projection === 'estado' && (
            <View style={s.sheet}>
              <Text style={s.sheetTitle}>Estado físico</Text>
              <Text style={s.muted}>
                Sin observaciones verificadas de esta instalación. Los elementos
                del croquis son propuestos hasta recibir evidencia.
              </Text>
              <Text style={s.note}>
                OBSERVADO · CALCULADO · SIMULADO · INFERIDO · PROPUESTO ·
                EJECUTADO
              </Text>
            </View>
          )}
        </>
      )}
      {section === 'medir' && (
        <View style={s.sheet}>
          <Text style={s.kicker}>MEDICIÓN UNIVERSAL</Text>
          <Text style={s.sectionTitle}>Cada medida, con origen.</Text>
          <Text style={s.muted}>
            Referencias del croquis: {fmt(area)} m² de superficie ·{' '}
            {fmt(routeLength)} m de recorridos dibujados.
          </Text>
          <View style={{flexDirection: 'row', gap: 8, marginTop: 14}}>
            <View style={[s.smallPill, {flex: 1}]}>
              <Text style={s.kicker}>CAÑO · CALCULADO</Text>
              <Text style={s.rowTitle}>
                {!calculation.circuits.length ||
                calculation.circuits.some(c => c.conduitLengthM === null)
                  ? 'Incompleto'
                  : `${fmt(
                      calculation.circuits.reduce(
                        (n, c) => n + (c.conduitLengthM || 0),
                        0,
                      ),
                    )} m`}
              </Text>
            </View>
            <View style={[s.smallPill, {flex: 1}]}>
              <Text style={s.kicker}>CONDUCTOR · ESTIMADO</Text>
              <Text style={s.rowTitle}>
                {!calculation.circuits.length ||
                calculation.circuits.some(c => c.conductorLengthM === null)
                  ? 'Faltan datos/provider'
                  : `${fmt(
                      calculation.circuits.reduce(
                        (n, c) => n + (c.conductorLengthM || 0),
                        0,
                      ),
                    )} m`}
              </Text>
            </View>
          </View>
          <Text style={s.note}>
            El caño suma recorridos por circuito. El conductor necesita cantidad
            de hilos y margen definido por un provider.
          </Text>
          <Text style={s.fieldLabel}>Valor</Text>
          <TextInput
            keyboardType="decimal-pad"
            placeholder="Ej. 3,50"
            style={s.field}
            value={measureValue}
            onChangeText={setMeasureValue}
          />
          <Text style={s.fieldLabel}>Unidad</Text>
          <TextInput
            style={s.field}
            value={measureUnit}
            onChangeText={setMeasureUnit}
          />
          <Text style={s.fieldLabel}>¿Qué mediste?</Text>
          <ScrollView horizontal contentContainerStyle={s.tools}>
            {[
              ['dimension', 'Dimensión', 'm'],
              ['available', 'Disponibilidad', 'kWh'],
              ['consumption', 'Consumo', 'kWh'],
              ['temperature', 'Temperatura', '°C'],
              ['pressure', 'Presión', 'bar'],
              ['humidity', 'Humedad', '%'],
              ['current', 'Corriente', 'A'],
              ['power', 'Potencia', 'W'],
              ['duration', 'Tiempo', 'h'],
              ['thermal_capacity', 'Capacidad térmica', 'kWh'],
              ['state', 'Estado', ''],
            ].map(([id, label, defaultUnit]) => (
              <TouchableOpacity key={id} onPress={() => {setMeasureProperty(id); if (defaultUnit) setMeasureUnit(defaultUnit);}} style={[s.smallPill, measureProperty === id && s.smallPillActive]}>
                <Text style={s.smallPillText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={s.fieldLabel}>Incertidumbre opcional (±)</Text>
          <TextInput
            keyboardType="decimal-pad"
            placeholder="Ej. 0,02"
            style={s.field}
            value={measureUncertainty}
            onChangeText={setMeasureUncertainty}
          />
          <Text style={s.fieldLabel}>Referencia</Text>
          <ScrollView horizontal contentContainerStyle={s.tools}>
            {[
              ...(selected && !selected.board ? [selected] : []),
              ...project.rooms,
              ...project.comps.filter(c => !c.board && c.id !== selected?.id),
              ...(project.routes || [])
                .filter(r => r.kind === 'conduit')
                .map(r => ({id: r.id, name: `Recorrido ${r.id.slice(-4)}`})),
            ].map(item => (
              <TouchableOpacity
                key={item.id}
                onPress={() => {
                  const value = measureValue.trim()
                    ? Number(measureValue.replace(',', '.'))
                    : NaN;
                  const uncertainty = Number(
                    measureUncertainty.replace(',', '.'),
                  );
                  const next = addManualMeasure(
                    project,
                    value,
                    measureUnit,
                    item.id,
                    measureUncertainty ? uncertainty : undefined,
                    measureProperty,
                  );
                  if (next !== project) {
                    onChange(next);
                    setMeasureValue('');
                    setMeasureUncertainty('');
                    setHint(
                      'Medida registrada como observada, con origen manual.',
                    );
                  } else setHint('Ingresá un valor y una unidad válidos.');
                }}
                style={s.smallPill}>
                <Text style={s.smallPillText}>{item.name || item.id}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {!!getMeasurementProviders().length && (
            <>
              <Text style={s.fieldLabel}>Instrumentos disponibles</Text>
              <ScrollView horizontal contentContainerStyle={s.tools}>
                {getMeasurementProviders().map(provider => (
                  <TouchableOpacity
                    key={provider.id}
                    style={s.smallPill}
                    onPress={async () => {
                      const reference =
                        selectedRouteId || selectedRoomId || selectedId;
                      if (!reference) {
                        setHint(
                          'Seleccioná una pared, recorrido o elemento como referencia.',
                        );
                        return;
                      }
                      try {
                        const reading = await provider.measure(reference);
                        if (reading)
                          onChange(
                            recordProviderMeasure(
                              project,
                              provider,
                              reference,
                              reading,
                            ),
                          );
                      } catch {
                        setHint('No se pudo leer el instrumento.');
                      }
                    }}>
                    <Text style={s.smallPillText}>{provider.id}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}
          <Text style={s.note}>
            Tocá una referencia para guardar la medida. El origen se registra
            como manual.
          </Text>
          {(project.measurements || [])
            .slice()
            .reverse()
            .map(m => (
              <View key={m.id} style={s.row}>
                <View style={s.flowDot} />
                <View style={{flex: 1}}>
                  <Text style={s.rowTitle}>
                    {fmt(m.value)} {m.unit}{' '}
                    {m.uncertainty !== undefined
                      ? `± ${fmt(m.uncertainty)}`
                      : ''}
                  </Text>
                  <Text style={s.muted}>
                    {(m.basis || 'medido').toUpperCase()} · {m.property || 'sin variable'} · {m.origin} ·{' '}
                    {m.epistemic} · {new Date(m.ts).toLocaleString()}
                  </Text>
                </View>
              </View>
            ))}
        </View>
      )}
      {section === 'simular' && (
        <View style={s.sheet}>
          <Text style={s.kicker}>EXPLORAR ESCENARIOS</Text>
          <Text style={s.sectionTitle}>¿Qué podría pasar?</Text>
          <ScrollView horizontal contentContainerStyle={s.tools}>
            {[
              ['normal', 'Normal'],
              ['motor_bloqueado', 'Motor bloqueado'],
              ['fase_perdida', 'Fase perdida'],
              ['sensor_ausente', 'Sensor ausente'],
              ['sobrecarga', 'Sobrecarga'],
              ['circuito_abierto', 'Circuito abierto'],
            ].map(([id, label]) => (
              <TouchableOpacity
                key={id}
                onPress={() => {
                  setScenario(id as Scenario);
                  setDidSimulate(false);
                }}
                style={[s.smallPill, scenario === id && s.smallPillActive]}>
                <Text style={s.smallPillText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity
            style={s.simButton}
            onPress={() => setDidSimulate(true)}>
            <Text style={s.simButtonText}>Simular escenario →</Text>
          </TouchableOpacity>
          {didSimulate && (
            <>
              <Text style={[s.kicker, {marginTop: 20}]}>FLUJO · SIMULADO</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.tools}>
                {simulateFlow(project, scenario).map((item, i) => (
                  <React.Fragment key={item.id}>
                    {i > 0 && (
                      <Text style={{color: '#7A9B80', alignSelf: 'center'}}>
                        →
                      </Text>
                    )}
                    <View
                      style={[
                        s.smallPill,
                        {
                          minWidth: 105,
                          borderColor:
                            item.state === 'indeterminado'
                              ? '#D8B781'
                              : [
                                  'energizado',
                                  'cerrado',
                                  'operando',
                                  'entrada_activa',
                                  'salida_activa',
                                ].includes(item.state)
                              ? '#8AC59A'
                              : '#C9D4CA',
                        },
                      ]}>
                      <Text style={s.rowTitle}>{item.label}</Text>
                      <Text style={s.muted}>
                        {item.state.replace('_', ' ')}
                      </Text>
                    </View>
                  </React.Fragment>
                ))}
              </ScrollView>
            </>
          )}
          {didSimulate &&
            simulatePhysical(project, scenario).map((event, i) => (
              <View key={i} style={s.result}>
                <Text style={s.resultFlag}>SIMULADO</Text>
                <Text style={s.rowTitle}>
                  {event.reference} · {event.state}
                </Text>
                <Text style={s.muted}>{event.detail}</Text>
              </View>
            ))}
          <Text style={s.note}>
            Estimación local. Sin parámetros completos, GE muestra la
            incertidumbre.
          </Text>
        </View>
      )}
      {section === 'observar' && (
        <View style={s.sheet}>
          <Text style={s.kicker}>ESTADO VIVO</Text>
          <Text style={s.sectionTitle}>Lo que sabemos</Text>
          <Text style={s.muted}>
            {(project.measurements || []).length} medidas ·{' '}
            {project.comps.length} elementos · {(project.fieldRecords || []).length} resultados de campo.
          </Text>
          <TouchableOpacity style={s.simButton} onPress={() => setDidDiagnose(true)}>
            <Text style={s.simButtonText}>¿Qué está pasando? →</Text>
          </TouchableOpacity>
          {didDiagnose && <View style={s.result}>
            <Text style={s.resultFlag}>DIAGNÓSTICO · {experienceId.toUpperCase()}</Text>
            <Text style={s.muted}>{diagnostic.observed.length} mediciones observadas relacionadas.</Text>
            {diagnostic.hypotheses.map((h, i) => <View key={i} style={s.row}>
              <View style={s.flowDot} />
              <View style={{flex: 1}}>
                <Text style={s.rowTitle}>INFERIDO · {h.text}</Text>
                <Text style={s.muted}>Medidas: {h.evidenceIds.join(', ')}</Text>
              </View>
            </View>)}
            {!diagnostic.hypotheses.length && <Text style={s.muted}>Aún no hay evidencia para proponer una causa.</Text>}
            <Text style={s.muted}>Para comprobar: {diagnostic.missing.join(', ') || 'seguir observando el estado en el tiempo'}.</Text>
          </View>}
          <View style={s.inspector}>
            <Text style={s.sectionTitle}>Antes / después</Text>
            <Text style={s.muted}>Compará dos medidas observadas del mismo elemento, variable y unidad. La diferencia es calculada.</Text>
            <Text style={s.fieldLabel}>Antes</Text>
            <ScrollView horizontal contentContainerStyle={s.tools}>
              {(project.measurements || []).map(m => <TouchableOpacity key={m.id} onPress={() => setBeforeId(m.id)} style={[s.smallPill, beforeId === m.id && s.smallPillActive]}>
                <Text style={s.smallPillText}>{m.value} {m.unit} · {m.property || 'variable pendiente'} · {m.reference.slice(-5)}</Text>
              </TouchableOpacity>)}
            </ScrollView>
            <Text style={s.fieldLabel}>Después</Text>
            <ScrollView horizontal contentContainerStyle={s.tools}>
              {(project.measurements || []).map(m => <TouchableOpacity key={m.id} onPress={() => setAfterId(m.id)} style={[s.smallPill, afterId === m.id && s.smallPillActive]}>
                <Text style={s.smallPillText}>{m.value} {m.unit} · {m.property || 'variable pendiente'} · {m.reference.slice(-5)}</Text>
              </TouchableOpacity>)}
            </ScrollView>
            <TextInput style={s.field} value={comparisonAction} onChangeText={setComparisonAction} placeholder="Intervención realizada" />
            <TextInput style={s.field} value={comparisonEvidence} onChangeText={setComparisonEvidence} placeholder="Evidencia de la intervención" />
            <TouchableOpacity style={s.simButton} onPress={() => {
              const next = createComparison(project, beforeId, afterId, comparisonAction, comparisonEvidence.trim() ? [comparisonEvidence.trim()] : [], recordOutcomeReference);
              if (next === project) {setHint('Para comparar: dos medidas observadas de la misma referencia, variable y unidad, intervención y evidencia.'); return;}
              onChange(next); setComparisonAction(''); setComparisonEvidence('');
              setHint('Comparación calculada y vinculada a la intervención.');
            }}><Text style={s.simButtonText}>Guardar comparación →</Text></TouchableOpacity>
            {(project.comparisons || []).slice().reverse().map(item => {
              const before = project.measurements?.find(m => m.id === item.beforeId);
              const after = project.measurements?.find(m => m.id === item.afterId);
              return <Text key={item.id} style={s.muted}>
                {before?.value} → {after?.value} {after?.unit} · Δ {before && after ? fmt(after.value - before.value) : 'sin dato'} CALCULADO · {item.action}
              </Text>;
            })}
          </View>
          <Text style={s.fieldLabel}>Referencia física</Text>
          <ScrollView horizontal contentContainerStyle={s.tools}>
            {[...project.rooms, ...project.comps, ...(project.routes || [])].map(item => (
              <TouchableOpacity key={item.id} onPress={() => setRecordReference(item.id)} style={[s.smallPill, recordReference === item.id && s.smallPillActive]}>
                <Text style={s.smallPillText}>{'name' in item ? item.name || item.id : item.id}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={s.fieldLabel}>Resultado observado o propuesta</Text>
          <TextInput style={s.field} value={recordStatement} onChangeText={setRecordStatement} placeholder="Ej. El circuito quedó instalado y verificado" />
          <Text style={s.fieldLabel}>Evidencia (foto, acta, instrumento o referencia)</Text>
          <TextInput style={s.field} value={recordEvidence} onChangeText={setRecordEvidence} placeholder="Referencia de evidencia" />
          <Text style={s.fieldLabel}>Outcome existente, si corresponde</Text>
          <TextInput style={s.field} value={recordOutcomeReference} onChangeText={setRecordOutcomeReference} placeholder="ID de outcome" />
          <ScrollView horizontal contentContainerStyle={s.tools}>
            {(['observado', 'inferido', 'propuesto', 'ejecutado'] as const).map(e => (
              <TouchableOpacity key={e} onPress={() => setRecordEpistemic(e)} style={[s.smallPill, recordEpistemic === e && s.smallPillActive]}>
                <Text style={s.smallPillText}>{e.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={s.simButton} onPress={() => {
            const next = addFieldRecord(project, recordReference, recordStatement, recordEpistemic, recordEvidence.trim() ? [recordEvidence.trim()] : [], recordOutcomeReference);
            if (next === project) {setHint('Elegí una referencia y describí el resultado.'); return;}
            onChange(next);
            setRecordStatement(''); setRecordEvidence(''); setRecordOutcomeReference('');
            setHint('Resultado registrado con su estado de conocimiento.');
          }}><Text style={s.simButtonText}>Registrar resultado →</Text></TouchableOpacity>
          {(project.fieldRecords || []).slice().reverse().map(record => (
            <View key={record.id} style={s.result}>
              <Text style={s.resultFlag}>{record.epistemic.toUpperCase()} · {record.reference}</Text>
              <Text style={s.rowTitle}>{record.statement}</Text>
              <Text style={s.muted}>{record.evidence.length ? `Evidencia: ${record.evidence.join(', ')}` : 'Sin evidencia'}{record.outcomeReference ? ` · Outcome ${record.outcomeReference}` : ''}</Text>
            </View>
          ))}
          <Text style={s.note}>
            Una señal requiere origen, tiempo, referencia, unidad, evidencia y
            continuidad antes de convertirse en un DV significativo.
          </Text>
        </View>
      )}
      {section === 'actuar' && (
        <View style={s.sheet}>
          <Text style={s.kicker}>AUTOMATIZACIÓN RESPONSABLE</Text>
          <Text style={s.sectionTitle}>De intención a acción</Text>
          <Text style={s.muted}>
            Observación → recomendación → autorización → acción → evidencia →
            outcome.
          </Text>
          <Text style={s.note}>
            Este croquis no envía comandos a equipos. Una acción física requiere
            authority, policy y mandate aplicables.
          </Text>
        </View>
      )}
      <View style={s.depth}>
        <Text style={s.depthLabel}>PROFUNDIDAD</Text>
        {(['simple', 'tecnico', 'profundo'] as const).map(d => (
          <TouchableOpacity key={d} onPress={() => setDepth(d)}>
            <Text style={[s.depthText, depth === d && s.depthCurrent]}>
              {d === 'tecnico'
                ? 'Técnico'
                : d === 'profundo'
                ? 'Profundo'
                : 'Simple'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {depth !== 'simple' && (
        <Text style={s.technical}>{`Circuitos ${
          electrical.rows.length
        } · Carga declarada ${fmt(
          electrical.connectedWatts,
        )} W · Recorridos ${fmt(routeLength)} m${
          depth === 'profundo'
            ? ` · Medidas ${project.measurements?.length || 0} · Referencias ${
                project.comps.length
              }`
            : ''
        }`}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 48,
    backgroundColor: '#F7F8F3',
  },
  brand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2.2,
    color: '#337458',
  },
  brandTitle: {fontSize: 25, fontWeight: '700', color: '#173D31', marginTop: 5},
  live: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#E4F2E6',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#2C9B68',
    marginRight: 6,
  },
  liveText: {fontSize: 11, color: '#28734E', fontWeight: '700'},
  intro: {
    fontSize: 14,
    color: '#687A70',
    marginTop: 10,
    marginBottom: 22,
    lineHeight: 21,
  },
  primary: {flexDirection: 'row', gap: 8},
  primaryButton: {
    flex: 1,
    minHeight: 82,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E3EAE2',
  },
  primaryActive: {backgroundColor: '#194D3C', borderColor: '#194D3C'},
  primaryNumber: {color: '#91A69A', fontSize: 11, fontWeight: '700'},
  primaryNumberActive: {color: '#A9D9BA'},
  primaryText: {
    color: '#234C3B',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  primaryTextActive: {color: '#FFFFFF'},
  secondary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
    marginBottom: 16,
  },
  secondaryButton: {paddingVertical: 5, paddingRight: 10},
  secondaryText: {color: '#687B70', fontSize: 13, fontWeight: '600'},
  secondaryCurrent: {color: '#1A6B46'},
  intent: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DFE8DF',
    backgroundColor: '#FFFFFF',
    paddingLeft: 14,
    height: 48,
  },
  intentInput: {flex: 1, color: '#173D31', fontSize: 14},
  intentGo: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intentGoText: {color: '#256C4A', fontSize: 25},
  micText: {color: '#8DAA9B', fontSize: 19},
  hint: {
    color: '#789084',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
    marginBottom: 22,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  kicker: {
    color: '#4B9170',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.7,
    marginBottom: 5,
  },
  sectionTitle: {fontSize: 23, fontWeight: '700', color: '#173D31'},
  outline: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#C5D8C8',
  },
  outlineText: {color: '#276348', fontSize: 12, fontWeight: '700'},
  tabRow: {gap: 8, paddingBottom: 12},
  tab: {paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10},
  tabActive: {backgroundColor: '#E2EFE4'},
  tabText: {color: '#81938A', fontSize: 12, fontWeight: '600'},
  tabTextActive: {color: '#225F44'},
  canvasWrap: {
    height: 330,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DBE7DC',
  },
  emptyCanvas: {
    position: 'absolute',
    top: 130,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  emptyTitle: {fontSize: 17, color: '#315744', fontWeight: '700'},
  emptyText: {color: '#8DA398', fontSize: 12},
  tools: {gap: 8, paddingVertical: 10},
  tool: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DEE8DF',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
  },
  toolActive: {backgroundColor: '#20553F', borderColor: '#20553F'},
  toolText: {color: '#547360', fontSize: 12, fontWeight: '700'},
  toolTextActive: {color: '#FFFFFF'},
  toolLabel: {
    color: '#81978A',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.3,
    marginTop: 12,
  },
  palette: {
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#E0E9E0',
    minWidth: 78,
    alignItems: 'center',
    padding: 10,
  },
  paletteActive: {borderColor: '#369166', backgroundColor: '#EBF6EC'},
  paletteMark: {color: '#236547', fontWeight: '800', fontSize: 14},
  paletteText: {color: '#506F5D', fontSize: 10, marginTop: 4},
  inspector: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 18,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E1EAE1',
  },
  inspectorHead: {flexDirection: 'row', justifyContent: 'space-between'},
  inspectorTitle: {fontSize: 18, fontWeight: '700', color: '#173D31'},
  delete: {color: '#A45246', fontSize: 12},
  muted: {color: '#6F8177', fontSize: 12, lineHeight: 18, marginTop: 4},
  fieldLabel: {
    color: '#466A54',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 15,
    marginBottom: 6,
  },
  field: {
    height: 42,
    borderWidth: 1,
    borderColor: '#DDE8DE',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 12,
    color: '#163D30',
  },
  smallPill: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#F2F6F0',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DFE9DD',
  },
  smallPillActive: {backgroundColor: '#DDEFE0', borderColor: '#74AD83'},
  smallPillText: {color: '#315D42', fontSize: 11, fontWeight: '700'},
  sheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2EAE1',
    minHeight: 240,
  },
  sheetTitle: {
    fontSize: 16,
    color: '#1B4534',
    fontWeight: '700',
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#E9EFE8',
    gap: 10,
  },
  flowDot: {width: 9, height: 9, borderRadius: 5, backgroundColor: '#4BA575'},
  rowTitle: {color: '#25513A', fontSize: 13, fontWeight: '700'},
  rowValue: {color: '#31664A', fontWeight: '700', fontSize: 12},
  note: {color: '#7C9082', fontSize: 11, lineHeight: 17, marginTop: 18},
  board: {
    minHeight: 110,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#8DAA94',
    backgroundColor: '#E8EFE7',
    padding: 14,
    marginTop: 15,
  },
  rail: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 55,
    height: 8,
    backgroundColor: '#A3B8A8',
  },
  module: {
    zIndex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A8BBA8',
    borderRadius: 5,
    minWidth: 42,
    alignItems: 'center',
    padding: 8,
  },
  moduleMark: {color: '#255D40', fontWeight: '800'},
  moduleName: {color: '#708577', fontSize: 8},
  simButton: {
    backgroundColor: '#194D3C',
    borderRadius: 12,
    alignItems: 'center',
    padding: 15,
    marginTop: 14,
  },
  simButtonText: {color: '#FFFFFF', fontWeight: '700'},
  result: {
    borderLeftWidth: 3,
    borderLeftColor: '#D3915C',
    backgroundColor: '#FFF9F2',
    padding: 13,
    marginTop: 12,
    borderRadius: 8,
  },
  resultFlag: {
    color: '#A8743C',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 5,
  },
  depth: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 35,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: '#DDE8DF',
  },
  depthLabel: {
    color: '#9AAA9C',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  depthText: {color: '#9AAB9E', fontSize: 11},
  depthCurrent: {color: '#286347', fontWeight: '800'},
  technical: {color: '#61776A', fontSize: 11, marginTop: 12},
});
