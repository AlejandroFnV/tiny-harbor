/** Tipos del estado de juego. Todo serializable a JSON (save). */

export type BoatPhase = "out" | "fishing" | "in" | "ready";

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
}

export type MissionKind =
  | "collect"      // cobra N cargas
  | "buy_boat"     // compra N barcos del tier T
  | "upgrade"      // haz N mejoras (velocidad o capacidad)
  | "earn"         // gana X monedas (esta vuelta)
  | "unlock_zone"  // desbloquea la zona Z
  | "hire_manager" // contrata/sube gestor
  | "dock";        // amplía el muelle

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
  reputation: number;
  prestiges: number;

  boats: Boat[];
  nextBoatId: number;
  dockLevel: number;
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

  /** Reloj de pared (ms epoch) de la última vez que se vio el juego (offline calc). */
  lastSeen: number;
  /** Tiempo total jugado (s, esta vuelta). */
  playTime: number;
  tutorialStep: number;

  settings: { muted: boolean };
  stats: { collects: number; boatsBought: number; upgrades: number; taps: number };
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
  | { kind: "mission_done"; missionId: number; reward: number; text: string };
