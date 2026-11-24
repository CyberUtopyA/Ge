import React, {useMemo, useState} from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  calculateElectrical,
  getElectricalCalculationPolicy,
} from '../physical.calculate';
import {
  PhysicalProject,
  circuitColor,
  electricalProjection,
} from '../physical.model';

type Props = {
  mode: 'unifilar' | 'cargas';
  project: PhysicalProject;
  onChange: (next: PhysicalProject) => void;
  onOpenBoard: () => void;
  onSimulate: () => void;
};
const number = (v: number | null, unit: string) =>
  v === null ? 'Incompleto' : `${Number(v.toFixed(2))} ${unit}`;

export default function ElectricalViews({
  mode,
  project,
  onChange,
  onOpenBoard,
  onSimulate,
}: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const projection = useMemo(() => electricalProjection(project), [project]);
  const calculation = useMemo(
    () =>
      calculateElectrical(
        project,
        getElectricalCalculationPolicy() || undefined,
      ),
    [project],
  );
  const edit = (id: string, key: string, value: string) =>
    onChange({
      ...project,
      comps: project.comps.map(c =>
        c.id === id
          ? {
              ...c,
              params: {
                ...c.params,
                [key]:
                  value.trim() === ''
                    ? undefined
                    : key === 'phase'
                    ? value
                    : Number(value.replace(',', '.')),
              },
            }
          : c,
      ),
    });
  return (
    <View style={s.root}>
      <View style={s.heading}>
        <View>
          <Text style={s.kicker}>DERIVADO DEL CROQUIS</Text>
          <Text style={s.title}>
            {mode === 'unifilar' ? 'Unifilar' : 'Cuadro de cargas'}
          </Text>
        </View>
        <TouchableOpacity style={s.simulate} onPress={onSimulate}>
          <Text style={s.simulateText}>Simular ↗</Text>
        </TouchableOpacity>
      </View>
      {!calculation.circuits.length && (
        <Text style={s.empty}>
          Agregá un circuito en el croquis. Las vistas aparecerán acá, sin
          copiar datos.
        </Text>
      )}
      {mode === 'unifilar' &&
        projection.rows.map((row, i) => {
          const calc = calculation.circuits[i];
          const color = circuitColor(row.circuit.id);
          return (
            <View key={row.circuit.id} style={s.circuit}>
              <View style={s.circuitHead}>
                <View style={[s.color, {backgroundColor: color}]} />
                <Text style={s.circuitName}>
                  {row.circuit.name || `Circuito ${i + 1}`}
                </Text>
                <Text style={s.badge}>
                  {calc.missing.length ? 'INCOMPLETO' : 'CALCULADO'}
                </Text>
              </View>
              <View style={s.flow}>
                <View style={s.flowNode}>
                  <Text style={s.flowIcon}>◉</Text>
                  <Text style={s.flowLabel}>
                    {projection.boards[0]?.name || 'Fuente por definir'}
                  </Text>
                </View>
                <Text style={[s.arrow, {color}]}>→</Text>
                <View style={s.flowNode}>
                  <Text style={s.flowIcon}>Q</Text>
                  <Text style={s.flowLabel}>
                    {row.protection?.name || 'Protección pendiente'}
                  </Text>
                </View>
                <Text style={[s.arrow, {color}]}>→</Text>
                <View style={s.flowNode}>
                  <Text style={s.flowIcon}>C</Text>
                  <Text style={s.flowLabel}>
                    {row.circuit.name || 'Circuito'}
                  </Text>
                </View>
                <Text style={[s.arrow, {color}]}>→</Text>
                <View style={s.flowNode}>
                  <Text style={s.flowIcon}>{row.loads.length}</Text>
                  <Text style={s.flowLabel}>Cargas</Text>
                </View>
              </View>
              <Text style={s.detail}>
                {row.loads.map(l => l.name || l.kind).join(' · ') ||
                  'Sin cargas asociadas'}
              </Text>
              <Text style={s.detail}>
                {number(calc.declaredPowerW, 'W')} ·{' '}
                {number(calc.currentA, 'A')} ·{' '}
                {number(calc.routeLengthM, 'm de recorrido')}
              </Text>
              {!!calc.missing.length && (
                <Text style={s.missing}>Falta: {calc.missing.join(', ')}.</Text>
              )}
              <TouchableOpacity
                onPress={() =>
                  setEditing(editing === row.circuit.id ? null : row.circuit.id)
                }>
                <Text style={s.editLink}>
                  {editing === row.circuit.id
                    ? 'Cerrar datos'
                    : 'Completar datos'}{' '}
                  ↓
                </Text>
              </TouchableOpacity>
              {editing === row.circuit.id && (
                <View style={s.editor}>
                  <Text style={s.fieldLabel}>Tensión (V)</Text>
                  <TextInput
                    style={s.field}
                    keyboardType="decimal-pad"
                    placeholder="Sin dato"
                    value={
                      row.circuit.params?.voltage === undefined
                        ? ''
                        : String(row.circuit.params.voltage)
                    }
                    onChangeText={v => edit(row.circuit.id, 'voltage', v)}
                  />
                  <Text style={s.fieldLabel}>Conductores en el recorrido</Text>
                  <TextInput
                    style={s.field}
                    keyboardType="number-pad"
                    placeholder="Sin dato"
                    value={
                      row.circuit.params?.conductors === undefined
                        ? ''
                        : String(row.circuit.params.conductors)
                    }
                    onChangeText={v => edit(row.circuit.id, 'conductors', v)}
                  />
                  <Text style={s.fieldLabel}>Sección (mm²)</Text>
                  <TextInput
                    style={s.field}
                    keyboardType="decimal-pad"
                    placeholder="Sin dato"
                    value={
                      row.circuit.params?.conductorAreaMm2 === undefined
                        ? ''
                        : String(row.circuit.params.conductorAreaMm2)
                    }
                    onChangeText={v =>
                      edit(row.circuit.id, 'conductorAreaMm2', v)
                    }
                  />
                  <Text style={s.fieldLabel}>
                    Factor de sobrecarga para simular
                  </Text>
                  <TextInput
                    style={s.field}
                    keyboardType="decimal-pad"
                    placeholder="Sin dato"
                    value={
                      row.circuit.params?.overloadFactor === undefined
                        ? ''
                        : String(row.circuit.params.overloadFactor)
                    }
                    onChangeText={v =>
                      edit(row.circuit.id, 'overloadFactor', v)
                    }
                  />
                  <Text style={s.fieldLabel}>Fase, si corresponde</Text>
                  <TextInput
                    style={s.field}
                    placeholder="Sin asignar"
                    value={row.circuit.params?.phase || ''}
                    onChangeText={v => edit(row.circuit.id, 'phase', v)}
                  />
                </View>
              )}
            </View>
          );
        })}
      {mode === 'cargas' && (
        <>
          <View style={s.summary}>
            <Text style={s.summaryValue}>
              {calculation.completePower
                ? `${Number(calculation.knownPowerW.toFixed(1))} W`
                : `≥ ${Number(calculation.knownPowerW.toFixed(1))} W`}
            </Text>
            <Text style={s.summaryLabel}>
              {calculation.completePower
                ? 'Potencia declarada'
                : 'Potencia conocida · cuadro incompleto'}
            </Text>
          </View>
          {calculation.circuits.map(c => (
            <View key={c.circuitId} style={s.loadRow}>
              <View
                style={[s.color, {backgroundColor: circuitColor(c.circuitId)}]}
              />
              <View style={{flex: 1}}>
                <Text style={s.circuitName}>{c.name}</Text>
                <Text style={s.detail}>
                  {c.loadCount} cargas · {c.phase || 'fase sin asignar'} ·{' '}
                  {number(c.routeLengthM, 'm de caño')}
                </Text>
                <Text style={s.detail}>
                  Conductor: {number(c.conductorLengthM, 'm')} · caída:{' '}
                  {number(c.voltageDropPct, '%')}
                </Text>
                <Text style={s.detail}>
                  Protección:{' '}
                  {c.protection === 'incomplete'
                    ? 'sin verificar'
                    : c.protection}
                </Text>
                {!!c.missing.length && (
                  <Text style={s.missing}>Falta {c.missing.join(', ')}</Text>
                )}
              </View>
              <Text style={s.loadValue}>{number(c.declaredPowerW, 'W')}</Text>
            </View>
          ))}
          {!!calculation.unassignedCount && (
            <Text style={s.missing}>
              {calculation.unassignedCount} cargas sin circuito.
            </Text>
          )}
          {Object.keys(calculation.phaseTotals).length > 0 && (
            <Text style={s.detail}>
              Por fase:{' '}
              {Object.entries(calculation.phaseTotals)
                .map(
                  ([phase, watts]) => `${phase} ${Number(watts.toFixed(1))} W`,
                )
                .join(' · ')}
            </Text>
          )}
          {calculation.phaseImbalancePct !== null && (
            <Text style={s.detail}>
              Diferencia relativa entre fases · CALCULADO:{' '}
              {Number(calculation.phaseImbalancePct.toFixed(1))} %. Sin umbral
              normativo aplicado.
            </Text>
          )}
          <Text style={s.note}>
            Corriente = potencia declarada / tensión declarada. Caída, margen de
            conductor y protección requieren policy/provider. No se aplica una
            normativa por defecto.
          </Text>
          <TouchableOpacity onPress={onOpenBoard} style={s.boardLink}>
            <Text style={s.boardLinkText}>Abrir tablero →</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  root: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 17,
    borderWidth: 1,
    borderColor: '#E2EAE1',
  },
  heading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  kicker: {
    color: '#4B9170',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {fontSize: 20, color: '#1B4934', fontWeight: '700', marginTop: 4},
  simulate: {padding: 9, backgroundColor: '#E4F2E6', borderRadius: 12},
  simulateText: {color: '#286E48', fontSize: 11, fontWeight: '700'},
  empty: {color: '#7B8D7E', lineHeight: 20, paddingVertical: 30},
  circuit: {borderTopWidth: 1, borderTopColor: '#E5ECE5', paddingVertical: 16},
  circuitHead: {flexDirection: 'row', alignItems: 'center', gap: 7},
  color: {width: 8, height: 22, borderRadius: 4},
  circuitName: {color: '#244C37', fontSize: 13, fontWeight: '800'},
  badge: {marginLeft: 'auto', color: '#9A7552', fontSize: 9, fontWeight: '800'},
  flow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 9,
    justifyContent: 'space-between',
  },
  flowNode: {width: 62, alignItems: 'center'},
  flowIcon: {
    borderWidth: 1,
    borderColor: '#A7C7AD',
    borderRadius: 10,
    width: 40,
    height: 40,
    textAlign: 'center',
    textAlignVertical: 'center',
    backgroundColor: '#F2F8F1',
    color: '#286345',
    fontSize: 16,
    fontWeight: '800',
  },
  flowLabel: {color: '#708678', fontSize: 9, textAlign: 'center', marginTop: 4},
  arrow: {fontSize: 16, fontWeight: '800'},
  detail: {color: '#728675', fontSize: 11, lineHeight: 17, marginTop: 4},
  missing: {color: '#A37749', fontSize: 11, lineHeight: 17, marginTop: 6},
  editLink: {color: '#2B7650', fontSize: 11, fontWeight: '700', marginTop: 10},
  editor: {
    marginTop: 12,
    backgroundColor: '#F7FAF5',
    padding: 12,
    borderRadius: 12,
  },
  fieldLabel: {color: '#62806A', fontSize: 10, fontWeight: '700', marginTop: 9},
  field: {
    height: 38,
    borderWidth: 1,
    borderColor: '#DDE9DB',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    color: '#1B4431',
    marginTop: 5,
  },
  summary: {
    backgroundColor: '#EAF4E9',
    borderRadius: 14,
    padding: 17,
    marginBottom: 10,
  },
  summaryValue: {fontSize: 25, color: '#22563C', fontWeight: '800'},
  summaryLabel: {color: '#5A8164', fontSize: 11, marginTop: 3},
  loadRow: {
    flexDirection: 'row',
    gap: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#EBF0EA',
    paddingVertical: 13,
  },
  loadValue: {color: '#27543B', fontWeight: '800', fontSize: 11},
  note: {color: '#8B9B8C', fontSize: 10, lineHeight: 17, marginTop: 20},
  boardLink: {
    backgroundColor: '#1E5B3F',
    padding: 13,
    borderRadius: 11,
    alignItems: 'center',
    marginTop: 16,
  },
  boardLinkText: {color: '#FFFFFF', fontWeight: '700'},
});
