/** Fórmulas de coste/ingreso. Puras: (state|args) → número. */

import * as C from "./config";
import type { Boat, GameState } from "./types";

// --- Multiplicadores globales ------------------------------------------------

export function prestigeMult(state: GameState): number {
  // Sobre la reputación GANADA total: gastar en el legado no baja el multiplicador.
  // Curva ^0.75: los primeros puntos rinden como siempre, la cola no rompe el juego.
  return 1 + Math.pow(state.repEarned, C.PRESTIGE_MULT_CURVE) * C.PRESTIGE_MULT_PER_REP;
}

/** Bonus de la lonja ampliada (+15% por nivel; se pierde al vender el puerto). */
export function lonjaMult(state: GameState): number {
  return 1 + state.lonjaLvl * C.LONJA_INCOME_BONUS;
}

/** Bonus de racha de cobro manual (el primer cobro no bonifica). */
export function comboMult(state: GameState): number {
  return 1 + Math.max(0, state.combo.n - 1) * C.COMBO_STEP;
}

export function hasRelic(state: GameState, id: string): boolean {
  return state.relics.includes(id);
}

/** Tope de racha (el mascarón de sirena lo alarga). */
export function comboMax(state: GameState): number {
  return C.COMBO_MAX + (hasRelic(state, "mascaron") ? C.RELIC_COMBO_EXTRA : 0);
}

/** Multiplicador combinado de las reliquias que tocan ingresos. */
export function relicIncomeMult(state: GameState): number {
  let m = 1;
  if (hasRelic(state, "redvieja")) m *= 1 + C.RELIC_CARGO;
  if (hasRelic(state, "moneda")) m *= 1 + C.RELIC_INCOME;
  if (hasRelic(state, "perlanegra")) m *= 1 + C.RELIC_PRESTIGE_INCOME * state.prestiges;
  return m;
}

/** Precio vivo de la lonja (mercado). */
export function marketMult(state: GameState): number {
  return state.market.mult;
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
  if (ev.kind === "storm" && ev.choice === "risk") {
    return C.STORM_RISK_MULT * (hasRelic(state, "colmillo") ? 1 + C.RELIC_STORM_BONUS : 1);
  }
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

/** Descuento del ancla dorada sobre mejoras de barco. */
function upgradeDiscount(state: GameState | null): number {
  return state && hasRelic(state, "anclaoro") ? 1 - C.RELIC_UPGRADE_DISCOUNT : 1;
}

export function speedUpgradeCost(boat: Boat, state: GameState | null = null): number {
  const def = C.BOAT_TIERS[boat.tier];
  return Math.ceil(def.baseCost * C.SPEED_COST_FACTOR * Math.pow(C.COST_GROWTH, boat.speedLvl) * upgradeDiscount(state));
}

export function capUpgradeCost(boat: Boat, state: GameState | null = null): number {
  const def = C.BOAT_TIERS[boat.tier];
  return Math.ceil(def.baseCost * C.CAP_COST_FACTOR * Math.pow(C.COST_GROWTH, boat.capLvl) * upgradeDiscount(state));
}

/** Duración total del ciclo de un barco (s): zona, velocidad, patrón y escuela. */
export function cycleTime(state: GameState, boat: Boat): number {
  const def = C.BOAT_TIERS[boat.tier];
  const zone = C.ZONES[state.zonesUnlocked];
  let speed = 1 + C.SPEED_BONUS * boat.speedLvl;
  if (boat.skipper?.trait === "rapido") speed *= 1 + C.TRAIT_SPEED_BONUS;
  speed *= 1 + C.LEGACY_ESCUELA_SPEED * state.legacy.escuela;
  if (hasRelic(state, "brujula")) speed *= 1 + C.RELIC_SPEED;
  return (def.cycle * zone.distMult) / speed;
}

/** Valor de la carga que trae un barco (sin multiplicador de evento). */
export function cargoValue(state: GameState, boat: Boat): number {
  const def = C.BOAT_TIERS[boat.tier];
  const zone = C.ZONES[state.zonesUnlocked];
  let v =
    def.baseCargo * (1 + C.CAP_BONUS * boat.capLvl) * zone.valueMult *
    prestigeMult(state) * speciesMult(state) * achievementMult(state) * lonjaMult(state) *
    relicIncomeMult(state) * marketMult(state);
  if (boat.skipper?.trait === "redes") v *= 1 + C.TRAIT_CARGO_BONUS;
  v *= 1 + C.LEGACY_ASTILLERO_CARGO * state.legacy.astillero;
  return v;
}

/** Multiplicador de probabilidad de descubrir especie al cobrar un barco. */
export function speciesChanceMult(state: GameState, boat: Boat): number {
  let m = 1 + C.LEGACY_FARO_SPECIES * state.legacy.faro;
  if (boat.skipper?.trait === "ojo") m *= C.TRAIT_SPECIES_MULT;
  if (hasRelic(state, "catalejo")) m *= 1 + C.RELIC_SPECIES;
  return m;
}

/** ¿Está este barco fuera, de expedición? (no pesca, no se dibuja, no se cobra). */
export function isAway(state: GameState, boatId: number): boolean {
  return state.expedition !== null && state.expedition.boatId === boatId;
}

/** Ingresos medios por segundo de toda la flota (para offline, misiones, UI). */
export function incomeRate(state: GameState): number {
  let rate = 0;
  for (const b of state.boats) {
    if (isAway(state, b.id)) continue;
    rate += cargoValue(state, b) / cycleTime(state, b);
  }
  return rate;
}

/** Duración real de una expedición (el timón de roble las acorta). */
export function expeditionDuration(state: GameState, defIndex: number): number {
  const def = C.EXPEDITIONS[defIndex];
  return def.dur * (hasRelic(state, "timon") ? 1 - C.RELIC_EXPEDITION_TIME : 1);
}

/** Botín de una expedición para un barco: lo que habría pescado × factor. */
export function expeditionBooty(state: GameState, boat: Boat, defIndex: number): number {
  const def = C.EXPEDITIONS[defIndex];
  return (cargoValue(state, boat) / cycleTime(state, boat)) * def.dur * def.factor;
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

export function lonjaCost(state: GameState): number {
  return Math.ceil(C.LONJA_BASE_COST * Math.pow(C.LONJA_COST_GROWTH, state.lonjaLvl));
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

/** Umbral de venta de ESTA vuelta: cada puerto vendido pide el triple que el anterior. */
export function prestigeThreshold(state: GameState): number {
  return C.PRESTIGE_MIN_LIFETIME * Math.pow(C.PRESTIGE_THRESHOLD_GROWTH, state.prestiges);
}

export function canPrestige(state: GameState): boolean {
  return state.lifetime >= prestigeThreshold(state);
}

export function prestigeGain(state: GameState): number {
  if (!canPrestige(state)) return 0;
  return Math.floor(Math.cbrt(state.lifetime / C.PRESTIGE_REP_DIVISOR));
}

// --- Offline ---------------------------------------------------------------------

export function offlineCapSeconds(state: GameState): number {
  // El Faro Viejo (legado) y el farolillo (reliquia) amplían el cofre por encima del techo.
  return (
    Math.min(C.OFFLINE_CAP_MAX_S, C.OFFLINE_CAP_BASE_S + state.dockLevel * C.OFFLINE_CAP_PER_DOCK_S) +
    state.legacy.faro * C.LEGACY_FARO_OFFLINE_S +
    (hasRelic(state, "farolillo") ? C.RELIC_OFFLINE_S : 0)
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
