/**
 * config.ts — TODO el balance del juego vive aquí.
 * Tunear números = tocar solo este archivo.
 * Los tests de pacing (test/pacing.test.ts) verifican que estos números
 * cumplen la curva diseñada; si cambias algo gordo, corre `npm test`.
 */

export const SAVE_VERSION = 3;
export const SAVE_KEY = "tiny-harbor-save";

// ---------------------------------------------------------------------------
// Curva de costes global
// ---------------------------------------------------------------------------
/** Multiplicador de coste por unidad/nivel comprado (curva idle clásica). */
export const COST_GROWTH = 1.15;

// ---------------------------------------------------------------------------
// Barcos
// ---------------------------------------------------------------------------
export interface BoatTierDef {
  id: string;
  name: string;
  /** Coste del primer barco de este tier; crece ×COST_GROWTH por unidad. */
  baseCost: number;
  /** Segundos de ciclo completo (zarpar+pescar+volver) en zona ×1 sin mejoras. */
  cycle: number;
  /** Valor de la carga base (monedas) en zona ×1 sin mejoras. */
  baseCargo: number;
  /** Color casco (render). */
  hull: string;
  /** Longitud relativa (render). */
  size: number;
}

export const BOAT_TIERS: BoatTierDef[] = [
  { id: "bote",       name: "Bote",       baseCost: 15,      cycle: 20, baseCargo: 10,      hull: "#c97b4a", size: 1.0 },
  { id: "chalana",    name: "Chalana",    baseCost: 300,     cycle: 28, baseCargo: 95,      hull: "#5b8c5a", size: 1.3 },
  { id: "trainera",   name: "Trainera",   baseCost: 4_000,   cycle: 38, baseCargo: 900,     hull: "#4a7ba6", size: 1.7 },
  { id: "pesquero",   name: "Pesquero",   baseCost: 50_000,  cycle: 48, baseCargo: 8_500,   hull: "#8a5aa6", size: 2.2 },
  { id: "arrastrero", name: "Arrastrero", baseCost: 650_000, cycle: 60, baseCargo: 140_000, hull: "#a65a5a", size: 2.8 },
];

/** Nº máximo de barcos totales (rendimiento móvil + legibilidad de escena). */
export const MAX_BOATS = 14;

// Mejoras por barco -----------------------------------------------------------
/** Coste mejora velocidad = tier.baseCost * SPEED_COST_FACTOR * COST_GROWTH^lvl */
export const SPEED_COST_FACTOR = 0.35;
/** Reducción de ciclo: cycle / (1 + SPEED_BONUS * lvl) */
export const SPEED_BONUS = 0.08;
export const SPEED_MAX_LVL = 25;

/** Coste mejora capacidad = tier.baseCost * CAP_COST_FACTOR * COST_GROWTH^lvl */
export const CAP_COST_FACTOR = 0.45;
/** Aumento de carga: cargo * (1 + CAP_BONUS * lvl) */
export const CAP_BONUS = 0.2;
export const CAP_MAX_LVL = 25;

// ---------------------------------------------------------------------------
// Zonas de pesca (caladeros) — progresión espacial
// ---------------------------------------------------------------------------
export interface ZoneDef {
  id: string;
  name: string;
  /** Coste de desbloqueo (la zona 0 es gratis). */
  unlockCost: number;
  /** Multiplicador de valor de carga. */
  valueMult: number;
  /** Multiplicador de duración de ciclo (más lejos = más tiempo). */
  distMult: number;
}

export const ZONES: ZoneDef[] = [
  { id: "bahia",   name: "Bahía",     unlockCost: 0,         valueMult: 1,   distMult: 1 },
  { id: "costa",   name: "Costa",     unlockCost: 600,       valueMult: 2,   distMult: 1.25 },
  { id: "bajio",   name: "Bajío",     unlockCost: 10_000,    valueMult: 4.5, distMult: 1.5 },
  { id: "altamar", name: "Alta mar",  unlockCost: 150_000,   valueMult: 10,  distMult: 1.8 },
  { id: "abismo",  name: "Abismo",    unlockCost: 2_500_000, valueMult: 22,  distMult: 2.2 },
];

// ---------------------------------------------------------------------------
// Muelle (amarres)
// ---------------------------------------------------------------------------
/** Amarres iniciales. */
export const BASE_BERTHS = 3;
/** Coste de ampliar muelle = DOCK_BASE_COST * DOCK_COST_GROWTH^nivel. */
export const DOCK_BASE_COST = 250;
export const DOCK_COST_GROWTH = 4;
/** Amarres por nivel de muelle. */
export const BERTHS_PER_LEVEL = 1;
export const DOCK_MAX_LEVEL = MAX_BOATS - BASE_BERTHS;

// ---------------------------------------------------------------------------
// Gestores (transición idle: cobran solos)
// ---------------------------------------------------------------------------
/** Coste contratar/subir gestor = MANAGER_BASE_COST * MANAGER_COST_GROWTH^lvl. */
export const MANAGER_BASE_COST = 2_500;
export const MANAGER_COST_GROWTH = 7;
/** Intervalo de auto-cobro (s) por nivel de gestor (índice = nivel-1). */
export const MANAGER_INTERVALS = [6, 3, 1];
export const MANAGER_MAX_LVL = MANAGER_INTERVALS.length;

// ---------------------------------------------------------------------------
// Ganancia offline
// ---------------------------------------------------------------------------
/** Cap base de ganancia offline (segundos). 4 h. */
export const OFFLINE_CAP_BASE_S = 4 * 3600;
/** Ampliación del cap por nivel de muelle (s). "Cap ampliable". */
export const OFFLINE_CAP_PER_DOCK_S = 30 * 60;
/** Cap máximo absoluto (s). 12 h. */
export const OFFLINE_CAP_MAX_S = 12 * 3600;
/** Eficiencia offline sin gestor (los barcos esperan a que cobres). */
export const OFFLINE_EFF_NO_MANAGER = 0.5;
/** Eficiencia offline con gestor. */
export const OFFLINE_EFF_MANAGER = 1.0;
/** Mínimo de ausencia para mostrar el modal "mientras no estabas" (s). */
export const OFFLINE_MIN_S = 60;

// ---------------------------------------------------------------------------
// Prestigio ("vender el puerto")
// ---------------------------------------------------------------------------
/** Ganancias acumuladas de la vuelta necesarias para poder prestigiar. */
export const PRESTIGE_MIN_LIFETIME = 400_000;
/** Reputación ganada = floor(sqrt(lifetime / PRESTIGE_REP_DIVISOR)). */
export const PRESTIGE_REP_DIVISOR = 50_000;
/** Multiplicador de ingresos permanente por punto de reputación. */
export const PRESTIGE_MULT_PER_REP = 0.12;

// ---------------------------------------------------------------------------
// Eventos aleatorios
// ---------------------------------------------------------------------------
/** No hay eventos antes de este tiempo de partida (s). */
export const EVENT_WARMUP_S = 120;
/** Intervalo entre eventos: min + rand*(max-min) (s). */
export const EVENT_INTERVAL_MIN_S = 90;
export const EVENT_INTERVAL_MAX_S = 200;

/** Banco de peces: duración (s) y multiplicador de ingresos. */
export const FRENZY_DURATION_S = 15;
export const FRENZY_MULT = 2;
/** Cada tap al banco da un burst = FRENZY_TAP_SECONDS de ingresos actuales. */
export const FRENZY_TAP_SECONDS = 1.5;
export const FRENZY_MAX_TAPS = 12;

/** Tormenta: ventana de decisión (s) y duración del efecto (s). */
export const STORM_WARNING_S = 10;
export const STORM_DURATION_S = 25;
/** Riesgo: multiplicador de ingresos si no te refugias… */
export const STORM_RISK_MULT = 1.5;
/** …pero cada barco que vuelve durante la tormenta pierde media carga con esta prob. */
export const STORM_LOSS_CHANCE = 0.25;
/** Nº mínimo de barcos para que salga tormenta (que la decisión importe). */
export const STORM_MIN_BOATS = 2;

// ---------------------------------------------------------------------------
// Misiones (3 activas, se renuevan solas)
// ---------------------------------------------------------------------------
export const ACTIVE_MISSIONS = 3;
/** Recompensa = max(MISSION_REWARD_MIN, income_rate * MISSION_REWARD_SECONDS). */
export const MISSION_REWARD_SECONDS = 75;
export const MISSION_REWARD_MIN = 30;

// ---------------------------------------------------------------------------
// Pedidos de la lonja (cliente en el muelle: "X de pesca en T segundos")
// ---------------------------------------------------------------------------
/** No hay pedidos antes de este tiempo de vuelta (s). */
export const ORDER_WARMUP_S = 240;
/** Intervalo entre pedidos (s). */
export const ORDER_INTERVAL_MIN_S = 150;
export const ORDER_INTERVAL_MAX_S = 320;
/** Objetivo = incomeRate * estos segundos (lo normal se consigue pescando bien). */
export const ORDER_GOAL_SECONDS = 45;
export const ORDER_GOAL_MIN = 100;
/** Tiempo para completarlo una vez aceptado (s). */
export const ORDER_TIME_S = 90;
/** Ventana para aceptar la oferta (s); si no, el cliente se va sin drama. */
export const ORDER_OFFER_S = 25;
/** Bono al completar = objetivo × factor. */
export const ORDER_REWARD_FACTOR = 0.6;

// ---------------------------------------------------------------------------
// Pescadoteca (colección de especies, persiste entre prestigios)
// ---------------------------------------------------------------------------
export type SpeciesRarity = "comun" | "rara" | "epica";

export interface SpeciesDef {
  id: string;
  name: string;
  /** Zona (índice en ZONES) donde se puede descubrir. */
  zone: number;
  rarity: SpeciesRarity;
}

/** Probabilidad de descubrimiento POR COBRO (solo especies de la zona actual aún no descubiertas). */
export const SPECIES_CHANCE: Record<SpeciesRarity, number> = {
  comun: 0.07,
  rara: 0.02,
  epica: 0.006,
};

/** Bonus permanente de ingresos por especie descubierta (+1% cada una). */
export const SPECIES_INCOME_BONUS = 0.01;

export const SPECIES: SpeciesDef[] = [
  // Bahía
  { id: "sardina", name: "Sardina", zone: 0, rarity: "comun" },
  { id: "boqueron", name: "Boquerón", zone: 0, rarity: "comun" },
  { id: "caballa", name: "Caballa", zone: 0, rarity: "rara" },
  { id: "caballito", name: "Caballito de mar", zone: 0, rarity: "epica" },
  // Costa
  { id: "dorada", name: "Dorada", zone: 1, rarity: "comun" },
  { id: "lubina", name: "Lubina", zone: 1, rarity: "comun" },
  { id: "pulpo", name: "Pulpo", zone: 1, rarity: "rara" },
  { id: "morena", name: "Morena", zone: 1, rarity: "epica" },
  // Bajío
  { id: "bonito", name: "Bonito", zone: 2, rarity: "comun" },
  { id: "merluza", name: "Merluza", zone: 2, rarity: "comun" },
  { id: "pezluna", name: "Pez luna", zone: 2, rarity: "rara" },
  { id: "mantaraya", name: "Manta raya", zone: 2, rarity: "epica" },
  // Alta mar
  { id: "atun", name: "Atún rojo", zone: 3, rarity: "comun" },
  { id: "pezespada", name: "Pez espada", zone: 3, rarity: "rara" },
  { id: "tiburon", name: "Tiburón azul", zone: 3, rarity: "epica" },
  // Abismo
  { id: "rape", name: "Rape abisal", zone: 4, rarity: "comun" },
  { id: "pezdragon", name: "Pez dragón", zone: 4, rarity: "rara" },
  { id: "calamargigante", name: "Calamar gigante", zone: 4, rarity: "epica" },
];

// ---------------------------------------------------------------------------
// Autosave / loop
// ---------------------------------------------------------------------------
export const AUTOSAVE_INTERVAL_S = 10;
/** Paso máximo de simulación por frame (s); por encima se trocea. */
export const MAX_TICK_STEP_S = 0.25;
/** Ciclo día/noche completo (s). */
export const DAY_CYCLE_S = 180;
