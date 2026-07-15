/**
 * Verificación v1.3 en navegador real:
 *  1. Lonja visible y comprable en Puerto.
 *  2. Racha: 3 cobros seguidos → sello RACHA visible.
 *  3. Legado: umbral escalonado y multiplicador en el texto.
 *  4. Migración v4→v5: save roto (rep 447) → rep convertida (~58) y jugable.
 * Uso: node scripts/verify-v5.mjs [urlBase]   (default http://localhost:5199)
 */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:5199";
const OUT = new URL("../playtest-shots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const errors = [];
let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--no-first-run", "--mute-audio"],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(`${BASE}/?dev=1`, { waitUntil: "networkidle0" });
await page.evaluate(() => window.TH.wipe && localStorage.clear());
await page.goto(`${BASE}/?dev=1`, { waitUntil: "networkidle0" });

// --- 1. Lonja en Puerto -----------------------------------------------------
await page.evaluate(() => {
  window.TH.give(1e6);
  window.TH.step(0.1);
});
await page.click("[data-tab='puerto']");
await page.evaluate(() => window.TH.step(0.1));
const lonjaCard = await page.evaluate(() => {
  const btn = document.querySelector("[data-action='up-lonja']");
  return btn ? { disabled: btn.disabled, text: btn.textContent } : null;
});
check("lonja visible y comprable en Puerto", !!lonjaCard && !lonjaCard.disabled, JSON.stringify(lonjaCard));
await page.click("[data-action='up-lonja']");
const lonjaLvl = await page.evaluate(() => window.TH.state.lonjaLvl);
check("comprar lonja sube nivel", lonjaLvl === 1, `lonjaLvl=${lonjaLvl}`);
await page.screenshot({ path: `${OUT}v5-puerto-lonja.png` });

// --- 2. Racha ----------------------------------------------------------------
await page.click("[data-tab='puerto']"); // cierra sheet
// Tres cobros manuales encadenados: tap físico sobre el canvas (hit-test real),
// barriendo una rejilla de puntos hasta acertar en el barco listo.
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => {
    window.TH.state.boats[0].phase = "ready";
    window.TH.state.boats[0].cargo = 50;
    window.TH.step(0.05);
  });
  const collected = await page.evaluate(() => {
    const before = window.TH.state.stats.collects;
    const canvas = document.getElementById("game-canvas");
    const r = canvas.getBoundingClientRect();
    for (let y = 0.45; y < 0.95 && window.TH.state.stats.collects === before; y += 0.05) {
      for (let x = 0.05; x < 0.95 && window.TH.state.stats.collects === before; x += 0.06) {
        canvas.dispatchEvent(new PointerEvent("pointerdown", {
          clientX: r.left + r.width * x, clientY: r.top + r.height * y, bubbles: true,
        }));
      }
    }
    return window.TH.state.stats.collects > before;
  });
  if (!collected) break;
}
const combo = await page.evaluate(() => {
  window.TH.step(0.05);
  return { n: window.TH.state.combo.n, stampHidden: document.getElementById("combo-stamp").hidden };
});
check("racha sube con cobros encadenados y el sello se ve", combo.n >= 2 && !combo.stampHidden, JSON.stringify(combo));
await page.screenshot({ path: `${OUT}v5-combo.png` });

// --- 3. Legado: umbral y multiplicador ---------------------------------------
await page.click("[data-tab='prestigio']");
await page.evaluate(() => window.TH.step(0.1));
const prestigioTxt = await page.evaluate(() => document.querySelector(".prestige-box").textContent);
check("panel legado menciona el multiplicador actual", /×\d/.test(prestigioTxt), "");
await page.screenshot({ path: `${OUT}v5-legado.png` });

// --- 4. Migración v4→v5 (partida rota real) -----------------------------------
// Gotcha: pagehide del juego autosalva y pisaría el save inyectado → se inyecta
// en una pestaña nueva ANTES de que el juego arranque (evaluateOnNewDocument).
const snap = await page.evaluate(() => JSON.parse(JSON.stringify(window.TH.state)));
await page.close();
const v4save = { ...snap, version: 4, repEarned: 447, reputation: 444, legacy: { astillero: 2, escuela: 0, faro: 0 } };
delete v4save.lonjaLvl;
delete v4save.combo;
delete v4save.stats.bestCombo;
delete v4save.stats.goldenCatches;
const page2 = await browser.newPage();
await page2.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
page2.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page2.on("pageerror", (e) => errors.push(e.message));
await page2.evaluateOnNewDocument((json) => localStorage.setItem("tiny-harbor-save", json), JSON.stringify(v4save));
await page2.goto(`${BASE}/?dev=1`, { waitUntil: "networkidle0" });
const migrated = await page2.evaluate(() => {
  const s = window.TH.state;
  return { version: s.version, repEarned: s.repEarned, reputation: s.reputation, astillero: s.legacy.astillero, lonjaLvl: s.lonjaLvl };
});
const expectedRep = Math.round(Math.pow(447, 2 / 3));
check(
  "migración v4→v5 convierte la rep y respeta el legado",
  migrated.version === 5 && migrated.repEarned === expectedRep && migrated.reputation === expectedRep - 3 && migrated.astillero === 2 && migrated.lonjaLvl === 0,
  JSON.stringify(migrated) + ` (esperado repEarned=${expectedRep})`,
);
const multTxt = await page2.evaluate(() => {
  window.TH.step(0.1);
  return document.getElementById("rep-val").textContent;
});
check("el sello de reputación muestra el mult domado (≈×3.5, no ×54)", /×3\.\d/.test(multTxt), multTxt);
await page2.screenshot({ path: `${OUT}v5-migrado.png` });

// ------------------------------------------------------------------------------
await browser.close();
if (errors.length) {
  console.error(`\n✗ ${errors.length} errores de consola:`);
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}
console.log(failures === 0 ? "\n✓ verify-v5: todo OK, cero errores de consola" : `\n✗ verify-v5: ${failures} fallos`);
process.exit(failures === 0 ? 0 : 1);
