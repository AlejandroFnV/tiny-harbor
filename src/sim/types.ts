/** Tipos del estado de juego. Todo serializable a JSON (save). */

import type { LegacyBranch, TraitId } from "./config";

export type BoatPhase = "out" | "fishing" | "in" | "ready";

/** Patrón contratado en la taberna. Vive en su barco; se va al prestigiar. */
export interface Skipper {
  name: string;
  trait: TraitId;
}

export interface Boat {
  id: number;
  /** Índice en BOAT_TIERS. */
  tier: number;
  speedLvl: number;
  capLvl: number;
  phase: BoatPhase;
  /** Segundos transcurridos dentro de la fase actual. */
  phaseT: number;
  /** Valor de la carga cuando phase === "ready" (fijado al llegar). */
  cargo: number;
  skipper: Skipper | null;
}

/** Candidato esperando en la taberna. El coste se fija al aparecer. */
export interface TavernCandidate {
  name: string;
  trait: TraitId;
  cost: number;
}

export type MissionKind =
  | "collect"      // cobra N cargas
  | "buy_boat"     // compra N barcos del tier T
  | "upgrade"      // haz N mejoras (velocidad o capacidad)
  | "earn"         // gana X monedas (esta vuelta)
  | "unlock_zone"  // desbloquea la zona Z
  | "hire_manager" // contrata/sube gestor
  | "hire_skipper" // ficha un patrón en la taberna
  | "dock"         // amplía el muelle
  | "lonja";       // amplía la lonja

export interface Mission {
  id: number;
  kind: MissionKind;
  /** Parámetro según kind: tier, zona… */
  param: number;
  target: number;
  progress: number;
  reward: number;
  /** true cuando está completada y pendiente de reclamar (se auto-reclama con toast). */
  done: boolean;
  text: string;
}

export type ActiveEventKind = "frenzy" | "storm";

/** Pedido de la lonja: cliente pide X de pesca en T segundos por un bono. */
export interface ActiveOrder {
  stage: "offer" | "active";
  /** Pesca (monedas ganadas) que pide. */
  goal: number;
  /** Progreso acumulado desde que se aceptó. */
  progress: number;
  /** Segundos restantes de la fase actual (oferta o cuenta atrás). */
  remaining: number;
  reward: number;
}

export interface ActiveEvent {
  kind: ActiveEventKind;
  /** Segundos restantes de la fase actual del evento. */
  remaining: number;
  /** Tormenta: "warning" (decidiendo) | "active". Frenzy siempre "active". */
  stage: "warning" | "active";
  /** Tormenta: decisión tomada. */
  choice?: "shelter" | "risk";
  /** Frenzy: taps que quedan con burst. */
  tapsLeft: number;
}

export interface GameState {
  version: number;
  money: number;
  /** Ganancias acumuladas en la vuelta actual (para prestigio). */
  lifetime: number;
  /** Ganancias acumuladas totales (histórico, stats). */
  totalEarned: number;
  /** Reputación DISPONIBLE (se gasta en el árbol de legado). */
  reputation: number;
  /** Reputación ganada total (nunca baja; de aquí sale el multiplicador). */
  repEarned: number;
  prestiges: number;

  boats: Boat[];
  nextBoatId: number;
  dockLevel: number;
  /** Ampliaciones de la lonja (+ingresos, sin techo). Se resetea al prestigiar. */
  lonjaLvl: number;
  managerLvl: number;
  /** Timer interno del gestor (s hasta el próximo auto-cobro). */
  managerT: number;
  /** Índice de la zona más lejana desbloqueada. */
  zonesUnlocked: number;

  missions: Mission[];
  nextMissionId: number;
  missionsDone: number;

  event: ActiveEvent | null;
  /** Segundos hasta el próximo evento. */
  eventT: number;

  order: ActiveOrder | null;
  /** Segundos hasta el próximo pedido de la lonja. */
  orderT: number;

  /** Pescadoteca: ids de especies descubiertas. PERSISTE entre prestigios. */
  discovered: string[];

  /** Taberna: candidatos a patrón. Se resetea al prestigiar. */
  tavern: { candidates: TavernCandidate[]; refreshT: number };
  /** Árbol de legado: nivel por rama. PERSISTE entre prestigios. */
  legacy: Record<LegacyBranch, number>;
  /** Logros conseguidos (ids). PERSISTEN entre prestigios. */
  achievements: string[];

  /** Racha de cobro manual: eslabones y segundos de vida que le quedan. */
  combo: { n: number; t: number };

  /** Reloj de pared (ms epoch) de la última vez que se vio el juego (offline calc). */
  lastSeen: number;
  /** Tiempo total jugado (s, esta vuelta). */
  playTime: number;
  tutorialStep: number;

  settings: { muted: boolean; music: boolean };
  stats: {
    collects: number;
    boatsBought: number;
    upgrades: number;
    taps: number;
    ordersDone: number;
    stormsRisked: number;
    skippersHired: number;
    bestCombo: number;
    goldenCatches: number;
  };
  rngSeed: number;
}

/** Eventos que emite la sim para que render/audio reaccionen. Sin DOM aquí. */
export type SimEvent =
  | { kind: "arrive"; boatId: number }
  | { kind: "depart"; boatId: number }
  | { kind: "collect"; boatId: number; amount: number; auto: boolean }
  | { kind: "cargo_lost"; boatId: number; amount: number }
  | { kind: "event_start"; event: ActiveEventKind }
  | { kind: "event_end"; event: ActiveEventKind }
  | { kind: "mission_done"; missionId: number; reward: number; text: string }
  | { kind: "order_offer"; goal: number; reward: number }
  | { kind: "order_done"; reward: number }
  | { kind: "order_gone" }
  | { kind: "species_found"; id: string }
  | { kind: "skipper_hired"; name: string; boatId: number }
  | { kind: "achievement"; id: string }
  | { kind: "golden"; boatId: number; amount: number };
