/**
 * theme.ts — dirección de arte "cartel de puerto / risografía".
 * Paleta de tintas limitada + papel. El ciclo día/noche funde cada tinta
 * hacia su variante nocturna (como cambiar la tinta del cartel, no un filtro gris).
 */

export const INK = {
  paper: "#f2e8d5",
  paperShade: "#e5d8bd",
  ink: "#233047",
  inkSoft: "#3b4a63",
  seaDeep: "#1e5f70",
  seaMid: "#2f8290",
  seaFoam: "#8fbfae",
  coral: "#e0684b",
  mustard: "#dfa93e",
  skyDay: "#f5d9a8",
  skyDayHigh: "#f0c37e",
  skyNight: "#1b2740",
  skyNightHigh: "#111a2e",
  seaNightDeep: "#12333f",
  seaNightMid: "#1a4551",
  paperNight: "#c9c0b2",
} as const;

/** Parsea "#rrggbb" o "rgb(r,g,b)" (mix devuelve rgb(), y se re-mezcla). */
function hex(c: string): [number, number, number] {
  if (c.startsWith("#")) {
    return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  }
  const m = c.match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return [0, 0, 0];
}

export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hex(a);
  const [br, bg, bb] = hex(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/**
 * 0 = pleno día, 1 = plena noche. dayT ∈ [0,1) es la fracción del ciclo.
 * Día 55%, transiciones 10%, noche 25%.
 */
export function nightness(dayT: number): number {
  if (dayT < 0.55) return 0;
  if (dayT < 0.65) return smoothstep(0.55, 0.65, dayT);
  if (dayT < 0.9) return 1;
  return 1 - smoothstep(0.9, 1.0, dayT);
}

/** Colores de escena ya fundidos para el nivel de noche dado. */
export interface ScenePalette {
  skyTop: string;
  skyLow: string;
  seaDeep: string;
  seaMid: string;
  seaFoam: string;
  paper: string;
  ink: string;
  night: number;
}

export function scenePalette(night: number): ScenePalette {
  return {
    skyTop: mix(INK.skyDayHigh, INK.skyNightHigh, night),
    skyLow: mix(INK.skyDay, INK.skyNight, night),
    seaDeep: mix(INK.seaDeep, INK.seaNightDeep, night),
    seaMid: mix(INK.seaMid, INK.seaNightMid, night),
    seaFoam: mix(INK.seaFoam, "#4a6b70", night),
    paper: mix(INK.paper, INK.paperNight, night * 0.7),
    ink: INK.ink,
    night,
  };
}

/** RNG visual determinista (NO toca el seed de la sim). */
export function visRand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
