/** Misiones: 3 activas, se renuevan solas al completarse. */

import * as C from "./config";
import { incomeRate } from "./economy";
import { nextRand } from "./rng";
import type { GameState, Mission, MissionKind, SimEvent } from "./types";

interface Template {
  kind: MissionKind;
  /** Genera param/target/text según el estado actual (dificultad adaptativa). */
  make: (state: GameState) => { param: number; target: number; text: string } | null;
}

const TEMPLATES: Template[] = [
  {
    kind: "collect",
    make: (s) => {
      const n = 5 + Math.min(20, s.missionsDone * 3);
      return { param: 0, target: n, text: `Cobra ${n} cargas` };
    },
  },
  {
    kind: "buy_boat",
    make: (s) => {
      // Tier objetivo: el más alto que ya puedas ver como alcanzable.
      const reach = Math.max(s.money, s.lifetime * 0.5) * 4 + 100;
      let tier = 0;
      for (let i = C.BOAT_TIERS.length - 1; i >= 0; i--) {
        if (C.BOAT_TIERS[i].baseCost <= reach) {
          tier = i;
          break;
        }
      }
      const n = tier >= 2 ? 1 : 2;
      return { param: tier, target: n, text: `Compra ${n} × ${C.BOAT_TIERS[tier].name.toLowerCase()}` };
    },
  },
  {
    kind: "upgrade",
    make: (s) => {
      const n = 3 + Math.min(12, s.missionsDone * 2);
      return { param: 0, target: n, text: `Mejora barcos ${n} veces` };
    },
  },
  {
    kind: "earn",
    make: (s) => {
      const goal = Math.ceil(Math.max(200, incomeRate(s) * 240, s.lifetime * 0.3) / 10) * 10;
      return { param: 0, target: goal, text: `Gana ${goal >= 1000 ? Math.round(goal / 100) / 10 + "K" : goal} monedas` };
    },
  },
  {
    kind: "unlock_zone",
    make: (s) => {
      const next = s.zonesUnlocked + 1;
      if (next >= C.ZONES.length) return null;
      return { param: next, target: 1, text: `Desbloquea ${C.ZONES[next].name}` };
    },
  },
  {
    kind: "hire_manager",
    make: (s) => {
      if (s.managerLvl >= C.MANAGER_MAX_LVL) return null;
      return {
        param: s.managerLvl + 1,
        target: 1,
        text: s.managerLvl === 0 ? "Contrata un gestor" : "Sube el gestor de nivel",
      };
    },
  },
  {
    kind: "hire_skipper",
    make: (s) => {
      if (s.boats.length < C.TAVERN_MIN_BOATS) return null;
      if (!s.boats.some((b) => !b.skipper)) return null;
      return { param: 0, target: 1, text: "Ficha un patrón en la taberna" };
    },
  },
  {
    kind: "dock",
    make: (s) => {
      if (s.dockLevel >= C.DOCK_MAX_LEVEL) return null;
      return { param: s.dockLevel + 1, target: 1, text: "Amplía el muelle" };
    },
  },
  {
    kind: "lonja",
    make: (s) => {
      // No proponerla hasta que el coste esté a la vista del jugador.
      if (s.lifetime < C.LONJA_BASE_COST / 4) return null;
      return { param: 0, target: 1, text: "Amplía la lonja" };
    },
  },
];

function makeMission(state: GameState): Mission | null {
  // Baraja plantillas de forma determinista y coge la primera válida no repetida.
  const activeKinds = new Set(state.missions.filter((m) => !m.done).map((m) => m.kind + ":" + m.param));
  const order = [...TEMPLATES];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand(state) * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const tpl of order) {
    const spec = tpl.make(state);
    if (!spec) continue;
    if (activeKinds.has(tpl.kind + ":" + spec.param)) continue;
    const reward = Math.max(C.MISSION_REWARD_MIN, Math.ceil(incomeRate(state) * C.MISSION_REWARD_SECONDS));
    return {
      id: state.nextMissionId++,
      kind: tpl.kind,
      param: spec.param,
      target: spec.target,
      progress: 0,
      reward,
      done: false,
      text: spec.text,
    };
  }
  return null;
}

/** Rellena hasta ACTIVE_MISSIONS misiones vivas. */
export function rollMissions(state: GameState): void {
  let guard = 10;
  while (state.missions.filter((m) => !m.done).length < C.ACTIVE_MISSIONS && guard-- > 0) {
    const m = makeMission(state);
    if (!m) break;
    state.missions.push(m);
  }
  // Poda misiones ya reclamadas para que el array no crezca sin fin.
  state.missions = state.missions.filter((m) => !m.done).slice(0, C.ACTIVE_MISSIONS * 2);
}

/** Avanza progreso de misiones de un tipo; completa y paga si llega al target. */
export function bumpMission(
  state: GameState,
  kind: MissionKind,
  amount: number,
  events: SimEvent[],
  param?: number,
): void {
  for (const m of state.missions) {
    if (m.done || m.kind !== kind) continue;
    if (param !== undefined && m.param !== param) continue;
    m.progress = Math.min(m.target, m.progress + amount);
    if (m.progress >= m.target) {
      m.done = true;
      state.money += m.reward;
      state.missionsDone++;
      events.push({ kind: "mission_done", missionId: m.id, reward: m.reward, text: m.text });
    }
  }
  rollMissions(state);
}
