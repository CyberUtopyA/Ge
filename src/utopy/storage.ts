// Storage universal UTOPÝ: Node (archivo JSON) / React Native (AsyncStorage) / Fallback memoria
// Sin tipos externos: no depende de @types/node ni de tipos de AsyncStorage.
// @ts-ignore
const fs = require("fs");
declare var process: any;
declare var require: any;
declare var navigator: any;

export interface KVStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, val: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  keys?(): Promise<string[]>;
  clear?(): Promise<void>;
}

type Runtime = "node" | "rn" | "unknown";

// ————————————————————————————————————————————
// Detección de entorno (sin @types/node)
// ————————————————————————————————————————————
function hasProcess() {
  return typeof globalThis !== "undefined" &&
         typeof (globalThis as any).process !== "undefined";
}
function nodeReleaseName() {
  try { return (globalThis as any).process?.release?.name; } catch { return undefined; }
}
function hasNavigatorRN() {
  try { return (globalThis as any).navigator?.product === "ReactNative"; } catch { return false; }
}
function getForced(): string {
  try { return String((globalThis as any).process?.env?.UTOPY_STORAGE || ""); } catch { return ""; }
}

function detectRuntime(): Runtime {
  const forced = getForced().toLowerCase();
  if (forced === "node") return "node";
  if (forced === "rn") return "rn";
  if (hasProcess() && nodeReleaseName() === "node") return "node";
  if (hasNavigatorRN()) return "rn";
  return "unknown";
}

const RUNTIME: Runtime = detectRuntime();

// ————————————————————————————————————————————
// Fallback en memoria (siempre disponible)
// ————————————————————————————————————————————
const MEM: Record<string, string> = {};
const memKV: KVStore = {
  async getItem(k) { return k in MEM ? MEM[k] : null; },
  async setItem(k, v) { MEM[k] = String(v); },
  async removeItem(k) { delete MEM[k]; },
  async keys() { return Object.keys(MEM); },
  async clear() { for (const k of Object.keys(MEM)) delete MEM[k]; },
};

// ————————————————————————————————————————————
// Node: archivo JSON con debounce (sin tipos de fs/path/os)
// ————————————————————————————————————————————
function createNodeKV(fileName = ".utopy.kv.json"): KVStore {
  let fs: any, path: any, os: any;
  try { fs = require("fs"); path = require("path"); os = require("os"); }
  catch { return memKV; } // si falla require en bundler, quedate en memoria

  // Elegir ruta: cwd si se puede escribir; si no, HOME
  let filePath = path.resolve(process.cwd(), fileName);
  try { fs.accessSync(path.dirname(filePath), fs.constants.W_OK); }
  catch { filePath = path.resolve(os.homedir?.() || ".", fileName); }

  let cache: Record<string, string> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function load(): Record<string, string> {
    if (cache) return cache;
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf8");
        cache = raw ? JSON.parse(raw) : {};
      } else cache = {};
    } catch { cache = {}; }
    return cache!;
  }

  function flushSoon() {
    if (timer) return;
    timer = setTimeout(() => {
      try { if (cache) fs.writeFileSync(filePath, JSON.stringify(cache, null, 2), "utf8"); }
      catch {}
      finally { if (timer) { clearTimeout(timer); timer = null; } }
    }, 120);
  }

  const kv: KVStore = {
    async getItem(key) {
      const db = load();
      return key in db ? db[key] : null;
    },
    async setItem(key, val) {
      const db = load();
      db[key] = String(val);
      flushSoon();
    },
    async removeItem(key) {
      const db = load();
      if (key in db) { delete db[key]; flushSoon(); }
    },
    async keys() {
      const db = load();
      return Object.keys(db);
    },
    async clear() {
      cache = {};
      flushSoon();
    },
  };
  return kv;
}

// ————————————————————————————————————————————
// React-Native: AsyncStorage (si no existe, memoria)
// ————————————————————————————————————————————
async function tryLoadRNKV(): Promise<KVStore | null> {
  let AsyncStorage: any;
  try { AsyncStorage = require("@react-native-async-storage/async-storage")?.default; }
  catch { return null; }
  if (!AsyncStorage) return null;

  const NS = "utopy:";
  const rnKV: KVStore = {
    async getItem(key) {
      try { return await AsyncStorage.getItem(NS + key); } catch { return null; }
    },
    async setItem(key, val) {
      try { await AsyncStorage.setItem(NS + key, String(val)); } catch {}
    },
    async removeItem(key) {
      try { await AsyncStorage.removeItem(NS + key); } catch {}
    },
    async keys() {
      try {
        const ks: string[] = await AsyncStorage.getAllKeys();
        return (ks || []).filter(k => k.startsWith(NS)).map(k => k.slice(NS.length));
      } catch { return []; }
    },
    async clear() {
      try {
        const ks = await rnKV.keys?.();
        if (!ks?.length) return;
        await AsyncStorage.multiRemove(ks.map(k => NS + k));
      } catch {}
    },
  };
  return rnKV;
}

// ————————————————————————————————————————————
// Selección de backend + helpers
// ————————————————————————————————————————————
let backend: KVStore = memKV; // default inmediato

if (RUNTIME === "node") {
  backend = createNodeKV(".utopy.kv.json");
} else if (RUNTIME === "rn") {
  // cargar de forma no-bloqueante; si falla, seguimos en memoria
  tryLoadRNKV().then(kv => { if (kv) backend = kv; }).catch(()=>{});
}

// Prefijo opcional (namespacing)
let __prefix = "";
export function setKVPrefix(prefix: string) { __prefix = prefix ? String(prefix) : ""; }
function pkey(key: string) { return __prefix ? `${__prefix}:${key}` : key; }

export const kv: KVStore = {
  async getItem(key) { return backend.getItem(pkey(key)); },
  async setItem(key, val) { return backend.setItem(pkey(key), val); },
  async removeItem(key) { return backend.removeItem(pkey(key)); },
  async keys() {
    const ks = (await (backend.keys?.() ?? Promise.resolve([]))) as string[];
    const pre = __prefix ? `${__prefix}:` : "";
    return pre ? ks.filter(k => k.startsWith(pre)).map(k => k.slice(pre.length)) : ks;
  },
  async clear() {
    if (backend.clear) return backend.clear();
    const ks = await kv.keys?.(); if (!ks?.length) return;
    await Promise.all(ks.map(k => kv.removeItem(k)));
  },
};

// JSON helpers
export async function kvGetJSON<T = any>(key: string, fallback: T): Promise<T> {
  const raw = await kv.getItem(key);
  if (raw == null) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}
export async function kvSetJSON(key: string, val: any): Promise<void> {
  try { await kv.setItem(key, JSON.stringify(val)); } catch {}
}

// Exponer runtime (debug)
export const KV_RUNTIME: Runtime = RUNTIME;
