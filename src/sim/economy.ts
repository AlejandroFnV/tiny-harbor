/** Fórmulas de coste/ingreso. Puras: (state|args) → número. */

import * as C from "./config";
import type { Boat, GameState } from "./types";

// --- Multiplicadores globales ------------------------------------------------

export function prestigeMult(state: GameState): number {
  // Sobre la reputación GANADA total: gastar en el legado no baja el multiplicador.
  return 1 + state.repEarned * C.PRESTIGE_MULT_PER_REP;
}

/** Bonus permanente de la pescadoteca (+1% por especie descubierta). */
export function speciesMult(state: GameState): number {
  return 1 + state.discovered.length * C.SPECIES_INCOME_BONUS;
}

/** Bonus permanente de logros (+2% por logro). */
export function achievementMult(state: GameState): number {
  return 1 + state.achievements.length * C.ACHIEVEMENT_INCOME_BONUS;
}

/** Multiplicador de evento activo sobre ingresos. */
export function eventMult(state: GameState): number {
  const ev = state.event;
  if (!ev || ev.stage !== "active") return 1;
  if (ev.kind === "frenzy") return C.FRENZY_MULT;
  if (ev.kind === "storm" && ev.choice === "risk") return C.STORM_RISK_MULT;
  return 1;
}

// --- Barcos -------------------------------------------------------------------

export function boatCount(state: GameState, tier: number): number {
  let n = 0;
  for (const b of state.boats) if (b.tier === tier) n++;
  return n;
}

/** Coste del siguiente barco de un tier. */
export function boatCost(state: GameState, tier: number): number {
  const def = C.BOAT_TIERS[tier];
  return Math.ceil(def.baseCost * Math.pow(C.COST_GROWTH, boatCount(state, tier)));
}

export function speedUpgradeCost(boat: Boat): number {
  const def = C.BOAT_TIERS[boat.tier];
  return Math.ceil(def.baseCost * C.SPEED_COST_FACTOR * Math.pow(C.COST_GROWTH, boat.speedLvl));
}

export function capUpgradeCost(boat: Boat): number {
  const def = C.BOAT_TIERS[boat.tier];
  return Math.ceil(def.baseCost * C.CAP_COST_FACTOR * Math.pow(C.COST_GROWTH, boat.capLvl));
}

/** Duración total del ciclo de un barco (s): zona, velocidad, patrón y escuela. */
export function cycleTime(state: GameState, boat: Boat): number {
  const def = C.BOAT_TIERS[boat.tier];
  const zone = C.ZONES[state.zonesUnlocked];
  let speed = 1 + C.SPEED_BONUS * boat.speedLvl;
  if (boat.skipper?.trait === "rapido") speed *= 1 + C.TRAIT_SPEED_BONUS;
  speed *= 1 + C.LEGACY_ESCUELA_SPEED * state.legacy.escuela;
  return (def.cycle * zone.distMult) / speed;
}

/** Valor de la carga que trae un barco (sin multiplicador de evento). */
export function cargoValue(state: GameState, boat: Boat): number {
  const def = C.BOAT_TIERS[boat.tier];
  const zone = C.ZONES[state.zonesUnlocked];
  let v =
    def.baseCargo * (1 + C.CAP_BONUS * boat.capLvl) * zone.valueMult *
    prestigeMult(state) * speciesMult(state) * achievementMult(state);
  if (boat.skipper?.trait === "redes") v *= 1 + C.TRAIT_CARGO_BONUS;
  v *= 1 + C.LEGACY_ASTILLERO_CARGO * state.legacy.astillero;
  return v;
}

/** Multiplicador de probabilidad de descubrir especie al cobrar un barco. */
export function speciesChanceMult(state: GameState, boat: Boat): number {
  let m = 1 + C.LEGACY_FARO_SPECIES * state.legacy.faro;
  if (boat.skipper?.trait === "ojo") m *= C.TRAIT_SPECIES_MULT;
  return m;
}

/** Ingresos medios por segundo de toda la flota (para offline, misiones, UI). */
export function incomeRate(state: GameState): number {
  let rate = 0;
  for (const b of state.boats) rate += cargoValue(state, b) / cycleTime(state, b);
  return rate;
}

// --- Muelle / gestor / zonas ---------------------------------------------------

export function berths(state: GameState): number {
  return C.BASE_BERTHS + state.dockLevel * C.BERTHS_PER_LEVEL;
}

export function dockCost(state: GameState): number {
  return Math.ceil(C.DOCK_BASE_COST * Math.pow(C.DOCK_COST_GROWTH, state.dockLevel));
}

export function managerCost(state: GameState): number {
  return Math.ceil(C.MANAGER_BASE_COST * Math.pow(C.MANAGER_COST_GROWTH, state.managerLvl));
}

export function nextZone(state: GameState): number | null {
  const next = state.zonesUnlocked + 1;
  return next < C.ZONES.length ? next : null;
}

export function zoneCost(state: GameState): number | null {
  const next = nextZone(state);
  return next === null ? null : C.ZONES[next].unlockCost;
}

// --- Prestigio ------------------------------------------------------------------

export function canPrestige(state: GameState): boolean {
  return state.lifetime >= C.PRESTIGE_MIN_LIFETIME;
}

export function prestigeGain(state: GameState): number {
  if (!canPrestige(state)) return 0;
  return Math.floor(Math.sqrt(state.lifetime / C.PRESTIGE_REP_DIVISOR));
}

// --- Offline ---------------------------------------------------------------------

export function offlineCapSeconds(state: GameState): number {
  // El Faro Viejo (legado) amplía el cofre por encima del techo normal.
  return (
    Math.min(C.OFFLINE_CAP_MAX_S, C.OFFLINE_CAP_BASE_S + state.dockLevel * C.OFFLINE_CAP_PER_DOCK_S) +
    state.legacy.faro * C.LEGACY_FARO_OFFLINE_S
  );
}

// --- Taberna / legado --------------------------------------------------------

/** Coste de fichar al próximo candidato (se fija al aparecer en la taberna). */
export function skipperCost(state: GameState): number {
  return Math.ceil(Math.max(C.TAVERN_COST_MIN, incomeRate(state) * C.TAVERN_COST_SECONDS));
}

/** Coste en reputación del siguiente nivel de una rama, o null si está al máximo. */
export function legacyCost(state: GameState, branch: C.LegacyBranch): number | null {
  const lvl = state.legacy[branch];
  return lvl >= C.LEGACY_MAX_LVL ? null : C.LEGACY_COSTS[lvl];
}
