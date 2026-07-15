/**
 * Save versionado con migraciones. Cambiar el schema NO puede corromper partidas:
 * cada versión antigua pasa por su migración y después por sanitize().
 * localStorage puede fallar (incógnito, lleno): todas las IO van en try/catch
 * y el juego sigue en memoria si el disco no está.
 */

import { LEGACY_COSTS, SAVE_KEY, SAVE_VERSION } from "./config";
import { sanitize } from "./state";
import type { GameState } from "./types";

/**
 * Migraciones: índice N transforma un save de versión N a N+1.
 * v1 → v2: se añadieron stats.taps y settings (solo muted); misiones ganaron `param`.
 * v2 → v3: pedidos de la lonja (order/orderT), pescadoteca (discovered) y settings.music.
 * v3 → v4: tripulación (skipper/taberna), árbol de legado (repEarned/legacy), logros y stats nuevas.
 * v4 → v5: rebalance del prestigio (sqrt→cbrt): la reputación vieja se convierte a la
 *          escala nueva (rep^(2/3), mismo lifetime equivalente); lonja, racha y stats nuevas.
 * v5 → v6: mercado de la lonja, cofres a la deriva, expediciones y reliquias.
 * v6 → v7: kraken, leyendas, regalo diario, nombre del puerto y récords.
 * v7 → v8: compradores del puerto, Torre del Vigía y El Alba.
 */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => void> = {
  1: (raw) => {
    const stats = (raw.stats ?? {}) as Record<string, unknown>;
    if (typeof stats.taps !== "number") stats.taps = 0;
    raw.stats = stats;
    if (!raw.settings || typeof raw.settings !== "object") raw.settings = { muted: false };
    if (Array.isArray(raw.missions)) {
      for (const m of raw.missions as Record<string, unknown>[]) {
        if (m && typeof m === "object" && typeof m.param !== "number") m.param = 0;
      }
    }
    raw.version = 2;
  },
  2: (raw) => {
    if (!Array.isArray(raw.discovered)) raw.discovered = [];
    if (raw.order === undefined) raw.order = null;
    if (typeof raw.orderT !== "number") raw.orderT = 240;
    const settings = (raw.settings ?? { muted: false }) as Record<string, unknown>;
    if (typeof settings.music !== "boolean") settings.music = true;
    raw.settings = settings;
    raw.version = 3;
  },
  3: (raw) => {
    // La reputación pasa a ser gastable: lo ganado hasta ahora se conserva como repEarned.
    if (typeof raw.repEarned !== "number") raw.repEarned = typeof raw.reputation === "number" ? raw.reputation : 0;
    if (!raw.legacy || typeof raw.legacy !== "object") raw.legacy = { astillero: 0, escuela: 0, faro: 0 };
    if (!Array.isArray(raw.achievements)) raw.achievements = [];
    if (!raw.tavern || typeof raw.tavern !== "object") raw.tavern = { candidates: [], refreshT: 120 };
    if (Array.isArray(raw.boats)) {
      for (const b of raw.boats as Record<string, unknown>[]) {
        if (b && typeof b === "object" && b.skipper === undefined) b.skipper = null;
      }
    }
    const stats = (raw.stats ?? {}) as Record<string, unknown>;
    if (typeof stats.ordersDone !== "number") stats.ordersDone = 0;
    if (typeof stats.stormsRisked !== "number") stats.stormsRisked = 0;
    if (typeof stats.skippersHired !== "number") stats.skippersHired = 0;
    raw.stats = stats;
    raw.version = 4;
  },
  4: (raw) => {
    // Rebalance v1.3: la rep se ganaba con sqrt(lifetime/div) y ahora con cbrt.
    // Convertimos lo ganado a la escala nueva preservando el lifetime equivalente:
    // sqrt(L/d) = r  →  L = d·r²  →  cbrt(L/d) = r^(2/3).
    const oldEarned = typeof raw.repEarned === "number" && Number.isFinite(raw.repEarned) ? Math.max(0, raw.repEarned) : 0;
    const newEarned = Math.round(Math.pow(oldEarned, 2 / 3));
    // Lo gastado en el legado se respeta: se descuenta de la rep disponible nueva.
    const legacy = (raw.legacy ?? {}) as Record<string, unknown>;
    let spent = 0;
    for (const key of ["astillero", "escuela", "faro"]) {
      const lvl = typeof legacy[key] === "number" ? Math.max(0, Math.min(LEGACY_COSTS.length, Math.floor(legacy[key] as number))) : 0;
      for (let i = 0; i < lvl; i++) spent += LEGACY_COSTS[i];
    }
    raw.repEarned = newEarned;
    raw.reputation = Math.max(0, newEarned - spent);
    if (typeof raw.lonjaLvl !== "number") raw.lonjaLvl = 0;
    raw.combo = { n: 0, t: 0 };
    const stats = (raw.stats ?? {}) as Record<string, unknown>;
    if (typeof stats.bestCombo !== "number") stats.bestCombo = 0;
    if (typeof stats.goldenCatches !== "number") stats.goldenCatches = 0;
    raw.stats = stats;
    raw.version = 5;
  },
  5: (raw) => {
    raw.market = { mult: 1, t: 15, dir: 0 };
    raw.drift = null;
    if (typeof raw.driftT !== "number") raw.driftT = 300;
    raw.expedition = null;
    if (!Array.isArray(raw.relics)) raw.relics = [];
    const stats = (raw.stats ?? {}) as Record<string, unknown>;
    if (typeof stats.driftsTapped !== "number") stats.driftsTapped = 0;
    if (typeof stats.expeditionsDone !== "number") stats.expeditionsDone = 0;
    if (typeof stats.soldHigh !== "number") stats.soldHigh = 0;
    raw.stats = stats;
    raw.version = 6;
  },
  6: (raw) => {
    if (typeof raw.portName !== "string") raw.portName = "";
    raw.gift = { lastAt: 0, streak: 0 };
    const stats = (raw.stats ?? {}) as Record<string, unknown>;
    if (typeof stats.krakensRepelled !== "number") stats.krakensRepelled = 0;
    // El mejor lifetime conocido hasta ahora es el de la vuelta actual.
    if (typeof stats.bestLifetime !== "number") stats.bestLifetime = typeof raw.lifetime === "number" ? raw.lifetime : 0;
    if (typeof stats.bestRepGain !== "number") stats.bestRepGain = 0;
    if (typeof stats.bestGiftStreak !== "number") stats.bestGiftStreak = 0;
    raw.stats = stats;
    raw.version = 7;
  },
  7: (raw) => {
    if (typeof raw.vigia !== "boolean") raw.vigia = false;
    const stats = (raw.stats ?? {}) as Record<string, unknown>;
    if (typeof stats.specialSales !== "number") stats.specialSales = 0;
    raw.stats = stats;
    raw.version = 8;
  },
  8: (raw) => {
    // El umbral pasa a recordar la última venta; para saves viejos usamos el
    // mejor lifetime conocido si ya vendió alguna vez (evita el re-sell fácil).
    if (typeof raw.lastSaleLifetime !== "number") {
      const stats = (raw.stats ?? {}) as Record<string, unknown>;
      const prestiges = typeof raw.prestiges === "number" ? raw.prestiges : 0;
      const best = typeof stats.bestLifetime === "number" ? stats.bestLifetime : 0;
      raw.lastSaleLifetime = prestiges > 0 ? best : 0;
    }
    raw.version = 9;
  },
};

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/** Parsea + migra + sanea. Devuelve null si el save es irrecuperable. */
export function deserialize(json: string): GameState | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  let v = typeof obj.version === "number" && Number.isFinite(obj.version) ? obj.version : 1;
  if (v > SAVE_VERSION) return null; // save de un futuro que no entendemos

  let guard = 20;
  while (v < SAVE_VERSION && guard-- > 0) {
    const migrate = MIGRATIONS[v];
    if (!migrate) return null; // hueco en la cadena: irrecuperable
    migrate(obj);
    v = typeof obj.version === "number" ? obj.version : v + 1;
  }

  return sanitize(obj as unknown as GameState);
}

// --- IO a localStorage (única parte con side effects; tolerante a fallos) -----

export function saveToStorage(state: GameState): boolean {
  try {
    localStorage.setItem(SAVE_KEY, serialize(state));
    return true;
  } catch {
    return false; // incógnito / lleno / bloqueado → seguimos en memoria
  }
}

export function loadFromStorage(): GameState | null {
  try {
    const json = localStorage.getItem(SAVE_KEY);
    if (!json) return null;
    return deserialize(json);
  } catch {
    return null;
  }
}

export function clearStorage(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* sin drama */
  }
}
