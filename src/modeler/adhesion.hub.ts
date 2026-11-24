// src/modeler/adhesion.hub.ts
// ============================================================
// UTOPÝ — AdhesionHub: fusión simbiótica entre nodos (FINAL)
// ============================================================

import type {
  NodeCapability,
  AdhesionGrant,
  CapabilityAdvertise,
  AssetDef,
  EnergyAssetDescriptor,
} from "../utopy/types.simbiosis";
import { upsertAssets } from "./registry";

// Paleta opcional que agregan los capabilities
export type PaletteItem = {
  id: string;
  label?: string;
  sym: string;    // emoji/ícono semántico
  say: string;
  with?: any;
  icon?: string;  // opcional (algunos capabilities lo envían)
};

class AdhesionHub {
  private caps = new Map<string, NodeCapability>();
  private palette = new Map<string, PaletteItem>();
  private watchers = new Set<() => void>();

  onChange(fn: () => void) {
    this.watchers.add(fn);
    return () => this.watchers.delete(fn);
  }

  getPalette(): PaletteItem[] { return [...this.palette.values()]; }
  getCapabilities(): NodeCapability[] { return [...this.caps.values()]; }

  mergeGrant(grant: AdhesionGrant) {
    const src = grant.from || "anon";
    for (const cap of grant.capabilities || []) {
      const key = `${src}:${cap.id}`;
      this.caps.set(key, cap);

      const items: PaletteItem[] = Array.isArray(cap.palette) ? cap.palette as any : [];
      for (const p of items) {
        const pid = `${cap.id}:${p.id}`;
        this.palette.set(pid, { ...p, label: p.label || cap.id });
      }
    }
    this.emit();
  }

  private emit() {
    for (const fn of this.watchers) try { fn(); } catch {}
  }
}

function adaptAssets(assets: AssetDef[] = []): EnergyAssetDescriptor[] {
  return assets.map(a => ({
    id: a.id,
    kind: a.kind,
    label: a.label,
    icon: a.icon,
    verbs: a.verbs,
    render: a.render,
    meta: a.meta,
    display: {
      // 👇 obligatorio según tu types.simbiosis.ts
      name: a.label ?? a.kind,
      icon: a.icon,
      color: a.meta?.tint,
    },
  }));
}

function collectAssetsFromGrant(g: AdhesionGrant): AssetDef[] {
  const top = Array.isArray(g.assets) ? g.assets : [];
  const nested = Array.isArray(g.capabilities)
    ? g.capabilities.flatMap(c => (Array.isArray(c.assets) ? c.assets : []))
    : [];
  return [...top, ...nested];
}

/** Conecta el spore para absorber capabilities + assets */
export function installAdhesionHub(spore: any) {
  spore.on("adhesion.grant", (msg: any) => {
    const g = (msg?.payload?.with || msg?.with || {}) as AdhesionGrant;

    // fusionar capabilities/paleta en memoria
    try { adhesionHub.mergeGrant(g); } catch {}

    // adaptar assets -> descriptors y registrar
    const collected = collectAssetsFromGrant(g);         // AssetDef[]
    const mapped = adaptAssets(collected);               // EnergyAssetDescriptor[]
    if (mapped.length) {
      // Si tu registry tipa upsertAssets como AssetDef[], hacemos cast seguro:
      (upsertAssets as unknown as (a: EnergyAssetDescriptor[]) => void)(mapped);
    }
  });

  spore.on("capability.advertise", (msg: any) => {
    const ad = (msg?.payload?.with || msg?.with || {}) as CapabilityAdvertise;
    const mapped = adaptAssets(ad.assets || []);
    if (mapped.length) {
      (upsertAssets as unknown as (a: EnergyAssetDescriptor[]) => void)(mapped);
    }
  });

  // “Ping” para que otros nodos anuncien
  try { spore.sayIntent({ sym: "🔗", say: "adhesion.ask", ns: "public" }); } catch {}
}

export const adhesionHub = new AdhesionHub();
