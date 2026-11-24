import { Tissue } from "../genome";

function triBox(p:{w:number;h:number;d:number;x:number;y:number;z:number}) {
  const { w,h,d,x,y,z }=p;
  const v=[[x-w/2,y,z-d/2],[x+w/2,y,z-d/2],[x+w/2,y,z+d/2],[x-w/2,y,z+d/2],[x-w/2,y+h,z-d/2],[x+w/2,y+h,z-d/2],[x+w/2,y+h,z+d/2],[x-w/2,y+h,z+d/2]];
  const f=(a:number,b:number,c:number)=>`facet normal 0 0 1
  outer loop
    vertex ${v[a][0]} ${v[a][1]} ${v[a][2]}
    vertex ${v[b][0]} ${v[b][1]} ${v[b][2]}
    vertex ${v[c][0]} ${v[c][1]} ${v[c][2]}
  endloop
endfacet
`;
  const tris=[[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,4,5],[0,5,1],[1,5,6],[1,6,2],[2,6,7],[2,7,3],[3,7,4],[3,4,0]];
  return tris.map(([a,b,c])=>f(a,b,c)).join("");
}

export const TissueExportSTL: Tissue = {
  name:"tissue.export.stl",
  capabilities:["export:stl"],
  receptors:[{
    when: s => s.ns==="modeler" && s.type==="export" && s.payload?.format==="stl",
    react: async ({ readScene, secrete }) => {
      const s = readScene(); if(!s) return;
      let out="solid utopy\n";
      for(const n of s.nodes){
        if(n.geom?.shape==="box"){
          const w=Number(n.geom.params?.w??1), h=Number(n.geom.params?.h??1), d=Number(n.geom.params?.d??1);
          const x=Number(n.pose?.x??0), y=Number(n.pose?.z??0), z=Number(n.pose?.y??0);
          out+=triBox({w,h,d,x,y,z});
        } else if(n.geom?.shape==="plane"){
          const w=Number(n.geom.params?.w??1), d=Number(n.geom.params?.d??1);
          out+=triBox({w,h:0.02,d,x:Number(n.pose?.x??0),y:0,z:Number(n.pose?.y??0)});
        }
      }
      out+="endsolid utopy\n";
      secrete({ kind:"file", format:"stl", name:"scene.stl", data: out });
    }
  }]
};
