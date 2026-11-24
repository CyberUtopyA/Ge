import {PhysicalProject, physicalId} from './physical.model';

/** Text and future speech adapters supply the same phrase. No command actuates hardware. */
export type PhysicalIntent = {
  kind:
    | 'measure'
    | 'measure_set'
    | 'calculate'
    | 'place'
    | 'circuit'
    | 'board'
    | 'simulate'
    | 'view'
    | 'isolate'
    | 'context'
    | 'availability'
    | 'target'
    | 'diagnose'
    | 'compare'
    | 'unknown';
  experience?: string;
  component?: string;
  count?: number;
  scenario?: string;
  value?: number;
  unit?: string;
  view?: 'unifilar' | 'tablero';
  filter?: string;
  forSelected?: boolean;
  phrase: string;
};
export function parsePhysicalIntent(phrase: string): PhysicalIntent {
  const s = phrase.trim().toLocaleLowerCase();
  const count = /\b(tres|3)\b/.test(s) ? 3 : /\b(dos|2)\b/.test(s) ? 2 : 1;
  const targetTemp = s.match(/c[aá]mara.*(?:deber[ií]a|tiene que|objetivo|meta).*?(\d+(?:[,.]\d+)?)\s*(?:grados|°c|celsius)/);
  if (targetTemp) return {kind: 'target', experience: 'refrigeracion', value: Number(targetTemp[1].replace(',', '.')), unit: '°C', phrase};
  if (/circuito frigor[ií]fico|refrigeraci[oó]n|c[aá]mara frigor[ií]fica|hvac/.test(s))
    return {kind: 'context', experience: 'refrigeracion', phrase};
  if (/qu[eé] est[aá] pasando|diagnostic|por qu[eé].*(consume|calienta|enfr[ií]a)/.test(s))
    return {kind: 'diagnose', phrase};
  if (/compar[aá].*(medicion|medici[oó]n|medidas)|antes.*despu[eé]s/.test(s))
    return {kind: 'compare', phrase};
  if (/excedente|hacer.*disponible|ofrec.*energ/.test(s))
    return {kind: 'availability', experience: 'energia', phrase};
  if (/investig|estudi|experiment|hip[oó]tesis|generaci[oó]n mediante plantas/.test(s))
    return {kind: 'context', experience: 'investigacion', phrase};
  if (/riego|suelo|humedad|cultivo|invernadero/.test(s))
    return {kind: 'context', experience: 'agricultura', phrase};
  if (/ganad|bebedero|corral|cercos/.test(s))
    return {kind: 'context', experience: 'ganaderia', phrase};
  if (/solar|e[oó]lica|bater[ií]a|generar.*energ|energ[ií]a.*gener/.test(s))
    return {kind: 'context', experience: 'energia', phrase};
  if (/instalaci[oó]n.*casa/.test(s))
    return {kind: 'context', experience: 'electricidad', phrase};
  if (/m[aá]quina.*consum|cu[aá]nto consume.*bomba/.test(s))
    return {kind: 'context', experience: 'energia', phrase};
  if (/simul/.test(s))
    return {
      kind: 'simulate',
      scenario: /bloque/.test(s) ? 'motor_bloqueado' : 'normal',
      phrase,
    };
  if (/mostr[aá].*solo.*(iluminaci[oó]n|luces)/.test(s))
    return {kind: 'isolate', filter: 'luz', phrase};
  if (/abr[ií].*tablero|mostr[aá].*tablero/.test(s))
    return {kind: 'view', view: 'tablero', phrase};
  if (/unifilar/.test(s)) return {kind: 'view', view: 'unifilar', phrase};
  if (/cu[aá]nto.*(ca[nñ]o|conductor|cable)|calcul[aá].*recorrido/.test(s))
    return {kind: 'calculate', phrase};
  const measured = s.match(
    /(?:mide|hay|son)\s+(\d+(?:[,.]\d+)?)\s*(m|metros?|cm|cent[ií]metros?)/,
  );
  if (measured)
    return {
      kind: 'measure_set',
      value: Number(measured[1].replace(',', '.')),
      unit: measured[2].startsWith('c') ? 'cm' : 'm',
      phrase,
    };
  if (/cu[aá]nto cable|med[ií]|medir|distancia|[aá]rea/.test(s))
    return {kind: 'measure', phrase};
  if (/circuito/.test(s))
    return {
      kind: 'circuit',
      component: /aire/.test(s)
        ? 'aire'
        : /bomba/.test(s)
        ? 'bomba'
        : undefined,
      forSelected: /estas?|seleccionad/.test(s),
      phrase,
    };
  if (/tablero/.test(s))
    return {
      kind: 'board',
      component: /bomba/.test(s) ? 'bomba' : undefined,
      phrase,
    };
  const component = /toma|enchufe/.test(s)
    ? 'toma'
    : /luz|l[uú]mpara/.test(s)
    ? 'luz'
    : /sensor/.test(s)
    ? 'sensor'
    : /motor|bomba/.test(s)
    ? 'motor'
    : null;
  if (component) return {kind: 'place', component, count, phrase};
  return {kind: 'unknown', phrase};
}

export function proposeIntent(
  project: PhysicalProject,
  intent: PhysicalIntent,
  context?: {roomId?: string; selectedIds?: string[]},
): PhysicalProject {
  const room =
    project.rooms.find(r => r.id === context?.roomId) || project.rooms[0];
  if (!room || !['place', 'circuit', 'board'].includes(intent.kind))
    return project;
  const kind =
    intent.kind === 'circuit'
      ? 'circuito'
      : intent.kind === 'board'
      ? 'tablero'
      : intent.component || 'toma';
  const quantity =
    intent.kind === 'place' ? Math.min(intent.count || 1, 12) : 1;
  const added = Array.from({length: quantity}, (_, index) => ({
    id: physicalId(kind),
    kind,
    roomId: room.id,
    attach: 'wall' as const,
    x: Math.min(room.w - 0.25, 0.5 + index * 0.75),
    y: 0.5,
    name: `${
      kind === 'circuito' ? 'C' : kind === 'tablero' ? 'TD' : kind.toUpperCase()
    }${project.comps.filter(c => c.kind === kind).length + index + 1}`,
    params: {epistemic: 'propuesto'},
  }));
  if (intent.component && intent.kind !== 'place') {
    const loadKind = intent.component;
    added.push({
      id: physicalId(loadKind),
      kind: loadKind,
      roomId: room.id,
      attach: 'wall',
      x: Math.min(room.w - 0.25, 1.5),
      y: 1.5,
      name: `${loadKind.toUpperCase()}${
        project.comps.filter(c => c.kind === loadKind).length + 1
      }`,
      params: {
        epistemic: 'propuesto',
        ...(intent.kind === 'circuit' ? {circuitId: added[0].id} : {}),
      },
    });
  }
  const selectedIds = new Set(context?.selectedIds || []);
  const linked =
    intent.kind === 'circuit' && intent.forSelected && selectedIds.size
      ? project.comps.map(c =>
          selectedIds.has(c.id)
            ? {...c, params: {...c.params, circuitId: added[0].id}}
            : c,
        )
      : project.comps;
  return {...project, comps: [...linked, ...added]};
}
