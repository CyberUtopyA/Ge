import { spore } from "../../utopy/spore";
import { publishGoodEnergyDV } from "../shared/dv.publish";
import { deriveAlarmCandidates, derivePlcMetrics, normalizePlcTags } from "./tagmap";
import { upsertPlcTelemetry, getAggregatedEnergyTelemetry } from "./telemetry.store";
import type {
  PlcAckAttrs,
  PlcAdapter,
  PlcAlarmAttrs,
  PlcCapabilityAttrs,
  PlcCommandAttrs,
  PlcSnapshot,
  PlcStoreEntry,
} from "./plc.types";

type AnyDV = {
  id?: string;
  kind: string;
  traits?: string[];
  attrs?: any;
  meta?: Record<string, any>;
};

type PlcRuntimeOpts = {
  ns?: string;
  scopes?: string[];
  siteId?: string;
  pollMs?: number;
  /** Authority/Mandate bridge supplied by the host for physical writes. */
  authorizeWrite?: (request: PlcCommandAttrs, context: { adapterId: string; ns: string }) => Promise<boolean> | boolean;
};

const RUNTIMES: Record<string, boolean> = {};

const now = () => Date.now();
const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}_${Date.now() % 1_000_000}`;

function runtimeKey(ns: string, plcId: string) {
  return `${ns}:${plcId}`;
}

function makeCapabilityDV(siteId: string, attrs: PlcCapabilityAttrs, ns: string, scopes: string[]): AnyDV {
  return {
    id: `dv:${siteId}:plc.capability:${attrs.plcId}`,
    kind: "plc.capability",
    traits: ["plc:capability", "node:capability"],
    attrs,
    meta: {
      ns: "energy:plc",
      scopes,
      ts: now(),
      by: "ge:plc.runtime",
      sourceNs: ns,
    },
  };
}

function makeTelemetryDV(siteId: string, attrs: any, ns: string, scopes: string[]): AnyDV {
  return {
    id: `dv:${siteId}:plc.telemetry:${attrs.plcId}:${attrs.ts}`,
    kind: "plc.telemetry",
    traits: ["plc:telemetry", "edge:live"],
    attrs,
    meta: {
      ns: "energy:plc",
      scopes,
      ts: attrs.ts || now(),
      ttl_ms: 5 * 60 * 1000,
      by: "ge:plc.runtime",
      sourceNs: ns,
    },
  };
}

function makeAlarmDV(siteId: string, attrs: PlcAlarmAttrs, ns: string, scopes: string[]): AnyDV {
  return {
    id: `dv:${siteId}:plc.alarm:${attrs.plcId}:${attrs.alarmCode || uid("alm")}:${now()}`,
    kind: "plc.alarm",
    traits: ["plc:alarm", "maintenance:event"],
    attrs,
    meta: {
      ns: "energy:plc",
      scopes,
      ts: now(),
      ttl_ms: 24 * 60 * 60 * 1000,
      by: "ge:plc.runtime",
      sourceNs: ns,
    },
  };
}

function makeAckDV(siteId: string, attrs: PlcAckAttrs, ns: string, scopes: string[]): AnyDV {
  return {
    id: `dv:${siteId}:plc.ack:${attrs.plcId}:${attrs.commandId || uid("ack")}:${now()}`,
    kind: "plc.ack",
    traits: ["plc:ack", "action:result"],
    attrs,
    meta: {
      ns: "energy:plc",
      scopes,
      ts: now(),
      ttl_ms: 24 * 60 * 60 * 1000,
      by: "ge:plc.runtime",
      sourceNs: ns,
    },
  };
}

function entryFromSnapshot(ns: string, snap: PlcSnapshot): PlcStoreEntry {
  const tags = normalizePlcTags(snap.tags || {});
  const normalized = derivePlcMetrics(tags);
  return {
    ns,
    plcId: snap.plcId,
    source: snap.source,
    ts: Number(snap.ts || now()),
    status: snap.status || "ok",
    tags,
    normalized,
  };
}

async function publish(ns: string, dv: AnyDV) {
  await publishGoodEnergyDV(dv, {
    semanticNs: String(dv?.meta?.ns || "energy:core"),
    echoToGe: true,
  });
}

async function publishTelemetrySideEffects(
  ns: string,
  entry: PlcStoreEntry,
  siteId: string,
  scopes: string[]
) {
  // Samples stay on the live signal bus. Significant alarms and capabilities are DVs.
  // plc.telemetry remains a legacy kind for consumers of previously published data.

  const agg = getAggregatedEnergyTelemetry(ns);
  await spore.sayIntent({
    sym: "⚡",
    say: "telemetry.update",
    ns,
    with: {
      ...agg,
      plcId: entry.plcId,
      source: entry.source,
      epistemic: entry.source === "mock" ? "simulado" : "observado",
      plcStatus: entry.status,
      ts: entry.ts,
    },
  });

  await spore.sayIntent({
    sym: "⚡",
    say: "plc.telemetry.result",
    ns,
    with: {
      plcId: entry.plcId,
      status: entry.status,
      normalized: entry.normalized,
      tags: entry.tags,
      ts: entry.ts,
    },
  });

  const alarms = deriveAlarmCandidates(entry);
  for (const a of alarms) {
    const alarmDV = makeAlarmDV(
      siteId,
      {
        plcId: entry.plcId,
        alarmCode: a.alarmCode,
        severity: a.severity,
        message: a.message,
        epistemic: entry.source === "mock" ? "simulado" : "observado",
        relatedTag: a.relatedTag,
        requiresAck: a.severity === "critical" || a.severity === "high",
      },
      ns,
      scopes
    );

    await publish(ns, alarmDV);

    await spore.sayIntent({
      sym: "⚡",
      say: "plc.alarm.result",
      ns,
      with: alarmDV.attrs,
    });
  }
}

async function handleCommand(
  ns: string,
  adapter: PlcAdapter,
  siteId: string,
  scopes: string[],
  withData: PlcCommandAttrs,
  authorizeWrite?: PlcRuntimeOpts["authorizeWrite"]
) {
  const capability =
    (await adapter.getCapability?.()) || {
      plcId: adapter.id,
      readTags: [],
      writableTags: [],
      actions: [],
      safetyMode: "read_only" as const,
    };

  const commandId = uid("cmd");

  const reject = async (message: string) => {
    const ackDV = makeAckDV(
      siteId,
      {
        plcId: adapter.id,
        commandId,
        result: "rejected",
        message,
      },
      ns,
      scopes
    );
    await publish(ns, ackDV);
    await spore.sayIntent({ sym: "⚡", say: "plc.ack.result", ns, with: ackDV.attrs });
  };

  if (withData.plcId !== adapter.id) return;
  if (!adapter.write) return reject("PLC sin soporte de escritura.");
  if (capability.safetyMode === "local_only") return reject("PLC en modo local_only.");
  if (capability.safetyMode === "read_only") return reject("PLC en modo read_only.");
  if (!capability.actions.includes(withData.command)) {
    return reject(`Comando no permitido: ${withData.command}`);
  }
  if (withData.approval?.required && !withData.approval?.approvedBy) {
    return reject("Falta aprobación explícita.");
  }
  // The demo adapter cannot actuate a physical device. Every real adapter must
  // delegate to a host Authority/Mandate verifier; a UI string is never proof.
  if (adapter.source !== "mock") {
    if (!authorizeWrite) return reject("Falta verificador de Authority/Mandate.");
    let allowed = false;
    try { allowed = await authorizeWrite(withData, { adapterId: adapter.id, ns }); } catch {}
    if (!allowed) return reject("Authority/Mandate no autorizó la acción.");
  }

  const acceptedDV = makeAckDV(
    siteId,
    {
      plcId: adapter.id,
      commandId,
      result: "accepted",
      message: `Comando aceptado: ${withData.command}`,
    },
    ns,
    scopes
  );
  await publish(ns, acceptedDV);
  await spore.sayIntent({ sym: "⚡", say: "plc.ack.result", ns, with: acceptedDV.attrs });

  const res = await adapter.write({
    plcId: adapter.id,
    command: withData.command,
    params: withData.params,
  });

  const finalDV = makeAckDV(
    siteId,
    {
      plcId: adapter.id,
      commandId,
      result: res.ok ? "executed" : "failed",
      message: res.message || (res.ok ? "Ejecución OK" : "Ejecución fallida"),
    },
    ns,
    scopes
  );
  await publish(ns, finalDV);
  await spore.sayIntent({ sym: "⚡", say: "plc.ack.result", ns, with: finalDV.attrs });
}

export async function bootstrapPlcRuntime(adapter: PlcAdapter, opts?: PlcRuntimeOpts) {
  const ns = opts?.ns || "energy:core";
  const scopes = opts?.scopes || ["public"];
  const pollMs = Math.max(1000, Number(opts?.pollMs || 3000));
  const siteId = opts?.siteId || "ge:site:default";

  const key = runtimeKey(ns, adapter.id);
  if (RUNTIMES[key]) return;
  RUNTIMES[key] = true;

  const capability =
    (await adapter.getCapability?.()) || {
      plcId: adapter.id,
      readTags: [],
      writableTags: [],
      actions: [],
      safetyMode: "read_only" as const,
    };

  const capDV = makeCapabilityDV(siteId, capability, ns, scopes);
  await publish(ns, capDV);

  spore.on("intent", async (msg: any) => {
    const i = msg?.payload || msg;
    if (!i || i.sym !== "⚡") return;

    const uiNs = i?.with?.uiNs;
    const isForMe = i.ns === ns || uiNs === ns;
    if (!isForMe) return;

    if (i.say === "plc.command.request") {
      await handleCommand(ns, adapter, siteId, scopes, i.with as PlcCommandAttrs, opts?.authorizeWrite);
    }

    if (i.say === "plc.capability.request") {
      await spore.sayIntent({
        sym: "⚡",
        say: "plc.capability.result",
        ns,
        with: capability,
      });
    }
  });

  const loop = async () => {
    try {
      const snap = await adapter.read();
      if (!snap) return;

      const entry = entryFromSnapshot(ns, snap);
      upsertPlcTelemetry(ns, entry);
      await publishTelemetrySideEffects(ns, entry, siteId, scopes);
    } catch (e: any) {
      const offline: PlcStoreEntry = {
        ns,
        plcId: adapter.id,
        source: adapter.source,
        ts: now(),
        status: "offline",
        tags: {},
        normalized: {},
      };
      upsertPlcTelemetry(ns, offline);
      await publishTelemetrySideEffects(ns, offline, siteId, scopes);

      await spore.sayIntent({
        sym: "⚡",
        say: "plc.runtime.error",
        ns,
        with: {
          plcId: adapter.id,
          message: e?.message || String(e),
        },
      });
    }
  };

  await loop();
  setInterval(loop, pollMs);
}
