/** Creación y saneado del estado. */

import * as C from "./config";
import type { Boat, GameState } from "./types";
import { rollMissions } from "./missions";

export function newBoat(state: GameState, tier: number): Boat {
  return {
    id: state.nextBoatId++,
    tier,
    paint: 0,
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
    lastSaleLifetime: 0,
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
    market: { mult: 1, t: C.MARKET_STEP_S, dir: 0 },
    drift: null,
    driftT: C.DRIFT_WARMUP_S,
    expedition: null,
    relics: [],
    portName: "",
    vigia: false,
    weather: 0,
    daily: null,
    gift: { lastAt: 0, streak: 0 },
    lastSeen: now,
    playTime: 0,
    tutorialStep: 0,
    settings: { muted: false, music: true },
    stats: { collects: 0, boatsBought: 0, upgrades: 0, taps: 0, ordersDone: 0, stormsRisked: 0, skippersHired: 0, bestCombo: 0, goldenCatches: 0, driftsTapped: 0, expeditionsDone: 0, soldHigh: 0, krakensRepelled: 0, specialSales: 0, weathersFished: 0, dailiesDone: 0, bestLifetime: 0, bestRepGain: 0, bestGiftStreak: 0 },
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
  state.lastSaleLifetime = num(state.lastSaleLifetime, 0);
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
    b.paint = Math.floor(num(b.paint, 0, 0, C.PAINTS.length - 1));
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

  // Racha de cobro (el tope real puede ser mayor con el mascarón).
  if (!state.combo || typeof state.combo !== "object") state.combo = { n: 0, t: 0 };
  state.combo.n = Math.floor(num(state.combo.n, 0, 0, C.COMBO_MAX + C.RELIC_COMBO_EXTRA));
  state.combo.t = num(state.combo.t, 0, 0, C.COMBO_WINDOW_S);

  // Mercado de la lonja.
  if (!state.market || typeof state.market !== "object") state.market = { mult: 1, t: C.MARKET_STEP_S, dir: 0 };
  state.market.mult = num(state.market.mult, 1, C.MARKET_MIN, C.MARKET_MAX);
  state.market.t = num(state.market.t, C.MARKET_STEP_S, 0, C.MARKET_STEP_S);
  state.market.dir = state.market.dir === 1 ? 1 : state.market.dir === -1 ? -1 : 0;

  // Cofre a la deriva.
  state.driftT = num(state.driftT, C.DRIFT_WARMUP_S, 0, 3600);
  if (state.drift && typeof state.drift === "object") {
    state.drift.kind = Math.floor(num(state.drift.kind, 0, 0, C.DRIFT_KINDS.length - 1));
    state.drift.x = num(state.drift.x, 0.5, 0, 1);
    state.drift.remaining = num(state.drift.remaining, 0, 0, C.DRIFT_LIFETIME_S);
    if (state.drift.remaining <= 0) state.drift = null;
  } else {
    state.drift = null;
  }

  // Expedición: el barco debe existir; si no, se anula sin drama.
  if (state.expedition && typeof state.expedition === "object") {
    const e = state.expedition;
    e.def = Math.floor(num(e.def, 0, 0, C.EXPEDITIONS.length - 1));
    e.boatId = Math.floor(num(e.boatId, -1, -1));
    e.remaining = num(e.remaining, 0, 0, C.EXPEDITIONS[C.EXPEDITIONS.length - 1].dur);
    if (!state.boats.some((b) => b.id === e.boatId)) state.expedition = null;
  } else {
    state.expedition = null;
  }

  // Reliquias: solo ids conocidas, sin duplicados.
  if (!Array.isArray(state.relics)) state.relics = [];
  const knownRelics = new Set(C.RELICS.map((r) => r.id));
  state.relics = [...new Set(state.relics)].filter((id) => knownRelics.has(id));

  // Nombre del puerto, vigía, clima, desafío y paquete del pescador.
  state.portName = typeof state.portName === "string" ? state.portName.slice(0, C.PORT_NAME_MAX) : "";
  state.vigia = state.vigia === true;
  state.weather = Math.floor(num(state.weather, 0, 0, C.WEATHERS.length - 1));
  if (state.daily && typeof state.daily === "object") {
    const d = state.daily;
    d.day = Math.floor(num(d.day, 0, 0));
    d.def = Math.floor(num(d.def, 0, 0, C.DAILIES.length - 1));
    d.baseline = num(d.baseline, 0, 0);
    d.done = d.done === true;
  } else {
    state.daily = null;
  }
  if (!state.gift || typeof state.gift !== "object") state.gift = { lastAt: 0, streak: 0 };
  state.gift.lastAt = num(state.gift.lastAt, 0);
  state.gift.streak = Math.floor(num(state.gift.streak, 0, 0, 100000));

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
    state.stats = { collects: 0, boatsBought: 0, upgrades: 0, taps: 0, ordersDone: 0, stormsRisked: 0, skippersHired: 0, bestCombo: 0, goldenCatches: 0, driftsTapped: 0, expeditionsDone: 0, soldHigh: 0, krakensRepelled: 0, specialSales: 0, weathersFished: 0, dailiesDone: 0, bestLifetime: 0, bestRepGain: 0, bestGiftStreak: 0 };
  }
  state.stats.collects = Math.floor(num(state.stats.collects, 0));
  state.stats.boatsBought = Math.floor(num(state.stats.boatsBought, 0));
  state.stats.upgrades = Math.floor(num(state.stats.upgrades, 0));
  state.stats.taps = Math.floor(num(state.stats.taps, 0));
  state.stats.ordersDone = Math.floor(num(state.stats.ordersDone, 0));
  state.stats.stormsRisked = Math.floor(num(state.stats.stormsRisked, 0));
  state.stats.skippersHired = Math.floor(num(state.stats.skippersHired, 0));
  state.stats.bestCombo = Math.floor(num(state.stats.bestCombo, 0, 0, C.COMBO_MAX + C.RELIC_COMBO_EXTRA));
  state.stats.goldenCatches = Math.floor(num(state.stats.goldenCatches, 0));
  state.stats.driftsTapped = Math.floor(num(state.stats.driftsTapped, 0));
  state.stats.expeditionsDone = Math.floor(num(state.stats.expeditionsDone, 0));
  state.stats.soldHigh = Math.floor(num(state.stats.soldHigh, 0));
  state.stats.krakensRepelled = Math.floor(num(state.stats.krakensRepelled, 0));
  state.stats.specialSales = Math.floor(num(state.stats.specialSales, 0));
  state.stats.weathersFished = Math.floor(num(state.stats.weathersFished, 0, 0, (1 << C.WEATHERS.length) - 1));
  state.stats.dailiesDone = Math.floor(num(state.stats.dailiesDone, 0));
  state.stats.bestLifetime = num(state.stats.bestLifetime, state.lifetime);
  state.stats.bestRepGain = Math.floor(num(state.stats.bestRepGain, 0));
  state.stats.bestGiftStreak = Math.floor(num(state.stats.bestGiftStreak, state.gift.streak));

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
    if (ev.kind !== "frenzy" && ev.kind !== "storm" && ev.kind !== "kraken") state.event = null;
    else {
      ev.remaining = num(ev.remaining, 0, 0, 120);
      ev.tapsLeft = Math.floor(num(ev.tapsLeft, 0, 0, Math.max(C.FRENZY_MAX_TAPS, C.KRAKEN_TAPS)));
      if (ev.stage !== "warning" && ev.stage !== "active") ev.stage = "active";
    }
  } else {
    state.event = null;
  }

  state.version = C.SAVE_VERSION;
  return state;
}
