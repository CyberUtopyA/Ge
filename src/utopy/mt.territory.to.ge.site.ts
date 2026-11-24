// FILE: src/goodenergy/adapters/mt.territory.to.ge.site.ts

export type MtTerritoryDV = {
  id: string;
  kind: "mt.territory";
  attrs?: any;
  meta?: any;
  traits?: string[];
  labels?: string[];
};

export type GeSiteDV = {
  id: string;
  kind: "ge.site";
  labels?: string[];
  traits?: string[];
  attrs: any;
  meta?: any;
};

export function mtTerritoryToGeSite(t: MtTerritoryDV): GeSiteDV {
  const name =
    t?.attrs?.name ||
    t?.attrs?.nombre ||
    (Array.isArray(t?.labels) ? t.labels[0] : null) ||
    "Site";

  const geo =
    t?.attrs?.geo ||
    t?.attrs?.ubicacion?.geo ||
    undefined;

  const id = `ge.site:from:${String(t.id).replace(/[^a-zA-Z0-9:_-]+/g, "_")}`;

  return {
    id,
    kind: "ge.site",
    labels: [name],
    traits: ["ge:site", "energy:site", "mt:linked"],
    attrs: {
      name,
      geo,
      // link back
      sourceTerritoryId: t.id,
      // defaults energéticos (luego lo editás en UI si querés)
      pv_kw: t?.attrs?.energy?.pv_kw ?? 3.0,
      battery_kwh: t?.attrs?.energy?.battery_kwh ?? 5.0,
      load_kw: t?.attrs?.energy?.load_kw ?? 1.0,
    },
    meta: {
      ns: "energy:site",
      scopes: t?.meta?.scopes || ["public"],
      ts: Date.now(),
      source: "ge:adapter",
    },
  };
}
