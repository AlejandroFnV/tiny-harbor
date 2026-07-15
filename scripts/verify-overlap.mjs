/**
 * Verifica que el botón Misiones NO solapa la money-card (bug móvil v1.4)
 * midiendo bounding rects reales en varios viewports.
 * Uso: node scripts/verify-overlap.mjs [urlBase]
 */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:5199";
const OUT = new URL("../playtest-shots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--no-first-run", "--mute-audio"],
});

let failures = 0;
for (const [w, h] of [[390, 844], [360, 740], [414, 896], [1440, 900]]) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/?dev=1`, { waitUntil: "networkidle0" });
  // Estado con dinero gordo y mercado visible: la card a su altura máxima real.
  await page.evaluate(() => {
    window.TH.give(1.23456e9);
    window.TH.state.repEarned = 10; // sello de reputación visible también
    window.TH.step(0.3);
  });
  const r = await page.evaluate(() => {
    const a = document.getElementById("money-card").getBoundingClientRect();
    const b = document.getElementById("missions-btn").getBoundingClientRect();
    const overlap = !(b.top >= a.bottom || b.bottom <= a.top || b.left >= a.right || b.right <= a.left);
    return { overlap, gap: Math.round(b.top - a.bottom), cardBottom: Math.round(a.bottom), btnTop: Math.round(b.top) };
  });
  const ok = !r.overlap && r.gap >= 4;
  console.log(`${ok ? "✓" : "✗"} ${w}×${h}: card acaba en ${r.cardBottom}px, botón empieza en ${r.btnTop}px (hueco ${r.gap}px)`);
  if (!ok) failures++;
  if (w === 390) await page.screenshot({ path: `${OUT}v6-overlap-fix.png` });
  await page.close();
}
await browser.close();
console.log(failures === 0 ? "✓ sin solapes en ningún viewport" : `✗ ${failures} viewports con solape`);
process.exit(failures === 0 ? 0 : 1);
