export type EnergyEmit = (sym: string, say: string, withPayload?: any) => void | Promise<void>;

export function emitEnergyPlanGenerate(emit: EnergyEmit, withData?: any) {
  return emit("⚡", "energy.plan.generate", withData || {});
}

export function emitEnergyOfferGenerate(emit: EnergyEmit, withData?: any) {
  return emit("⚡", "energy.offer.generate", withData || {});
}

export function emitEnergyFabricationPrepare(emit: EnergyEmit, withData?: any) {
  return emit("⚡", "energy.fabrication.prepare", withData || {});
}

export function emitEnergyMoPlanRequest(emit: EnergyEmit, withData?: any) {
  return emit("⚡", "energy.mo.plan.request", withData || {});
}

export function emitEnergyFabricationPublish(emit: EnergyEmit, withData?: any) {
  return emit("⚡", "energy.fabrication.publish", withData || {});
}