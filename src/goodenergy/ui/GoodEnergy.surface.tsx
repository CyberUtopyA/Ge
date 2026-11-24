import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
} from "react-native";
import type { NodeSurfaceProps } from "../../utopy/ui/PortalHost";
import { spore } from "../../utopy/spore";
import TopGalaxyBar from "./topgalaxybar";
import Iso25DEditor from "./editor";
import PhysicalWorkspace from "./PhysicalWorkspace";
import { emptyPhysicalProject, normalizePhysicalProject, type PhysicalProject, type PhysicalAvailability } from "../physical.model";
import { availabilityDV, availabilityIssues, fieldRecordDV, investigationDV, physicalRelationDV } from "../physical.system";
import { geStorage } from "../core/mmkv";
import { measurementDV, verifyPhysicalAvailabilityAuthority } from "../physical.capabilities";
import { publishGoodEnergyDV } from "../shared/dv.publish";
import { micelioPublishDV } from "../../utopy/micelio.client";
import { comparisonDV } from "../physical.diagnose";
import { BuyEnergyScreen, SellEnergyScreen } from "./market";

import Svg, {
  G,
  Rect,
  Defs,
  LinearGradient,
  Stop,
  Polygon,
  Path,
  Pattern,
} from "react-native-svg";
import { IsoDefs } from "./iso/Defs";
import { IsoFloor } from "./iso/IsoFloor";
import { IsoWall } from "./iso/IsoWall";
import { IsoRoof } from "./iso/IsoRoof";
import { IsoDoor } from "./iso/Isodoor";
import { IsoWindow } from "./iso/isowindow";
import { IsoComp } from "./iso/isoComp";
import { iso as isoXY } from "./iso/iso.utils";

// ---------- Tipos base ----------
type Room = { id: string; x: number; y: number; w: number; d: number; h: number; roof: boolean };
type CompType =
  | "puerta"
  | "ventana"
  | "panel.solar"
  | "turbina.eolica"
  | "hidro"
  | "bateria"
  | "inversor"
  | "sensor"
  | "rele"
  | "personalizado"
  | (string & {});
type Comp = { id: string; kind: CompType; roomId: string; attach: "floor" | "wall" | "roof"; x: number; y: number };
type Topologia = { rooms: Room[]; comps: Comp[] };
type PreviewState = { topo: Topologia | null; theme: "day" | "night" };
type Route = "home" | "buy" | "sell";
type ActivePanel = "plan" | "plc" | "fabricar" | "seed";

type Telemetry = {
  pv_kw?: number;
  load_kw?: number;
  soc?: number;
  grid_in?: number;
  grid_out?: number;
  ts?: number;
  plcId?: string;
  plcStatus?: string;
};

type EnergyIntent = {
  sourceKinds?: string[];
  contextType?: string;
  objective?: string;
  estimatedOps?: {
    shiftsPerDay?: number;
    hoursPerDay?: number;
    workers?: number;
    machineGroups?: string[];
  };
  notes?: string;
};

type CircuitPlan = {
  id: string;
  name: string;
  loadType: string;
  estimatedKw: number;
  priority: "alta" | "media" | "baja";
  roomId?: string;
};

type MaterialLine = {
  name: string;
  qty: number;
  unit: string;
  category: string;
  priceHint?: number;
  currency?: string;
};

type EnergyPlan = {
  summary?: {
    connectedKw?: number;
    estimatedPeakKw?: number;
    estimatedDailyKwh?: number;
    growthMarginPct?: number;
  };
  circuits?: CircuitPlan[];
  board?: {
    mainBreakerAmp?: number;
    phases?: string;
    cabinetType?: string;
    surgeProtection?: boolean;
    grounding?: boolean;
  };
  sensors?: Array<{
    type: string;
    zone: string;
    qty: number;
  }>;
  materials?: MaterialLine[];
  recommendations?: string[];
};

type EnergyOffer = {
  sellerId?: string;
  sellerName?: string;
  basedOnPlanId?: string;
  offerType?: string;
  items?: Array<{
    name: string;
    qty?: number;
    unit?: string;
    priceHint?: number;
    currency?: string;
  }>;
  serviceArea?: string;
  leadTimeDays?: number;
  notes?: string;
};

type PlanResult = {
  intent?: EnergyIntent;
  plan?: EnergyPlan;
  offers?: EnergyOffer[];
};

type PlcCapability = {
  plcId: string;
  readTags: string[];
  writableTags: string[];
  actions: string[];
  safetyMode: "read_only" | "guarded_write" | "local_only";
};

type PlcTelemetryResult = {
  plcId: string;
  status: "ok" | "warn" | "alert" | "offline";
  normalized?: Record<string, any>;
  tags?: Record<string, any>;
  ts?: number;
};

type PlcAlarm = {
  plcId: string;
  alarmCode?: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  relatedTag?: string;
  requiresAck?: boolean;
};

type PlcAck = {
  plcId: string;
  commandId?: string;
  result: "accepted" | "rejected" | "executed" | "failed";
  message?: string;
};

type FabricationResult = {
  structureKind?: string;
  dimensions?: {
    width_m?: number;
    depth_m?: number;
    height_m?: number;
  };
  title?: string;
  cutlistCount?: number;
  hardwareCount?: number;
  electricalCount?: number;
};

type SeedSnapshot = {
  seedId?: string;
  tiles?: any[];
  states?: any[];
  assignments?: any[];
  outcomes?: any[];
};

type UtopySignal = {
  signalId?: string;
  tileId?: string;
  type?: string;
  payload?: Record<string, any>;
  confidence?: number;
  ts?: number;
};

const S = 22;

export const GoodEnergySurface: React.FC<NodeSurfaceProps> = ({ ns, onEmit }) => {
  const [showIso, setShowIso] = useState(false);
  const [route, setRoute] = useState<Route>("home");
  const [marketAvailability, setMarketAvailability] = useState<PhysicalAvailability | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>("plan");
  const { width, height } = Dimensions.get("window");

  const [preview, setPreview] = useState<PreviewState>({ topo: null, theme: "day" });
  const [savedTopo, setSavedTopo] = useState<Topologia | null>(null);
  const [showLegacy, setShowLegacy] = useState(false);
  const [physicalProject, setPhysicalProject] = useState<PhysicalProject>(() => {
    try {
      const physical = geStorage.getString(`ge:physical:${ns}`);
      if (physical) return normalizePhysicalProject(JSON.parse(physical));
      const existing = geStorage.getString(`ge:scene:${ns}`);
      if (existing) { const parsed = JSON.parse(existing); return normalizePhysicalProject(parsed?.topo || parsed); }
    } catch {}
    return emptyPhysicalProject();
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      try { geStorage.set(`ge:physical:${ns}`, JSON.stringify(physicalProject)); } catch {}
    }, 150);
    return () => clearTimeout(timer);
  }, [ns, physicalProject]);

  const [telemetry, setTelemetry] = useState<Telemetry>({});
  const [planResult, setPlanResult] = useState<PlanResult>({});
  const [plcCapabilities, setPlcCapabilities] = useState<Record<string, PlcCapability>>({});
  const [plcNodes, setPlcNodes] = useState<Record<string, PlcTelemetryResult>>({});
  const [plcAlarms, setPlcAlarms] = useState<PlcAlarm[]>([]);
  const [plcAcks, setPlcAcks] = useState<PlcAck[]>([]);
  const [fabrication, setFabrication] = useState<FabricationResult>({});
  const [seedSnapshot, setSeedSnapshot] = useState<SeedSnapshot>({});
  const [recentSignals, setRecentSignals] = useState<UtopySignal[]>([]);

  const emitGe = useCallback(
    (say: string, withPayload?: any) => {
      const payload =
        withPayload && typeof withPayload === "object"
          ? { ...withPayload, uiNs: ns }
          : { uiNs: ns };
      onEmit("⚡", say as any, payload);
    },
    [onEmit, ns]
  );

  useEffect(() => {
    const unsub = spore.on("intent", (msg: any) => {
      const i = msg?.payload || msg;
      if (!i || i?.sym !== "⚡") return;

      const uiNs = i?.with?.uiNs;
      const isForMe = i?.ns === ns || uiNs === ns;
      if (!isForMe) return;

      if (i?.say === "ui.editor.open") {
        setShowIso(true);
        return;
      }

      if (i?.say === "ui.preview.theme") {
        const next = i?.with?.theme === "night" ? "night" : "day";
        setPreview((p) => ({ ...p, theme: next }));
        return;
      }

      if (i?.say === "guardar.escena") {
        const topo = i?.with?.topologia ?? null;
        const theme: "day" | "night" =
          i?.with?.meta?.previewTheme === "night" ? "night" : "day";
        setPreview({ topo, theme });
        setSavedTopo(topo);
        return;
      }

      if (i?.say === "telemetry.update") {
        setTelemetry((prev) => ({
          ...prev,
          ...(i?.with || {}),
          ts: i?.with?.ts || Date.now(),
        }));
        return;
      }

      if (i?.say === "energy.plan.result") {
        setPlanResult({
          intent: i?.with?.intent || {},
          plan: i?.with?.plan || {},
          offers: i?.with?.offers || [],
        });
        setActivePanel("plan");
        return;
      }

      if (i?.say === "plc.capability.result") {
        const cap = i?.with as PlcCapability;
        if (cap?.plcId) {
          setPlcCapabilities((prev) => ({ ...prev, [cap.plcId]: cap }));
        }
        return;
      }

      if (i?.say === "plc.telemetry.result") {
        const row = i?.with as PlcTelemetryResult;
        if (row?.plcId) {
          setPlcNodes((prev) => ({ ...prev, [row.plcId]: row }));
          setActivePanel((p) => (p === "seed" ? p : "plc"));
        }
        return;
      }

      if (i?.say === "plc.alarm.result") {
        const alarm = i?.with as PlcAlarm;
        if (alarm?.plcId) {
          setPlcAlarms((prev) => [alarm, ...prev].slice(0, 20));
          setActivePanel("plc");
        }
        return;
      }

      if (i?.say === "plc.ack.result") {
        const ack = i?.with as PlcAck;
        if (ack?.plcId) {
          setPlcAcks((prev) => [ack, ...prev].slice(0, 20));
        }
        return;
      }

      if (i?.say === "energy.fabrication.result") {
        setFabrication(i?.with || {});
        setActivePanel("fabricar");
        return;
      }

      if (i?.say === "utopy.seed.state.result") {
        setSeedSnapshot(i?.with || {});
        setActivePanel("seed");
        return;
      }

      if (i?.say === "utopy.assignment.result") {
        const asg = i?.with;
        setSeedSnapshot((prev) => ({
          ...prev,
          assignments: [asg, ...(prev.assignments || [])].slice(0, 20),
        }));
        setActivePanel("seed");
        return;
      }

      if (i?.say === "utopy.outcome.result") {
        const out = i?.with;
        setSeedSnapshot((prev) => ({
          ...prev,
          outcomes: [out, ...(prev.outcomes || [])].slice(0, 20),
        }));
        return;
      }

      if (i?.say === "utopy.signal.result") {
        const sig = i?.with as UtopySignal;
        setRecentSignals((prev) => [sig, ...prev].slice(0, 20));
        return;
      }
    });

    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [ns]);

  useEffect(() => {
    emitGe("plc.capability.request", {});
    emitGe("utopy.seed.state.request", {});
  }, [emitGe]);

  const handleSavedLocal = (topo: Topologia, theme: "day" | "night") => {
    setSavedTopo(topo);
    setPreview({ topo, theme });
    setPhysicalProject(normalizePhysicalProject(topo));
  };

  const handleTopSelect = (r: Route) => setRoute(r);

  const summary = useMemo(() => {
    const topo = preview.topo;
    const rooms = topo?.rooms?.length || 0;
    const comps = topo?.comps?.length || 0;

    return {
      rooms,
      comps,
      pv: Number(telemetry?.pv_kw || 0),
      load: Number(telemetry?.load_kw || 0),
      soc: Number(telemetry?.soc || 0),
      gridIn: Number(telemetry?.grid_in || 0),
      gridOut: Number(telemetry?.grid_out || 0),
    };
  }, [preview.topo, telemetry]);

  const Header = useMemo(
    () => (
      <View style={styles.header}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.headerActions}>
          <ActionChip label="🧪 Simular" onPress={() => { emitGe("simular.red", { preset: "microgrid.default" }); setActivePanel("plan"); }} />
          <ActionChip label="⚡ Plan" onPress={() => { emitGe("energy.plan.generate", {}); setActivePanel("plan"); }} />
          <ActionChip label="💸 Oferta" onPress={() => { emitGe("energy.offer.generate", {}); setActivePanel("plan"); }} />
          <ActionChip label="🛠 Fabricar" onPress={() => { emitGe("energy.fabrication.prepare", {}); setActivePanel("fabricar"); }} />
          <ActionChip label="🧬 Seed" onPress={() => { emitGe("utopy.seed.state.request", {}); setActivePanel("seed"); }} />
          <ActionChip label="🛰 PLC" onPress={() => { emitGe("plc.capability.request", {}); setActivePanel("plc"); }} />
        </ScrollView>
      </View>
    ),
    [emitGe]
  );

  if (route === "home" && !showLegacy) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F7F8F3" }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
          <PhysicalWorkspace
            project={physicalProject}
            onChange={(next) => {
              const known = new Set((physicalProject.measurements || []).map(m => m.id));
              for (const measure of next.measurements || []) {
                if (known.has(measure.id)) continue;
                const dv = measurementDV(ns, measure);
                if (dv) publishGoodEnergyDV(dv).catch(console.warn);
              }
              const knownRecords = new Set((physicalProject.fieldRecords || []).map(r => r.id));
              for (const record of next.fieldRecords || []) {
                if (knownRecords.has(record.id)) continue;
                const dv = fieldRecordDV(ns, record);
                if (dv) publishGoodEnergyDV(dv).catch(console.warn);
              }
              const knownComparisons = new Set((physicalProject.comparisons || []).map(c => c.id));
              for (const comparison of next.comparisons || []) {
                if (knownComparisons.has(comparison.id)) continue;
                const dv = comparisonDV(next, ns, comparison);
                if (dv) publishGoodEnergyDV(dv).catch(console.warn);
              }
              setPhysicalProject(next);
              setSavedTopo(next as Topologia);
            }}
            onOpen25D={() => { setSavedTopo(physicalProject as Topologia); setShowIso(true); }}
            onLegacy={() => setShowLegacy(true)}
            onOpenMarket={(availability) => {
              if (availabilityIssues(physicalProject, availability).length || availability.unit.toLowerCase() !== 'kwh') return;
              setMarketAvailability(availability);
              setRoute('sell');
            }}
            onPublishInvestigation={async (id) => {
              const investigation = (physicalProject.investigations || []).find(i => i.id === id);
              const dv = investigation && investigationDV(physicalProject, ns, investigation);
              if (!dv) return false;
              try { await publishGoodEnergyDV(dv); return true; }
              catch (error) { console.warn(error); return false; }
            }}
            onPublishAvailability={async (id) => {
              const availability = (physicalProject.availabilities || []).find(a => a.id === id);
              const dv = availability && availabilityDV(physicalProject, ns, availability);
              if (!dv) return false;
              if (!await verifyPhysicalAvailabilityAuthority(physicalProject, availability!, 'discover')) return false;
              try { await micelioPublishDV(dv as any, {ns: 'energy:physical', scopes: ['public']}); return true; }
              catch (error) { console.warn(error); return false; }
            }}
            onPublishRelation={async (id) => {
              const relation = (physicalProject.routes || []).find(r => r.id === id);
              const dv = relation && physicalRelationDV(physicalProject, ns, relation);
              if (!dv) return false;
              try {await micelioPublishDV(dv as any, {ns: 'energy:physical', scopes: ['public']}); return true;}
              catch (error) {console.warn(error); return false;}
            }}
          />
        </ScrollView>
        {showIso && (
          <Iso25DEditor
            ns={ns}
            onEmit={onEmit}
            onClose={() => setShowIso(false)}
            width={width}
            height={height - 70}
            initialTopo={physicalProject as Topologia}
            onSaved={handleSavedLocal}
          />
        )}
      </View>
    );
  }

  if (route === "buy") {
    return (
      <View style={{ flex: 1 }}>
        {!showIso && <TopGalaxyBar active="buy" onSelect={handleTopSelect} />}
        {!showIso && <View style={{ height: 64 }} />}
        <BuyEnergyScreen
          ns={ns}
          onEmit={(sym: any, say: any, withPayload: any) =>
            onEmit(sym, say, { ...(withPayload || {}), uiNs: ns })
          }
          onClose={() => setRoute("home")}
          telemetry={telemetry as any}
        />
      </View>
    );
  }

  if (route === "sell") {
    return (
      <View style={{ flex: 1 }}>
        {!showIso && <TopGalaxyBar active="sell" onSelect={handleTopSelect} />}
        {!showIso && <View style={{ height: 64 }} />}
        <SellEnergyScreen
          ns={ns}
          onEmit={(sym: any, say: any, withPayload: any) =>
            onEmit(sym, say, { ...(withPayload || {}), uiNs: ns })
          }
          onClose={() => setRoute("home")}
          telemetry={telemetry as any}
          physicalAvailability={marketAvailability}
          physicalProject={physicalProject}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#090d14" }}>
      {!showIso && <TouchableOpacity onPress={() => setShowLegacy(false)} style={{ padding: 12, alignSelf: "flex-start" }}><Text style={{ color: "#B8E8CE" }}>← Volver a GE</Text></TouchableOpacity>}
      {!showIso && <TopGalaxyBar active="home" onSelect={handleTopSelect} />}
      {!showIso && <View style={{ height: 64 }} />}
      {Header}

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={styles.stack}>
          <View style={[styles.preview, { height: 320 }]}>
            <PreviewIso
              width={Dimensions.get("window").width - 32}
              height={300}
              data={preview.topo}
              theme={preview.theme}
            />
            <TouchableOpacity style={styles.fab} onPress={() => setShowIso(true)}>
              <Text style={{ fontSize: 20 }}>✏️</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Resumen GE</Text>
            <Text style={styles.subtitle}>Escena + energía viva + infraestructura simbiótica.</Text>

            <View style={{ height: 10 }} />

            <View style={styles.grid2}>
              <StatCard label="Cuartos" value={String(summary.rooms)} />
              <StatCard label="Componentes" value={String(summary.comps)} />
              <StatCard label="PV kW" value={fmt(summary.pv)} />
              <StatCard label="Load kW" value={fmt(summary.load)} />
              <StatCard label="SoC %" value={fmt(summary.soc)} />
              <StatCard label="Grid ↔" value={`${fmt(summary.gridIn)} / ${fmt(summary.gridOut)}`} />
            </View>

            <View style={{ height: 12 }} />
            <View style={styles.breakCard}>
              <Text style={styles.breakTitle}>Detalle escena</Text>
              <BreakLine label="🔆 Paneles" count={countKind(preview.topo, "panel.solar")} />
              <BreakLine label="🔋 Baterías" count={countKind(preview.topo, "bateria")} />
              <BreakLine label="🔀 Inversores" count={countKind(preview.topo, "inversor")} />
              <BreakLine label="🛰️ Sensores" count={countKind(preview.topo, "sensor")} />
              <BreakLine label="⚙️ Relés" count={countKind(preview.topo, "rele")} />
              <BreakLine label="🌐 Red" count={countKind(preview.topo, "grid" as any)} />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Centro GoodEnergy</Text>
            <Text style={styles.subtitle}>
              Fase 1 plan · Fase 2 PLC · Fase 3 fabricar · Fase 4 seed vivo
            </Text>

            <View style={{ height: 12 }} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.panelTabs}>
              <PanelTab label="Plan" active={activePanel === "plan"} onPress={() => setActivePanel("plan")} />
              <PanelTab label="PLC" active={activePanel === "plc"} onPress={() => setActivePanel("plc")} />
              <PanelTab label="Fabricar" active={activePanel === "fabricar"} onPress={() => setActivePanel("fabricar")} />
              <PanelTab label="Seed vivo" active={activePanel === "seed"} onPress={() => setActivePanel("seed")} />
            </ScrollView>

            <View style={{ height: 12 }} />

            {activePanel === "plan" && (
              <PlanPanel
                result={planResult}
                onGeneratePlan={() => emitGe("energy.plan.generate", {})}
                onGenerateOffer={() => emitGe("energy.offer.generate", {})}
              />
            )}

            {activePanel === "plc" && (
              <PlcPanel
                telemetry={telemetry}
                nodes={Object.values(plcNodes)}
                capabilities={Object.values(plcCapabilities)}
                alarms={plcAlarms}
                acks={plcAcks}
                onRequestCapabilities={() => emitGe("plc.capability.request", {})}
                onExtractorOn={() =>
                  emitGe("plc.command.request", {
                    plcId: Object.keys(plcNodes)[0] || "plc:mock:main",
                    command: "extractor_on",
                    approval: { required: true, approvedBy: "ui:operator" },
                  })
                }
                onExtractorOff={() =>
                  emitGe("plc.command.request", {
                    plcId: Object.keys(plcNodes)[0] || "plc:mock:main",
                    command: "extractor_off",
                    approval: { required: true, approvedBy: "ui:operator" },
                  })
                }
                onLineToggle={() =>
                  emitGe("plc.command.request", {
                    plcId: Object.keys(plcNodes)[0] || "plc:mock:main",
                    command: "disable_line",
                    approval: { required: true, approvedBy: "ui:operator" },
                  })
                }
              />
            )}

            {activePanel === "fabricar" && (
              <FabricationPanel
                fabrication={fabrication}
                onPrepare={() => emitGe("energy.fabrication.prepare", {})}
                onRequestMo={() => emitGe("energy.mo.plan.request", {})}
              />
            )}

            {activePanel === "seed" && (
              <SeedPanel
                seed={seedSnapshot}
                signals={recentSignals}
                onRefresh={() => emitGe("utopy.seed.state.request", {})}
                onAssignTelemetryTask={() =>
                  emitGe("utopy.task.assign", {
                    taskId: `task_energy_${Date.now()}`,
                    seedId: "ge:seed:default",
                    kind: "bridge.telemetry",
                    requiredCapabilities: ["bridge.plc", "compute.logic"],
                    preferredKinds: ["plc", "gateway"],
                    zone: "linea-1",
                    priority: "high",
                    payload: { source: "plc:mock:main" },
                    createdAt: Date.now(),
                  })
                }
                onAssignInferenceTask={() =>
                  emitGe("utopy.task.assign", {
                    taskId: `task_infer_${Date.now()}`,
                    seedId: "ge:seed:default",
                    kind: "run.inference",
                    requiredCapabilities: ["compute.infer"],
                    preferredKinds: ["inference"],
                    zone: "edge",
                    priority: "medium",
                    payload: { reason: "energy-optimization" },
                    createdAt: Date.now(),
                  })
                }
              />
            )}
          </View>
        </View>
      </ScrollView>

      {showIso && (
        <Iso25DEditor
          ns={ns}
          onEmit={onEmit}
          onClose={() => setShowIso(false)}
          width={width}
          height={height - 160}
          // @ts-ignore
          onSaved={handleSavedLocal}
          // @ts-ignore
          initialTopo={savedTopo}
        />
      )}
    </View>
  );
};

// ---------- Subcomponentes ----------
function ActionChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.actionBtn}>
      <Text style={styles.actionTxt}>{label}</Text>
    </TouchableOpacity>
  );
}

function PanelTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.tabBtn, active && styles.tabBtnActive]}>
      <Text style={[styles.tabTxt, active && styles.tabTxtActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.glassItem}>
      <Text style={styles.glassLabel}>{label}</Text>
      <Text style={styles.glassValue}>{value}</Text>
    </View>
  );
}

function PlanPanel({
  result,
  onGeneratePlan,
  onGenerateOffer,
}: {
  result: PlanResult;
  onGeneratePlan: () => void;
  onGenerateOffer: () => void;
}) {
  const plan = result.plan || {};
  const intent = result.intent || {};
  const offers = result.offers || [];

  return (
    <View>
      <View style={styles.inlineActions}>
        <MiniBtn label="⚡ Generar plan" onPress={onGeneratePlan} />
        <MiniBtn label="💸 Generar oferta" onPress={onGenerateOffer} />
      </View>

      <View style={{ height: 10 }} />

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Intent</Text>
        <InfoLine label="Contexto" value={intent.contextType || "-"} />
        <InfoLine label="Objetivo" value={intent.objective || "-"} />
        <InfoLine label="Horas/día" value={String(intent.estimatedOps?.hoursPerDay ?? "-")} />
        <InfoLine label="Trabajadores" value={String(intent.estimatedOps?.workers ?? "-")} />
        <InfoLine label="Sources" value={(intent.sourceKinds || []).join(", ") || "-"} />
        {!!intent.notes && <Text style={styles.smallMuted}>{intent.notes}</Text>}
      </View>

      <View style={{ height: 10 }} />

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Plan</Text>
        <View style={styles.grid2}>
          <StatCard label="Connected kW" value={fmt(plan.summary?.connectedKw)} />
          <StatCard label="Peak kW" value={fmt(plan.summary?.estimatedPeakKw)} />
          <StatCard label="Daily kWh" value={fmt(plan.summary?.estimatedDailyKwh)} />
          <StatCard label="Growth %" value={fmt(plan.summary?.growthMarginPct)} />
        </View>

        <View style={{ height: 10 }} />
        <InfoLine label="Breaker" value={`${plan.board?.mainBreakerAmp ?? "-"} A`} />
        <InfoLine label="Fases" value={plan.board?.phases || "-"} />
        <InfoLine label="Gabinete" value={plan.board?.cabinetType || "-"} />
        <InfoLine label="SPD" value={plan.board?.surgeProtection ? "sí" : "no"} />
        <InfoLine label="Tierra" value={plan.board?.grounding ? "sí" : "no"} />

        <View style={{ height: 10 }} />
        <Text style={styles.subSectionTitle}>Circuitos</Text>
        {(plan.circuits || []).length ? (
          (plan.circuits || []).map((c) => (
            <View key={c.id} style={styles.listRow}>
              <Text style={styles.listMain}>{c.name}</Text>
              <Text style={styles.listMeta}>{fmt(c.estimatedKw)} kW · {c.priority}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>Aún no hay plan generado.</Text>
        )}

        <View style={{ height: 10 }} />
        <Text style={styles.subSectionTitle}>Materiales</Text>
        {(plan.materials || []).length ? (
          (plan.materials || []).slice(0, 8).map((m, idx) => (
            <View key={`${m.name}-${idx}`} style={styles.listRow}>
              <Text style={styles.listMain}>{m.name}</Text>
              <Text style={styles.listMeta}>
                {m.qty} {m.unit} · {m.priceHint ? `${m.priceHint.toLocaleString("es-PY")} ${m.currency || ""}` : m.category}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>Sin materiales todavía.</Text>
        )}

        {!!plan.recommendations?.length && (
          <>
            <View style={{ height: 10 }} />
            <Text style={styles.subSectionTitle}>Recomendaciones</Text>
            {plan.recommendations.slice(0, 6).map((r, idx) => (
              <Text key={idx} style={styles.bulletLine}>• {r}</Text>
            ))}
          </>
        )}
      </View>

      <View style={{ height: 10 }} />
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Ofertas derivadas</Text>
        {offers.length ? (
          offers.map((o, idx) => (
            <View key={`${o.offerType}-${idx}`} style={styles.listRowTall}>
              <Text style={styles.listMain}>{o.offerType || "offer"}</Text>
              <Text style={styles.smallMuted}>{o.sellerName || o.sellerId || "-"}</Text>
              <Text style={styles.listMeta}>
                {(o.items || []).length} ítems · lead {o.leadTimeDays ?? "-"} días
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>Todavía no hay ofertas generadas.</Text>
        )}
      </View>
    </View>
  );
}

function PlcPanel({
  telemetry,
  nodes,
  capabilities,
  alarms,
  acks,
  onRequestCapabilities,
  onExtractorOn,
  onExtractorOff,
  onLineToggle,
}: {
  telemetry: Telemetry;
  nodes: PlcTelemetryResult[];
  capabilities: PlcCapability[];
  alarms: PlcAlarm[];
  acks: PlcAck[];
  onRequestCapabilities: () => void;
  onExtractorOn: () => void;
  onExtractorOff: () => void;
  onLineToggle: () => void;
}) {
  return (
    <View>
      <View style={styles.inlineActions}>
        <MiniBtn label="🛰 Capabilities" onPress={onRequestCapabilities} />
        <MiniBtn label="💨 Extractor ON" onPress={onExtractorOn} />
        <MiniBtn label="🛑 Extractor OFF" onPress={onExtractorOff} />
        <MiniBtn label="⛔ Línea" onPress={onLineToggle} />
      </View>

      <View style={{ height: 10 }} />
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Telemetría viva</Text>
        <View style={styles.grid2}>
          <StatCard label="PV kW" value={fmt(telemetry.pv_kw)} />
          <StatCard label="Load kW" value={fmt(telemetry.load_kw)} />
          <StatCard label="SoC %" value={fmt(telemetry.soc)} />
          <StatCard label="Grid in/out" value={`${fmt(telemetry.grid_in)} / ${fmt(telemetry.grid_out)}`} />
        </View>
        <Text style={styles.smallMuted}>ts: {fmtTs(telemetry.ts)}</Text>
      </View>

      <View style={{ height: 10 }} />
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>PLCs / Edge nodes</Text>
        {nodes.length ? nodes.map((n) => (
          <View key={n.plcId} style={styles.listRowTall}>
            <Text style={styles.listMain}>{n.plcId}</Text>
            <Text style={[styles.statusPill, pillStyle(n.status)]}>{n.status}</Text>
            <Text style={styles.smallMuted}>
              {Object.entries(n.normalized || {})
                .filter(([, v]) => v !== undefined && v !== null)
                .slice(0, 4)
                .map(([k, v]) => `${k}:${String(v)}`)
                .join(" · ") || "sin normalized"}
            </Text>
          </View>
        )) : <Text style={styles.emptyText}>Sin PLC live todavía.</Text>}
      </View>

      <View style={{ height: 10 }} />
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Capabilities</Text>
        {capabilities.length ? capabilities.map((c) => (
          <View key={c.plcId} style={styles.listRowTall}>
            <Text style={styles.listMain}>{c.plcId}</Text>
            <Text style={styles.listMeta}>{c.safetyMode}</Text>
            <Text style={styles.smallMuted}>
              actions: {c.actions.join(", ") || "-"}
            </Text>
          </View>
        )) : <Text style={styles.emptyText}>Sin capabilities cargadas.</Text>}
      </View>

      <View style={{ height: 10 }} />
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Alarmas</Text>
        {alarms.length ? alarms.slice(0, 10).map((a, idx) => (
          <View key={`${a.plcId}-${a.alarmCode}-${idx}`} style={styles.listRowTall}>
            <Text style={styles.listMain}>{a.message}</Text>
            <Text style={[styles.statusPill, pillStyle(a.severity)]}>{a.severity}</Text>
            <Text style={styles.smallMuted}>{a.plcId} {a.relatedTag ? `· ${a.relatedTag}` : ""}</Text>
          </View>
        )) : <Text style={styles.emptyText}>Sin alarmas.</Text>}
      </View>

      <View style={{ height: 10 }} />
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Acks</Text>
        {acks.length ? acks.slice(0, 10).map((a, idx) => (
          <View key={`${a.commandId || idx}`} style={styles.listRow}>
            <Text style={styles.listMain}>{a.result}</Text>
            <Text style={styles.listMeta}>{a.message || a.plcId}</Text>
          </View>
        )) : <Text style={styles.emptyText}>Sin acks todavía.</Text>}
      </View>
    </View>
  );
}

function FabricationPanel({
  fabrication,
  onPrepare,
  onRequestMo,
}: {
  fabrication: FabricationResult;
  onPrepare: () => void;
  onRequestMo: () => void;
}) {
  return (
    <View>
      <View style={styles.inlineActions}>
        <MiniBtn label="🛠 Preparar" onPress={onPrepare} />
        <MiniBtn label="🧱 Fabricar en MO" onPress={onRequestMo} />
      </View>

      <View style={{ height: 10 }} />
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Infraestructura materializable</Text>
        <InfoLine label="Título" value={fabrication.title || "-"} />
        <InfoLine label="Structure kind" value={fabrication.structureKind || "-"} />
        <InfoLine
          label="Dimensiones"
          value={
            fabrication.dimensions
              ? `${fmt(fabrication.dimensions.width_m)} × ${fmt(fabrication.dimensions.depth_m)} × ${fmt(fabrication.dimensions.height_m)} m`
              : "-"
          }
        />
        <InfoLine label="Cutlist" value={String(fabrication.cutlistCount ?? "-")} />
        <InfoLine label="Hardware" value={String(fabrication.hardwareCount ?? "-")} />
        <InfoLine label="Material eléctrico" value={String(fabrication.electricalCount ?? "-")} />
      </View>

      <View style={{ height: 10 }} />
      <View style={styles.breakCard}>
        <Text style={styles.breakTitle}>Qué hace esta fase</Text>
        <Text style={styles.bulletLine}>• GE convierte `energy.plan` en gabinete / estación / rack / módulo e-waste.</Text>
        <Text style={styles.bulletLine}>• Publica `energy.infrastructure.seed` y `mo.fabrication.pack`.</Text>
        <Text style={styles.bulletLine}>• Dispara `action.run` para que MO materialice el plan.</Text>
      </View>
    </View>
  );
}

function SeedPanel({
  seed,
  signals,
  onRefresh,
  onAssignTelemetryTask,
  onAssignInferenceTask,
}: {
  seed: SeedSnapshot;
  signals: UtopySignal[];
  onRefresh: () => void;
  onAssignTelemetryTask: () => void;
  onAssignInferenceTask: () => void;
}) {
  const tiles = seed.tiles || [];
  const states = seed.states || [];
  const assignments = seed.assignments || [];
  const outcomes = seed.outcomes || [];

  return (
    <View>
      <View style={styles.inlineActions}>
        <MiniBtn label="🧬 Refresh seed" onPress={onRefresh} />
        <MiniBtn label="🔌 Task telemetry" onPress={onAssignTelemetryTask} />
        <MiniBtn label="🧠 Task infer" onPress={onAssignInferenceTask} />
      </View>

      <View style={{ height: 10 }} />
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Seed vivo</Text>
        <InfoLine label="Seed ID" value={seed.seedId || "ge:seed:default"} />
        <View style={styles.grid2}>
          <StatCard label="Tiles" value={String(tiles.length)} />
          <StatCard label="States" value={String(states.length)} />
          <StatCard label="Assignments" value={String(assignments.length)} />
          <StatCard label="Outcomes" value={String(outcomes.length)} />
        </View>
      </View>

      <View style={{ height: 10 }} />
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Tiles</Text>
        {tiles.length ? tiles.slice(0, 10).map((t: any) => {
          const st = states.find((s: any) => s.tileId === t.tileId);
          return (
            <View key={t.tileId} style={styles.listRowTall}>
              <Text style={styles.listMain}>{t.tileId}</Text>
              <Text style={styles.listMeta}>{t.kind} · {(t.capabilities || []).join(", ")}</Text>
              <Text style={styles.smallMuted}>
                health={st?.health || "-"} · load={fmt(st?.loadPct)}% · trust={fmt(st?.trust)}
              </Text>
            </View>
          );
        }) : <Text style={styles.emptyText}>Sin seed snapshot todavía.</Text>}
      </View>

      <View style={{ height: 10 }} />
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Assignments</Text>
        {assignments.length ? assignments.slice(0, 10).map((a: any, idx: number) => (
          <View key={a.assignmentId || idx} style={styles.listRowTall}>
            <Text style={styles.listMain}>{a.assignedTileId || "-"}</Text>
            <Text style={styles.listMeta}>task={a.taskId || "-"} · score={fmt(a.score)}</Text>
            <Text style={styles.smallMuted}>{(a.rationale || []).join(" · ")}</Text>
          </View>
        )) : <Text style={styles.emptyText}>Sin assignments.</Text>}
      </View>

      <View style={{ height: 10 }} />
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Outcomes</Text>
        {outcomes.length ? outcomes.slice(0, 10).map((o: any, idx: number) => (
          <View key={o.outcomeId || idx} style={styles.listRowTall}>
            <Text style={styles.listMain}>{o.status || "-"}</Text>
            <Text style={styles.listMeta}>{o.tileId || "-"} · task={o.taskId || "-"}</Text>
            <Text style={styles.smallMuted}>{JSON.stringify(o.result || {})}</Text>
          </View>
        )) : <Text style={styles.emptyText}>Sin outcomes.</Text>}
      </View>

      <View style={{ height: 10 }} />
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Signals</Text>
        {signals.length ? signals.slice(0, 10).map((s, idx) => (
          <View key={s.signalId || idx} style={styles.listRowTall}>
            <Text style={styles.listMain}>{s.type || "-"}</Text>
            <Text style={styles.listMeta}>{s.tileId || "-"} · conf={fmt(s.confidence)}</Text>
            <Text style={styles.smallMuted}>{JSON.stringify(s.payload || {})}</Text>
          </View>
        )) : <Text style={styles.emptyText}>Sin señales.</Text>}
      </View>
    </View>
  );
}

function MiniBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.miniBtn}>
      <Text style={styles.miniBtnTxt}>{label}</Text>
    </TouchableOpacity>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoLine}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function countKind(topo: Topologia | null, k: CompType) {
  if (!topo) return 0;
  return topo.comps.filter((c) => c.kind === k).length;
}

function BreakLine({ label, count }: { label: string; count: number }) {
  return (
    <View style={styles.breakLine}>
      <Text style={styles.breakLabel}>{label}</Text>
      <Text style={styles.breakCount}>{count}</Text>
    </View>
  );
}

function fmt(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2);
}

function fmtTs(ts?: number) {
  if (!ts) return "-";
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return String(ts);
  }
}

function pillStyle(status?: string) {
  switch (status) {
    case "ok":
    case "low":
      return { backgroundColor: "rgba(49,183,110,0.15)", color: "#7ff0aa" };
    case "warn":
    case "medium":
      return { backgroundColor: "rgba(255,196,87,0.15)", color: "#ffd87f" };
    case "alert":
    case "high":
    case "critical":
      return { backgroundColor: "rgba(255,90,90,0.15)", color: "#ff9b9b" };
    case "offline":
      return { backgroundColor: "rgba(150,150,150,0.15)", color: "#c8c8c8" };
    default:
      return { backgroundColor: "rgba(150,200,255,0.12)", color: "#dfefff" };
  }
}

// ------------------ Mini preview isométrico ------------------
function PreviewIso({
  width,
  height,
  data,
  theme,
}: {
  width: number;
  height: number;
  data: Topologia | null;
  theme: "day" | "night";
}) {
  const origin = useMemo(() => ({ ox: width / 2, oy: 110 }), [width]);

  const rectIso = (x: number, y: number, w: number, d: number, z = 0) => {
    const A = isoXY(x, y, z, S);
    const B = isoXY(x + w, y, z, S);
    const C = isoXY(x + w, y + d, z, S);
    const D = isoXY(x, y + d, z, S);
    return [
      `${origin.ox + A.x},${origin.oy + A.y}`,
      `${origin.ox + B.x},${origin.oy + B.y}`,
      `${origin.ox + C.x},${origin.oy + C.y}`,
      `${origin.ox + D.x},${origin.oy + D.y}`,
    ].join(" ");
  };

  const skyGrad = theme === "night" ? "skyNight" : "skyDay";

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="skyDay" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#f8fbff" />
          <Stop offset="1" stopColor="#f1f6fd" />
        </LinearGradient>
        <LinearGradient id="skyNight" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#0c1119" />
          <Stop offset="1" stopColor="#0a0f16" />
        </LinearGradient>

        <LinearGradient id="floorAO" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#a8b7cc" stopOpacity="0.08" />
          <Stop offset="1" stopColor="#8797b0" stopOpacity="0.06" />
        </LinearGradient>

        <LinearGradient id="roofTint" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#d9e7ff" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#c7dbff" stopOpacity="0.45" />
        </LinearGradient>

        <Pattern id="roofHatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(30)">
          <Path d="M0 0 L0 8" stroke="#8fb2e6" strokeWidth="0.6" opacity={0.35 as any} />
        </Pattern>

        <Pattern id="roofGlass" patternUnits="userSpaceOnUse" width="8" height="8">
          <Rect x="0" y="0" width="8" height="8" fill="url(#roofTint)" />
          <Rect x="0" y="0" width="8" height="8" fill="url(#roofHatch)" />
        </Pattern>
      </Defs>

      <IsoDefs />
      <Rect x={0} y={0} width={width} height={height} fill={`url(#${skyGrad})`} />

      {!data ? null : (
        <G>
          {data.rooms.map((r) => {
            const floor = (
              <G key={`pf-${r.id}`}>
                <Polygon points={rectIso(r.x, r.y, r.w, r.d, 0)} fill="url(#floorAO)" opacity={0.6} />
                <G transform={`translate(${origin.ox + isoXY(r.x, r.y, 0, S).x}, ${origin.oy + isoXY(r.x, r.y, 0, S).y})`}>
                  <IsoFloor w={r.w} d={r.d} s={S} />
                </G>
                <G transform={`translate(${origin.ox + isoXY(r.x, r.y, 0, S).x}, ${origin.oy + isoXY(r.x, r.y, 0, S).y})`}>
                  <IsoWall len={r.w} h={r.h} thick={0.12} dir="x" s={S} />
                  <IsoWall len={r.d} h={r.h} thick={0.12} dir="y" s={S} />
                </G>
                <G transform={`translate(${origin.ox + isoXY(r.x + r.w, r.y, 0, S).x}, ${origin.oy + isoXY(r.x + r.w, r.y, 0, S).y})`}>
                  <IsoWall len={r.d} h={r.h} thick={0.12} dir="y" s={S} />
                </G>
                <G transform={`translate(${origin.ox + isoXY(r.x, r.y + r.d, 0, S).x}, ${origin.oy + isoXY(r.x, r.y + r.d, 0, S).y})`}>
                  <IsoWall len={r.w} h={r.h} thick={0.12} dir="x" s={S} />
                </G>
              </G>
            );

            const roof = r.roof ? (
              <G key={`rf-${r.id}`}>
                <G transform={`translate(${origin.ox + isoXY(r.x, r.y, r.h, S).x}, ${origin.oy + isoXY(r.x, r.y, r.h, S).y})`}>
                  <IsoRoof w={r.w} d={r.d} z={0} s={S} />
                </G>
                <Polygon
                  points={rectIso(r.x, r.y, r.w, r.d, r.h)}
                  fill={theme === "night" ? "#0e1826" : "url(#roofGlass)"}
                  opacity={theme === "night" ? 0.88 : 0.9}
                  stroke={theme === "night" ? "#1e2a3a" : "#9fb8df"}
                  strokeWidth={1}
                />
              </G>
            ) : null;

            const compsWallFloor = data.comps
              .filter((c) => c.roomId === r.id && c.attach !== "roof")
              .map((c) => {
                let dir: "x" | "y" = "x";
                let worldX = r.x + c.x;
                let worldY = r.y + c.y;
                let z = 0;

                const dl = c.x;
                const dr = r.w - c.x;
                const dt = c.y;
                const db = r.d - c.y;
                const m = Math.min(dl, dr, dt, db);

                if (c.attach === "wall") {
                  if (m === dl) { dir = "y"; worldX = r.x; }
                  else if (m === dr) { dir = "y"; worldX = r.x + r.w; }
                  else if (m === dt) { dir = "x"; worldY = r.y; }
                  else { dir = "x"; worldY = r.y + r.d; }
                }

                if (String(c.kind) === "ventana") z = r.h * 0.6;
                if (String(c.kind) === "puerta") z = 0;

                const P = isoXY(worldX, worldY, z, S);

                return (
                  <G key={`c-${c.id}`} transform={`translate(${origin.ox + P.x}, ${origin.oy + P.y})`}>
                    {String(c.kind) === "puerta" ? (
                      <IsoDoor w={0.9} h={2.1} dir={dir} s={S} />
                    ) : String(c.kind) === "ventana" ? (
                      <IsoWindow w={1.2} h={1.0} dir={dir} s={S} />
                    ) : (
                      <IsoComp kind={c.kind} dir={dir} s={S} emoji={emojiFor(c.kind)} />
                    )}
                  </G>
                );
              });

            const compsRoof = data.comps
              .filter((c) => c.roomId === r.id && c.attach === "roof")
              .map((c) => {
                const P = isoXY(r.x + c.x, r.y + c.y, r.h, S);
                return (
                  <G key={`cr-${c.id}`} transform={`translate(${origin.ox + P.x}, ${origin.oy + P.y})`}>
                    <IsoComp kind={c.kind} dir="x" s={S} emoji={emojiFor(c.kind)} />
                  </G>
                );
              });

            return (
              <G key={`room-${r.id}`}>
                {floor}
                {roof}
                {compsWallFloor}
                {compsRoof}
              </G>
            );
          })}
        </G>
      )}
    </Svg>
  );
}

function emojiFor(kind: CompType) {
  switch (String(kind)) {
    case "panel.solar":
      return "🔆";
    case "turbina.eolica":
      return "🌬️";
    case "hidro":
      return "💧";
    case "bateria":
      return "🔋";
    case "inversor":
      return "🔀";
    case "sensor":
      return "🛰️";
    case "rele":
      return "⚙️";
    case "puerta":
      return "🚪";
    case "ventana":
      return "🪟";
    case "grid":
      return "🌐";
    default:
      return "🧩";
  }
}

const styles = StyleSheet.create({
  stack: {
    gap: 12 as any,
  },

  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#223",
    backgroundColor: "#0b0f14",
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  headerActions: {
    gap: 8 as any,
    paddingRight: 12,
  },

  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "#18263b",
    borderWidth: 1,
    borderColor: "rgba(150,200,255,0.15)",
  },
  actionTxt: {
    color: "#d6e8ff",
    fontWeight: "700",
  },

  preview: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#1c2533",
    backgroundColor: "#0c1119",
  },

  fab: {
    position: "absolute",
    left: "50%",
    top: "45%",
    marginLeft: -28,
    width: 56,
    height: 56,
    borderRadius: 30,
    backgroundColor: "#e9eef5",
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },

  card: {
    backgroundColor: "#0f1520",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1c2533",
  },

  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  subtitle: {
    color: "#9bb",
    fontSize: 14,
    marginTop: 6,
  },

  grid2: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10 as any,
  },

  glassItem: {
    width: "48%",
    backgroundColor: "rgba(16,22,32,0.55)",
    borderColor: "rgba(150,200,255,0.18)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  glassLabel: {
    color: "#9bb",
    fontSize: 12,
  },
  glassValue: {
    color: "#e7f1ff",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 2,
  },

  breakCard: {
    backgroundColor: "rgba(16,22,32,0.55)",
    borderColor: "rgba(150,200,255,0.18)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  breakTitle: {
    color: "#e7f1ff",
    fontWeight: "800",
    marginBottom: 6,
  },
  breakLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(150,200,255,0.18)",
  },
  breakLabel: {
    color: "#b9cede",
  },
  breakCount: {
    color: "#e7f1ff",
    fontWeight: "800",
  },

  panelTabs: {
    gap: 8 as any,
    paddingRight: 10,
  },
  tabBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(150,200,255,0.12)",
  },
  tabBtnActive: {
    backgroundColor: "rgba(86,126,255,0.18)",
    borderColor: "rgba(126,166,255,0.35)",
  },
  tabTxt: {
    color: "#aac1d8",
    fontWeight: "700",
  },
  tabTxtActive: {
    color: "#eef5ff",
  },

  inlineActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8 as any,
  },
  miniBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#162233",
    borderWidth: 1,
    borderColor: "rgba(150,200,255,0.15)",
  },
  miniBtnTxt: {
    color: "#dbe9ff",
    fontSize: 13,
    fontWeight: "700",
  },

  sectionCard: {
    backgroundColor: "rgba(16,22,32,0.55)",
    borderColor: "rgba(150,200,255,0.18)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  sectionTitle: {
    color: "#eef5ff",
    fontWeight: "800",
    fontSize: 15,
    marginBottom: 8,
  },
  subSectionTitle: {
    color: "#dcecff",
    fontWeight: "800",
    marginBottom: 6,
  },

  infoLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10 as any,
    paddingVertical: 4,
  },
  infoLabel: {
    color: "#9db2c7",
    fontSize: 13,
  },
  infoValue: {
    color: "#edf5ff",
    fontSize: 13,
    fontWeight: "700",
    flexShrink: 1,
    textAlign: "right",
  },

  listRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10 as any,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(150,200,255,0.12)",
  },
  listRowTall: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(150,200,255,0.12)",
  },
  listMain: {
    color: "#edf5ff",
    fontWeight: "700",
  },
  listMeta: {
    color: "#aac1d8",
    fontSize: 12,
    marginTop: 2,
  },
  smallMuted: {
    color: "#8fa7bc",
    fontSize: 12,
    marginTop: 4,
  },
  emptyText: {
    color: "#93a9bf",
    fontSize: 13,
  },
  bulletLine: {
    color: "#cbdcf0",
    fontSize: 13,
    marginTop: 4,
  },

  statusPill: {
    alignSelf: "flex-start",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 4,
  },
});
