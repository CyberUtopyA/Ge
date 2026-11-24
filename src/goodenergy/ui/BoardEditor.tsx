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
  PhysicalComp,
  PhysicalProject,
  componentPoint,
  physicalId,
} from '../physical.model';

type Role = 'fuerza' | 'mando' | 'automatizacion' | 'todo';
type Props = {
  project: PhysicalProject;
  onChange: (next: PhysicalProject) => void;
  onSimulate: () => void;
  onOpenCroquis: () => void;
};
const kinds = [
  ['proteccion', 'Protección', 'Q', 'fuerza'],
  ['contacto', 'Contactor', 'K', 'fuerza'],
  ['rele', 'Relé', 'R', 'mando'],
  ['bornera', 'Bornera', 'X', 'mando'],
  ['fuente', 'Fuente', 'F', 'mando'],
  ['plc', 'PLC / adapter', 'P', 'automatizacion'],
  ['sensor', 'Entrada', 'I', 'automatizacion'],
  ['actuador', 'Salida', 'O', 'automatizacion'],
] as const;
const label = (kind: string) => kinds.find(k => k[0] === kind)?.[1] || kind;
const mark = (kind: string) => kinds.find(k => k[0] === kind)?.[2] || '•';

export default function BoardEditor({
  project,
  onChange,
  onSimulate,
  onOpenCroquis,
}: Props) {
  const [role, setRole] = useState<Role>('fuerza');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wireStart, setWireStart] = useState<string | null>(null);
  const [wireMode, setWireMode] = useState(false);
  const [width, setWidth] = useState(340);
  const [drag, setDrag] = useState<{id: string; x: number; y: number} | null>(
    null,
  );
  const touch = useRef<{x: number; y: number; id: string | null} | null>(null);
  const board = project.comps.find(c => c.kind === 'tablero');
  const railCount = Math.max(
    1,
    Math.min(3, Number(board?.params?.railCount) || 2),
  );
  const ductCount = Math.max(
    0,
    Math.min(
      4,
      board?.params?.ductCount === undefined
        ? 3
        : Number(board.params.ductCount),
    ),
  );
  const modules = useMemo(
    () => project.comps.filter(c => c.board?.boardId === board?.id),
    [project, board?.id],
  );
  const visible = modules.filter(
    c => role === 'todo' || c.board?.role === role || !c.board?.role,
  );
  const selected = modules.find(c => c.id === selectedId);
  const boardRoutes = (project.routes || []).filter(
    r => r.kind === 'wire' && r.board?.boardId === board?.id,
  );
  const px = (n: number) =>
    30 + (Math.max(0, Math.min(100, n)) * (width - 60)) / 100;
  const railY = (n: number) =>
    [100, 205, 310][Math.max(0, Math.min(railCount - 1, Math.round(n)))];
  const hit = (x: number, y: number) =>
    [...visible]
      .reverse()
      .find(
        c =>
          Math.abs(px(c.board?.x || 0) - x) < 25 &&
          Math.abs(railY(c.board?.y || 0) - y) < 28,
      ) || null;
  const endTouch = (x: number, y: number) => {
    const start = touch.current;
    touch.current = null;
    setDrag(null);
    if (!start) return;
    const target = hit(x, y);
    if (wireMode) {
      if (!wireStart) {
        if (target) setWireStart(target.id);
        return;
      }
      if (target && target.id !== wireStart) {
        const from = modules.find(c => c.id === wireStart);
        if (from && board) {
          const p = componentPoint(project, from),
            q = componentPoint(project, target);
          onChange({
            ...project,
            routes: [
              ...(project.routes || []),
              {
                id: physicalId('wire'),
                from: from.id,
                to: target.id,
                kind: 'wire',
                points: [p, q],
                board: {
                  boardId: board.id,
                  points: [
                    {x: from.board?.x || 0, y: from.board?.y || 0},
                    {x: target.board?.x || 0, y: target.board?.y || 0},
                  ],
                },
                circuitId: from.params?.circuitId || target.params?.circuitId,
              },
            ],
          });
        }
      }
      setWireStart(null);
      return;
    }
    if (!start.id || !board) {
      setSelectedId(target?.id || null);
      return;
    }
    if (Math.hypot(start.x - x, start.y - y) < 8) {
      setSelectedId(start.id);
      return;
    }
    const nextX =
      Math.round(
        Math.max(0, Math.min(100, ((x - 30) / (width - 60)) * 100)) / 5,
      ) * 5;
    const nextY = Array.from({length: railCount}, (_, i) => i).sort(
      (a, b) => Math.abs(railY(a) - y) - Math.abs(railY(b) - y),
    )[0];
    const comps = project.comps.map(c =>
      c.id === start.id ? {...c, board: {...c.board!, x: nextX, y: nextY}} : c,
    );
    const routes = (project.routes || []).map(r => {
      if (
        r.board?.boardId !== board.id ||
        (r.from !== start.id && r.to !== start.id)
      )
        return r;
      const points = [...r.board.points];
      if (r.from === start.id) points[0] = {x: nextX, y: nextY};
      if (r.to === start.id) points[points.length - 1] = {x: nextX, y: nextY};
      return {...r, board: {...r.board, points}};
    });
    onChange({...project, comps, routes});
    setSelectedId(start.id);
  };
  const addModule = (kind: string, defaultRole: Exclude<Role, 'todo'>) => {
    if (!board) return;
    const count = modules.length;
    const component: PhysicalComp = {
      id: physicalId(kind),
      kind,
      roomId: board.roomId,
      attach: 'wall',
      x: board.x,
      y: board.y,
      name: `${mark(kind)}${
        project.comps.filter(c => c.kind === kind).length + 1
      }`,
      params: {epistemic: 'propuesto'},
      board: {
        boardId: board.id,
        x: 10 + (count % 7) * 13,
        y: count % railCount,
        role: defaultRole,
      },
    };
    onChange({...project, comps: [...project.comps, component]});
    setSelectedId(component.id);
    setRole(defaultRole);
  };
  const updateSelected = (change: Partial<PhysicalComp>) =>
    selected &&
    onChange({
      ...project,
      comps: project.comps.map(c =>
        c.id === selected.id ? {...c, ...change} : c,
      ),
    });
  const setBoardParam = (key: string, value: number) =>
    board &&
    onChange({
      ...project,
      comps: project.comps.map(c =>
        c.id === board.id ? {...c, params: {...c.params, [key]: value}} : c,
      ),
    });
  if (!board)
    return (
      <View style={s.empty}>
        <Text style={s.title}>Empezá por un tablero</Text>
        <Text style={s.muted}>
          El tablero pertenece al mismo croquis y comparte sus componentes.
        </Text>
        <TouchableOpacity
          style={s.action}
          onPress={() => {
            const room = project.rooms[0];
            if (!room) {
              onOpenCroquis();
              return;
            }
            onChange({
              ...project,
              comps: [
                ...project.comps,
                {
                  id: physicalId('board'),
                  kind: 'tablero',
                  roomId: room.id,
                  attach: 'wall',
                  x: 0.5,
                  y: 0.5,
                  name: 'TD1',
                  params: {epistemic: 'propuesto'},
                },
              ],
            });
          }}>
          <Text style={s.actionText}>
            {project.rooms.length
              ? 'Agregar tablero al croquis'
              : 'Primero dibujá un ambiente'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  return (
    <View style={s.root}>
      <View style={s.heading}>
        <View>
          <Text style={s.kicker}>MISMO PROYECTO</Text>
          <Text style={s.title}>{board.name || 'Tablero'}</Text>
        </View>
        <TouchableOpacity onPress={onSimulate} style={s.simulate}>
          <Text style={s.simulateText}>Simular ↗</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={[s.chip, {alignSelf: 'flex-start', marginTop: 12}]}
        onPress={() =>
          onChange({
            ...project,
            comps: project.comps.map(c =>
              c.id === board.id
                ? {
                    ...c,
                    params: {
                      ...c.params,
                      sourceReady: c.params?.sourceReady !== true,
                    },
                  }
                : c,
            ),
          })
        }>
        <Text style={s.chipText}>
          {board.params?.sourceReady === true
            ? '✓ Fuente declarada para simular'
            : '○ Declarar fuente para simular'}
        </Text>
      </TouchableOpacity>
      <View style={s.tools}>
        <TouchableOpacity
          style={s.chip}
          onPress={() =>
            setBoardParam('railCount', Math.max(1, railCount - 1))
          }>
          <Text style={s.chipText}>− Riel</Text>
        </TouchableOpacity>
        <Text style={s.muted}>{railCount} rieles DIN</Text>
        <TouchableOpacity
          style={s.chip}
          onPress={() =>
            setBoardParam('railCount', Math.min(3, railCount + 1))
          }>
          <Text style={s.chipText}>+ Riel</Text>
        </TouchableOpacity>
      </View>
      <View style={s.tools}>
        <TouchableOpacity
          style={s.chip}
          onPress={() =>
            setBoardParam('ductCount', Math.max(0, ductCount - 1))
          }>
          <Text style={s.chipText}>− Canaleta</Text>
        </TouchableOpacity>
        <Text style={s.muted}>{ductCount} canaletas</Text>
        <TouchableOpacity
          style={s.chip}
          onPress={() =>
            setBoardParam('ductCount', Math.min(4, ductCount + 1))
          }>
          <Text style={s.chipText}>+ Canaleta</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.tabs}>
        {(['fuerza', 'mando', 'automatizacion', 'todo'] as Role[]).map(
          value => (
            <TouchableOpacity
              key={value}
              onPress={() => setRole(value)}
              style={[s.tab, role === value && s.tabActive]}>
              <Text style={[s.tabText, role === value && s.tabTextActive]}>
                {value === 'todo'
                  ? 'Todo'
                  : value === 'automatizacion'
                  ? 'Automatización'
                  : value === 'fuerza'
                  ? 'Fuerza'
                  : 'Mando'}
              </Text>
            </TouchableOpacity>
          ),
        )}
      </ScrollView>
      <View
        style={s.cabinet}
        onLayout={e => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={e => {
          const {locationX: x, locationY: y} = e.nativeEvent;
          touch.current = {x, y, id: hit(x, y)?.id || null};
        }}
        onResponderMove={e => {
          if (touch.current?.id && !wireMode)
            setDrag({
              id: touch.current.id,
              x: e.nativeEvent.locationX,
              y: e.nativeEvent.locationY,
            });
        }}
        onResponderRelease={e =>
          endTouch(e.nativeEvent.locationX, e.nativeEvent.locationY)
        }>
        <Svg width={width} height={380} pointerEvents="none">
          <Rect
            x={7}
            y={7}
            width={width - 14}
            height={366}
            rx={12}
            fill="#EEF2EC"
            stroke="#779783"
            strokeWidth={2}
          />
          {[50, 155, 260, 352].slice(0, ductCount).map(y => (
            <Rect
              key={`duct-${y}`}
              x={18}
              y={y}
              width={width - 36}
              height={15}
              fill="#D4E1D6"
            />
          ))}
          {Array.from({length: railCount}, (_, i) => railY(i)).map(y => (
            <React.Fragment key={y}>
              <Rect
                x={23}
                y={y - 6}
                width={width - 46}
                height={12}
                fill="#A7B8AC"
              />
              <Line
                x1={23}
                y1={y}
                x2={width - 23}
                y2={y}
                stroke="#708C78"
                strokeWidth={2}
              />
            </React.Fragment>
          ))}
          {boardRoutes.map(route => {
            const a = modules.find(c => c.id === route.from),
              b = modules.find(c => c.id === route.to);
            if (!a || !b || !visible.includes(a) || !visible.includes(b))
              return null;
            return (
              <Line
                key={route.id}
                x1={px(a.board?.x || 0)}
                y1={railY(a.board?.y || 0)}
                x2={px(b.board?.x || 0)}
                y2={railY(b.board?.y || 0)}
                stroke="#E08D54"
                strokeWidth={3}
                strokeDasharray="5 3"
              />
            );
          })}
          {visible.map(c => {
            const x = drag?.id === c.id ? drag.x : px(c.board?.x || 0),
              y = drag?.id === c.id ? drag.y : railY(c.board?.y || 0);
            return (
              <React.Fragment key={c.id}>
                <Rect
                  x={x - 21}
                  y={y - 25}
                  width={42}
                  height={50}
                  rx={5}
                  fill={selectedId === c.id ? '#DCF2DF' : '#FFFFFF'}
                  stroke={selectedId === c.id ? '#278256' : '#759982'}
                  strokeWidth={2}
                />
                <SvgText
                  x={x}
                  y={y + 4}
                  textAnchor="middle"
                  fontSize={16}
                  fontWeight="bold"
                  fill="#265C40">
                  {mark(c.kind)}
                </SvgText>
                <SvgText
                  x={x}
                  y={y + 38}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#516B59">
                  {c.name}
                </SvgText>
              </React.Fragment>
            );
          })}
          <Circle cx={width - 26} cy={27} r={5} fill="#60AF7B" />
        </Svg>
      </View>
      <View style={s.tools}>
        <TouchableOpacity
          style={[s.chip, wireMode && s.chipActive]}
          onPress={() => {
            setWireMode(!wireMode);
            setWireStart(null);
          }}>
          <Text style={[s.chipText, wireMode && s.chipTextActive]}>
            {wireStart ? 'Elegí destino' : 'Unir conductores'}
          </Text>
        </TouchableOpacity>
        <Text style={s.muted}>Arrastrá módulos · snap al riel DIN</Text>
      </View>
      <Text style={s.label}>AGREGAR COMPONENTE</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.tabs}>
        {kinds.map(([kind, title, icon, defaultRole]) => (
          <TouchableOpacity
            key={kind}
            style={s.moduleButton}
            onPress={() => addModule(kind, defaultRole)}>
            <Text style={s.moduleIcon}>{icon}</Text>
            <Text style={s.moduleLabel}>{title}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {selected && (
        <View style={s.inspector}>
          <Text style={s.kicker}>COMPONENTE · {label(selected.kind)}</Text>
          <TextInput
            style={s.field}
            value={selected.name || ''}
            onChangeText={name => updateSelected({name})}
          />
          <Text style={s.label}>PROYECCIÓN</Text>
          <ScrollView horizontal contentContainerStyle={s.tabs}>
            {(['fuerza', 'mando', 'automatizacion'] as const).map(value => (
              <TouchableOpacity
                key={value}
                style={[s.chip, selected.board?.role === value && s.chipActive]}
                onPress={() => {
                  updateSelected({board: {...selected.board!, role: value}});
                  setRole(value);
                }}>
                <Text style={s.chipText}>
                  {value === 'automatizacion' ? 'Automatización' : value}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {selected.kind === 'proteccion' && (
            <>
              <Text style={s.label}>CORRIENTE NOMINAL (A)</Text>
              <TextInput
                style={s.field}
                keyboardType="decimal-pad"
                placeholder="Sin dato"
                value={
                  selected.params?.amperes === undefined
                    ? ''
                    : String(selected.params.amperes)
                }
                onChangeText={value =>
                  updateSelected({
                    params: {
                      ...selected.params,
                      amperes: value.trim()
                        ? Number(value.replace(',', '.'))
                        : undefined,
                    },
                  })
                }
              />
            </>
          )}
          {['contacto', 'rele', 'sensor', 'actuador'].includes(
            selected.kind,
          ) && (
            <>
              <Text style={s.label}>ESTADO PARA SIMULAR · PROPUESTO</Text>
              <TouchableOpacity
                style={s.chip}
                onPress={() => {
                  const key = ['contacto', 'rele'].includes(selected.kind)
                    ? 'closed'
                    : 'active';
                  updateSelected({
                    params: {
                      ...selected.params,
                      [key]: selected.params?.[key] !== true,
                    },
                  });
                }}>
                <Text style={s.chipText}>
                  {['contacto', 'rele'].includes(selected.kind)
                    ? selected.params?.closed === true
                      ? 'Cerrado'
                      : selected.params?.closed === false
                      ? 'Abierto'
                      : 'Sin declarar'
                    : selected.params?.active === true
                    ? 'Activo'
                    : selected.params?.active === false
                    ? 'Inactivo'
                    : 'Sin declarar'}
                </Text>
              </TouchableOpacity>
            </>
          )}
          <Text style={s.label}>CIRCUITO</Text>
          <ScrollView horizontal contentContainerStyle={s.tabs}>
            {project.comps
              .filter(c => c.kind === 'circuito')
              .map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    s.chip,
                    selected.params?.circuitId === c.id && s.chipActive,
                  ]}
                  onPress={() =>
                    updateSelected({
                      params: {...selected.params, circuitId: c.id},
                    })
                  }>
                  <Text style={s.chipText}>{c.name}</Text>
                </TouchableOpacity>
              ))}
          </ScrollView>
          <View style={s.tools}>
            <TouchableOpacity
              onPress={() =>
                onChange({
                  ...project,
                  comps: project.comps.filter(c => c.id !== selected.id),
                  routes: (project.routes || []).filter(
                    r => r.from !== selected.id && r.to !== selected.id,
                  ),
                })
              }>
              <Text style={s.remove}>Quitar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {!!boardRoutes.length && (
        <View style={s.inspector}>
          <Text style={s.kicker}>CONDUCTORES PROPUESTOS</Text>
          {boardRoutes.map(route => (
            <View key={route.id} style={s.tools}>
              <Text style={[s.muted, {flex: 1}]}>
                {modules.find(c => c.id === route.from)?.name || 'Origen'} →{' '}
                {modules.find(c => c.id === route.to)?.name || 'Destino'}
              </Text>
              <TouchableOpacity
                onPress={() =>
                  onChange({
                    ...project,
                    routes: (project.routes || []).filter(
                      r => r.id !== route.id,
                    ),
                  })
                }>
                <Text style={s.remove}>Quitar</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
      <Text style={s.footer}>
        Gabinete, rieles y canaletas se muestran como contexto. La posición y
        los conductores se guardan en el mismo proyecto.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2EAE1',
  },
  empty: {backgroundColor: '#FFFFFF', borderRadius: 18, padding: 20},
  heading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kicker: {
    fontSize: 10,
    letterSpacing: 1.4,
    color: '#548667',
    fontWeight: '800',
  },
  title: {fontSize: 19, fontWeight: '700', color: '#1B4934', marginTop: 3},
  muted: {fontSize: 11, color: '#7B8C7F', lineHeight: 17},
  action: {
    backgroundColor: '#1D593E',
    padding: 12,
    borderRadius: 10,
    marginTop: 15,
  },
  actionText: {color: '#FFFFFF', fontWeight: '700', textAlign: 'center'},
  simulate: {padding: 10, borderRadius: 12, backgroundColor: '#E3F1E5'},
  simulateText: {color: '#276447', fontWeight: '700', fontSize: 11},
  tabs: {gap: 8, paddingVertical: 12},
  tab: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 15,
    backgroundColor: '#F1F5EE',
  },
  tabActive: {backgroundColor: '#245C41'},
  tabText: {color: '#68836E', fontSize: 12, fontWeight: '700'},
  tabTextActive: {color: '#FFFFFF'},
  cabinet: {
    height: 380,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#EEF2EC',
  },
  tools: {flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12},
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: '#EEF4EC',
  },
  chipActive: {backgroundColor: '#D6EAD9'},
  chipText: {color: '#316044', fontSize: 11, fontWeight: '700'},
  chipTextActive: {color: '#1D6F48'},
  label: {
    fontSize: 10,
    color: '#82988A',
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 16,
  },
  moduleButton: {
    minWidth: 77,
    borderWidth: 1,
    borderColor: '#DFE9E0',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
  },
  moduleIcon: {color: '#2D704A', fontSize: 17, fontWeight: '800'},
  moduleLabel: {color: '#607767', fontSize: 9, marginTop: 4},
  inspector: {
    borderTopWidth: 1,
    borderTopColor: '#E5ECE3',
    paddingTop: 15,
    marginTop: 12,
  },
  field: {
    height: 42,
    borderWidth: 1,
    borderColor: '#DDE8DE',
    borderRadius: 10,
    paddingHorizontal: 12,
    color: '#173D31',
    marginTop: 9,
  },
  remove: {color: '#AA554D', fontSize: 12, fontWeight: '700'},
  footer: {color: '#889A8B', fontSize: 10, lineHeight: 16, marginTop: 18},
});
