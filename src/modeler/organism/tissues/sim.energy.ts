import { Tissue } from "../genome";

export const TissueSimEnergy: Tissue = {
  name:"tissue.sim.energy",
  capabilities:["sim:energy"],
  receptors:[{
    when: s => s.ns==="modeler" && s.type==="simulate" && s.payload?.domain==="energy",
    react: async ({ readScene, secrete }) => {
      const s = readScene(); if(!s) return;
      let pvW=0, loadsW=0;
      for(const n of s.nodes){
        if(n.kind==="pv") pvW += Number(n.params?.Wp ?? 300);
        if(n.kind==="load") loadsW += Number(n.params?.W ?? 100);
      }
      secrete({ kind:"sim", domain:"energy", data:{ pvW, loadsW, balanceW: pvW - loadsW } });
    }
  }]
};
