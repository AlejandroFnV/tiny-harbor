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
  /** Pintura del casco (índice en PAINTS; 0 = color de fábrica). */
  paint: number;
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
  | "lonja"        // amplía la lonja
  | "expedition";  // manda un barco de expedición

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

export type ActiveEventKind = "frenzy" | "storm" | "kraken";

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
  /** Frenzy: taps que quedan con burst. Kraken: taps que FALTAN para ahuyentarlo. */
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
  /** Lifetime con el que se vendió el último puerto (sube el umbral siguiente). */
  lastSaleLifetime: number;

  boats: Boat[];
  nextBoatId: number;
  dockLevel: number;
  /** Ampliaciones de la lonja (+ingresos, sin techo). Se resetea al prestigiar. */
  lonjaLvl: number;
  managerLvl: number;
  /** Timer interno del gestor (s hasta el próximo auto-cobro). */
  managerT: number;
  /** Gestor en pausa (el jugador quiere cobrar a mano: rachas, doradas). */
  managerPaused: boolean;
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

  /** Mercado de la lonja: precio vivo (mult), timer del paso y dirección del último paso. */
  market: { mult: number; t: number; dir: number };

  /** Cofre a la deriva visible (o null) y segundos hasta el próximo. */
  drift: { kind: number; x: number; remaining: number } | null;
  driftT: number;

  /** Expedición activa: barco fuera y segundos que le quedan. */
  expedition: { boatId: number; def: number; remaining: number } | null;

  /** Reliquias del pecio (ids). PERSISTEN entre prestigios. */
  relics: string[];

  /** Nombre del puerto (lo pone el jugador; sale en la tarjeta de compartir). */
  portName: string;

  /** Torre del Vigía comprada esta vuelta (anticipa eventos y cofres). */
  vigia: boolean;

  /** Clima del día (índice en WEATHERS); se sortea con cada amanecer. */
  weather: number;

  /** Desafío del día (el mismo para todos): fecha, tipo y línea base del stat. */
  daily: { day: number; def: number; baseline: number; done: boolean } | null;

  /** Paquete del pescador: reloj de pared del último regalo y racha de días. */
  gift: { lastAt: number; streak: number };

  /** Reloj de pared (ms epoch) de la última vez que se vio el juego (offline calc). */
  lastSeen: number;
  /** Tiempo total jugado (s, esta vuelta). */
  playTime: number;
  tutorialStep: number;
  /** Consejos one-shot ya mostrados (racha, mercado…). PERSISTEN entre prestigios. */
  tips: string[];

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
    driftsTapped: number;
    expeditionsDone: number;
    soldHigh: number;
    krakensRepelled: number;
    specialSales: number;
    /** Bitmask de climas bajo los que se ha cobrado pesca (logro meteorólogo). */
    weathersFished: number;
    dailiesDone: number;
    /** Récords para la bitácora. */
    bestLifetime: number;
    bestRepGain: number;
    bestGiftStreak: number;
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
  | { kind: "golden"; boatId: number; amount: number }
  | { kind: "drift_spawn"; drift: number }
  | { kind: "drift_reward"; drift: number; amount: number }
  | { kind: "drift_gone" }
  | { kind: "relic_found"; id: string }
  | { kind: "expedition_done"; boatId: number; amount: number }
  | { kind: "kraken_repelled"; amount: number }
  | { kind: "kraken_escaped"; lost: number }
  | { kind: "weather_change"; weather: number }
  | { kind: "daily_done"; reward: number; text: string }
  | { kind: "kraken_appeased"; lost: number }
  | { kind: "order_failed" };
