/**
 * Save versionado con migraciones. Cambiar el schema NO puede corromper partidas:
 * cada versión antigua pasa por su migración y después por sanitize().
 * localStorage puede fallar (incógnito, lleno): todas las IO van en try/catch
 * y el juego sigue en memoria si el disco no está.
 */

import { SAVE_KEY, SAVE_VERSION } from "./config";
import { sanitize } from "./state";
import type { GameState } from "./types";

/**
 * Migraciones: índice N transforma un save de versión N a N+1.
 * v1 → v2: se añadieron stats.taps y settings (solo muted); misiones ganaron `param`.
 * v2 → v3: pedidos de la lonja (order/orderT), pescadoteca (discovered) y settings.music.
 * v3 → v4: tripulación (skipper/taberna), árbol de legado (repEarned/legacy), logros y stats nuevas.
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
