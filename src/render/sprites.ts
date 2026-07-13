/**
 * sprites.ts — arte pixel del juego, dibujado a mano en mapas de caracteres.
 * Cada sprite: filas de chars → colores de la paleta (día/noche interpolada).
 * Los sprites se rasterizan a canvas y se cachean por (sprite, paso de noche).
 */

import { BOAT_TIERS } from "../sim/config";
import { mix } from "./theme";

// ---------------------------------------------------------------------------
// Paleta: [día, noche]. La noche se interpola (16 pasos cacheables).
// ---------------------------------------------------------------------------
const RAMP: Record<string, [string, string]> = {
  skyHi: ["#f7dca8", "#111a2e"],
  skyLo: ["#f1b377", "#1d2942"],
  seaFar: ["#8fc9b6", "#2a4d55"],
  sea1: ["#4aa39b", "#21454d"],
  sea2: ["#2f8289", "#193a43"],
  sea3: ["#216271", "#132e37"],
  seaFg: ["#184c59", "#0e232c"],
  foam: ["#f0f8ec", "#93a8a8"],
  ink: ["#2b3245", "#20263a"],
  wood: ["#bb8c55", "#5f4b34"],
  wood2: ["#906339", "#483620"],
  paper: ["#f7efdb", "#918b77"],
  coral: ["#e3664b", "#8e4737"],
  roof: ["#2d3754", "#1d2539"],
  must: ["#eab14e", "#d3a54e"],
  white: ["#fbf6e8", "#bcb7a6"],
  sail: ["#f3e9d0", "#8d8672"],
  glassDay: ["#3a7590", "#3a7590"], // la ventana de noche se enciende (paso, no lerp)
  glassLit: ["#f2cf6f", "#f2cf6f"],
};

export interface PixelPalette {
  [key: string]: string;
}

const paletteCache = new Map<number, PixelPalette>();

/** Paleta interpolada al paso de noche (0..NIGHT_STEPS). */
export const NIGHT_STEPS = 16;

export function palette(nightStep: number): PixelPalette {
  const cached = paletteCache.get(nightStep);
  if (cached) return cached;
  const t = nightStep / NIGHT_STEPS;
  const p: PixelPalette = {};
  for (const [k, [day, night]] of Object.entries(RAMP)) p[k] = mix(day, night, t);
  // Ventanas: apagadas de día, encendidas de noche (escalón en t=0.4).
  p.win = t > 0.4 ? p.glassLit : p.glassDay;
  // Cascos por tier (mismo apagado nocturno que la madera).
  BOAT_TIERS.forEach((tier, i) => {
    p[`hull${i}`] = mix(tier.hull, "#463328", t * 0.65);
  });
  paletteCache.set(nightStep, p);
  return p;
}

// ---------------------------------------------------------------------------
// Sprites
// ---------------------------------------------------------------------------
export interface Sprite {
  id: string;
  w: number;
  h: number;
  rows: string[];
  /** char → clave de paleta ("hull" se resuelve a hull<tier> al dibujar). */
  legend: Record<string, string>;
}

function sprite(id: string, legend: Record<string, string>, rows: string[]): Sprite {
  return { id, w: Math.max(...rows.map((r) => r.length)), h: rows.length, rows, legend };
}

const L_BOAT = { I: "ink", H: "hull", C: "coral", P: "paper", W: "win", S: "sail", M: "must", R: "roof", F: "foam", D: "wood", d: "wood2" };

// --- barcos (proa a la derecha; la fila inferior es la línea de flotación) ---

export const BOATS: Sprite[] = [
  // 0 · Bote — remos y banderín
  sprite("bote", L_BOAT, [
    "......CC........",
    "......CCC.......",
    "......I.........",
    "......I.........",
    ".IIIIIIIIIIIII..",
    "IIHHHHHHHHHHHII.",
    ".IHHHHHHHHHHHI..",
    "..IHHHHHHHHII...",
    "...IIIIIIII.....",
  ]),
  // 1 · Chalana — cabina pequeña a popa
  sprite("chalana", L_BOAT, [
    "....CC................",
    "....CCC...............",
    "....I.................",
    ".PPPPPPP..............",
    ".PWWIWWP..............",
    ".PPPPPPP..............",
    "IIIIIIIIIIIIIIIIIIII..",
    "IHHHHHHHHHHHHHHHHHHII.",
    ".IHFFHHHHHHHHHHHHHHI..",
    "..IHHHHHHHHHHHHHHII...",
    "...IIIIIIIIIIIIII.....",
  ]),
  // 2 · Trainera — cabina + chimenea + mástil
  sprite("trainera", L_BOAT, [
    ".......RR..........CC.......",
    ".......RR..........CCC......",
    ".......RR..........I........",
    "..PPPPPPPPP........I........",
    "..PWWIIIWWP........I........",
    "..PPPPPPPPP........I........",
    "..PPPPPPPPP........I........",
    "IIIIIIIIIIIIIIIIIIIIIIIIII..",
    "IHHHHHHHHHHHHHHHHHHHHHHHHII.",
    ".IHFFHHHHHHHHHHHHHHHHHHHHI..",
    ".IHHHHHHHHHHHHHHHHHHHHHHI...",
    "..IHHHHHHHHHHHHHHHHHHHII....",
    "...IIIIIIIIIIIIIIIIIII......",
  ]),
  // 3 · Pesquero — puente alto + pluma de carga
  sprite("pesquero", L_BOAT, [
    "..........I................CC......",
    "..........I...............CCC......",
    "..........I...............I........",
    "..........II..............I........",
    "...RRRRRR..II..............I........",
    "...RPPPPR....II............I........",
    "...RPWWPR......II..........I........",
    "...RPPPPR........II........I........",
    "..PPPPPPPP.........II......I........",
    "..PWWIIWWP...........I.....I........",
    "..PPPPPPPP...........I.....I........",
    "IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII...",
    "IHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHII..",
    ".IHFFFHHHHHHHHHHHHHHHHHHHHHHHHHHHI..",
    ".IHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHI...",
    "..IHHHHHHHHHHHHHHHHHHHHHHHHHHHII....",
    "...IHHHHHHHHHHHHHHHHHHHHHHHHHI......",
    "....IIIIIIIIIIIIIIIIIIIIIIIII.......",
  ]),
  // 4 · Arrastrero — dos alturas + pórtico de arrastre (patas hasta cubierta)
  sprite("arrastrero", L_BOAT, [
    "......................II.....II.............",
    "......................IIIIIIIII.............",
    "......................II.....II.....CC......",
    "...RRRRRRRR...........II.....II....CCC......",
    "...RPPPPPPR...........II.....II....I........",
    "...RPWWWWPR...........II.....II....I........",
    "...RPPPPPPR...........II.....II....I........",
    "..PPPPPPPPPP..........II.....II....I........",
    "..PWWIIIIWWP..........II.....II....I........",
    "..PPPPPPPPPP..........II.....II....I........",
    "..PPPPPPPPPP..........II.....II....I........",
    "IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII..",
    "IHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHII.",
    ".IHFFFFHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHI..",
    ".IHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHI...",
    "..IHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHI....",
    "...IHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHII.....",
    "....IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII.......",
  ]),
];

// --- carga lista para cobrar -------------------------------------------------
export const CRATES = sprite("crates", L_BOAT, [
  "..MMMMM...",
  "..MIIIM...",
  "..MMMMM...",
  "MMMMMMMMM.",
  "MIIIMIIIM.",
  "MMMMMMMMM.",
]);

export const BUBBLE = sprite("bubble", { I: "ink", P: "white", M: "must" }, [
  "...PPPPP...",
  "..PPPPPPP..",
  ".PPPMMMPPP.",
  ".PPMMMMMPP.",
  ".PPMMIMMPP.",
  ".PPMMMMMPP.",
  ".PPPMMMPPP.",
  "..PPPPPPP..",
  "...PPPPP...",
  ".....PP....",
  ".....P.....",
]);

// --- pueblo -------------------------------------------------------------------
const L_TOWN = { I: "ink", P: "paper", W: "win", C: "coral", M: "must", R: "roof", D: "wood", d: "wood2", F: "white", G: "seaFg" };

export const LIGHTHOUSE = sprite("lighthouse", L_TOWN, [
  ".....RR.....",
  "....RRRR....",
  "...IIIIII...",
  "...IMMMMI...",
  "...IMMMMI...",
  "...IIIIII...",
  "....FFFF....",
  "....FFFF....",
  "....CCCC....",
  "....CCCC....",
  "....FFFF....",
  "....FFFF....",
  "...FFFFFF...",
  "...CCCCCC...",
  "...CCCCCC...",
  "...FFFFFF...",
  "...FFFFFF...",
  "..FFFFFFFF..",
  "..FFFFFFFF..",
  ".IIIIIIIIII.",
  ".IIIIIIIIII.",
]);

/** Props bajos para el muelle cercano (no tapan barcos amarrados). */
export const BARRELS = sprite("barrels", L_TOWN, [
  "..dd..dd..",
  ".dDDddDDd.",
  ".dDDddDDd.",
  ".dddddddd.",
]);

export const CRATE_PILE = sprite("cratePile", L_TOWN, [
  "...MMMM....",
  "...MIIM....",
  "MMMMMMMMMM.",
  "MIIMMMMIIM.",
  "MMMMMMMMMM.",
]);

export const NET_RACK = sprite("netRack", { I: "ink", d: "wood2", G: "sea2" }, [
  "I........I",
  "IGGGGGGGGI",
  "IG.GG.GG.I",
  "IGGGGGGGGI",
  "I........I",
  "I........I",
]);

export const MARKET = sprite("market", L_TOWN, [
  "..........................",
  "CCFFCCFFCCFFCCFFCCFFCCFF..",
  "CCFFCCFFCCFFCCFFCCFFCCFF..",
  ".CFFCCFFCCFFCCFFCCFFCCF...",
  ".PPPPPPPPPPPPPPPPPPPPPP...",
  ".PPPPPPPPPPPPPPPPPPPPPP...",
  ".PPWWWWPPPPPPPPPPWWWWPP...",
  ".PPWWWWPPPPIIIIPPWWWWPP...",
  ".PPWWWWPPPPIIIIPPWWWWPP...",
  ".PPPPPPPPPPIIIIPPPPPPPP...",
  ".PPPPPPPPPPIIIIPPPPPPPP...",
]);

export const WAREHOUSE = sprite("warehouse", L_TOWN, [
  "............RRR...........",
  "......RRRRRRRRRRRRRR......",
  "....RRRRRRRRRRRRRRRRRR....",
  "..RRRRRRRRRRRRRRRRRRRRRR..",
  "RRRRRRRRRRRRRRRRRRRRRRRRRR",
  ".CCCCCCCCCCCCCCCCCCCCCCCC.",
  ".CCCCCCCCCWWWWCCCCCCCCCCC.",
  ".CCCCCCCCCWWWWCCCCCCCCCCC.",
  ".CCCCCCCCCCCCCCCCCCCCCCCC.",
  ".CCCCddddddCCCCCCCCCCCCCC.",
  ".CCCCdddIddCCCCCCCCCCCCCC.",
  ".CCCCddddddCCCCCCCCCCCCCC.",
  ".CCCCddddddCCCCCCCCCCCCCC.",
]);

export const HOUSE = sprite("house", L_TOWN, [
  "....RRRRRRRR....",
  "...RRRRRRRRRR...",
  "..RRRRRRRRRRRR..",
  ".RRRRRRRRRRRRRR.",
  "..PPPPPPPPPPPP..",
  "..PPWWWWPPPPPP..",
  "..PPWWWWPPddPP..",
  "..PPPPPPPPddPP..",
  "..PPPPPPPPddPP..",
]);

export const LAMP = sprite("lamp", { I: "ink", M: "must" }, [
  ".MMM.",
  ".MMM.",
  "..I..",
  "..I..",
  "..I..",
  "..I..",
  "..I..",
  "..I..",
  "..I..",
  ".III.",
]);

export const BOLLARD = sprite("bollard", { I: "ink" }, ["III.", "IIII", ".II."]);

export const GULL_A = sprite("gullA", { I: "ink", F: "white" }, [
  "I.....I",
  ".I.F.I.",
  "..IFI..",
]);
export const GULL_B = sprite("gullB", { I: "ink", F: "white" }, [
  ".......",
  ".IIFII.",
  "I..F..I",
]);

export const SUN = sprite("sun", { M: "must", C: "coral" }, [
  "......C......",
  "...M..C..M...",
  "....MMMMM....",
  "...MMMMMMM...",
  "..MMMMMMMMM..",
  "C.MMMMMMMMM.C",
  "..MMMMMMMMM..",
  "...MMMMMMM...",
  "....MMMMM....",
  "...M..C..M...",
  "......C......",
]);

export const MOON = sprite("moon", { F: "white" }, [
  "....FFF..",
  "..FFFFF..",
  ".FFFFF...",
  ".FFFF....",
  ".FFFF....",
  ".FFFFF...",
  "..FFFFF..",
  "....FFF..",
]);

export const CLOUDS: Sprite[] = [
  sprite("cloud1", { F: "white" }, [
    "....FFFFF.......",
    "..FFFFFFFFFF....",
    "FFFFFFFFFFFFFF..",
    ".FFFFFFFFFFFF...",
  ]),
  sprite("cloud2", { F: "white" }, [
    "...FFFF....",
    ".FFFFFFFF..",
    "FFFFFFFFFF.",
  ]),
];

export const FISH = sprite("fish", { G: "foam", I: "ink" }, [
  ".GGG..",
  "GGGGGI",
  ".GGG..",
]);

// ---------------------------------------------------------------------------
// Raster + caché
// ---------------------------------------------------------------------------
const rasterCache = new Map<string, HTMLCanvasElement>();

/**
 * Rasteriza un sprite con la paleta dada. hullTier resuelve "hull"→"hull<tier>".
 * Cachea por sprite+nightStep+tier+flip.
 */
export function raster(
  spr: Sprite,
  nightStep: number,
  opts: { hullTier?: number; flip?: boolean } = {},
): HTMLCanvasElement {
  const key = `${spr.id}:${nightStep}:${opts.hullTier ?? ""}:${opts.flip ? 1 : 0}`;
  const hit = rasterCache.get(key);
  if (hit) return hit;
  const pal = palette(nightStep);
  const cv = document.createElement("canvas");
  cv.width = spr.w;
  cv.height = spr.h;
  const ctx = cv.getContext("2d")!;
  for (let y = 0; y < spr.rows.length; y++) {
    const row = spr.rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === "." || ch === " ") continue;
      let colKey = spr.legend[ch];
      if (!colKey) continue;
      if (colKey === "hull") colKey = `hull${opts.hullTier ?? 0}`;
      ctx.fillStyle = pal[colKey] ?? "#f0f;";
      ctx.fillRect(opts.flip ? spr.w - 1 - x : x, y, 1, 1);
    }
  }
  rasterCache.set(key, cv);
  if (rasterCache.size > 600) rasterCache.clear(); // techo de memoria, se regenera solo
  return cv;
}

/** Miniatura de barco para la UI (dataURL, escala fija, día). */
const thumbCache = new Map<number, string>();
export function boatThumbURL(tier: number): string {
  const hit = thumbCache.get(tier);
  if (hit) return hit;
  const spr = BOATS[Math.min(tier, BOATS.length - 1)];
  const s = 3;
  const cv = document.createElement("canvas");
  cv.width = spr.w * s;
  cv.height = spr.h * s;
  const ctx = cv.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(raster(spr, 0, { hullTier: tier }), 0, 0, cv.width, cv.height);
  const url = cv.toDataURL();
  thumbCache.set(tier, url);
  return url;
}
