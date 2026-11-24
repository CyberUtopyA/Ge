// FILE: src/goodenergy/actions/energy.simulate.for.territory.ts

import { mtTerritoryToGeSite } from "./mt.territory.to.ge.site";

// helpers
const now = () => Date.now();

function computeTelemetry(site: any) {
  // ✅ stub simple (después reemplazás con tu simulador real)
  const pv_kw = Number(site?.attrs?.pv_kw ?? 3);
  const load_kw = Number(site?.attrs?.load_kw ?? 1);
  const soc = Math.max(0, Math.min(100, Number(site?.attrs?.soc ?? 60)));

  const surplus_kw = Math.max(0, pv_kw - load_kw);

  return { pv_kw, load_kw, soc, surplus_kw };
}

function buildEnergyTelemetryDV(site: any, scopes: string[]) {
  const ts = now();
  const telem = computeTelemetry(site);

  return {
    id: `energy.telemetry:${site.id}:${ts}`,
    kind: "energy.telemetry",
    labels: [`Telemetría ${site?.labels?.[0] || "site"}`],
    traits: ["energy:telemetry", "mt:market.signal"],
    attrs: {
      siteId: site.id,
      sourceTerritoryId: site?.attrs?.sourceTerritoryId,
      ...telem,
      ts,
    },
    meta: {
      ns: "mt:market",          // ✅ para que MT lo vea directo
      scopes,
      ts,
      source: "ge:sim",
    },
  };
}

function buildEnergyOfferDV(site: any, scopes: string[]) {
  const ts = now();
  const telem = computeTelemetry(site);

  if (telem.surplus_kw <= 0.05) return null;

  const kwh = Math.max(0.1, Math.min(100, telem.surplus_kw * 1)); // 1h aprox

  return {
    id: `energy.offer:${site.id}:${ts}`,
    kind: "energy.offer",
    labels: ["Oferta de energía (auto)"],
    traits: ["mt:offer", "mt:market.offer", "mt:energy.offer", "ge:market.offer"],
    attrs: {
      kind: "sell",
      amount_kwh: kwh,
      price_per_kwh: 0.12,
      siteId: site.id,
      sourceTerritoryId: site?.attrs?.sourceTerritoryId,
      ts,
      // geo si hay
      location: site?.attrs?.geo ? { lat: site.attrs.geo.lat, lng: site.attrs.geo.lng } : undefined,
      visibility: { radius_km: 10 },
    },
    meta: {
      ns: "mt:market",          // ✅ MT Market lo consume
      scopes,
      ts,
      source: "ge:sim",
    },
  };
}

// handler principal
export async function handleEnergySimulateForTerritory(ctx: {
  actionRun: any;
  getDV: (id: string) => Promise<any>;
  publishDV: (dv: any) => Promise<void>;
  sayOutcome: (payload: any) => Promise<void>;
}) {
  const { actionRun, getDV, publishDV, sayOutcome } = ctx;

  const dvId = actionRun?.input?.dvId;
  const scopes = actionRun?.meta?.scopes || ["public"];

  // 1) agarrar territorio
  let territory = actionRun?.input?.dv;
  if (!territory && dvId) territory = await getDV(dvId);
  if (!territory) throw new Error("GE: falta DV territorio");

  // 2) convertir a site
  const site = mtTerritoryToGeSite(territory);

  // 3) publicar ge.site (opcional pero útil)
  await publishDV(site);

  // 4) publicar telemetry
  const telemetryDV = buildEnergyTelemetryDV(site, scopes);
  await publishDV(telemetryDV);

  // 5) publicar offer si hay excedente
  const offerDV = buildEnergyOfferDV(site, scopes);
  if (offerDV) await publishDV(offerDV);

  // 6) outcome (devuelve dvOutId del principal que quieras encadenar)
  await sayOutcome({
    kind: "sem.dv.outcome",
    payload: {
      ok: true,
      action: "energy.simulate.for.territory",
      effects: {
        dvOutId: telemetryDV.id, // ✅ el “resultado principal”
        also: offerDV ? [offerDV.id] : [],
      },
      ts: Date.now(),
    },
    meta: {
      ns: "ge",
      scopes,
      ts: Date.now(),
      from: "ge",
    },
  });
}
