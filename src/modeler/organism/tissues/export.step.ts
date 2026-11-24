import { Tissue } from "../genome";

export const TissueExportSTEP: Tissue = {
  name:"tissue.export.step",
  capabilities:["export:step"],
  receptors:[{
    when: s => s.ns==="modeler" && s.type==="export" && s.payload?.format==="step",
    react: async ({ readScene, secrete }) => {
      const s = readScene(); if(!s) return;
      const header=`ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('UTOPY STEP LIGHT'),'2;1');
FILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));
ENDSEC;
DATA;
`;
      let ent=""; let id=1;
      for(const n of s.nodes){ ent+=`#${id++}=UTOPY_NODE('${n.id}','${n.kind}');\n`; }
      const end=`ENDSEC;\nEND-ISO-10303-21;\n`;
      secrete({ kind:"file", format:"step", name:"scene.step", data: header+ent+end });
    }
  }]
};
