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
  cycleTime,
  dockCost,
  eventMult,
  managerCost,
  nextZone,
  prestigeGain,
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

function gainMoney(state: GameState, amount: number, events: SimEvent[]): void {
  state.money += amount;
  state.lifetime += amount;
  state.totalEarned += amount;
  bumpMission(state, "earn", amount, events);
}

function collectBoatInternal(state: GameState, boat: Boat, auto: boolean, events: SimEvent[]): number {
  const amount = boat.cargo * eventMult(state);
  gainMoney(state, amount, events);
  boat.cargo = 0;
  boat.phase = "out";
  boat.phaseT = 0;
  state.stats.collects++;
  events.push({ kind: "collect", boatId: boat.id, amount, auto });
  events.push({ kind: "depart", boatId: boat.id });
  bumpMission(state, "collect", 1, events);
  return amount;
}

/** Avanza la simulación dt segundos. Devuelve eventos para render/audio. */
export function tick(state: GameState, dt: number, events: SimEvent[] = []): SimEvent[] {
  if (!Number.isFinite(dt) || dt <= 0) return events;
  state.playTime += dt;

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
        // Tormenta arriesgada: puede perder media carga.
        if (stormActive && state.event!.choice === "risk" && nextRand(state) < C.STORM_LOSS_CHANCE) {
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

  return events;
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

export function collectBoat(state: GameState, boatId: number, events: SimEvent[] = []): ActionResult {
  const boat = state.boats.find((b) => b.id === boatId);
  if (!boat || boat.phase !== "ready") return { ok: false, reason: "not_ready" };
  const gained = collectBoatInternal(state, boat, false, events);
  return { ok: true, gained };
}

/** Cobra todos los barcos listos (botón "cobrar todo" del gestor manual). */
export function collectAll(state: GameState, events: SimEvent[] = []): ActionResult {
  let gained = 0;
  for (const boat of state.boats) {
    if (boat.phase === "ready") gained += collectBoatInternal(state, boat, false, events);
  }
  return gained > 0 ? { ok: true, gained } : { ok: false, reason: "none_ready" };
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

/** Decisión de tormenta durante la ventana de aviso. */
export function resolveStorm(state: GameState, choice: "shelter" | "risk"): ActionResult {
  const ev = state.event;
  if (!ev || ev.kind !== "storm" || ev.stage !== "warning") return { ok: false, reason: "no_storm" };
  ev.choice = choice;
  ev.stage = "active";
  ev.remaining = C.STORM_DURATION_S;
  return { ok: true };
}

/** Prestigio: vende el puerto → reputación permanente, reinicio de la vuelta. */
export function doPrestige(state: GameState, now: number): ActionResult {
  if (!canPrestige(state)) return { ok: false, reason: "not_yet" };
  const gain = prestigeGain(state);
  if (gain <= 0) return { ok: false, reason: "no_gain" };

  state.reputation += gain;
  state.prestiges++;
  state.money = 0;
  state.lifetime = 0;
  state.boats = [];
  state.nextBoatId = 1;
  state.boats.push(newBoat(state, 0));
  state.dockLevel = 0;
  state.managerLvl = 0;
  state.managerT = 0;
  state.zonesUnlocked = 0;
  state.missions = [];
  state.missionsDone = 0;
  state.event = null;
  state.eventT = C.EVENT_WARMUP_S;
  state.playTime = 0;
  state.lastSeen = now;
  rollMissions(state);
  return { ok: true, gained: gain };
}
