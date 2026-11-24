import { spore } from "../utopy/spore";
import { installGoodEnergyModeler } from "../goodenergy/ge.bus";
import { installDynamicPalette } from "./palette.bus";

export async function bootModelerNode() {
  const manifest = {
    id: "utopy:modeler",
    ws: ["wss://seed.mterra.space/utopy"],
    utopy: { transports: { gossip: { wsSeeds: ["wss://seed.mterra.space/utopy"] } } },
  };

  await spore.init(manifest);

  spore.call("node.capability", {
    id: "utopy:modeler",
    capabilities: [
      "utopy.modeler",
      "energy.modeler",
      "context.symbiotic",
    ],
    meta: { ns: "energy:modeler", role: "modelador-simbiotico" },
    scope: "public",
  });
  spore.on("intent", (msg:any)=>{
  const i = msg?.payload||msg;
  if(i.say==="node.capability" && i.with?.capabilities?.includes("energy.asset.wind")){
    console.log("[UTOPY:modeler] detectó nodo eólico, extendiendo paleta 🌀");
    spore.sayIntent({
      sym:"⚡",
      say:"add-to-palette",
      ns:"energy:modeler",
      with:{ text:"Turbina", sym:"🌀", say:"asset.create", with:{ kind:"wind.turbine" } }
    });
  }
});


  // Instala sus resonadores simbióticos
  installGoodEnergyModeler(spore);
  installDynamicPalette(spore);
}
