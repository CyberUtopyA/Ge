// ==============================
// File: src/modeler/organismbridge.ts
// Bridge: intents (⚡) → organismo (🧬) y consumo de organism.secrete (🧬)
// ==============================
import { spore as sporeSingleton, UtopySpore } from "../utopy/spore";

export type OrganismBridgeOpts = {
  ns?: string;                          // default "energy:modeler"
  toUI?: (blocks: any[]) => void;       // push de bloques al modal
  sceneIdGetter?: () => string | null;  // opcional: id actual de escena
};

type SporeLike = UtopySpore | any;

function blocksFromSecretion(sec: any): any[] {
  const kind = String(sec?.kind || "");
  const name = String(sec?.name || "archivo");
  const note = (txt: string) => ({ kind: "note", text: txt });

  const fileBlock = (fname: string, ref: any) => ({
    kind: "download.file",
    name: fname,
    with: { url: ref?.url, dataUrl: ref?.dataUrl, mime: ref?.mime || "application/octet-stream" },
  });

  if (["stl","step","ifc","gcode","plan","sim"].includes(kind)) {
    return [ note(`🧬 Organismo generó: ${kind.toUpperCase()} (${name})`), fileBlock(`${name}.${kind}`, sec?.file || sec) ];
  }
  if (kind === "file") return [ note(`🧬 Organismo: archivo listo (${name})`), fileBlock(name, sec?.file || sec) ];
  if (kind === "toast" || kind === "note") return [ note(String(sec?.text || "ok")) ];
  return [ note("🧬 Organismo secretó algo"), { kind: "json.view", data: sec } ];
}

export function installOrganismBridge(sp: SporeLike, opts?: OrganismBridgeOpts) {
  const ns = opts?.ns || "energy:modeler";
  // fallback robusto
  const bus: UtopySpore = (sp && typeof sp.on === "function") ? sp : sporeSingleton;

  const pushUI = (blocks: any[]) => {
    try { opts?.toUI?.(blocks); }
    catch {
      bus.sayIntent({ sym: "⚡", ns, say: "render", with: { blocks } });
    }
  };

  // Escuchar secreciones del organismo (🧬 -> UI)
  const off = bus.on("intent", (msg: any) => {
    const i = msg?.payload || msg;
    if (i?.sym === "🧬" && i?.say === "organism.secrete") {
      pushUI(blocksFromSecretion(i?.with || {}));
    }
  });

  // API opcional → pedir algo al organismo
  const request = (what: string, withData?: any) => {
    const sceneId = opts?.sceneIdGetter?.() || undefined;
    bus.sayIntent({ sym: "🧬", ns, say: "organism.request", with: { what, ...(withData||{}), sceneId } });
  };

  return { request, off };
}
