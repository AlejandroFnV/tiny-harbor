/** Creación y saneado del estado. */

import * as C from "./config";
import type { Boat, GameState } from "./types";
import { rollMissions } from "./missions";

export function newBoat(state: GameState, tier: number): Boat {
  return {
    id: state.nextBoatId++,
    tier,
    speedLvl: 0,
    capLvl: 0,
    phase: "out",
    phaseT: 0,
    cargo: 0,
    skipper: null,
  };
}

export function newGame(now: number, seed = 1234567): GameState {
  const state: GameState = {
    version: C.SAVE_VERSION,
    money: 0,
    lifetime: 0,
    totalEarned: 0,
    reputation: 0,
    repEarned: 0,
    prestiges: 0,
    boats: [],
    nextBoatId: 1,
    dockLevel: 0,
    lonjaLvl: 0,
    managerLvl: 0,
    managerT: 0,
    zonesUnlocked: 0,
    missions: [],
    nextMissionId: 1,
    missionsDone: 0,
    event: null,
    eventT: C.EVENT_WARMUP_S,
    order: null,
    orderT: C.ORDER_WARMUP_S,
    discovered: [],
    tavern: { candidates: [], refreshT: C.TAVERN_REFRESH_S },
    legacy: { astillero: 0, escuela: 0, faro: 0 },
    achievements: [],
    combo: { n: 0, t: 0 },
    lastSeen: now,
    playTime: 0,
    tutorialStep: 0,
    settings: { muted: false, music: true },
    stats: { collects: 0, boatsBought: 0, upgrades: 0, taps: 0, ordersDone: 0, stormsRisked: 0, skippersHired: 0, bestCombo: 0, goldenCatches: 0 },
    rngSeed: seed >>> 0,
  };
  // Empiezas con un bote heredado, ya faenando.
  state.boats.push(newBoat(state, 0));
  rollMissions(state);
  return state;
}

function num(v: unknown, fallback: number, min = 0, max = Number.MAX_VALUE): number {
  const n = typeof v === "number" ? v : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Sanea un estado cargado: nada de NaN, negativos ni referencias fuera de rango.
 * Se aplica SIEMPRE al cargar un save (corrupto, editado, o de versión migrada).
 */
export function sanitize(state: GameState): GameState {
  state.money = num(state.money, 0);
  state.lifetime = num(state.lifetime, 0);
  state.totalEarned = num(state.totalEarned, state.lifetime);
  state.reputation = Math.floor(num(state.reputation, 0, 0, 1e9));
  // repEarned nunca puede ser menor que la reputación disponible.
  state.repEarned = Math.max(Math.floor(num(state.repEarned, state.reputation, 0, 1e9)), state.reputation);
  state.prestiges = Math.floor(num(state.prestiges, 0, 0, 1e9));
  state.dockLevel = Math.floor(num(state.dockLevel, 0, 0, C.DOCK_MAX_LEVEL));
  state.lonjaLvl = Math.floor(num(state.lonjaLvl, 0, 0, 1000));
  state.managerLvl = Math.floor(num(state.managerLvl, 0, 0, C.MANAGER_MAX_LVL));
  state.managerT = num(state.managerT, 0, 0, 60);
  state.zonesUnlocked = Math.floor(num(state.zonesUnlocked, 0, 0, C.ZONES.length - 1));
  state.playTime = num(state.playTime, 0);
  state.lastSeen = num(state.lastSeen, 0);
  state.eventT = num(state.eventT, C.EVENT_WARMUP_S, 0, 3600);
  state.tutorialStep = Math.floor(num(state.tutorialStep, 0, 0, 99));
  state.nextBoatId = Math.floor(num(state.nextBoatId, 1, 1));
  state.nextMissionId = Math.floor(num(state.nextMissionId, 1, 1));
  state.missionsDone = Math.floor(num(state.missionsDone, 0));
  state.rngSeed = Math.floor(num(state.rngSeed, 1234567, 0, 4294967295));

  if (!Array.isArray(state.boats)) state.boats = [];
  state.boats = state.boats.filter((b) => b && typeof b === "object").slice(0, C.MAX_BOATS);
  for (const b of state.boats) {
    b.tier = Math.floor(num(b.tier, 0, 0, C.BOAT_TIERS.length - 1));
    b.speedLvl = Math.floor(num(b.speedLvl, 0, 0, C.SPEED_MAX_LVL));
    b.capLvl = Math.floor(num(b.capLvl, 0, 0, C.CAP_MAX_LVL));
    b.phaseT = num(b.phaseT, 0, 0, 36000);
    b.cargo = num(b.cargo, 0);
    b.id = Math.floor(num(b.id, 0, 0));
    if (!["out", "fishing", "in", "ready"].includes(b.phase)) b.phase = "out";
    // Patrón: nombre string + rasgo conocido, o fuera.
    if (b.skipper && typeof b.skipper === "object" && typeof b.skipper.name === "string"
        && C.TRAITS.some((t) => t.id === b.skipper!.trait)) {
      b.skipper = { name: b.skipper.name.slice(0, 24), trait: b.skipper.trait };
    } else {
      b.skipper = null;
    }
  }
  if (state.boats.length === 0) state.boats.push(newBoat(state, 0));

  if (!state.settings || typeof state.settings !== "object") state.settings = { muted: false, music: true };
  state.settings.muted = state.settings.muted === true;
  state.settings.music = state.settings.music !== false;

  // Pescadoteca: solo ids conocidas, sin duplicados.
  if (!Array.isArray(state.discovered)) state.discovered = [];
  const known = new Set(C.SPECIES.map((s) => s.id));
  state.discovered = [...new Set(state.discovered)].filter((id) => known.has(id));

  // Logros: solo ids conocidas, sin duplicados.
  if (!Array.isArray(state.achievements)) state.achievements = [];
  const knownAch = new Set(C.ACHIEVEMENTS.map((a) => a.id));
  state.achievements = [...new Set(state.achievements)].filter((id) => knownAch.has(id));

  // Árbol de legado.
  if (!state.legacy || typeof state.legacy !== "object") state.legacy = { astillero: 0, escuela: 0, faro: 0 };
  for (const b of C.LEGACY_BRANCHES) {
    state.legacy[b.id] = Math.floor(num(state.legacy[b.id], 0, 0, C.LEGACY_MAX_LVL));
  }

  // Racha de cobro.
  if (!state.combo || typeof state.combo !== "object") state.combo = { n: 0, t: 0 };
  state.combo.n = Math.floor(num(state.combo.n, 0, 0, C.COMBO_MAX));
  state.combo.t = num(state.combo.t, 0, 0, C.COMBO_WINDOW_S);

  // Taberna.
  if (!state.tavern || typeof state.tavern !== "object" || !Array.isArray(state.tavern.candidates)) {
    state.tavern = { candidates: [], refreshT: C.TAVERN_REFRESH_S };
  }
  state.tavern.refreshT = num(state.tavern.refreshT, C.TAVERN_REFRESH_S, 0, 3600);
  state.tavern.candidates = state.tavern.candidates
    .filter((c) => c && typeof c === "object" && typeof c.name === "string" && C.TRAITS.some((t) => t.id === c.trait))
    .slice(0, C.TAVERN_SLOTS)
    .map((c) => ({ name: c.name.slice(0, 24), trait: c.trait, cost: num(c.cost, C.TAVERN_COST_MIN, 1) }));

  // Pedido de la lonja.
  state.orderT = num(state.orderT, C.ORDER_WARMUP_S, 0, 3600);
  if (state.order && typeof state.order === "object") {
    const o = state.order;
    if (o.stage !== "offer" && o.stage !== "active") state.order = null;
    else {
      o.goal = num(o.goal, C.ORDER_GOAL_MIN, 1);
      o.progress = num(o.progress, 0, 0);
      o.remaining = num(o.remaining, 0, 0, 600);
      o.reward = num(o.reward, 0, 0);
    }
  } else {
    state.order = null;
  }
  if (!state.stats || typeof state.stats !== "object") {
    state.stats = { collects: 0, boatsBought: 0, upgrades: 0, taps: 0, ordersDone: 0, stormsRisked: 0, skippersHired: 0, bestCombo: 0, goldenCatches: 0 };
  }
  state.stats.collects = Math.floor(num(state.stats.collects, 0));
  state.stats.boatsBought = Math.floor(num(state.stats.boatsBought, 0));
  state.stats.upgrades = Math.floor(num(state.stats.upgrades, 0));
  state.stats.taps = Math.floor(num(state.stats.taps, 0));
  state.stats.ordersDone = Math.floor(num(state.stats.ordersDone, 0));
  state.stats.stormsRisked = Math.floor(num(state.stats.stormsRisked, 0));
  state.stats.skippersHired = Math.floor(num(state.stats.skippersHired, 0));
  state.stats.bestCombo = Math.floor(num(state.stats.bestCombo, 0, 0, C.COMBO_MAX));
  state.stats.goldenCatches = Math.floor(num(state.stats.goldenCatches, 0));

  if (!Array.isArray(state.missions)) state.missions = [];
  state.missions = state.missions.filter((m) => m && typeof m === "object" && typeof m.text === "string");
  for (const m of state.missions) {
    m.target = num(m.target, 1, 1);
    m.progress = num(m.progress, 0, 0, m.target);
    m.reward = num(m.reward, C.MISSION_REWARD_MIN, 0);
    m.param = Math.floor(num(m.param, 0, 0));
    m.done = m.done === true;
  }
  if (state.missions.length < C.ACTIVE_MISSIONS) rollMissions(state);

  if (state.event && typeof state.event === "object") {
    const ev = state.event;
    if (ev.kind !== "frenzy" && ev.kind !== "storm") state.event = null;
    else {
      ev.remaining = num(ev.remaining, 0, 0, 120);
      ev.tapsLeft = Math.floor(num(ev.tapsLeft, 0, 0, C.FRENZY_MAX_TAPS));
      if (ev.stage !== "warning" && ev.stage !== "active") ev.stage = "active";
    }
  } else {
    state.event = null;
  }

  state.version = C.SAVE_VERSION;
  return state;
}
