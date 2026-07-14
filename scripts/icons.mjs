/**
 * Genera los iconos PWA desde el sprite pixel del pesquero (arte real del juego).
 * Salida: public/icons/icon-{192,512,512-maskable,180}.png
 */
import puppeteer from "puppeteer-core";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = new URL("../public/icons/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

// Sprite del pesquero (copiado de sprites.ts; el icono es un artefacto de build).
const ROWS = [
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
];
const COLORS = {
  I: "#2b3245", H: "#8a5aa6", P: "#f7efdb", W: "#f2cf6f",
  C: "#e3664b", R: "#2d3754", F: "#fbf6e8",
};

const html = `<canvas id="c"></canvas><script>
function draw(size, pad) {
  const rows = ${JSON.stringify(ROWS)};
  const colors = ${JSON.stringify(COLORS)};
  const c = document.getElementById('c');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  // Fondo: mar nocturno con bandas + luna.
  const bands = ['#f1b377', '#8fc9b6', '#4aa39b', '#2f8289'];
  bands.forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect(0, size * i / 4, size, size / 4 + 1);
  });
  // Sprite centrado.
  const w = Math.max(...rows.map(r => r.length));
  const h = rows.length;
  const s = Math.floor((size - pad * 2) / w);
  const ox = Math.floor((size - w * s) / 2);
  const oy = Math.floor((size - h * s) / 2) + Math.floor(size * 0.06);
  for (let y = 0; y < h; y++) for (let x = 0; x < rows[y].length; x++) {
    const ch = rows[y][x];
    if (ch === '.' || ch === ' ') continue;
    g.fillStyle = colors[ch];
    g.fillRect(ox + x * s, oy + y * s, s, s);
  }
  // Línea de flotación.
  g.fillStyle = 'rgba(251,246,232,.55)';
  g.fillRect(ox, oy + 12 * s + 6 * s, w * s, Math.max(2, s / 2));
  return c.toDataURL('image/png');
}
</script>`;

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
const page = await browser.newPage();
await page.setContent(html);

for (const [name, size, pad] of [
  ["icon-192.png", 192, 16],
  ["icon-512.png", 512, 40],
  ["icon-512-maskable.png", 512, 100], // zona segura maskable
  ["icon-180.png", 180, 16], // apple-touch-icon
]) {
  const dataURL = await page.evaluate((s, p) => draw(s, p), size, pad);
  writeFileSync(OUT + name, Buffer.from(dataURL.split(",")[1], "base64"));
  console.log("✓", name);
}
await browser.close();
