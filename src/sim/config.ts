/**
 * config.ts — TODO el balance del juego vive aquí.
 * Tunear números = tocar solo este archivo.
 * Los tests de pacing (test/pacing.test.ts) verifican que estos números
 * cumplen la curva diseñada; si cambias algo gordo, corre `npm test`.
 */

export const SAVE_VERSION = 11;
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
  { id: "palangrero", name: "Palangrero", baseCost: 8_000_000, cycle: 72, baseCargo: 2_200_000, hull: "#3f8f7a", size: 3.1 },
  { id: "atunero", name: "Atunero", baseCost: 110_000_000, cycle: 85, baseCargo: 36_000_000, hull: "#5464a8", size: 3.4 },
  { id: "factoria", name: "Buque factoría", baseCost: 1_500_000_000, cycle: 100, baseCargo: 550_000_000, hull: "#8a4a68", size: 3.8 },
  // El Alba: barco de leyenda ÚNICO (exige las 4 leyendas). No sale en el astillero normal.
  { id: "alba", name: "El Alba", baseCost: 200_000_000, cycle: 45, baseCargo: 18_000_000, hull: "#e8e2d0", size: 3.2 },
];

/** Índice de El Alba en BOAT_TIERS. Único: 1 por flota; inmune a tormenta y kraken; imán de especies. */
export const ALBA_TIER = 8;
/** Multiplicador de prob. de especies cuando cobra El Alba. */
export const ALBA_SPECIES_MULT = 5;

/** Nº máximo de barcos totales (rendimiento móvil + legibilidad de escena). */
export const MAX_BOATS = 14;

// Mejoras por barco -----------------------------------------------------------
/** Coste mejora velocidad = tier.baseCost * SPEED_COST_FACTOR * COST_GROWTH^lvl */
export const SPEED_COST_FACTOR = 0.35;
/**
 * Reducción de ciclo: cycle / (1 + SPEED_BONUS * lvl).
 * v1.8: 0.08 → 0.13. Con 0.08, capacidad daba ×1.94 más ingreso por moneda que
 * velocidad en TODOS los niveles (dominada estricta). Ahora queda ~×1.2: capacidad
 * sigue mandando en $/s puro, pero velocidad da más ciclos = más tiradas de
 * especie/dorada/racha, y esa es su gracia.
 */
export const SPEED_BONUS = 0.13;
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
  { id: "fosa",    name: "La Fosa",   unlockCost: 40_000_000, valueMult: 48, distMult: 2.6 },
  { id: "hielo",   name: "Mar de Hielo", unlockCost: 700_000_000, valueMult: 105, distMult: 3.0 },
  { id: "confin",  name: "El Fin del Mapa", unlockCost: 12_000_000_000, valueMult: 240, distMult: 3.4 },
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
/**
 * Ganancias de la vuelta necesarias para la PRIMERA venta; cada venta
 * multiplica el umbral ×PRESTIGE_THRESHOLD_GROWTH (cada puerto vale más
 * que el anterior → no se puede spamear la venta).
 */
export const PRESTIGE_MIN_LIFETIME = 400_000;
export const PRESTIGE_THRESHOLD_GROWTH = 3;
/**
 * v1.6.1: el umbral también recuerda tu última venta — el próximo puerto pide
 * superar en este factor lo que GANASTE con el anterior. Sin esto, vender con
 * mucho overshoot (umbral 400k, venta con 5M) dejaba el siguiente umbral (1.2M)
 * por debajo de lo ya demostrado y se podía re-vender en 2-3 minutos.
 */
export const PRESTIGE_BEAT_FACTOR = 1.4;
/**
 * Reputación ganada = floor(cbrt(lifetime / PRESTIGE_REP_DIVISOR)).
 * Raíz cúbica (v1.3, antes sqrt): con el contenido v1.2 llegando a lifetimes
 * de decenas de B, sqrt daba cientos de rep en una vuelta y el multiplicador
 * rompía el juego tras el primer prestigio.
 */
export const PRESTIGE_REP_DIVISOR = 50_000;
/**
 * Multiplicador permanente = 1 + PER_REP × repEarned^CURVE.
 * La curva <1 doma la cola: rep 2 → +20%, rep 100 → ×4.8, rep 1000 → ×22
 * (con la lineal vieja: rep 1000 → ×121 = juego roto).
 */
export const PRESTIGE_MULT_PER_REP = 0.12;
export const PRESTIGE_MULT_CURVE = 0.75;

// ---------------------------------------------------------------------------
// La Lonja (ampliaciones infinitas — sumidero de dinero del late game)
// ---------------------------------------------------------------------------
/** Coste = LONJA_BASE_COST × LONJA_COST_GROWTH^nivel. Sin techo de niveles. */
export const LONJA_BASE_COST = 15_000;
export const LONJA_COST_GROWTH = 3.5;
/** Bonus de ingresos por nivel (aditivo: ×(1 + bonus·nivel)). Se pierde al prestigiar. */
export const LONJA_INCOME_BONUS = 0.15;

// ---------------------------------------------------------------------------
// Racha de cobro manual (combo) — premia el juego activo
// ---------------------------------------------------------------------------
/** Segundos entre cobros manuales para mantener la racha viva. */
export const COMBO_WINDOW_S = 4;
/** Bonus por eslabón de racha (el primer cobro no bonifica). */
export const COMBO_STEP = 0.04;
/** Eslabones máximos (bonus máximo = STEP × (MAX - 1)). */
export const COMBO_MAX = 15;

// ---------------------------------------------------------------------------
// Captura dorada — cobro manual con suerte
// ---------------------------------------------------------------------------
/** Probabilidad por cobro MANUAL de que la carga sea dorada (×GOLDEN_MULT). */
export const GOLDEN_CHANCE = 0.03;
export const GOLDEN_MULT = 3;

// ---------------------------------------------------------------------------
// El clima del día (se sortea con cada amanecer; la tormenta-evento va aparte)
// ---------------------------------------------------------------------------
export interface WeatherDef {
  id: string;
  name: string;
  desc: string;
  /** Pesos de sorteo. */
  weight: number;
  /** Multiplicadores suaves. */
  cargoMult: number;
  speedMult: number;
  speciesMult: number;
  /** Multiplicador del intervalo entre cofres a la deriva (<1 = más frecuentes). */
  driftMult: number;
}

export const WEATHERS: WeatherDef[] = [
  { id: "despejado", name: "Despejado", desc: "Un día de postal", weight: 40, cargoMult: 1, speedMult: 1, speciesMult: 1, driftMult: 1 },
  // v1.8: la niebla era un día a −15% sin contrapartida una vez completada la zona;
  // ahora también arrima cofres a la deriva (intervalo ×0.6).
  { id: "niebla", name: "Niebla", desc: "Se navega despacio… y el mar arrima cosas raras y cofres", weight: 20, cargoMult: 1, speedMult: 0.85, speciesMult: 1.5, driftMult: 0.6 },
  { id: "llovizna", name: "Llovizna", desc: "Con lluvia fina, los peces pican", weight: 20, cargoMult: 1.1, speedMult: 1, speciesMult: 1, driftMult: 1 },
  { id: "marejada", name: "Marejada", desc: "Mar gruesa: redes llenas, ritmo lento", weight: 20, cargoMult: 1.25, speedMult: 0.85, speciesMult: 1, driftMult: 1 },
];

// ---------------------------------------------------------------------------
// El desafío del día (el MISMO para todos los jugadores: se sortea con la fecha)
// ---------------------------------------------------------------------------
export interface DailyDef {
  id: string;
  /** Stat de GameState.stats que mide el progreso (por delta desde que se asigna). */
  stat: string;
  target: number;
  text: string;
  /** true → el objetivo es ALCANZAR el valor (no acumular delta). */
  absolute?: boolean;
}

export const DAILIES: DailyDef[] = [
  { id: "cargas", stat: "collects", target: 40, text: "Cobra 40 cargas" },
  { id: "doradas", stat: "goldenCatches", target: 3, text: "Pesca 3 capturas doradas" },
  { id: "pedidos", stat: "ordersDone", target: 2, text: "Entrega 2 pedidos de la lonja" },
  { id: "cofres", stat: "driftsTapped", target: 2, text: "Pesca 2 cofres a la deriva" },
  { id: "racha", stat: "bestCombo", target: 8, text: "Encadena una racha de 8", absolute: true },
  { id: "mejoras", stat: "upgrades", target: 12, text: "Mejora barcos 12 veces" },
];
/** Recompensa = max(suelo, income × segundos). */
export const DAILY_REWARD_SECONDS = 1200;
export const DAILY_REWARD_MIN = 2_000;

// ---------------------------------------------------------------------------
// Pintura de barcos (personalización pura; 0 = color de fábrica del tier)
// ---------------------------------------------------------------------------
export const PAINTS = ["", "#c94f4f", "#4f7fc9", "#4fa06a", "#8a5aa6", "#e0a33e", "#3b3f4a"];
/** Nombre de cada color (mismo índice que PAINTS) para el toast al pintar. */
export const PAINT_NAMES = ["color de fábrica", "rojo teja", "azul ultramar", "verde mar", "violeta", "ámbar", "carbón"];

// ---------------------------------------------------------------------------
// Mercado de la lonja (precio vivo) — el timing de venta importa
// ---------------------------------------------------------------------------
/** Segundos entre pasos del precio. */
export const MARKET_STEP_S = 15;
/** Amplitud del paso aleatorio y fuerza de retorno a ×1. */
export const MARKET_VOLATILITY = 0.09;
export const MARKET_REVERSION = 0.06;
export const MARKET_MIN = 0.7;
export const MARKET_MAX = 1.5;
/** Umbral de "precio alto" para el logro de vender caro. */
export const MARKET_HIGH = 1.35;

// ---------------------------------------------------------------------------
// Cofres a la deriva (objeto tapeable en el agua)
// ---------------------------------------------------------------------------
export const DRIFT_WARMUP_S = 300;
export const DRIFT_INTERVAL_MIN_S = 150;
export const DRIFT_INTERVAL_MAX_S = 300;
/** Segundos que el objeto flota antes de hundirse. */
export const DRIFT_LIFETIME_S = 22;
/** Rarezas: madera / hierro / oro. Recompensa = income × segundos (con suelo). */
export const DRIFT_KINDS = [
  { id: "madera", name: "Cofre de madera", seconds: 25, floor: 60, weight: 68 },
  { id: "hierro", name: "Cofre de hierro", seconds: 150, floor: 400, weight: 26 },
  { id: "oro", name: "Cofre de oro", seconds: 900, floor: 2500, weight: 6 },
] as const;
/** Prob. de que un cofre de ORO traiga además una reliquia no poseída. */
export const DRIFT_GOLD_RELIC_CHANCE = 0.25;

// ---------------------------------------------------------------------------
// Expediciones (mandas tu mejor barco fuera: botín gordo diferido)
// ---------------------------------------------------------------------------
export interface ExpeditionDef {
  id: string;
  name: string;
  /** Duración en segundos de juego (corre también offline). */
  dur: number;
  /** Botín = (carga/ciclo del barco) × dur × factor. */
  factor: number;
  /** Prob. de traer una reliquia no poseída. */
  relicChance: number;
}

// v1.8: factores 1.9/2.6 → 1.6/1.8. Con 2.6, la Odisea superaba el techo teórico
// del jugador activo perfecto (racha máx × EV dorada ≈ ×1.65) sin riesgo ni
// atención: dominaba TODO. Sigue siendo la mejor jugada idle, ya no la única jugada.
export const EXPEDITIONS: ExpeditionDef[] = [
  { id: "marea", name: "Con la marea", dur: 5 * 60, factor: 1.4, relicChance: 0.08 },
  { id: "travesia", name: "Travesía", dur: 20 * 60, factor: 1.6, relicChance: 0.3 },
  { id: "odisea", name: "Odisea", dur: 60 * 60, factor: 1.8, relicChance: 1 },
];
/** Barcos mínimos para poder zarpar (el puerto no se queda vacío). */
export const EXPEDITION_MIN_BOATS = 2;

// ---------------------------------------------------------------------------
// Reliquias del pecio (colección permanente; bonus únicos, sobreviven al prestigio)
// ---------------------------------------------------------------------------
export interface RelicDef {
  id: string;
  name: string;
  desc: string;
}

export const RELICS: RelicDef[] = [
  { id: "brujula", name: "Brújula de latón", desc: "+6% de velocidad en toda la flota" },
  { id: "redvieja", name: "Red del abuelo", desc: "+6% de carga en toda la flota" },
  { id: "moneda", name: "Doblón antiguo", desc: "+4% de ingresos" },
  { id: "catalejo", name: "Catalejo rayado", desc: "+60% de probabilidad de especies" },
  { id: "anclaoro", name: "Ancla dorada", desc: "Mejoras de barco un 12% más baratas" },
  { id: "timon", name: "Timón de roble", desc: "Expediciones un 15% más cortas" },
  { id: "caracola", name: "Caracola cantora", desc: "Pedidos de la lonja: bono +30%" },
  { id: "mapapirata", name: "Mapa pirata", desc: "Cofres a la deriva casi el doble de frecuentes" },
  { id: "farolillo", name: "Farolillo de tormenta", desc: "+45 min de cofre offline" },
  { id: "mascaron", name: "Mascarón de sirena", desc: "La racha aguanta 4 eslabones más" },
  { id: "colmillo", name: "Colmillo de kraken", desc: "+25% de ingresos faenando en tormenta" },
  { id: "perlanegra", name: "Perla negra", desc: "+1% de ingresos por puerto vendido" },
  { id: "astrolabio", name: "Astrolabio de marfil", desc: "Cada toque al banco de peces rinde un 50% más" },
  { id: "boya", name: "Boya cantarina", desc: "Los cofres a la deriva flotan un 60% más antes de hundirse" },
  { id: "ojovidrio", name: "Ojo de vidrio", desc: "Las capturas doradas salen el doble de a menudo" },
  { id: "cuerda", name: "Cuerda de la suerte", desc: "3 toques extra en cada banco de peces" },
];

export const RELIC_SPEED = 0.06;
export const RELIC_CARGO = 0.06;
export const RELIC_INCOME = 0.04;
export const RELIC_SPECIES = 0.6;
export const RELIC_UPGRADE_DISCOUNT = 0.12;
export const RELIC_EXPEDITION_TIME = 0.15;
export const RELIC_ORDER_BONUS = 0.3;
export const RELIC_DRIFT_FREQ = 0.55;
export const RELIC_OFFLINE_S = 45 * 60;
export const RELIC_COMBO_EXTRA = 4;
export const RELIC_STORM_BONUS = 0.25;
export const RELIC_PRESTIGE_INCOME = 0.01;
/** Astrolabio de marfil: +50% al burst de cada toque en el banco de peces. */
export const RELIC_FRENZY_BONUS = 0.5;
/** Boya cantarina: +60% de tiempo a flote de los cofres a la deriva. */
export const RELIC_DRIFT_LIFETIME = 0.6;
/** Ojo de vidrio: multiplica la probabilidad de captura dorada. */
export const RELIC_GOLDEN_MULT = 2;
/** Cuerda de la suerte: toques extra al arrancar un banco de peces. */
export const RELIC_FRENZY_TAPS = 3;

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

/** El Kraken: solo en zonas profundas y con flota. Tap-frenesí para ahuyentarlo. */
export const KRAKEN_MIN_ZONE = 5; // La Fosa
export const KRAKEN_MIN_BOATS = 3;
/** Prob. de que el evento sea kraken (si se cumplen las condiciones). */
export const KRAKEN_CHANCE = 0.22;
export const KRAKEN_WARNING_S = 6;
export const KRAKEN_DURATION_S = 14;
/** Taps necesarios para ahuyentarlo. */
export const KRAKEN_TAPS = 18;
/** Botín al ahuyentarlo = income × estos segundos. */
export const KRAKEN_REWARD_SECONDS = 300;
/** Prob. de reliquia extra al ahuyentarlo. */
export const KRAKEN_RELIC_CHANCE = 0.3;
/** Si escapa: fracción de carga que arranca a los barcos cargados. */
export const KRAKEN_CARGO_LOSS = 0.35;
/** Soltar carga para aplacarlo (v1.8): pierdes esta fracción YA, pero se va sin botín. */
export const KRAKEN_APPEASE_LOSS = 0.15;

/** Tormenta: ventana de decisión (s) y duración del efecto (s). */
export const STORM_WARNING_S = 10;
export const STORM_DURATION_S = 25;
/** Riesgo: multiplicador de ingresos si no te refugias… */
export const STORM_RISK_MULT = 1.5;
/**
 * …pero cada barco que vuelve durante la tormenta puede perder la carga ENTERA.
 * v1.8: antes era media carga al 25% (EV de arriesgar 1.31 vs 1.0 de refugio:
 * refugiarse nunca era racional). Con carga entera al 35%, el barco que llega
 * en plena tormenta es una apuesta de verdad (EV ~0.98 por barco que arriba)
 * y el ×1.5 se gana con los que faenan sin cruzar el temporal.
 */
export const STORM_LOSS_CHANCE = 0.35;
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
/**
 * v1.8: fallar un pedido ACEPTADO retrasa al siguiente cliente más que rechazarlo
 * de entrada (antes ambos costaban lo mismo → aceptar siempre era gratis).
 */
export const ORDER_FAIL_COOLDOWN_S = 420;

// ---------------------------------------------------------------------------
// Pescadoteca (colección de especies, persiste entre prestigios)
// ---------------------------------------------------------------------------
export type SpeciesRarity = "comun" | "rara" | "epica" | "leyenda";

export interface SpeciesDef {
  id: string;
  name: string;
  /** Zona (índice en ZONES) donde se puede descubrir. Las leyendas: en su zona O MÁS ALLÁ. */
  zone: number;
  rarity: SpeciesRarity;
  /** Solo leyendas: pista visible en la pescadoteca (la condición vive en sim.ts). */
  hint?: string;
}

/** Probabilidad de descubrimiento POR COBRO (solo especies de la zona actual aún no descubiertas). */
export const SPECIES_CHANCE: Record<SpeciesRarity, number> = {
  comun: 0.07,
  rara: 0.02,
  epica: 0.006,
  leyenda: 0.014, // la puerta real es su condición, no la probabilidad
};

/** Bonus permanente de ingresos por especie descubierta (+1% cada una). */
export const SPECIES_INCOME_BONUS = 0.01;
/** Las leyendas valen +5% cada una. */
export const LEGEND_INCOME_BONUS = 0.05;

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
  { id: "delfin", name: "Delfín", zone: 1, rarity: "rara" },
  { id: "morena", name: "Morena", zone: 1, rarity: "epica" },
  // Bajío
  { id: "bonito", name: "Bonito", zone: 2, rarity: "comun" },
  { id: "merluza", name: "Merluza", zone: 2, rarity: "comun" },
  { id: "pezluna", name: "Pez luna", zone: 2, rarity: "rara" },
  { id: "mantaraya", name: "Manta raya", zone: 2, rarity: "epica" },
  // Alta mar
  { id: "atun", name: "Atún rojo", zone: 3, rarity: "comun" },
  { id: "jurel", name: "Jurel", zone: 3, rarity: "comun" },
  { id: "pezespada", name: "Pez espada", zone: 3, rarity: "rara" },
  { id: "tiburon", name: "Tiburón azul", zone: 3, rarity: "epica" },
  // Abismo
  { id: "rape", name: "Rape abisal", zone: 4, rarity: "comun" },
  { id: "pezdragon", name: "Pez dragón", zone: 4, rarity: "rara" },
  { id: "quimera", name: "Quimera abisal", zone: 4, rarity: "rara" },
  { id: "calamargigante", name: "Calamar gigante", zone: 4, rarity: "epica" },
  // La Fosa
  { id: "sable", name: "Pez sable", zone: 5, rarity: "comun" },
  { id: "granadero", name: "Granadero", zone: 5, rarity: "comun" },
  { id: "pelicano", name: "Pez pelícano", zone: 5, rarity: "rara" },
  { id: "duende", name: "Tiburón duende", zone: 5, rarity: "epica" },
  // Mar de Hielo
  { id: "bacalao", name: "Bacalao ártico", zone: 6, rarity: "comun" },
  { id: "fletan", name: "Fletán negro", zone: 6, rarity: "comun" },
  { id: "pezhielo", name: "Pez hielo", zone: 6, rarity: "rara" },
  { id: "loboartico", name: "Pez lobo ártico", zone: 6, rarity: "epica" },
  // El Fin del Mapa
  { id: "emperador", name: "Atún emperador", zone: 7, rarity: "comun" },
  { id: "medusaeterna", name: "Medusa eterna", zone: 7, rarity: "comun" },
  { id: "pezremo", name: "Pez remo", zone: 7, rarity: "rara" },
  { id: "kraken", name: "Kraken", zone: 7, rarity: "epica" },
  // Leyendas: solo aparecen si se cumple su condición (sim.ts). Desde su zona en adelante.
  { id: "reysol", name: "Rey Sol", zone: 2, rarity: "leyenda", hint: "Solo se deja ver cuando el sol está en lo más alto" },
  { id: "sierpe", name: "Sierpe de Tormenta", zone: 3, rarity: "leyenda", hint: "Solo muerde el anzuelo de quien faena bajo la tormenta" },
  { id: "farolreal", name: "Pez Farol Real", zone: 4, rarity: "leyenda", hint: "Su luz solo se distingue en plena noche" },
  { id: "aurora", name: "Medusa Aurora", zone: 4, rarity: "leyenda", hint: "Su fulgor solo se adivina entre la niebla del mar" },
  { id: "fantasma", name: "El Fantasma Blanco", zone: 7, rarity: "leyenda", hint: "Solo aparece ante manos que no paran: racha de 10 o más" },
];

// ---------------------------------------------------------------------------
// Tripulación (patrones de la taberna) — un patrón por barco, se va al prestigiar
// ---------------------------------------------------------------------------
export type TraitId = "rapido" | "redes" | "lobo" | "ojo" | "pregonero";

export interface TraitDef {
  id: TraitId;
  name: string;
  /** Descripción corta para la carta de la taberna. */
  desc: string;
}

export const TRAITS: TraitDef[] = [
  { id: "rapido", name: "Manos rápidas", desc: "Su barco navega un 28% más rápido" },
  { id: "redes", name: "Redes dobles", desc: "Su barco trae un 30% más de carga" },
  { id: "lobo", name: "Lobo de mar", desc: "Su barco nunca pierde carga en tormenta" },
  { id: "ojo", name: "Ojo avizor", desc: "Triple probabilidad de descubrir especies" },
  { id: "pregonero", name: "Pregonero", desc: "Su pesca cuenta un 60% más en pedidos" },
];

/** Efectos de rasgo (los usa economy/sim). v1.8: rápido 0.25→0.28 (acercar a redes). */
export const TRAIT_SPEED_BONUS = 0.28;
export const TRAIT_CARGO_BONUS = 0.3;
export const TRAIT_SPECIES_MULT = 3;
export const TRAIT_ORDER_MULT = 1.6;

/** Nombres de patrones (pool; el retrato sale del nombre). */
export const SKIPPER_NAMES = [
  "Marcial", "Sole", "Tano", "Chelo", "Curro", "Maruxa", "Peio", "Lola",
  "Anxo", "Reme", "Fermín", "Pura", "Xoel", "Custodia", "Bartolo", "Milagros",
  "Cosme", "Petra", "Ulises", "Amparo", "Genaro", "Balbina", "Saturio", "Nieves",
];

/** La taberna abre cuando tienes este nº de barcos. */
export const TAVERN_MIN_BOATS = 2;
/** Candidatos simultáneos en la taberna. */
export const TAVERN_SLOTS = 2;
/** Segundos hasta que llega un candidato nuevo a un asiento vacío. */
export const TAVERN_REFRESH_S = 120;
/** Coste de fichar = max(min, incomeRate × estos segundos). */
export const TAVERN_COST_SECONDS = 100;
export const TAVERN_COST_MIN = 250;

// ---------------------------------------------------------------------------
// Árbol de legado (se compra con reputación; PERSISTE entre prestigios)
// ---------------------------------------------------------------------------
export type LegacyBranch = "astillero" | "escuela" | "faro";

export interface LegacyDef {
  id: LegacyBranch;
  name: string;
  /** Descripción del efecto POR NIVEL. */
  desc: string;
}

export const LEGACY_BRANCHES: LegacyDef[] = [
  { id: "astillero", name: "Astillero familiar", desc: "+10% de carga en toda la flota" },
  { id: "escuela", name: "Escuela de navegación", desc: "+9% de velocidad en toda la flota" },
  { id: "faro", name: "El Faro Viejo", desc: "+2h de cofre offline y +35% de encontrar especies" },
];

/** Coste en reputación de cada nivel (índice = nivel a comprar - 1). */
export const LEGACY_COSTS = [1, 2, 4, 7, 12];
export const LEGACY_MAX_LVL = LEGACY_COSTS.length;

export const LEGACY_ASTILLERO_CARGO = 0.1;
/** v1.8: 0.08 → 0.09 (mismo coste de rep que astillero; la velocidad además da más tiradas). */
export const LEGACY_ESCUELA_SPEED = 0.09;
export const LEGACY_FARO_OFFLINE_S = 2 * 3600;
export const LEGACY_FARO_SPECIES = 0.35;

// ---------------------------------------------------------------------------
// Compradores del puerto (elección al vender — prestigio con decisión)
// ---------------------------------------------------------------------------
export interface BuyerDef {
  id: string;
  name: string;
  desc: string;
}

/** La Naviera (estándar) siempre está; se le suman 2 ofertas especiales. */
export const BUYERS: BuyerDef[] = [
  { id: "naviera", name: "La Naviera", desc: "El precio justo, sin letra pequeña" },
  { id: "gremio", name: "El Gremio de Armadores", desc: "Pagan un 20% más de reputación" },
  { id: "cofradia", name: "La Cofradía", desc: "Te dejan quedarte tu barco más humilde" },
  { id: "viejaguardia", name: "La Vieja Guardia", desc: "Arrancas la próxima vuelta con 10 min de ingresos en caja" },
  { id: "anticuario", name: "El Anticuario", desc: "Un 20% menos de reputación… y una reliquia que le sobra" },
];
export const BUYER_GREMIO_BONUS = 0.2;
export const BUYER_ANTICUARIO_MALUS = 0.2;
export const BUYER_VIEJAGUARDIA_SECONDS = 600;

// ---------------------------------------------------------------------------
// La Torre del Vigía (compra por vuelta: anticipa eventos y cofres)
// ---------------------------------------------------------------------------
/** Coste = max(min, income × segundos). Se pierde al vender el puerto. */
export const VIGIA_COST_SECONDS = 120;
export const VIGIA_COST_MIN = 2_000;

// ---------------------------------------------------------------------------
// El paquete del pescador (regalo diario con racha de días)
// ---------------------------------------------------------------------------
/** Horas mínimas entre regalos y horas máximas para conservar la racha. */
export const GIFT_MIN_HOURS = 20;
export const GIFT_STREAK_HOURS = 48;
/** Regalo = max(suelo, income × segundos) × mult de racha (cap). */
export const GIFT_FLOOR = 500;
export const GIFT_INCOME_SECONDS = 1800;
export const GIFT_STREAK_STEP = 0.25;
export const GIFT_STREAK_CAP = 3;

/** Nombre del puerto (personalizable): longitud máxima. */
export const PORT_NAME_MAX = 18;

// ---------------------------------------------------------------------------
// Logros (permanentes, sobreviven al prestigio; cada uno +2% de ingresos)
// ---------------------------------------------------------------------------
export const ACHIEVEMENT_INCOME_BONUS = 0.02;

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
}

/** Las condiciones viven en sim.ts (funciones puras sobre el estado). */
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "flota5", name: "Media flota", desc: "Ten 5 barcos a la vez" },
  { id: "flotafull", name: "Puerto lleno", desc: "Ocupa los 14 amarres" },
  { id: "pesquero1", name: "Palabras mayores", desc: "Bota un pesquero" },
  { id: "factoria1", name: "Industria pesada", desc: "Bota un buque factoría" },
  { id: "altamar", name: "Sin miedo", desc: "Faena en Alta mar" },
  { id: "confin", name: "El Fin del Mapa", desc: "Desbloquea el último caladero" },
  { id: "millon", name: "Primer millón", desc: "Gana 1M en total" },
  { id: "billon", name: "Leyenda de la lonja", desc: "Gana 1B en total" },
  { id: "prestigio1", name: "Empezar de cero", desc: "Vende tu primer puerto" },
  { id: "prestigio5", name: "Serial vendedor", desc: "Vende 5 puertos" },
  { id: "prestigio10", name: "Magnate del puerto", desc: "Vende 10 puertos" },
  { id: "peces10", name: "Coleccionista", desc: "Descubre 10 especies" },
  { id: "pecesall", name: "Pescadoteca completa", desc: "Descubre TODAS las especies" },
  { id: "taps100", name: "Dedos de acero", desc: "100 taps a bancos de peces" },
  { id: "taps500", name: "Maestro del banco", desc: "500 taps a bancos de peces" },
  { id: "pedidos10", name: "Cliente fiel", desc: "Entrega 10 pedidos de la lonja" },
  { id: "tormentas5", name: "Temerario", desc: "Aguanta 5 tormentas faenando" },
  { id: "patrones3", name: "Casa llena", desc: "Ficha 3 patrones en la taberna" },
  { id: "legado1", name: "Herencia", desc: "Compra tu primera mejora de legado" },
  { id: "lonja5", name: "Puesto fijo", desc: "Amplía la lonja 5 veces" },
  { id: "racha10", name: "Manos de mercado", desc: "Encadena una racha de 10 cobros" },
  { id: "dorado5", name: "Toque de Midas", desc: "Pesca 5 capturas doradas" },
  { id: "cofres10", name: "Ojos en el agua", desc: "Pesca 10 cofres a la deriva" },
  { id: "cofres25", name: "Rastreador de cofres", desc: "Pesca 25 cofres a la deriva" },
  { id: "expedicion1", name: "Mar adentro", desc: "Completa tu primera expedición" },
  { id: "expediciones5", name: "Cartas de otro mar", desc: "Completa 5 expediciones" },
  { id: "reliquias6", name: "Vitrina del pecio", desc: "Reúne 6 reliquias" },
  { id: "reliquias12", name: "Museo del puerto", desc: "Reúne TODAS las reliquias" },
  { id: "lonjero", name: "Olfato de lonjero", desc: "Cobra 30 veces con el precio alto (×1.35+)" },
  { id: "kraken1", name: "A cañonazos de dedo", desc: "Ahuyenta al Kraken" },
  { id: "kraken5", name: "Terror de terrores", desc: "Ahuyenta al Kraken 5 veces" },
  { id: "leyenda1", name: "Cuento de taberna", desc: "Pesca tu primera leyenda" },
  { id: "leyendas4", name: "Las cuatro leyendas", desc: "Pesca 4 leyendas del mar" },
  { id: "leyendas5", name: "Todas las leyendas", desc: "Pesca las 5 leyendas del mar" },
  { id: "fiel7", name: "Sal en las venas", desc: "Vuelve al puerto 7 días seguidos" },
  { id: "alba1", name: "El amanecer", desc: "Bota El Alba, el barco de leyenda" },
  { id: "tratos3", name: "Mano izquierda", desc: "Vende 3 puertos a compradores especiales" },
  { id: "meteorologo", name: "Piel de gaviota", desc: "Cobra pesca bajo los 4 climas" },
  { id: "desafios7", name: "Palabra de puerto", desc: "Completa 7 desafíos del día" },
];

// ---------------------------------------------------------------------------
// Autosave / loop
// ---------------------------------------------------------------------------
export const AUTOSAVE_INTERVAL_S = 10;
/** Paso máximo de simulación por frame (s); por encima se trocea. */
export const MAX_TICK_STEP_S = 0.25;
/** Ciclo día/noche completo (s). */
export const DAY_CYCLE_S = 180;
