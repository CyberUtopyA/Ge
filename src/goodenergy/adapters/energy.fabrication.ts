import { buildFabricationPackFromEnergyPlan, buildMoSceneFromEnergyPlan, inferEnergyStructureKind } from "../adapters/ge.to.mo";
import type { AnyDV, EnergyContext, EnergyPlanAttrs } from "../core/energy.phase1.types";

export type EnergyFabricationArtifacts = {
  structureKind: string;
  sceneSeed: ReturnType<typeof buildMoSceneFromEnergyPlan>;
  fabricationPack: ReturnType<typeof buildFabricationPackFromEnergyPlan>;
  infrastructureSeedDV: AnyDV;
  fabricationPackDV: AnyDV;
  actionRunDV: AnyDV;
};

const now = () => Date.now();
const safe = (s: string) => String(s).replace(/[^a-zA-Z0-9:_\-.]/g, "_");

export function buildEnergyInfrastructureSeedDV(input: {
  siteId: string;
  ns: string;
  basedOnPlanId?: string;
  sceneSeed: ReturnType<typeof buildMoSceneFromEnergyPlan>;
}) : AnyDV {
  const ts = now();
  return {
    id: `dv:${safe(input.siteId)}:energy.infrastructure.seed:${ts}`,
    kind: "energy.infrastructure.seed",
    traits: ["energy:infrastructure", "mo:seed", "work:support"],
    attrs: {
      basedOnPlanId: input.basedOnPlanId,
      sceneSeed: input.sceneSeed,
      structureKind: input.sceneSeed.meta.structureKind,
      contextType: input.sceneSeed.meta.contextType,
    },
    meta: {
      ns: input.ns,
      scopes: ["public"],
      ts,
      ttl_ms: 14 * 24 * 60 * 60 * 1000,
      by: "ge:phase3",
    },
  };
}

export function buildMoFabricationPackDV(input: {
  siteId: string;
  basedOnPlanId?: string;
  pack: ReturnType<typeof buildFabricationPackFromEnergyPlan>;
}) : AnyDV {
  const ts = now();
  return {
    id: `dv:${safe(input.siteId)}:mo.fabrication.pack:${ts}`,
    kind: "mo.fabrication.pack",
    traits: ["mo:fabrication.pack", "energy:infrastructure", "work:support"],
    attrs: {
      ...input.pack,
      basedOnPlanId: input.basedOnPlanId,
    },
    meta: {
      ns: "mo:plan",
      scopes: ["public"],
      ts,
      ttl_ms: 14 * 24 * 60 * 60 * 1000,
      by: "ge:phase3",
    },
  };
}

export function buildEnergyToMoActionRunDV(input: {
  siteId: string;
  ns: string;
  basedOnPlanId?: string;
  context: EnergyContext;
  plan: EnergyPlanAttrs;
  sceneSeed: ReturnType<typeof buildMoSceneFromEnergyPlan>;
  fabricationPack: ReturnType<typeof buildFabricationPackFromEnergyPlan>;
}) : AnyDV {
  const ts = now();
  return {
    id: `dv:${safe(input.siteId)}:action.run:mo.plan.from.energy.plan:${ts}`,
    kind: "action.run",
    traits: ["action:run", "mo:requested", "energy:fabrication"],
    attrs: {
      action: "mo.plan.from.energy.plan",
      input: {
        basedOnPlanId: input.basedOnPlanId,
        contextType: input.context.siteType,
        structureKind: input.sceneSeed.meta.structureKind,
        sceneSeed: input.sceneSeed,
        fabricationPack: input.fabricationPack,
        planSummary: input.plan.summary,
        board: input.plan.board,
        materials: input.plan.materials,
        sensors: input.plan.sensors,
        recommendations: input.plan.recommendations || [],
      },
      output: {
        expectedDvKinds: ["mo.plan", "mo.fabrication.pack"],
        preferredNs: "mo:plan",
      },
    },
    meta: {
      ns: input.ns,
      scopes: ["public"],
      ts,
      ttl_ms: 7 * 24 * 60 * 60 * 1000,
      by: "ge:phase3",
    },
  };
}

export function buildEnergyFabricationArtifacts(input: {
  siteId: string;
  ns: string;
  context: EnergyContext;
  plan: EnergyPlanAttrs;
  basedOnPlanId?: string;
}) : EnergyFabricationArtifacts {
  const sceneSeed = buildMoSceneFromEnergyPlan(input.context, input.plan, input.basedOnPlanId);
  const fabricationPack = buildFabricationPackFromEnergyPlan(input.context, input.plan, input.basedOnPlanId);
  const structureKind = inferEnergyStructureKind(input.context, input.plan);

  const infrastructureSeedDV = buildEnergyInfrastructureSeedDV({
    siteId: input.siteId,
    ns: input.ns,
    basedOnPlanId: input.basedOnPlanId,
    sceneSeed,
  });

  const fabricationPackDV = buildMoFabricationPackDV({
    siteId: input.siteId,
    basedOnPlanId: input.basedOnPlanId,
    pack: fabricationPack,
  });

  const actionRunDV = buildEnergyToMoActionRunDV({
    siteId: input.siteId,
    ns: input.ns,
    basedOnPlanId: input.basedOnPlanId,
    context: input.context,
    plan: input.plan,
    sceneSeed,
    fabricationPack,
  });

  return {
    structureKind,
    sceneSeed,
    fabricationPack,
    infrastructureSeedDV,
    fabricationPackDV,
    actionRunDV,
  };
}