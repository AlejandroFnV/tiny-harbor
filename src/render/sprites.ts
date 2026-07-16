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
  // 5 · Palangrero — casco alto, doble cabina y línea de boyas a popa
  sprite("palangrero", L_BOAT, [
    "..MM..MM..MM.........................CC......",
    "...I...I...I........................CCC......",
    "...IIIIIIIII........................I........",
    "...RRRRRRR..........................I........",
    "...RPPPPPR..........................I........",
    "...RPWWWPR.....RRRRRR...............I........",
    "...RPPPPPR.....RPPPPR...............I........",
    "..PPPPPPPPP....RPWWPR...............I........",
    "..PWWIIIWWP....RPPPPR...............I........",
    "..PPPPPPPPP...PPPPPPPP..............I........",
    "..PPPPPPPPP...PWWIIWWP..............I........",
    "IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII.",
    "IHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHII",
    ".IHFFFFHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHI.",
    ".IHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHI..",
    "..IHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHI...",
    "...IHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHII....",
    "....IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII......",
  ]),
  // 6 · Atunero — torre vigía alta + grúa de red (los atuneros de verdad la llevan)
  sprite("atunero", L_BOAT, [
    ".........II..........................CC......",
    ".........II.........................CCC......",
    "......RRRRRRR.......................I........",
    "......RPWWWPR.......................I........",
    "......RRRRRRR..........II...........I........",
    ".........II.............II.........I........",
    ".........II..............II........I........",
    ".........II...............II.......I........",
    "...RRRRRRRRRR...............II......I........",
    "...RPPPPPPPPR................II.....I........",
    "...RPWWWWWWPR.................I.....I........",
    "...RPPPPPPPPR.................I.....I........",
    "..PPPPPPPPPPPP................I.....I........",
    "..PWWIIIIIIWWP................I.....I........",
    "..PPPPPPPPPPPP................I.....I........",
    "IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII",
    "IHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHII",
    ".IHFFFFFHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHI.",
    ".IHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHI..",
    "..IHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHI...",
    "...IHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHII....",
    "....IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII......",
  ]),
  // 7 · Buque factoría — superestructura de tres alturas + dos chimeneas humeantes
  sprite("factoria", L_BOAT, [
    "....RR....RR.........................CC......",
    "....RR....RR........................CCC......",
    "....RR....RR........................I........",
    "..RRRRRRRRRRRR......................I........",
    "..RPPPPPPPPPPR......................I........",
    "..RPWWWWWWWWPR......................I........",
    "..RPPPPPPPPPPR......................I........",
    ".PPPPPPPPPPPPPP.......MMMM..........I........",
    ".PWWIIWWIIWWIIP.......MIIM..........I........",
    ".PPPPPPPPPPPPPP.....MMMMMMMM........I........",
    ".PPPPPPPPPPPPPP.....MIIMMIIM........I........",
    ".PPPPPPPPPPPPPP.....MMMMMMMM........I........",
    "IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII",
    "IHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHII",
    "IHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHI.",
    ".IHFFFFFFHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHI.",
    ".IHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHI..",
    "..IHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHI...",
    "...IHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHII....",
    "....IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII......",
  ]),
  // 8 · El Alba — goleta de leyenda: casco claro, dos velas doradas y gallardete
  sprite("alba", L_BOAT, [
    "...............M....................",
    "..............MM....................",
    "..............I.........M...........",
    ".......MMM....I.........I...........",
    ".....MMMMMM...I......MMMI...........",
    "....MMMMMMMM..I....MMMMMI...........",
    "...MMMMMMMMMM.I...MMMMMMI...........",
    "..MMMMMMMMMMM.I..MMMMMMMI...........",
    "...MMMMMMMMM..I...MMMMMMI...........",
    ".....MMMMM....I.....MMMMI...........",
    "..............I.......MMI...........",
    "IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII..",
    "IHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHII",
    ".IHFFFFHHHHHHHHHHHHHHHHHHHHHHHHHHI.",
    "..IHHHHHHHHHHHHHHHHHHHHHHHHHHHHHI..",
    "...IHHHHHHHHHHHHHHHHHHHHHHHHHHII...",
    "....IIIIIIIIIIIIIIIIIIIIIIIIII.....",
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

// --- cofres a la deriva (3 rarezas: madera / hierro / oro) -----------------------
export const DRIFT_CHESTS: Sprite[] = [
  sprite("chestWood", { I: "ink", D: "wood", d: "wood2", F: "foam" }, [
    ".IIIIIII.",
    "IDDDDDDDI",
    "IDDdIdDDI",
    "IdddIdddI",
    ".IIIIIII.",
    "..FF.FF..",
  ]),
  sprite("chestIron", { I: "ink", R: "roof", P: "paper", F: "foam" }, [
    ".IIIIIII.",
    "IRRPRPRRI",
    "IRRPIPRRI",
    "IPPPIPPPI",
    ".IIIIIII.",
    "..FF.FF..",
  ]),
  sprite("chestGold", { I: "ink", M: "must", W: "white", F: "foam" }, [
    ".IIIIIII.",
    "IMMWMWMMI",
    "IMMWIWMMI",
    "IWWWIWWWI",
    ".IIIIIII.",
    "..FF.FF..",
  ]),
];

// --- kraken (tentáculo; se dibujan varios con fase distinta) -----------------------
export const KRAKEN_TENTACLE = sprite("tentacle", { I: "ink", R: "roof", C: "coral", F: "foam" }, [
  "....RR....",
  "...RRRR...",
  "..RRCRR...",
  "..RRRR....",
  ".RRCRR....",
  ".RRRR.....",
  ".RRRR.....",
  ".RRCRR....",
  "..RRRR....",
  "..RRRRR...",
  "...RRRRR..",
  "....RRRR..",
  "..FF.FF.F.",
]);

export const KRAKEN_EYES = sprite("krakenEyes", { M: "must", I: "ink" }, [
  "MM....MM",
  "MIM..MIM",
  "MM....MM",
]);

// --- ballena ambiental (silueta que cruza el mar de fondo) ------------------------
export const WHALE = sprite("whale", { I: "ink", F: "foam" }, [
  "......................",
  "...........IIIIIII...I",
  ".....IIIIIIIIIIIIIII.I",
  "..IIIIIIIIIIIIIIIIIIII",
  "IIIIIIIIIIIIIIIIIIII..",
  "..FF...........FF.....",
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
  // 3 · cúmulo largo y fino, para variedad de cielo
  sprite("cloud3", { F: "white" }, [
    ".......FFF........",
    "...FFFFFFFFFFF....",
    "FFFFFFFFFFFFFFFFF.",
    ".FFFFFFFFFFFFFF...",
  ]),
];

// --- delfín ambiental (silueta que salta en arco) ---------------------------------
export const DOLPHIN = sprite("dolphin", { I: "ink", F: "white" }, [
  "........II..",
  ".......III..",
  ".I...IIIII..",
  ".II.IIIII...",
  "..IIIIIII...",
  "...IIIII....",
  "....I.......",
]);

// --- gato del muelle (siluetita, cola arriba) -------------------------------------
export const CAT = sprite("cat", { I: "ink", M: "must" }, [
  "I.....I.",
  "II...III",
  ".IIIIIII",
  ".IIIIIII",
  ".IIIIIII",
  ".II..II.",
]);

// --- pescador sentado en el borde del muelle (mira al mar, con caña) ---------------
export const FISHERMAN = sprite("fisherman", { I: "ink", R: "roof", P: "paper", C: "coral" }, [
  "..RRR.",
  "..III.",
  "..PPP.",
  ".CCCCC",
  "CCCCC.",
  ".CCCC.",
  ".I..I.",
  ".I..I.",
]);

// --- gaviota posada en un bolardo -------------------------------------------------
export const GULL_SIT = sprite("gullSit", { I: "ink", F: "white", M: "must" }, [
  ".FFI",
  "FFFF",
  ".MM.",
]);

export const FISH = sprite("fish", { G: "foam", I: "ink" }, [
  ".GGG..",
  "GGGGGI",
  ".GGG..",
]);

/** Cliente de la lonja esperando en el muelle (pedido). */
export const CLIENT = sprite("client", { I: "ink", P: "paper", C: "coral", M: "must", R: "roof" }, [
  "..MMM..",
  "..PPP..",
  "..IPI..",
  "..PPP..",
  ".RRRRR.",
  "RIRRRIR",
  "R.RRR.R",
  "..R.R..",
  "..R.R..",
  "..I.I..",
]);

// ---------------------------------------------------------------------------
// Pescadoteca: siluetas base + color por especie
// ---------------------------------------------------------------------------
const F = { B: "body", F: "white", I: "ink" }; // B se tiñe por especie

const FISH_SHAPES: Record<string, Sprite> = {
  small: sprite("f-small", F, [
    "..BBBB...",
    "BBBBBBBI.",
    "..BBBB...",
  ]),
  long: sprite("f-long", F, [
    "...BBBBBBB...",
    ".BBBBBBBBBBI.",
    "...BBBBBBB...",
  ]),
  round: sprite("f-round", F, [
    "..BBBB..",
    ".BBBBBB.",
    "BBBBBBBI",
    ".BBBBBB.",
    "..BBBB..",
  ]),
  big: sprite("f-big", F, [
    "....BBBBBB....",
    "..BBBBBBBBBB..",
    "BBBBBBBBBBBBI.",
    "..BBBBBBBBBB..",
    "....BBBBBB....",
  ]),
  sword: sprite("f-sword", F, [
    ".....BBBBBB.....",
    "BBBBBBBBBBBBBI..",
    ".....BBBBBB.....",
  ]),
  shark: sprite("f-shark", F, [
    ".....B........",
    "....BBB.......",
    "..BBBBBBBBBB..",
    "BBBBBBBBBBBBI.",
    "..BBBBBBBBBB..",
  ]),
  eel: sprite("f-eel", F, [
    "BB....BB......",
    ".BBBBBBBBBBBI.",
    "......BB....BB",
  ]),
  ray: sprite("f-ray", F, [
    "....BB....",
    "..BBBBBB..",
    "BBBBBBBBBB",
    "..BBBBBB..",
    "....BB..BB",
  ]),
  octo: sprite("f-octo", F, [
    "..BBBB..",
    ".BBBBBB.",
    ".BIBBIB.",
    ".BBBBBB.",
    "B.B..B.B",
    ".B.BB.B.",
  ]),
  seahorse: sprite("f-seahorse", F, [
    "..BBB.",
    ".BBIB.",
    "..BB..",
    ".BBB..",
    ".BB...",
    ".BBB..",
    "..BB..",
  ]),
  angler: sprite("f-angler", F, [
    "..F.......",
    "..B.......",
    ".BBBBBB...",
    "BBIBBBBBI.",
    ".BBBBBB...",
  ]),
  squid: sprite("f-squid", F, [
    "...BBB....",
    "..BBBBB...",
    "..BIBIB...",
    "..BBBBB...",
    ".B.B.B.B..",
    "B..B.B..B.",
    "..B...B...",
  ]),
  dolphin: sprite("f-dolphin", F, [
    ".....BB.......",
    "...BBBBBBBB...",
    ".BBBBBBBBBBBI.",
    "BBBBBBBBBB....",
    "..BB...BBB....",
  ]),
  medusa: sprite("f-medusa", F, [
    "..BBBB..",
    ".BBBBBB.",
    ".BBBBBB.",
    ".B.BB.B.",
    "B.B.B.B.",
    ".B.B.B.B",
  ]),
};

/** Silueta y color por especie de config. */
const SPECIES_ART: Record<string, { shape: keyof typeof FISH_SHAPES; color: string }> = {
  sardina: { shape: "small", color: "#9fb8c8" },
  boqueron: { shape: "small", color: "#7f9db5" },
  caballa: { shape: "long", color: "#4a8f96" },
  caballito: { shape: "seahorse", color: "#e3a04b" },
  dorada: { shape: "round", color: "#d8b04e" },
  lubina: { shape: "long", color: "#a8b5b5" },
  pulpo: { shape: "octo", color: "#9a6bb0" },
  morena: { shape: "eel", color: "#7d9354" },
  bonito: { shape: "long", color: "#5580b0" },
  merluza: { shape: "long", color: "#8a9aa5" },
  pezluna: { shape: "round", color: "#c8ccd4" },
  mantaraya: { shape: "ray", color: "#4a5a75" },
  atun: { shape: "big", color: "#b05555" },
  pezespada: { shape: "sword", color: "#6a8fc0" },
  tiburon: { shape: "shark", color: "#7086a0" },
  rape: { shape: "angler", color: "#8a6a50" },
  pezdragon: { shape: "eel", color: "#50647d" },
  calamargigante: { shape: "squid", color: "#c06858" },
  // La Fosa
  sable: { shape: "sword", color: "#b8c4d4" },
  granadero: { shape: "long", color: "#77706a" },
  pelicano: { shape: "eel", color: "#454f66" },
  duende: { shape: "shark", color: "#c99aa4" },
  // Mar de Hielo
  bacalao: { shape: "long", color: "#8fa8b8" },
  fletan: { shape: "ray", color: "#3d4a52" },
  pezhielo: { shape: "small", color: "#cfe4ec" },
  loboartico: { shape: "angler", color: "#6a7f95" },
  // El Fin del Mapa
  emperador: { shape: "big", color: "#c08838" },
  medusaeterna: { shape: "round", color: "#d8a8c8" },
  pezremo: { shape: "eel", color: "#d44a4a" },
  kraken: { shape: "squid", color: "#5e3a52" },
  // v1.9
  delfin: { shape: "dolphin", color: "#5f7d95" },
  aurora: { shape: "medusa", color: "#7fd8c0" },
};

const fishURLCache = new Map<string, string>();

/** Miniatura de especie para el álbum (silueta a tinta si no está descubierta). */
export function speciesThumbURL(id: string, discovered: boolean): string {
  const key = `${id}:${discovered ? 1 : 0}`;
  const hit = fishURLCache.get(key);
  if (hit) return hit;
  const art = SPECIES_ART[id] ?? { shape: "small", color: "#888888" };
  const spr = FISH_SHAPES[art.shape];
  const s = 3;
  const cv = document.createElement("canvas");
  cv.width = spr.w * s;
  cv.height = spr.h * s;
  const ctx = cv.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const body = discovered ? art.color : "#3a415580";
  const ink = discovered ? "#2b3245" : "#3a415580";
  const white = discovered ? "#fbf6e8" : "#3a415580";
  for (let y = 0; y < spr.rows.length; y++) {
    const row = spr.rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === "." || ch === " ") continue;
      ctx.fillStyle = ch === "B" ? body : ch === "I" ? ink : white;
      ctx.fillRect(x * s, y * s, s, s);
    }
  }
  const url = cv.toDataURL();
  fishURLCache.set(key, url);
  return url;
}

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
  opts: { hullTier?: number; flip?: boolean; paint?: string } = {},
): HTMLCanvasElement {
  const key = `${spr.id}:${nightStep}:${opts.hullTier ?? ""}:${opts.flip ? 1 : 0}:${opts.paint ?? ""}`;
  const hit = rasterCache.get(key);
  if (hit) return hit;
  const pal = palette(nightStep);
  // Pintura de casco: color elegido por el jugador, con el mismo apagado nocturno.
  const paintCol = opts.paint ? mix(opts.paint, "#463328", (nightStep / NIGHT_STEPS) * 0.65) : null;
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
      if (colKey === "hull") {
        if (paintCol) {
          ctx.fillStyle = paintCol;
          ctx.fillRect(opts.flip ? spr.w - 1 - x : x, y, 1, 1);
          continue;
        }
        colKey = `hull${opts.hullTier ?? 0}`;
      }
      ctx.fillStyle = pal[colKey] ?? "#f0f;";
      ctx.fillRect(opts.flip ? spr.w - 1 - x : x, y, 1, 1);
    }
  }
  rasterCache.set(key, cv);
  if (rasterCache.size > 600) rasterCache.clear(); // techo de memoria, se regenera solo
  return cv;
}

// ---------------------------------------------------------------------------
// Retratos de patrón (taberna): cara pixel procedural, determinista por nombre
// ---------------------------------------------------------------------------
const SKIN_TONES = ["#e8b88a", "#d49a6a", "#b87c50", "#96603c"];
const HAT_COLORS = ["#e3664b", "#eab14e", "#2d3754", "#5b8c5a", "#4a7ba6"];
const BEARD_COLORS = ["#8a8577", "#5f4b34", "#3a3428", "#b8b2a2"];

function nameHash(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const portraitCache = new Map<string, string>();

/** Retrato pixel 12×13 del patrón (gorro + cara + barba según el nombre). */
export function skipperPortraitURL(name: string): string {
  const hit = portraitCache.get(name);
  if (hit) return hit;
  const h = nameHash(name);
  const skin = SKIN_TONES[h % SKIN_TONES.length];
  const hat = HAT_COLORS[(h >> 2) % HAT_COLORS.length];
  const beard = (h >> 4) % 3; // 0 = afeitado, 1 = corta, 2 = cerrada
  const beardCol = BEARD_COLORS[(h >> 6) % BEARD_COLORS.length];
  const hatStyle = (h >> 8) % 3; // 0 = gorro lana, 1 = sueste, 2 = gorra capitán
  const ink = "#2b3245";
  const jersey = (h >> 10) % 2 ? "#2d3754" : "#4a7ba6";

  const W = 12, H = 13, s = 4;
  const cv = document.createElement("canvas");
  cv.width = W * s;
  cv.height = H * s;
  const ctx = cv.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const px = (x: number, y: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x * s, y * s, s, s);
  };
  const row = (x0: number, x1: number, y: number, c: string) => {
    for (let x = x0; x <= x1; x++) px(x, y, c);
  };

  // Gorro (filas 0-3)
  if (hatStyle === 0) {
    row(4, 7, 0, hat); row(3, 8, 1, hat); row(3, 8, 2, hat); row(2, 9, 3, ink);
  } else if (hatStyle === 1) {
    row(4, 7, 1, hat); row(3, 8, 2, hat); row(1, 10, 3, hat);
  } else {
    row(3, 8, 1, "#f2e8d5"); row(3, 8, 2, ink); row(2, 9, 3, ink);
  }
  // Cara (filas 4-8)
  for (let y = 4; y <= 8; y++) row(3, 8, y, skin);
  px(4, 5, ink); px(7, 5, ink); // ojos
  px(5, 7, "#c97b6a"); px(6, 7, "#c97b6a"); // nariz/mejilla
  // Barba (filas 8-9)
  if (beard >= 1) { row(3, 8, 8, beardCol); }
  if (beard === 2) { row(4, 7, 9, beardCol); }
  else if (beard === 1) { px(5, 9, skin); px(6, 9, skin); }
  else { row(4, 7, 9, skin); }
  // Jersey (filas 10-12)
  row(3, 8, 10, jersey); row(2, 9, 11, jersey); row(2, 9, 12, jersey);
  row(4, 7, 10, (h >> 12) % 2 ? "#f2e8d5" : jersey); // cuello a rayas a veces

  const url = cv.toDataURL();
  portraitCache.set(name, url);
  return url;
}

/** Miniatura de barco para la UI (dataURL, escala fija, día). `paint` tiñe el casco. */
const thumbCache = new Map<string, string>();
export function boatThumbURL(tier: number, paint = ""): string {
  const key = `${tier}:${paint}`;
  const hit = thumbCache.get(key);
  if (hit) return hit;
  const spr = BOATS[Math.min(tier, BOATS.length - 1)];
  const s = 3;
  const cv = document.createElement("canvas");
  cv.width = spr.w * s;
  cv.height = spr.h * s;
  const ctx = cv.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(raster(spr, 0, { hullTier: tier, paint: paint || undefined }), 0, 0, cv.width, cv.height);
  const url = cv.toDataURL();
  thumbCache.set(key, url);
  return url;
}
