// src/utopy/context.bus.ts
// Contexto compartido + eventos. Seguro para RN/Web.
// Emite y escucha cambios de contexto en clave UTOPÝ.

import { hear, dispatch } from "./symbol.bus";

export type SharedContext = {
  topic?: string;              // "energy" | "interior" | ...
  user?: string;
  locale?: string;             // "es-AR", "en-US"...
  mode?: string;               // "dev" | "prod" | "demo"...
  tags?: string[];
  extra?: Record<string, any>; // libre
};

let CURRENT: SharedContext = {};
const listeners = new Set<(c: SharedContext) => void>();

export function getContext(): SharedContext {
  // devuelvo copia para evitar mutaciones accidentales
  return { ...CURRENT, extra: { ...(CURRENT.extra || {}) } };
}

export function tellContext(patch: Partial<SharedContext>) {
  CURRENT = { ...CURRENT, ...patch, extra: { ...(CURRENT.extra || {}), ...(patch.extra || {}) } };
  for (const fn of listeners) {
    try { fn(getContext()); } catch {}
  }
}

export function onContextChange(cb: (c: SharedContext) => void) {
  listeners.add(cb);
  try { cb(getContext()); } catch {}
  return () => { listeners.delete(cb); };
}

/** Conecta el bus simbólico con el contexto */
export function installContextReactions(ctx: any) {
  // Recibir updates externos → setear contexto local
  hear("🧭", "tell", (i) => {
    const c = i?.with?.context || {};
    tellContext(c);
  });

  // Pedir contexto → responder
  hear("🧭", "ask", (_i, cx) => {
    cx.say({ sym: "🧭", say: "context.changed", with: { context: getContext() } });
  });

  // Propagar cambios a quien escuche el bus (correcto: dispatch(intent, ctx))
  onContextChange((c) => {
    try {
      dispatch({ sym: "🧭", say: "context.changed", with: { context: c } }, ctx);
    } catch {}
  });
}

// Aliases útiles
export const tell = tellContext;

// Diccionario simbólico base (extensible)
export const simbionDict: Record<string, string> = {
  "⚡": "energía",
  "🏠": "hogar",
  "🌀": "viento",
  "☀️": "sol",
  "🔋": "batería",
  "🌍": "contexto",
  "🧬": "vida",
};

export function mergeDictionaries(remoteDict: Record<string, string>) {
  Object.entries(remoteDict || {}).forEach(([k, v]) => {
    if (!simbionDict[k]) simbionDict[k] = v;
  });
}
