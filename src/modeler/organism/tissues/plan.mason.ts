import { Tissue } from "../genome";

export const TissuePlanMason: Tissue = {
  name:"tissue.plan.mason",
  capabilities:["plan:mason"],
  receptors:[{
    when: s => s.ns==="modeler" && s.type==="plan" && s.payload?.kind==="mason",
    react: async ({ readScene, secrete }) => {
      const s = readScene(); if(!s) return;
      const steps:any[]=[];
      for(const n of s.nodes){
        if(n.kind.startsWith("wall")){
          steps.push({ op:"prepare-foundation", args:{ wallId:n.id } });
          steps.push({ op:"lay-bricks", args:{ wallId:n.id, course:"up-to-h=2.4m" } });
        }
        if(n.kind.startsWith("roof")){
          steps.push({ op:"lift-truss", args:{ roofId:n.id } });
          steps.push({ op:"place-panels", args:{ roofId:n.id } });
        }
      }
      secrete({ kind:"plan", name:"obra.mason", steps });
    }
  }]
};
