/** Fórmulas de coste/ingreso. Puras: (state|args) → número. */

import * as C from "./config";
import type { Boat, GameState } from "./types";

// --- Multiplicadores globales ------------------------------------------------

export function prestigeMult(state: GameState): number {
  return 1 + state.reputation * C.PRESTIGE_MULT_PER_REP;
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

/** Duración total del ciclo de un barco (s), contando zona y velocidad. */
export function cycleTime(state: GameState, boat: Boat): number {
  const def = C.BOAT_TIERS[boat.tier];
  const zone = C.ZONES[state.zonesUnlocked];
  return (def.cycle * zone.distMult) / (1 + C.SPEED_BONUS * boat.speedLvl);
}

/** Valor de la carga que trae un barco (sin multiplicador de evento). */
export function cargoValue(state: GameState, boat: Boat): number {
  const def = C.BOAT_TIERS[boat.tier];
  const zone = C.ZONES[state.zonesUnlocked];
  return def.baseCargo * (1 + C.CAP_BONUS * boat.capLvl) * zone.valueMult * prestigeMult(state);
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
  return Math.min(
    C.OFFLINE_CAP_MAX_S,
    C.OFFLINE_CAP_BASE_S + state.dockLevel * C.OFFLINE_CAP_PER_DOCK_S,
  );
}
