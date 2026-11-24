import { Tissue } from "../genome";

export const TissueToolpathGcode: Tissue = {
  name:"tissue.toolpath.gcode",
  capabilities:["toolpath:gcode"],
  receptors:[{
    when: s => s.ns==="modeler" && s.type==="toolpath",
    react: async ({ readScene, secrete }) => {
      const s = readScene(); if(!s) return;
      let g="G21\nG90\nM3 S1000\n";
      for(const n of s.nodes){
        if(n.geom?.shape==="box"){
          const w=(Number(n.geom.params?.w??1)*100), d=(Number(n.geom.params?.d??1)*100);
          const x=(Number(n.pose?.x??0)*100), y=(Number(n.pose?.y??0)*100);
          g+=`G0 X${x-w/2} Y${y-d/2}\nG1 Z-1 F300\nG1 X${x+w/2} Y${y-d/2} F600\nG1 X${x+w/2} Y${y+d/2}\nG1 X${x-w/2} Y${y+d/2}\nG1 X${x-w/2} Y${y-d/2}\nG1 Z5\n`;
        }
      }
      g+="M5\nM2\n";
      secrete({ kind:"file", format:"gcode", name:"toolpath.gcode", data:g });
    }
  }]
};
