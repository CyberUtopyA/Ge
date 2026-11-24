import { spore, sporeMT } from "../../utopy/spore";

export async function publishGoodEnergyDV(
  dv: any,
  opts?: {
    semanticNs?: string;
    echoToGe?: boolean;
  }
) {
  const semanticNs = String(opts?.semanticNs || dv?.meta?.ns || "energy:core").trim() || "energy:core";
  const echoToGe = opts?.echoToGe !== false;
  const ts = Date.now();

  // Contexto MT
  if (semanticNs.startsWith("mt:")) {
    await sporeMT.sayIntent({
      sym: "🧬",
      say: "dv.upsert",
      ns: "mt",
      with: { dv, ns: semanticNs },
      ts,
    });

    if (echoToGe) {
      await spore.sayIntent({
        sym: "🧬",
        say: "dv.upsert",
        ns: "energy:core",
        with: { dv, ns: semanticNs },
        ts,
      });
    }
    return;
  }

  // Contexto GE / energy / plc / hardware
  await spore.sayIntent({
    sym: "🧬",
    say: "dv.upsert",
    ns: "energy:core",
    with: { dv, ns: semanticNs },
    ts,
  });
}