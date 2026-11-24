
import { buildEnergyContext } from "./energy.reader";
import type {
  EnergyPhase1Artifacts,
  GeoHint,
  Phase1Seller,
  Telemetry,
  Topologia,
} from "./energy.phase1.types";
import { buildEnergyIntent, buildEnergyPlan } from "./plan.builder";
import { buildEnergyOffers } from "./offer.builder";
import { dvEnergyIntent, dvEnergyOffer, dvEnergyPlan } from "./energy.phase1.dv";

export function runEnergyPhase1(input: {
  ns: string;
  siteId: string;
  topo: Topologia | null;
  telemetry?: Telemetry;
  geo?: GeoHint;
  seller?: Phase1Seller;
  publishOffers?: boolean;
}): EnergyPhase1Artifacts {
  const context = buildEnergyContext({
    ns: input.ns,
    siteId: input.siteId,
    topo: input.topo,
    telemetry: input.telemetry,
    geo: input.geo,
  });

  const intent = buildEnergyIntent(context);
  const plan = buildEnergyPlan(context);
  const offers = buildEnergyOffers(plan, context, input.seller);

  const intentDV = dvEnergyIntent(input.siteId, intent, {
    ns: "energy:core",
    scopes: ["public"],
    by: "ge:phase1",
  });

  const planDV = dvEnergyPlan(input.siteId, plan, {
    ns: "energy:core",
    scopes: ["public"],
    by: "ge:phase1",
  });

  const offerDVs = offers.map((offer, idx) =>
    dvEnergyOffer(input.siteId, offer, idx, {
      ns: "mt:market",
      scopes: ["public"],
      by: "ge:phase1",
    })
  );

  return {
    context,
    intent,
    plan,
    offers,
    intentDV,
    planDV,
    offerDVs,
  };
}