// FILE: src/goodenergy/actions/ge.action.run.ts

import { handleEnergySimulateForTerritory } from "./energy.simulate.for.territory";

export async function handleActionRun(ctx: {
  msg: any;
  getDV: (id: string) => Promise<any>;
  publishDV: (dv: any) => Promise<void>;
  say: (verb: string, payload?: any) => Promise<any>;
}) {
  const { msg, getDV, publishDV, say } = ctx;

  const action = String(msg?.action || "");
  if (!action) return;

  const sayOutcome = async (payload: any) => {
    // outcome via WS
    try { await say("sem.dv.outcome", payload); } catch {}
  };

  if (action === "energy.simulate.for.territory") {
    await handleEnergySimulateForTerritory({
      actionRun: msg,
      getDV,
      publishDV,
      sayOutcome,
    });
    return;
  }

  // acciones desconocidas: ignorar
}
