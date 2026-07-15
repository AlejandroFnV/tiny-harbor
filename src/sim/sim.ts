/**
 * sim.ts — corazón de la simulación. Puro: sin DOM, sin Date.now, sin Math.random.
 * El tiempo entra por parámetro (dt en segundos, now en ms cuando hace falta).
 */

import * as C from "./config";
import {
  albaUnlocked,
  berths,
  boatCost,
  buyerGain,
  canPrestige,
  capUpgradeCost,
  cargoValue,
  comboMax,
  comboMult,
  cycleTime,
  dockCost,
  eventMult,
  expeditionBooty,
  expeditionDuration,
  giftAmount,
  hasRelic,
  incomeRate,
  isAway,
  isMidday,
  isNight,
  legacyCost,
  lonjaCost,
  managerCost,
  nextZone,
  ownsAlba,
  prestigeOffers,
  skipperCost,
  speciesChanceMult,
  speedUpgradeCost,
  vigiaCost,
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
  if (state.lifetime > state.stats.bestLifetime) state.stats.bestLifetime = state.lifetime;
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

/** Condiciones de las leyendas: el CUÁNDO importa más que la suerte. */
const LEGEND_CONDS: Record<string, (s: GameState) => boolean> = {
  reysol: (s) => isMidday(s),
  sierpe: (s) => s.event?.kind === "storm" && s.event.stage === "active" && s.event.choice === "risk",
  farolreal: (s) => isNight(s),
  fantasma: (s) => s.combo.n >= 10,
};

/** Tirada de descubrimiento de especie (zona actual, no descubiertas). */
function rollSpecies(state: GameState, boat: Boat, events: SimEvent[]): void {
  const mult = speciesChanceMult(state, boat);
  for (const sp of C.SPECIES) {
    if (sp.rarity === "leyenda") {
      // Las leyendas: desde su zona en adelante, y SOLO si se cumple su condición.
      if (state.zonesUnlocked < sp.zone) continue;
      if (!LEGEND_CONDS[sp.id]?.(state)) continue;
    } else if (sp.zone !== state.zonesUnlocked) {
      continue;
    }
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
    if (state.market.mult >= C.MARKET_HIGH) state.stats.soldHigh++;
    state.stats.weathersFished |= 1 << state.weather; // logro meteorólogo
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
  const dayBefore = Math.floor(state.playTime / C.DAY_CYCLE_S);
  state.playTime += dt;

  // Con cada amanecer se sortea el clima del día.
  if (Math.floor(state.playTime / C.DAY_CYCLE_S) > dayBefore) {
    const total = C.WEATHERS.reduce((s, w) => s + w.weight, 0);
    let roll = nextRand(state) * total;
    for (let i = 0; i < C.WEATHERS.length; i++) {
      roll -= C.WEATHERS[i].weight;
      if (roll <= 0) {
        if (state.weather !== i) events.push({ kind: "weather_change", weather: i });
        state.weather = i;
        break;
      }
    }
  }

  // Desafío del día: progreso medido como delta del stat desde la asignación.
  tickDaily(state, events);

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
    if (isAway(state, boat.id)) continue; // de expedición: su ciclo no corre
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
        // Tormenta arriesgada: puede perder media carga (lobos de mar y El Alba, nunca).
        if (stormActive && state.event!.choice === "risk" && boat.skipper?.trait !== "lobo"
            && boat.tier !== C.ALBA_TIER && nextRand(state) < C.STORM_LOSS_CHANCE) {
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
      const ready = state.boats.find((b) => b.phase === "ready" && !isAway(state, b.id));
      if (ready) collectBoatInternal(state, ready, true, events);
    }
    if (state.managerT < 0) state.managerT = 0;
  }

  // Mercado de la lonja: paseo aleatorio con retorno a ×1 ---------------------
  tickMarket(state, dt);

  // Cofres a la deriva ---------------------------------------------------------
  tickDrift(state, dt, events);

  // Expedición: el barco vuelve con el botín -----------------------------------
  tickExpedition(state, dt, events);

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

/** Progreso del desafío del día (0..target) leyendo el stat correspondiente. */
export function dailyProgress(state: GameState): number {
  const d = state.daily;
  if (!d) return 0;
  const def = C.DAILIES[d.def];
  const value = (state.stats as unknown as Record<string, number>)[def.stat] ?? 0;
  return Math.min(def.target, def.absolute ? value : value - d.baseline);
}

function tickDaily(state: GameState, events: SimEvent[]): void {
  const d = state.daily;
  if (!d || d.done) return;
  const def = C.DAILIES[d.def];
  if (dailyProgress(state) >= def.target) {
    d.done = true;
    state.stats.dailiesDone++;
    const reward = Math.ceil(Math.max(C.DAILY_REWARD_MIN, incomeRate(state) * C.DAILY_REWARD_SECONDS));
    gainMoney(state, reward, events);
    events.push({ kind: "daily_done", reward, text: def.text });
  }
}

/**
 * Asigna el desafío del día si toca (fecha real → el MISMO reto para todo el mundo).
 * La llama main al abrir/volver, como el regalo diario.
 */
export function checkDaily(state: GameState, now: number): boolean {
  const day = Math.floor(now / 86_400_000);
  if (state.daily && state.daily.day === day) return false;
  // Sorteo por fecha (determinista global, sin gastar el RNG de la partida).
  let seed = (day * 2654435761) >>> 0;
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  const def = Math.floor(r * C.DAILIES.length);
  const stat = (state.stats as unknown as Record<string, number>)[C.DAILIES[def].stat] ?? 0;
  state.daily = { day, def, baseline: stat, done: false };
  return true;
}

/** Cambia la pintura del casco (cicla por PAINTS). */
export function paintBoat(state: GameState, boatId: number): ActionResult {
  const boat = state.boats.find((b) => b.id === boatId);
  if (!boat) return { ok: false, reason: "no_boat" };
  boat.paint = (boat.paint + 1) % C.PAINTS.length;
  return { ok: true };
}

function tickMarket(state: GameState, dt: number): void {
  state.market.t -= dt;
  let guard = 40; // catch-up acotado en dt grandes (offline corto)
  while (state.market.t <= 0 && guard-- > 0) {
    state.market.t += C.MARKET_STEP_S;
    const prev = state.market.mult;
    const step = (nextRand(state) * 2 - 1) * C.MARKET_VOLATILITY + (1 - prev) * C.MARKET_REVERSION;
    state.market.mult = Math.min(C.MARKET_MAX, Math.max(C.MARKET_MIN, prev + step));
    state.market.dir = state.market.mult > prev ? 1 : state.market.mult < prev ? -1 : 0;
  }
  if (state.market.t < 0) state.market.t = 0;
}

/** Elige una reliquia aún no poseída (o null si están todas). */
function rollRelic(state: GameState): string | null {
  const missing = C.RELICS.filter((r) => !state.relics.includes(r.id));
  if (missing.length === 0) return null;
  return missing[Math.floor(nextRand(state) * missing.length)].id;
}

function grantRelic(state: GameState, events: SimEvent[]): void {
  const id = rollRelic(state);
  if (!id) return;
  state.relics.push(id);
  events.push({ kind: "relic_found", id });
}

function tickDrift(state: GameState, dt: number, events: SimEvent[]): void {
  const drift = state.drift;
  if (drift) {
    drift.remaining -= dt;
    if (drift.remaining <= 0) {
      state.drift = null;
      scheduleDrift(state);
      events.push({ kind: "drift_gone" });
    }
    return;
  }
  if (state.playTime < C.DRIFT_WARMUP_S) return;
  state.driftT -= dt;
  if (state.driftT > 0) return;
  // Rareza por pesos (madera/hierro/oro).
  const total = C.DRIFT_KINDS.reduce((s, k) => s + k.weight, 0);
  let roll = nextRand(state) * total;
  let kind = 0;
  for (let i = 0; i < C.DRIFT_KINDS.length; i++) {
    roll -= C.DRIFT_KINDS[i].weight;
    if (roll <= 0) {
      kind = i;
      break;
    }
  }
  state.drift = { kind, x: 0.12 + nextRand(state) * 0.76, remaining: C.DRIFT_LIFETIME_S };
  state.driftT = 0;
  events.push({ kind: "drift_spawn", drift: kind });
}

function scheduleDrift(state: GameState): void {
  let t = C.DRIFT_INTERVAL_MIN_S + nextRand(state) * (C.DRIFT_INTERVAL_MAX_S - C.DRIFT_INTERVAL_MIN_S);
  if (hasRelic(state, "mapapirata")) t *= C.RELIC_DRIFT_FREQ;
  state.driftT = t;
}

function tickExpedition(state: GameState, dt: number, events: SimEvent[]): void {
  const exp = state.expedition;
  if (!exp) return;
  exp.remaining -= dt;
  if (exp.remaining > 0) return;
  completeExpedition(state, events);
}

/** Cierra la expedición activa: paga botín, tira reliquia y trae el barco. */
export function completeExpedition(state: GameState, events: SimEvent[]): void {
  const exp = state.expedition;
  if (!exp) return;
  state.expedition = null; // antes del botín: el barco vuelve a contar
  const boat = state.boats.find((b) => b.id === exp.boatId);
  if (!boat) return;
  const def = C.EXPEDITIONS[exp.def];
  const booty = expeditionBooty(state, boat, exp.def);
  gainMoney(state, booty, events);
  state.stats.expeditionsDone++;
  if (nextRand(state) < def.relicChance) grantRelic(state, events);
  boat.phase = "out";
  boat.phaseT = 0;
  boat.cargo = 0;
  events.push({ kind: "expedition_done", boatId: boat.id, amount: booty });
  events.push({ kind: "depart", boatId: boat.id });
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
  cofres10: (s) => s.stats.driftsTapped >= 10,
  expedicion1: (s) => s.stats.expeditionsDone >= 1,
  expediciones5: (s) => s.stats.expeditionsDone >= 5,
  reliquias6: (s) => s.relics.length >= 6,
  reliquias12: (s) => s.relics.length >= C.RELICS.length,
  lonjero: (s) => s.stats.soldHigh >= 30,
  kraken1: (s) => s.stats.krakensRepelled >= 1,
  kraken5: (s) => s.stats.krakensRepelled >= 5,
  alba1: (s) => s.boats.some((b) => b.tier === C.ALBA_TIER),
  tratos3: (s) => s.stats.specialSales >= 3,
  meteorologo: (s) => s.stats.weathersFished === (1 << C.WEATHERS.length) - 1,
  desafios7: (s) => s.stats.dailiesDone >= 7,
  leyenda1: (s) => s.discovered.some((id) => LEGEND_CONDS[id] !== undefined),
  leyendas4: (s) => Object.keys(LEGEND_CONDS).every((id) => s.discovered.includes(id)),
  fiel7: (s) => s.stats.bestGiftStreak >= 7,
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
  const rewardFactor = C.ORDER_REWARD_FACTOR * (hasRelic(state, "caracola") ? 1 + C.RELIC_ORDER_BONUS : 1);
  const reward = Math.ceil(goal * rewardFactor);
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
      } else if (ev.kind === "kraken" && ev.stage === "warning") {
        ev.stage = "active";
        ev.remaining = C.KRAKEN_DURATION_S;
      } else {
        // Kraken sin ahuyentar: arranca carga a los barcos cargados y se sumerge.
        if (ev.kind === "kraken" && ev.tapsLeft > 0) {
          let lost = 0;
          for (const b of state.boats) {
            if (b.cargo > 0 && b.tier !== C.ALBA_TIER) { // El Alba no se deja morder
              const bite = b.cargo * C.KRAKEN_CARGO_LOSS;
              b.cargo -= bite;
              lost += bite;
            }
          }
          events.push({ kind: "kraken_escaped", lost });
        }
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

  // El Kraken solo asoma en aguas profundas y con flota que morder.
  const canKraken = state.zonesUnlocked >= C.KRAKEN_MIN_ZONE && state.boats.length >= C.KRAKEN_MIN_BOATS;
  if (canKraken && nextRand(state) < C.KRAKEN_CHANCE) {
    state.event = { kind: "kraken", stage: "warning", remaining: C.KRAKEN_WARNING_S, tapsLeft: C.KRAKEN_TAPS };
    events.push({ kind: "event_start", event: "kraken" });
    return;
  }

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
  state.combo.n = Math.min(comboMax(state), state.combo.n + 1);
  state.combo.t = C.COMBO_WINDOW_S;
  if (state.combo.n > state.stats.bestCombo) state.stats.bestCombo = state.combo.n;
}

/** Tap al cofre a la deriva: recompensa según rareza (el oro puede traer reliquia). */
export function tapDrift(state: GameState, events: SimEvent[] = []): ActionResult {
  const drift = state.drift;
  if (!drift) return { ok: false, reason: "no_drift" };
  const def = C.DRIFT_KINDS[drift.kind];
  const gained = Math.max(def.floor, incomeRate(state) * def.seconds);
  state.drift = null;
  scheduleDrift(state);
  gainMoney(state, gained, events);
  state.stats.driftsTapped++;
  if (drift.kind === 2 && nextRand(state) < C.DRIFT_GOLD_RELIC_CHANCE) grantRelic(state, events);
  events.push({ kind: "drift_reward", drift: drift.kind, amount: gained });
  return { ok: true, gained };
}

/** Zarpa la expedición `defIndex` con el barco más valioso (queda fuera hasta volver). */
export function startExpedition(state: GameState, defIndex: number, events: SimEvent[] = []): ActionResult {
  if (defIndex < 0 || defIndex >= C.EXPEDITIONS.length) return { ok: false, reason: "bad_def" };
  if (state.expedition) return { ok: false, reason: "busy" };
  if (state.boats.length < C.EXPEDITION_MIN_BOATS) return { ok: false, reason: "few_boats" };
  const boat = state.boats.reduce((a, b) => (cargoValue(state, b) > cargoValue(state, a) ? b : a));
  state.expedition = { boatId: boat.id, def: defIndex, remaining: expeditionDuration(state, defIndex) };
  boat.phase = "out";
  boat.phaseT = 0;
  boat.cargo = 0;
  bumpMission(state, "expedition", 1, events);
  return { ok: true };
}

export function collectBoat(state: GameState, boatId: number, events: SimEvent[] = []): ActionResult {
  const boat = state.boats.find((b) => b.id === boatId);
  if (!boat || boat.phase !== "ready" || isAway(state, boatId)) return { ok: false, reason: "not_ready" };
  bumpCombo(state);
  const gained = collectBoatInternal(state, boat, false, events);
  return { ok: true, gained };
}

/** Cobra todos los barcos listos (botón "cobrar todo" del gestor manual). */
export function collectAll(state: GameState, events: SimEvent[] = []): ActionResult {
  if (!state.boats.some((b) => b.phase === "ready" && !isAway(state, b.id))) return { ok: false, reason: "none_ready" };
  bumpCombo(state);
  let gained = 0;
  for (const boat of state.boats) {
    if (boat.phase === "ready" && !isAway(state, boat.id)) gained += collectBoatInternal(state, boat, false, events);
  }
  return { ok: true, gained };
}

export function buyBoat(state: GameState, tier: number, events: SimEvent[] = []): ActionResult {
  if (tier < 0 || tier >= C.BOAT_TIERS.length) return { ok: false, reason: "bad_tier" };
  // El Alba: exige las 4 leyendas y es único.
  if (tier === C.ALBA_TIER) {
    if (!albaUnlocked(state)) return { ok: false, reason: "locked" };
    if (ownsAlba(state)) return { ok: false, reason: "unique" };
  }
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
    const cost = speedUpgradeCost(boat, state);
    if (state.money < cost) return { ok: false, reason: "poor" };
    state.money -= cost;
    boat.speedLvl++;
  } else {
    if (boat.capLvl >= C.CAP_MAX_LVL) return { ok: false, reason: "max" };
    const cost = capUpgradeCost(boat, state);
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

/** Compra la Torre del Vigía (por vuelta): anticipa eventos y cofres. */
export function buyVigia(state: GameState): ActionResult {
  if (state.vigia) return { ok: false, reason: "owned" };
  const cost = vigiaCost(state);
  if (state.money < cost) return { ok: false, reason: "poor" };
  state.money -= cost;
  state.vigia = true;
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

/** Tap al Kraken: cada golpe cuenta; al completarlos, huye y suelta el botín. */
export function tapKraken(state: GameState, events: SimEvent[] = []): ActionResult {
  const ev = state.event;
  if (!ev || ev.kind !== "kraken" || ev.stage !== "active" || ev.tapsLeft <= 0) {
    return { ok: false, reason: "no_kraken" };
  }
  ev.tapsLeft--;
  state.stats.taps++;
  if (ev.tapsLeft > 0) return { ok: true };
  // Ahuyentado: botín gordo + posible reliquia; el evento se cierra ya.
  const reward = Math.max(1, incomeRate(state) * C.KRAKEN_REWARD_SECONDS);
  gainMoney(state, reward, events);
  state.stats.krakensRepelled++;
  if (nextRand(state) < C.KRAKEN_RELIC_CHANCE) grantRelic(state, events);
  events.push({ kind: "kraken_repelled", amount: reward });
  events.push({ kind: "event_end", event: "kraken" });
  state.event = null;
  state.eventT = C.EVENT_INTERVAL_MIN_S + nextRand(state) * (C.EVENT_INTERVAL_MAX_S - C.EVENT_INTERVAL_MIN_S);
  return { ok: true, gained: reward };
}

/** El paquete del pescador: regalo diario con racha (reloj de pared). */
export function claimGift(state: GameState, now: number, events: SimEvent[] = []): { day: number; amount: number } | null {
  const hoursSince = (now - state.gift.lastAt) / 3_600_000;
  if (state.gift.lastAt > 0 && hoursSince < C.GIFT_MIN_HOURS) return null;
  const keepStreak = state.gift.lastAt > 0 && hoursSince <= C.GIFT_STREAK_HOURS;
  state.gift.streak = keepStreak ? state.gift.streak + 1 : 1;
  state.gift.lastAt = now;
  if (state.gift.streak > state.stats.bestGiftStreak) state.stats.bestGiftStreak = state.gift.streak;
  const amount = giftAmount(state, state.gift.streak);
  gainMoney(state, amount, events);
  tickAchievements(state, events);
  return { day: state.gift.streak, amount };
}

/** Renombra el puerto (se recorta y limpia; vacío = vuelve al nombre por defecto). */
export function renamePort(state: GameState, name: string): ActionResult {
  state.portName = name.replace(/\s+/g, " ").trim().slice(0, C.PORT_NAME_MAX);
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

/**
 * Prestigio: vende el puerto → reputación permanente, reinicio de la vuelta.
 * `buyerId` (v1.6): comprador elegido entre prestigeOffers() — cada uno con su trato.
 */
export function doPrestige(state: GameState, now: number, buyerId = "naviera", events: SimEvent[] = []): ActionResult {
  if (!canPrestige(state)) return { ok: false, reason: "not_yet" };
  // El comprador debe estar sobre la mesa (o ser la Naviera de siempre).
  if (buyerId !== "naviera" && !prestigeOffers(state).some((b) => b.id === buyerId)) {
    return { ok: false, reason: "bad_buyer" };
  }
  const gain = buyerGain(state, buyerId);
  if (gain <= 0) return { ok: false, reason: "no_gain" };

  // Efectos del trato que dependen del estado PREVIO al reset.
  const startCash = buyerId === "viejaguardia" ? incomeRate(state) * C.BUYER_VIEJAGUARDIA_SECONDS : 0;
  let keptBoat: Boat | null = null;
  if (buyerId === "cofradia" && state.boats.length >= 2) {
    keptBoat = state.boats.reduce((a, b) => (cargoValue(state, b) < cargoValue(state, a) ? b : a));
  }

  state.reputation += gain;
  state.repEarned += gain;
  state.prestiges++;
  state.lastSaleLifetime = state.lifetime; // el próximo puerto pedirá superarte
  if (gain > state.stats.bestRepGain) state.stats.bestRepGain = gain;
  if (buyerId !== "naviera") state.stats.specialSales++;
  state.money = Math.max(0, startCash);
  state.lifetime = 0;
  state.boats = [];
  state.nextBoatId = 1;
  state.boats.push(newBoat(state, 0));
  if (keptBoat) {
    // La Cofradía: tu barco más humilde te espera en el muelle, sin patrón y descargado.
    keptBoat.id = state.nextBoatId++;
    keptBoat.skipper = null;
    keptBoat.cargo = 0;
    keptBoat.phase = "out";
    keptBoat.phaseT = 0;
    state.boats.push(keptBoat);
  }
  state.dockLevel = 0;
  state.lonjaLvl = 0;
  state.managerLvl = 0;
  state.managerT = 0;
  state.zonesUnlocked = 0;
  state.combo = { n: 0, t: 0 };
  state.vigia = false;
  if (buyerId === "anticuario") grantRelic(state, events);
  state.missions = [];
  state.missionsDone = 0;
  state.event = null;
  state.eventT = C.EVENT_WARMUP_S;
  state.order = null;
  state.orderT = C.ORDER_WARMUP_S;
  state.tavern = { candidates: [], refreshT: C.TAVERN_REFRESH_S };
  state.drift = null;
  state.driftT = C.DRIFT_WARMUP_S;
  state.expedition = null; // el barco se vende con el puerto, botín incluido
  // NO se resetean: discovered (pescadoteca), legacy, achievements, repEarned,
  // relics (reliquias) ni market (el precio de la lonja es del mundo, no tuyo).
  state.playTime = 0;
  state.lastSeen = now;
  rollMissions(state);
  return { ok: true, gained: gain };
}
