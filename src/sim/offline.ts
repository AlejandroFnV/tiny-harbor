/** Ganancia offline: "mientras no estabas…". */

import * as C from "./config";
import { cargoValue, expeditionBooty, incomeRate, isAway, offlineCapSeconds } from "./economy";
import { nextRand } from "./rng";
import type { GameState } from "./types";

export interface OfflineResult {
  /** Segundos de ausencia contabilizados (ya con cap aplicado). */
  seconds: number;
  /** Segundos reales de ausencia (sin cap), para el texto del modal. */
  rawSeconds: number;
  earned: number;
  capped: boolean;
}

/**
 * Calcula y APLICA la ganancia offline al estado.
 * - Reloj hacia atrás (now < lastSeen) → 0 segundos, jamás negativo.
 * - Cap 4h + extensión por nivel de muelle (config), techo 12h.
 * - Sin gestor los barcos esperaban tu tap → eficiencia reducida (config).
 * Deja además los barcos amarrados con carga lista: al volver hay taps que dar.
 */
export function applyOffline(state: GameState, now: number): OfflineResult {
  const rawSeconds = Math.max(0, (now - state.lastSeen) / 1000);
  const cap = offlineCapSeconds(state);
  const seconds = Math.min(rawSeconds, cap);
  state.lastSeen = now;

  if (seconds < C.OFFLINE_MIN_S) {
    return { seconds: 0, rawSeconds, earned: 0, capped: false };
  }

  const eff = state.managerLvl > 0 ? C.OFFLINE_EFF_MANAGER : C.OFFLINE_EFF_NO_MANAGER;
  let earned = incomeRate(state) * seconds * eff;
  if (!Number.isFinite(earned) || earned < 0) earned = 0;

  // Expedición: su reloj es de pared (sin cap). Si terminó fuera, el botín entra al cofre.
  const exp = state.expedition;
  if (exp) {
    exp.remaining -= rawSeconds;
    if (exp.remaining <= 0) {
      state.expedition = null;
      const boat = state.boats.find((b) => b.id === exp.boatId);
      if (boat) {
        const booty = expeditionBooty(state, boat, exp.def);
        if (Number.isFinite(booty) && booty > 0) {
          earned += booty;
          state.stats.expeditionsDone++;
        }
        // La reliquia también llega si la expedición terminó estando fuera.
        if (nextRand(state) < C.EXPEDITIONS[exp.def].relicChance) {
          const missing = C.RELICS.filter((r) => !state.relics.includes(r.id));
          if (missing.length > 0) state.relics.push(missing[Math.floor(nextRand(state) * missing.length)].id);
        }
      }
    }
  }

  state.money += earned;
  state.lifetime += earned;
  state.totalEarned += earned;

  // Al volver, la flota está amarrada con carga fresca lista para cobrar.
  for (const boat of state.boats) {
    if (isAway(state, boat.id)) continue; // sigue de expedición
    boat.phase = "ready";
    boat.phaseT = 0;
    boat.cargo = cargoValue(state, boat);
  }

  return { seconds, rawSeconds, earned, capped: rawSeconds > cap };
}
