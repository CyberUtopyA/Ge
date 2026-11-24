import { Tissue } from "../genome";

export const TissueExportIFC: Tissue = {
  name:"tissue.export.ifc",
  capabilities:["export:ifc"],
  receptors:[{
    when: s => s.ns==="modeler" && s.type==="export" && s.payload?.format==="ifc",
    react: async ({ readScene, secrete }) => {
      const s = readScene(); if(!s) return;
      const rows:string[]=[]; let id=1;
      for(const n of s.nodes){
        const cls = n.kind.startsWith("wall") ? "IFCWALL"
                 : n.kind.startsWith("roof") ? "IFCROOF"
                 : n.kind==="floor"          ? "IFCSLAB"
                 : "IFCBUILDINGELEMENTPROXY";
        rows.push(`#${id++}=${cls}('${n.id}',${JSON.stringify(n.name??"")});`);
      }
      secrete({ kind:"file", format:"ifc", name:"scene.ifc", data: rows.join("\n")+"\n" });
    }
  }]
};
