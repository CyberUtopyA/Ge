import type {
  UtopyAssignment,
  UtopyOutcome,
  UtopySeedState,
  UtopyTask,
  UtopyTileProfile,
  UtopyTileSignal,
  UtopyTileState,
} from "./utopy.seed.type";

type AnyDV = {
  id?: string;
  kind: string;
  traits?: string[];
  attrs?: any;
  meta?: Record<string, any>;
};

const now = () => Date.now();
const safe = (s: string) => String(s).replace(/[^a-zA-Z0-9:_\-.]/g, "_");

export function emptyUtopySeedState(seedId: string, ns: string): UtopySeedState {
  return {
    seedId,
    ns,
    tiles: {},
    states: {},
    links: [],
    assignments: {},
    outcomes: {},
  };
}

export function dvUtopySeedProfile(seedId: string, ns: string, extra?: Record<string, any>): AnyDV {
  const ts = now();
  return {
    id: `dv:${safe(seedId)}:utopy.seed.profile:${ts}`,
    kind: "utopy.seed.profile",
    traits: ["utopy:seed", "hardware:profile", "ge:hardware"],
    attrs: {
      seedId,
      ns,
      ...extra,
    },
    meta: {
      ns,
      scopes: ["public"],
      ts,
      ttl_ms: 14 * 24 * 60 * 60 * 1000,
      by: "ge:hardware",
    },
  };
}

export function dvUtopyTileProfile(ns: string, profile: UtopyTileProfile): AnyDV {
  const ts = now();
  return {
    id: `dv:${safe(profile.seedId)}:utopy.tile.profile:${safe(profile.tileId)}:${ts}`,
    kind: "utopy.tile.profile",
    traits: ["utopy:tile", "hardware:profile"],
    attrs: profile,
    meta: {
      ns,
      scopes: ["public"],
      ts,
      ttl_ms: 14 * 24 * 60 * 60 * 1000,
      by: "ge:hardware",
    },
  };
}

export function dvUtopyTileState(ns: string, seedId: string, state: UtopyTileState): AnyDV {
  const ts = now();
  return {
    id: `dv:${safe(seedId)}:utopy.tile.state:${safe(state.tileId)}:${ts}`,
    kind: "utopy.tile.state",
    traits: ["utopy:tile", "hardware:state", "edge:live"],
    attrs: {
      seedId,
      ...state,
    },
    meta: {
      ns,
      scopes: ["public"],
      ts,
      ttl_ms: 5 * 60 * 1000,
      by: "ge:hardware",
    },
  };
}

export function dvUtopyTileSignal(ns: string, seedId: string, signal: UtopyTileSignal): AnyDV {
  return {
    id: `dv:${safe(seedId)}:utopy.tile.signal:${safe(signal.signalId)}`,
    kind: "utopy.tile.signal",
    traits: ["utopy:signal", "edge:live"],
    attrs: {
      seedId,
      ...signal,
    },
    meta: {
      ns,
      scopes: ["public"],
      ts: signal.ts,
      ttl_ms: 60 * 60 * 1000,
      by: "ge:hardware",
    },
  };
}

export function dvUtopyTask(ns: string, task: UtopyTask): AnyDV {
  return {
    id: `dv:${safe(task.seedId)}:utopy.task:${safe(task.taskId)}`,
    kind: "utopy.task",
    traits: ["utopy:task", "hardware:task"],
    attrs: task,
    meta: {
      ns,
      scopes: ["public"],
      ts: task.createdAt,
      ttl_ms: 24 * 60 * 60 * 1000,
      by: "ge:hardware",
    },
  };
}

export function dvUtopyAssignment(ns: string, a: UtopyAssignment): AnyDV {
  return {
    id: `dv:${safe(a.seedId)}:utopy.assignment:${safe(a.assignmentId)}`,
    kind: "utopy.assignment",
    traits: ["utopy:assignment", "hardware:task"],
    attrs: a,
    meta: {
      ns,
      scopes: ["public"],
      ts: a.ts,
      ttl_ms: 24 * 60 * 60 * 1000,
      by: "ge:hardware",
    },
  };
}

export function dvUtopyOutcome(ns: string, o: UtopyOutcome): AnyDV {
  return {
    id: `dv:${safe(o.seedId)}:utopy.outcome:${safe(o.outcomeId)}`,
    kind: "utopy.outcome",
    traits: ["utopy:outcome", "hardware:task"],
    attrs: o,
    meta: {
      ns,
      scopes: ["public"],
      ts: o.ts,
      ttl_ms: 24 * 60 * 60 * 1000,
      by: "ge:hardware",
    },
  };
}