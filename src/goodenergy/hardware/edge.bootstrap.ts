import { bootstrapUtopyEdgeRuntime, registerUtopyTile } from "./edge.runtime";

export async function bootstrapDefaultUtopyHardware(ns = "energy:core") {
  const seedId = "ge:seed:default";

  await bootstrapUtopyEdgeRuntime({
    ns,
    seedId,
    siteName: "GoodEnergy Hardware Seed",
  });

  await registerUtopyTile(ns, seedId, {
    tileId: "tile:power:main",
    seedId,
    kind: "power",
    capabilities: ["control.power", "sense.energy"],
    role: "power-brain",
    location: { zone: "tablero" },
    neighbors: ["tile:sense:env", "tile:gateway:main", "tile:plc:main"],
  }, {
    loadPct: 24,
    health: "ok",
    trust: 0.82,
    powerW: 22,
  });

  await registerUtopyTile(ns, seedId, {
    tileId: "tile:sense:env",
    seedId,
    kind: "sense",
    capabilities: ["sense.env", "sense.energy"],
    role: "ambient-sense",
    location: { zone: "gabinete" },
    neighbors: ["tile:power:main", "tile:gateway:main"],
  }, {
    loadPct: 14,
    health: "ok",
    trust: 0.78,
    temperatureC: 34,
    powerW: 4,
  });

  await registerUtopyTile(ns, seedId, {
    tileId: "tile:gateway:main",
    seedId,
    kind: "gateway",
    capabilities: ["route.signal", "bridge.ws", "store.buffer"],
    role: "mesh-gateway",
    location: { zone: "gateway" },
    neighbors: ["tile:power:main", "tile:sense:env", "tile:plc:main", "tile:infer:main"],
  }, {
    loadPct: 31,
    health: "ok",
    trust: 0.85,
    powerW: 8,
  });

  await registerUtopyTile(ns, seedId, {
    tileId: "tile:plc:main",
    seedId,
    kind: "plc",
    capabilities: ["bridge.plc", "bridge.modbus", "compute.logic"],
    role: "industrial-bridge",
    location: { zone: "linea-1" },
    neighbors: ["tile:gateway:main", "tile:power:main"],
  }, {
    loadPct: 28,
    health: "ok",
    trust: 0.88,
    powerW: 7,
  });

  await registerUtopyTile(ns, seedId, {
    tileId: "tile:infer:main",
    seedId,
    kind: "inference",
    capabilities: ["compute.infer", "compute.logic", "store.buffer"],
    role: "local-inference",
    location: { zone: "edge" },
    neighbors: ["tile:gateway:main"],
  }, {
    loadPct: 35,
    health: "ok",
    trust: 0.8,
    powerW: 12,
  });
}