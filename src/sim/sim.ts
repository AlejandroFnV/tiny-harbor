/**
 * sim.ts — corazón de la simulación. Puro: sin DOM, sin Date.now, sin Math.random.
 * El tiempo entra por parámetro (dt en segundos, now en ms cuando hace falta).
 */

import * as C from "./config";
import {
  berths,
  boatCost,
  canPrestige,
  capUpgradeCost,
  cargoValue,
  comboMult,
  cycleTime,
  dockCost,
  eventMult,
  incomeRate,
  legacyCost,
  lonjaCost,
  managerCost,
  nextZone,
  prestigeGain,
  skipperCost,
  speciesChanceMult,
  speedUpgradeCost,
  zoneCost,
} from "./economy";
import { bumpMission, rollMissions } from "./missions";
import { nextRand } from "./rng";
import { newBoat } from "./state";
import type { ActiveEvent, Boat, GameState, SimEvent } from "./types";

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

/** Duración de cada fase del ciclo como fracción del total: zarpa 25%, pesca 50%, vuelve 25%. */
export const PHASE_SPLIT = { out: 0.25, fishing: 0.5, in: 0.25 };

export function phaseDuration(state: GameState, boat: Boat, phase: "out" | "fishing" | "in"): number {
  return cycleTime(state, boat) * PHASE_SPLIT[phase];
}

function gainMoney(state: GameState, amount: number, events: SimEvent[], orderMult = 1): void {
  state.money += amount;
  state.lifetime += amount;
  state.totalEarned += amount;
  // Pedido de la lonja activo: toda pesca cuenta para el objetivo.
  const order = state.order;
  if (order && order.stage === "active") {
    order.progress += amount * orderMult;
    if (order.progress >= order.goal) {
      state.money += order.reward;
      state.lifetime += order.reward;
      state.totalEarned += order.reward;
      state.stats.ordersDone++;
      events.push({ kind: "order_done", reward: order.reward });
      state.order = null;
      state.orderT = C.ORDER_INTERVAL_MIN_S + nextRand(state) * (C.ORDER_INTERVAL_MAX_S - C.ORDER_INTERVAL_MIN_S);
    }
  }
  bumpMission(state, "earn", amount, events);
}

/** Tirada de descubrimiento de especie (zona actual, no descubiertas). */
function rollSpecies(state: GameState, boat: Boat, events: SimEvent[]): void {
  const mult = speciesChanceMult(state, boat);
  for (const sp of C.SPECIES) {
    if (sp.zone !== state.zonesUnlocked) continue;
    if (state.discovered.includes(sp.id)) continue;
    if (nextRand(state) < C.SPECIES_CHANCE[sp.rarity] * mult) {
      state.discovered.push(sp.id);
      events.push({ kind: "species_found", id: sp.id });
      return; // máx. una por cobro
    }
  }
}

function collectBoatInternal(state: GameState, boat: Boat, auto: boolean, events: SimEvent[]): number {
  let amount = boat.cargo * eventMult(state);
  // Cobro manual: bonifica la racha viva y puede salir dorado (×3).
  if (!auto) {
    amount *= comboMult(state);
    if (nextRand(state) < C.GOLDEN_CHANCE) {
      amount *= C.GOLDEN_MULT;
      state.stats.goldenCatches++;
      events.push({ kind: "golden", boatId: boat.id, amount });
    }
  }
  const orderMult = boat.skipper?.trait === "pregonero" ? C.TRAIT_ORDER_MULT : 1;
  gainMoney(state, amount, events, orderMult);
  boat.cargo = 0;
  boat.phase = "out";
  boat.phaseT = 0;
  state.stats.collects++;
  events.push({ kind: "collect", boatId: boat.id, amount, auto });
  events.push({ kind: "depart", boatId: boat.id });
  bumpMission(state, "collect", 1, events);
  rollSpecies(state, boat, events);
  return amount;
}

/** Avanza la simulación dt segundos. Devuelve eventos para render/audio. */
export function tick(state: GameState, dt: number, events: SimEvent[] = []): SimEvent[] {
  if (!Number.isFinite(dt) || dt <= 0) return events;
  state.playTime += dt;

  // Racha de cobro manual: caduca si pasan COMBO_WINDOW_S sin cobrar.
  if (state.combo.n > 0) {
    state.combo.t -= dt;
    if (state.combo.t <= 0) {
      state.combo.n = 0;
      state.combo.t = 0;
    }
  }

  // Barcos ------------------------------------------------------------------
  const stormActive = state.event?.kind === "storm" && state.event.stage === "active";
  const sheltered = stormActive && state.event!.choice === "shelter";

  for (const boat of state.boats) {
    if (boat.phase === "ready") continue; // esperando cobro
    if (sheltered) continue; // refugiados: el ciclo se pausa
    boat.phaseT += dt;
    // Puede cruzar varias fases en un dt grande (offline/catch-up).
    let guard = 8;
    while (guard-- > 0) {
      const dur = phaseDuration(state, boat, boat.phase as "out" | "fishing" | "in");
      if (boat.phaseT < dur) break;
      boat.phaseT -= dur;
      if (boat.phase === "out") boat.phase = "fishing";
      else if (boat.phase === "fishing") boat.phase = "in";
      else {
        // Llega a puerto con la carga.
        boat.cargo = cargoValue(state, boat);
        // Tormenta arriesgada: puede perder media carga (los lobos de mar, nunca).
        if (stormActive && state.event!.choice === "risk" && boat.skipper?.trait !== "lobo"
            && nextRand(state) < C.STORM_LOSS_CHANCE) {
          const lost = boat.cargo / 2;
          boat.cargo -= lost;
          events.push({ kind: "cargo_lost", boatId: boat.id, amount: lost });
        }
        boat.phase = "ready";
        boat.phaseT = 0;
        events.push({ kind: "arrive", boatId: boat.id });
        break;
      }
    }
  }

  // Gestor: auto-cobra barcos listos cada X segundos -------------------------
  if (state.managerLvl > 0) {
    state.managerT -= dt;
    const interval = C.MANAGER_INTERVALS[state.managerLvl - 1];
    let guard = 20;
    while (state.managerT <= 0 && guard-- > 0) {
      state.managerT += interval;
      const ready = state.boats.find((b) => b.phase === "ready");
      if (ready) collectBoatInternal(state, ready, true, events);
    }
    if (state.managerT < 0) state.managerT = 0;
  }

  // Eventos aleatorios --------------------------------------------------------
  tickEvent(state, dt, events);

  // Pedidos de la lonja ---------------------------------------------------------
  tickOrder(state, dt, events);

  // Taberna: van llegando candidatos a patrón -----------------------------------
  tickTavern(state, dt);

  // Logros ------------------------------------------------------------------------
  tickAchievements(state, events);

  return events;
}

function tickTavern(state: GameState, dt: number): void {
  if (state.boats.length < C.TAVERN_MIN_BOATS) return;
  if (state.tavern.candidates.length >= C.TAVERN_SLOTS) return;
  state.tavern.refreshT -= dt;
  if (state.tavern.refreshT > 0) return;
  state.tavern.refreshT = C.TAVERN_REFRESH_S;
  // Nombre nuevo que no esté ya sentado en la taberna ni al mando de un barco.
  const taken = new Set<string>([
    ...state.tavern.candidates.map((c) => c.name),
    ...state.boats.map((b) => b.skipper?.name ?? ""),
  ]);
  const free = C.SKIPPER_NAMES.filter((n) => !taken.has(n));
  const pool = free.length > 0 ? free : C.SKIPPER_NAMES;
  const name = pool[Math.floor(nextRand(state) * pool.length)];
  const trait = C.TRAITS[Math.floor(nextRand(state) * C.TRAITS.length)].id;
  state.tavern.candidates.push({ name, trait, cost: skipperCost(state) });
}

/** Condiciones de logro: puras sobre el estado. */
const ACHIEVEMENT_CONDS: Record<string, (s: GameState) => boolean> = {
  flota5: (s) => s.boats.length >= 5,
  flotafull: (s) => s.boats.length >= C.MAX_BOATS,
  pesquero1: (s) => s.boats.some((b) => b.tier >= 3),
  factoria1: (s) => s.boats.some((b) => b.tier >= 7),
  altamar: (s) => s.zonesUnlocked >= 3,
  confin: (s) => s.zonesUnlocked >= C.ZONES.length - 1,
  millon: (s) => s.totalEarned >= 1e6,
  billon: (s) => s.totalEarned >= 1e9,
  prestigio1: (s) => s.prestiges >= 1,
  prestigio5: (s) => s.prestiges >= 5,
  peces10: (s) => s.discovered.length >= 10,
  pecesall: (s) => s.discovered.length >= C.SPECIES.length,
  taps100: (s) => s.stats.taps >= 100,
  pedidos10: (s) => s.stats.ordersDone >= 10,
  tormentas5: (s) => s.stats.stormsRisked >= 5,
  patrones3: (s) => s.stats.skippersHired >= 3,
  legado1: (s) => s.legacy.astillero + s.legacy.escuela + s.legacy.faro >= 1,
  lonja5: (s) => s.lonjaLvl >= 5,
  racha10: (s) => s.stats.bestCombo >= 10,
  dorado5: (s) => s.stats.goldenCatches >= 5,
};

function tickAchievements(state: GameState, events: SimEvent[]): void {
  for (const def of C.ACHIEVEMENTS) {
    if (state.achievements.includes(def.id)) continue;
    const cond = ACHIEVEMENT_CONDS[def.id];
    if (cond && cond(state)) {
      state.achievements.push(def.id);
      events.push({ kind: "achievement", id: def.id });
    }
  }
}

function tickOrder(state: GameState, dt: number, events: SimEvent[]): void {
  const order = state.order;
  if (order) {
    order.remaining -= dt;
    if (order.remaining <= 0) {
      // Oferta no aceptada o tiempo agotado: el cliente se va, sin castigo.
      events.push({ kind: "order_gone" });
      state.order = null;
      state.orderT = C.ORDER_INTERVAL_MIN_S + nextRand(state) * (C.ORDER_INTERVAL_MAX_S - C.ORDER_INTERVAL_MIN_S);
    }
    return;
  }
  if (state.playTime < C.ORDER_WARMUP_S) return;
  state.orderT -= dt;
  if (state.orderT > 0) return;
  state.orderT = 0;
  const goal = Math.max(C.ORDER_GOAL_MIN, Math.ceil(incomeRate(state) * C.ORDER_GOAL_SECONDS));
  const reward = Math.ceil(goal * C.ORDER_REWARD_FACTOR);
  state.order = { stage: "offer", goal, progress: 0, remaining: C.ORDER_OFFER_S, reward };
  events.push({ kind: "order_offer", goal, reward });
}

function tickEvent(state: GameState, dt: number, events: SimEvent[]): void {
  const ev = state.event;
  if (ev) {
    ev.remaining -= dt;
    if (ev.remaining <= 0) {
      if (ev.kind === "storm" && ev.stage === "warning") {
        // Sin decisión a tiempo → los barcos se refugian solos (opción segura).
        ev.stage = "active";
        ev.choice = ev.choice ?? "shelter";
        ev.remaining = C.STORM_DURATION_S;
      } else {
        events.push({ kind: "event_end", event: ev.kind });
        state.event = null;
        state.eventT = C.EVENT_INTERVAL_MIN_S + nextRand(state) * (C.EVENT_INTERVAL_MAX_S - C.EVENT_INTERVAL_MIN_S);
      }
    }
    return;
  }
  if (state.playTime < C.EVENT_WARMUP_S) return;
  state.eventT -= dt;
  if (state.eventT > 0) return;
  state.eventT = 0; // consumido: no dejar residuo negativo

  const canStorm = state.boats.length >= C.STORM_MIN_BOATS;
  const kind = canStorm && nextRand(state) < 0.5 ? "storm" : "frenzy";
  const next: ActiveEvent =
    kind === "frenzy"
      ? { kind, stage: "active", remaining: C.FRENZY_DURATION_S, tapsLeft: C.FRENZY_MAX_TAPS }
      : { kind, stage: "warning", remaining: C.STORM_WARNING_S, tapsLeft: 0 };
  state.event = next;
  events.push({ kind: "event_start", event: kind });
}

// ---------------------------------------------------------------------------
// Acciones del jugador (todas validan; nunca dejan dinero negativo)
// ---------------------------------------------------------------------------

export interface ActionResult {
  ok: boolean;
  /** Dinero ganado por la acción (cobros). */
  gained?: number;
  reason?: string;
}

/** Alarga la racha de cobro manual (un eslabón por ACCIÓN, no por barco). */
function bumpCombo(state: GameState): void {
  state.combo.n = Math.min(C.COMBO_MAX, state.combo.n + 1);
  state.combo.t = C.COMBO_WINDOW_S;
  if (state.combo.n > state.stats.bestCombo) state.stats.bestCombo = state.combo.n;
}

export function collectBoat(state: GameState, boatId: number, events: SimEvent[] = []): ActionResult {
  const boat = state.boats.find((b) => b.id === boatId);
  if (!boat || boat.phase !== "ready") return { ok: false, reason: "not_ready" };
  bumpCombo(state);
  const gained = collectBoatInternal(state, boat, false, events);
  return { ok: true, gained };
}

/** Cobra todos los barcos listos (botón "cobrar todo" del gestor manual). */
export function collectAll(state: GameState, events: SimEvent[] = []): ActionResult {
  if (!state.boats.some((b) => b.phase === "ready")) return { ok: false, reason: "none_ready" };
  bumpCombo(state);
  let gained = 0;
  for (const boat of state.boats) {
    if (boat.phase === "ready") gained += collectBoatInternal(state, boat, false, events);
  }
  return { ok: true, gained };
}

export function buyBoat(state: GameState, tier: number, events: SimEvent[] = []): ActionResult {
  if (tier < 0 || tier >= C.BOAT_TIERS.length) return { ok: false, reason: "bad_tier" };
  if (state.boats.length >= berths(state)) return { ok: false, reason: "no_berth" };
  const cost = boatCost(state, tier);
  if (state.money < cost) return { ok: false, reason: "poor" };
  state.money -= cost;
  state.boats.push(newBoat(state, tier));
  state.stats.boatsBought++;
  bumpMission(state, "buy_boat", 1, events, tier);
  events.push({ kind: "depart", boatId: state.boats[state.boats.length - 1].id });
  return { ok: true };
}

export function upgradeBoat(
  state: GameState,
  boatId: number,
  what: "speed" | "cap",
  events: SimEvent[] = [],
): ActionResult {
  const boat = state.boats.find((b) => b.id === boatId);
  if (!boat) return { ok: false, reason: "no_boat" };
  if (what === "speed") {
    if (boat.speedLvl >= C.SPEED_MAX_LVL) return { ok: false, reason: "max" };
    const cost = speedUpgradeCost(boat);
    if (state.money < cost) return { ok: false, reason: "poor" };
    state.money -= cost;
    boat.speedLvl++;
  } else {
    if (boat.capLvl >= C.CAP_MAX_LVL) return { ok: false, reason: "max" };
    const cost = capUpgradeCost(boat);
    if (state.money < cost) return { ok: false, reason: "poor" };
    state.money -= cost;
    boat.capLvl++;
  }
  state.stats.upgrades++;
  bumpMission(state, "upgrade", 1, events);
  return { ok: true };
}

export function upgradeDock(state: GameState, events: SimEvent[] = []): ActionResult {
  if (state.dockLevel >= C.DOCK_MAX_LEVEL) return { ok: false, reason: "max" };
  const cost = dockCost(state);
  if (state.money < cost) return { ok: false, reason: "poor" };
  state.money -= cost;
  state.dockLevel++;
  bumpMission(state, "dock", 1, events, state.dockLevel);
  return { ok: true };
}

/** Amplía la lonja: +ingresos permanentes de la vuelta, coste sin techo. */
export function upgradeLonja(state: GameState, events: SimEvent[] = []): ActionResult {
  const cost = lonjaCost(state);
  if (state.money < cost) return { ok: false, reason: "poor" };
  state.money -= cost;
  state.lonjaLvl++;
  bumpMission(state, "lonja", 1, events);
  return { ok: true };
}

export function hireManager(state: GameState, events: SimEvent[] = []): ActionResult {
  if (state.managerLvl >= C.MANAGER_MAX_LVL) return { ok: false, reason: "max" };
  const cost = managerCost(state);
  if (state.money < cost) return { ok: false, reason: "poor" };
  state.money -= cost;
  state.managerLvl++;
  state.managerT = C.MANAGER_INTERVALS[state.managerLvl - 1];
  bumpMission(state, "hire_manager", 1, events, state.managerLvl);
  return { ok: true };
}

export function unlockZone(state: GameState, events: SimEvent[] = []): ActionResult {
  const next = nextZone(state);
  const cost = zoneCost(state);
  if (next === null || cost === null) return { ok: false, reason: "max" };
  if (state.money < cost) return { ok: false, reason: "poor" };
  state.money -= cost;
  state.zonesUnlocked = next;
  bumpMission(state, "unlock_zone", 1, events, next);
  return { ok: true };
}

/** Tap al banco de peces: burst de ingresos inmediato. */
export function tapShoal(state: GameState, events: SimEvent[] = []): ActionResult {
  const ev = state.event;
  if (!ev || ev.kind !== "frenzy" || ev.tapsLeft <= 0) return { ok: false, reason: "no_frenzy" };
  ev.tapsLeft--;
  let rate = 0;
  for (const b of state.boats) rate += cargoValue(state, b) / cycleTime(state, b);
  const gained = Math.max(1, rate * C.FRENZY_TAP_SECONDS);
  gainMoney(state, gained, events);
  state.stats.taps++;
  return { ok: true, gained };
}

/** Aceptar el pedido de la lonja durante la oferta. */
export function acceptOrder(state: GameState): ActionResult {
  const order = state.order;
  if (!order || order.stage !== "offer") return { ok: false, reason: "no_offer" };
  order.stage = "active";
  order.remaining = C.ORDER_TIME_S;
  order.progress = 0;
  return { ok: true };
}

/** Rechazar el pedido: el cliente se va y el siguiente llegará más tarde. */
export function declineOrder(state: GameState): ActionResult {
  const order = state.order;
  if (!order || order.stage !== "offer") return { ok: false, reason: "no_offer" };
  state.order = null;
  state.orderT = C.ORDER_INTERVAL_MIN_S + nextRand(state) * (C.ORDER_INTERVAL_MAX_S - C.ORDER_INTERVAL_MIN_S);
  return { ok: true };
}

/** Decisión de tormenta durante la ventana de aviso. */
export function resolveStorm(state: GameState, choice: "shelter" | "risk"): ActionResult {
  const ev = state.event;
  if (!ev || ev.kind !== "storm" || ev.stage !== "warning") return { ok: false, reason: "no_storm" };
  ev.choice = choice;
  ev.stage = "active";
  ev.remaining = C.STORM_DURATION_S;
  if (choice === "risk") state.stats.stormsRisked++;
  return { ok: true };
}

/** Ficha al candidato `index` de la taberna: va al mejor barco sin patrón. */
export function hireSkipper(state: GameState, index: number, events: SimEvent[] = []): ActionResult {
  const cand = state.tavern.candidates[index];
  if (!cand) return { ok: false, reason: "no_candidate" };
  const free = state.boats.filter((b) => !b.skipper);
  if (free.length === 0) return { ok: false, reason: "no_boat" };
  if (state.money < cand.cost) return { ok: false, reason: "poor" };
  state.money -= cand.cost;
  // Al mando del barco más valioso sin patrón (donde el rasgo rinde más).
  const boat = free.reduce((a, b) => (cargoValue(state, b) > cargoValue(state, a) ? b : a));
  boat.skipper = { name: cand.name, trait: cand.trait };
  state.tavern.candidates.splice(index, 1);
  state.tavern.refreshT = C.TAVERN_REFRESH_S;
  state.stats.skippersHired++;
  bumpMission(state, "hire_skipper", 1, events);
  events.push({ kind: "skipper_hired", name: cand.name, boatId: boat.id });
  return { ok: true };
}

/** Compra el siguiente nivel de una rama del legado (cuesta reputación). */
export function buyLegacy(state: GameState, branch: C.LegacyBranch, events: SimEvent[] = []): ActionResult {
  const cost = legacyCost(state, branch);
  if (cost === null) return { ok: false, reason: "max" };
  if (state.reputation < cost) return { ok: false, reason: "poor" };
  state.reputation -= cost;
  state.legacy[branch]++;
  tickAchievements(state, events);
  return { ok: true };
}

/** Prestigio: vende el puerto → reputación permanente, reinicio de la vuelta. */
export function doPrestige(state: GameState, now: number): ActionResult {
  if (!canPrestige(state)) return { ok: false, reason: "not_yet" };
  const gain = prestigeGain(state);
  if (gain <= 0) return { ok: false, reason: "no_gain" };

  state.reputation += gain;
  state.repEarned += gain;
  state.prestiges++;
  state.money = 0;
  state.lifetime = 0;
  state.boats = [];
  state.nextBoatId = 1;
  state.boats.push(newBoat(state, 0));
  state.dockLevel = 0;
  state.lonjaLvl = 0;
  state.managerLvl = 0;
  state.managerT = 0;
  state.zonesUnlocked = 0;
  state.combo = { n: 0, t: 0 };
  state.missions = [];
  state.missionsDone = 0;
  state.event = null;
  state.eventT = C.EVENT_WARMUP_S;
  state.order = null;
  state.orderT = C.ORDER_WARMUP_S;
  state.tavern = { candidates: [], refreshT: C.TAVERN_REFRESH_S };
  // NO se resetean: discovered (pescadoteca), legacy, achievements, repEarned.
  state.playTime = 0;
  state.lastSeen = now;
  rollMissions(state);
  return { ok: true, gained: gain };
}
