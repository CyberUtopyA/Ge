import { LivingModeler } from "./organism";
import { TissueExportSTL } from "./tissues/export.stl";
import { TissueExportSTEP } from "./tissues/export.step";
import { TissueExportIFC } from "./tissues/export.ifc";
import { TissueToolpathGcode } from "./tissues/toolpath.gcode";
import { TissuePlanMason } from "./tissues/plan.mason";
import { TissueSimEnergy } from "./tissues/sim.energy";
import type { UScene } from "./genome";

export async function bootModelerOrganism(scene: UScene) {
  const org = new LivingModeler(scene);
  await org.graft(TissueExportSTL);
  await org.graft(TissueExportSTEP);
  await org.graft(TissueExportIFC);
  await org.graft(TissueToolpathGcode);
  await org.graft(TissuePlanMason);
  await org.graft(TissueSimEnergy);
  return org;
}
