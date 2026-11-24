import { spore } from "../../utopy/spore";
import { publishGoodEnergyDV } from "../shared/dv.publish";
import {
  dvUtopyAssignment,
  dvUtopyOutcome,
  dvUtopySeedProfile,
  dvUtopyTask,
  dvUtopyTileProfile,
  dvUtopyTileSignal,
  dvUtopyTileState,
  emptyUtopySeedState,
} from "./protocol";
import type {
  UtopyAssignment,
  UtopyOutcome,
  UtopySeedState,
  UtopyTask,
  UtopyTileCapability,
  UtopyTileProfile,
  UtopyTileSignal,
  UtopyTileState,
} from "./utopy.seed.type";

const RUNTIMES: Record<string, boolean> = {};
const STATES: Record<string, UtopySeedState> = {};

const now = () => Date.now();
const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}_${Date.now() % 1000000}`;

function getState(seedId: string, ns: string): UtopySeedState {
  const key = `${ns}:${seedId}`;
  if (!STATES[key]) STATES[key] = emptyUtopySeedState(seedId, ns);
  return STATES[key];
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function hasAllCapabilities(tileCaps: UtopyTileCapability[], req: UtopyTileCapability[]) {
  return req.every((r) => tileCaps.includes(r));
}

function neighborBoost(seed: UtopySeedState, tileId: string, task: UtopyTask) {
  const tile = seed.tiles[tileId];
  if (!tile?.neighbors?.length) return 0;
  let boost = 0;

  for (const nId of tile.neighbors) {
    const n = seed.tiles[nId];
    if (!n) continue;
    if (task.requiredCapabilities.some((cap) => n.capabilities.includes(cap))) boost += 0.03;
  }
  return boost;
}

function zoneBoost(tile: UtopyTileProfile, task: UtopyTask) {
  if (!task.zone) return 0;
  return tile.location?.zone === task.zone ? 0.08 : 0;
}

function kindBoost(tile: UtopyTileProfile, task: UtopyTask) {
  if (!task.preferredKinds?.length) return 0;
  return task.preferredKinds.includes(tile.kind) ? 0.08 : 0;
}

function priorityWeight(p?: UtopyTask["priority"]) {
  switch (p) {
    case "critical":
      return 1.2;
    case "high":
      return 1.1;
    case "medium":
      return 1;
    default:
      return 0.9;
  }
}

function computeTileScore(seed: UtopySeedState, tile: UtopyTileProfile, state: UtopyTileState, task: UtopyTask) {
  if (!hasAllCapabilities(tile.capabilities, task.requiredCapabilities)) return -1;
  if (state.health === "offline") return -1;

  let score = 0.4;
  score += clamp01(state.trust) * 0.25;
  score += (1 - clamp01(state.loadPct / 100)) * 0.2;

  if (state.health === "ok") score += 0.08;
  if (state.health === "warn") score += 0.02;
  if (state.health === "alert") score -= 0.1;

  score += zoneBoost(tile, task);
  score += kindBoost(tile, task);
  score += neighborBoost(seed, tile.tileId, task);
  score *= priorityWeight(task.priority);

  return Number(score.toFixed(4));
}

function buildRationale(tile: UtopyTileProfile, state: UtopyTileState, task: UtopyTask): string[] {
  const r: string[] = [];
  r.push(`capabilities=${tile.capabilities.join(",")}`);
  r.push(`health=${state.health}`);
  r.push(`trust=${state.trust}`);
  r.push(`loadPct=${state.loadPct}`);
  if (task.zone && tile.location?.zone) r.push(`zone=${tile.location.zone}`);
  if (tile.neighbors?.length) r.push(`neighbors=${tile.neighbors.length}`);
  return r;
}

async function publish(ns: string, dv: any) {
  await publishGoodEnergyDV(dv, {
    semanticNs: String(dv?.meta?.ns || ns || "energy:core"),
    echoToGe: true,
  });
}

export async function registerUtopyTile(
  ns: string,
  seedId: string,
  profile: UtopyTileProfile,
  state?: Partial<UtopyTileState>
) {
  const S = getState(seedId, ns);

  S.tiles[profile.tileId] = profile;
  S.states[profile.tileId] = {
    tileId: profile.tileId,
    loadPct: state?.loadPct ?? 0,
    temperatureC: state?.temperatureC,
    powerW: state?.powerW,
    health: state?.health || "ok",
    trust: clamp01(state?.trust ?? 0.7),
    lastSeen: state?.lastSeen ?? now(),
    memory: state?.memory || { localFacts: 0, recentTasks: 0 },
  };

  await publish(ns, dvUtopyTileProfile(ns, profile));
  await publish(ns, dvUtopyTileState(ns, seedId, S.states[profile.tileId]));
}

export async function updateUtopyTileState(
  ns: string,
  seedId: string,
  tileId: string,
  patch: Partial<UtopyTileState>
) {
  const S = getState(seedId, ns);
  const prev = S.states[tileId];
  if (!prev) return;

  S.states[tileId] = {
    ...prev,
    ...patch,
    tileId,
    trust: clamp01(patch.trust ?? prev.trust),
    lastSeen: patch.lastSeen ?? now(),
  };

  await publish(ns, dvUtopyTileState(ns, seedId, S.states[tileId]));
}

export async function emitUtopySignal(
  ns: string,
  seedId: string,
  signal: Omit<UtopyTileSignal, "signalId" | "ts"> & Partial<Pick<UtopyTileSignal, "signalId" | "ts">>
) {
  const full: UtopyTileSignal = {
    signalId: signal.signalId || uid("sig"),
    ts: signal.ts || now(),
    ...signal,
  };

  await publish(ns, dvUtopyTileSignal(ns, seedId, full));
  await spore.sayIntent({
    sym: "⚡",
    say: "utopy.signal.result",
    ns,
    with: full,
  });
}

export async function assignUtopyTask(ns: string, seedId: string, task: UtopyTask) {
  const S = getState(seedId, ns);

  await publish(ns, dvUtopyTask(ns, task));

  let bestTile: UtopyTileProfile | null = null;
  let bestState: UtopyTileState | null = null;
  let bestScore = -1;

  for (const tile of Object.values(S.tiles)) {
    const state = S.states[tile.tileId];
    if (!state) continue;
    const score = computeTileScore(S, tile, state, task);
    if (score > bestScore) {
      bestScore = score;
      bestTile = tile;
      bestState = state;
    }
  }

  if (!bestTile || !bestState || bestScore < 0) {
    const outcome: UtopyOutcome = {
      outcomeId: uid("out"),
      seedId,
      taskId: task.taskId,
      tileId: "none",
      status: "failed",
      result: { reason: "no_tile_available" },
      ts: now(),
    };
    S.outcomes[outcome.outcomeId] = outcome;
    await publish(ns, dvUtopyOutcome(ns, outcome));
    await spore.sayIntent({ sym: "⚡", say: "utopy.outcome.result", ns, with: outcome });
    return;
  }
  const selectedState = bestState;
  const selectedTile = bestTile;

  const assignment: UtopyAssignment = {
    assignmentId: uid("asg"),
    seedId,
    taskId: task.taskId,
    assignedTileId: selectedTile.tileId,
    score: bestScore,
    rationale: buildRationale(selectedTile, selectedState, task),
    ts: now(),
  };

  S.assignments[assignment.assignmentId] = assignment;

  selectedState.loadPct = Math.min(
    100,
    selectedState.loadPct + (task.priority === "critical" ? 25 : task.priority === "high" ? 18 : 10)
  );
  selectedState.lastSeen = now();
  selectedState.memory = {
    localFacts: selectedState.memory?.localFacts || 0,
    recentTasks: (selectedState.memory?.recentTasks || 0) + 1,
  };

  await publish(ns, dvUtopyAssignment(ns, assignment));
  await publish(ns, dvUtopyTileState(ns, seedId, selectedState));

  await spore.sayIntent({
    sym: "⚡",
    say: "utopy.assignment.result",
    ns,
    with: assignment,
  });

  const running: UtopyOutcome = {
    outcomeId: uid("out"),
    seedId,
    taskId: task.taskId,
    tileId: selectedTile.tileId,
    status: "running",
    result: {
      assignedBy: "ge:hardware",
    },
    ts: now(),
  };

  S.outcomes[running.outcomeId] = running;
  await publish(ns, dvUtopyOutcome(ns, running));

  setTimeout(async () => {
    selectedState.loadPct = Math.max(0, selectedState.loadPct - 7);
    selectedState.trust = clamp01(selectedState.trust + 0.01);
    selectedState.lastSeen = now();

    const done: UtopyOutcome = {
      outcomeId: uid("out"),
      seedId,
      taskId: task.taskId,
      tileId: selectedTile.tileId,
      status: "done",
      result: {
        acceptedBy: selectedTile.tileId,
        capabilityMatch: task.requiredCapabilities,
      },
      ts: now(),
    };

    S.outcomes[done.outcomeId] = done;

    await publish(ns, dvUtopyTileState(ns, seedId, selectedState));
    await publish(ns, dvUtopyOutcome(ns, done));

    await spore.sayIntent({
      sym: "⚡",
      say: "utopy.outcome.result",
      ns,
      with: done,
    });
  }, 1200);
}

export async function bootstrapUtopyEdgeRuntime(input: {
  ns?: string;
  seedId?: string;
  siteName?: string;
}) {
  const ns = input.ns || "energy:core";
  const seedId = input.seedId || "ge:seed:default";
  const key = `${ns}:${seedId}`;

  if (RUNTIMES[key]) return;
  RUNTIMES[key] = true;

  const S = getState(seedId, ns);

  await publish(
    ns,
    dvUtopySeedProfile(seedId, ns, {
      siteName: input.siteName || "GoodEnergy Seed",
      description: "Arquitectura viva simbiótica modular para GE hardware.",
    })
  );

  spore.on("intent", async (msg: any) => {
    const i = msg?.payload || msg;
    if (!i || i.sym !== "⚡") return;

    const uiNs = i?.with?.uiNs;
    const isForMe = i.ns === ns || uiNs === ns;
    if (!isForMe) return;

    switch (i.say) {
      case "utopy.tile.register":
        await registerUtopyTile(ns, seedId, i.with.profile, i.with.state);
        break;

      case "utopy.tile.state.update":
        await updateUtopyTileState(ns, seedId, i.with.tileId, i.with.patch || {});
        break;

      case "utopy.signal.emit":
        await emitUtopySignal(ns, seedId, i.with);
        break;

      case "utopy.task.assign":
        await assignUtopyTask(ns, seedId, i.with as UtopyTask);
        break;

      case "utopy.seed.state.request":
        await spore.sayIntent({
          sym: "⚡",
          say: "utopy.seed.state.result",
          ns,
          with: {
            seedId,
            tiles: Object.values(S.tiles),
            states: Object.values(S.states),
            assignments: Object.values(S.assignments),
            outcomes: Object.values(S.outcomes),
          },
        });
        break;

      default:
        break;
    }
  });
}
