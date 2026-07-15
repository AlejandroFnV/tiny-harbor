/**
 * Verificación v1.4 en navegador real:
 *  1. Ticker del mercado visible y moviéndose.
 *  2. Cofre a la deriva: aparece, se ve y el tap lo cobra (hit-test real).
 *  3. Expedición: zarpar, barco fuera, vuelve con botín (skipMinutes).
 *  4. Reliquias: la Odisea trae una y la vitrina la muestra.
 *  5. Hold-to-upgrade con EVENTOS TÁCTILES (el fallo reportado en móvil).
 *  6. Migración v5→v6.
 * Uso: node scripts/verify-v6.mjs [urlBase]   (default http://localhost:5199)
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
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(`${BASE}/?dev=1`, { waitUntil: "networkidle0" });
await page.evaluate(() => localStorage.clear());
await page.goto(`${BASE}/?dev=1`, { waitUntil: "networkidle0" });

// --- 1. Mercado -----------------------------------------------------------------
const m0 = await page.evaluate(() => {
  window.TH.step(0.1);
  return { txt: document.getElementById("market-val").textContent, mult: window.TH.state.market.mult };
});
await page.evaluate(() => window.TH.skipMinutes(5));
const m1 = await page.evaluate(() => {
  window.TH.step(0.1);
  return { txt: document.getElementById("market-val").textContent, mult: window.TH.state.market.mult };
});
check("ticker del mercado visible y el precio se mueve", m0.txt.startsWith("×") && m1.mult !== m0.mult, `${m0.txt} → ${m1.txt}`);

// --- 2. Cofre a la deriva ---------------------------------------------------------
await page.evaluate(() => {
  const s = window.TH.state;
  s.playTime = Math.max(s.playTime, 301);
  s.driftT = 0;
  s.drift = null;
  window.TH.step(0.2);
});
const hasDrift = await page.evaluate(() => window.TH.state.drift !== null);
check("el cofre aparece en el agua", hasDrift);
await page.screenshot({ path: `${OUT}v6-cofre.png` });
const driftResult = await page.evaluate(() => {
  const s = window.TH.state;
  const before = s.stats.driftsTapped;
  const canvas = document.getElementById("game-canvas");
  const r = canvas.getBoundingClientRect();
  for (let y = 0.3; y < 0.95 && s.stats.driftsTapped === before; y += 0.04) {
    for (let x = 0.05; x < 0.95 && s.stats.driftsTapped === before; x += 0.05) {
      canvas.dispatchEvent(new PointerEvent("pointerdown", {
        clientX: r.left + r.width * x, clientY: r.top + r.height * y, bubbles: true,
      }));
    }
  }
  window.TH.step(0.1);
  return { tapped: s.stats.driftsTapped, money: s.money };
});
check("tap al cofre lo cobra", driftResult.tapped === 1 && driftResult.money > 0, JSON.stringify(driftResult));

// --- 3+4. Expedición + reliquia ---------------------------------------------------
await page.evaluate(() => {
  window.TH.give(5000);
  window.TH.step(0.1);
});
await page.click("[data-tab='flota']");
await page.evaluate(() => {
  // Compra un segundo barco para poder zarpar.
  const btn = document.querySelector("[data-action='buy-boat']");
  btn.click();
  window.TH.step(0.1);
});
await page.click("[data-tab='mapa']");
await page.evaluate(() => window.TH.step(0.1));
const expBtns = await page.$$("[data-action='start-expedition']");
check("las 3 expediciones se ofrecen en el Mapa", expBtns.length === 3, `${expBtns.length} botones`);
// Zarpa la Odisea (índice 2): reliquia garantizada.
await page.evaluate(() => {
  document.querySelectorAll("[data-action='start-expedition']")[2].click();
  window.TH.step(0.1);
});
const expState = await page.evaluate(() => ({
  active: window.TH.state.expedition !== null,
  boats: window.TH.state.boats.length,
}));
check("la expedición zarpa (barco fuera, sigue en la flota)", expState.active && expState.boats === 2, JSON.stringify(expState));
await page.screenshot({ path: `${OUT}v6-expedicion.png` });
await page.evaluate(() => window.TH.skipMinutes(65));
const expDone = await page.evaluate(() => {
  window.TH.step(0.1);
  return {
    active: window.TH.state.expedition !== null,
    relics: window.TH.state.relics.length,
    done: window.TH.state.stats.expeditionsDone,
  };
});
check("la Odisea vuelve con botín y RELIQUIA", !expDone.active && expDone.done === 1 && expDone.relics === 1, JSON.stringify(expDone));
await page.click("[data-tab='prestigio']");
await page.evaluate(() => window.TH.step(0.1));
const relicShown = await page.evaluate(() => {
  const grid = document.querySelector(".relic-grid");
  return grid ? grid.querySelectorAll(".ach.got").length : -1;
});
check("la vitrina de reliquias muestra la conseguida", relicShown === 1, `${relicShown} en vitrina`);
await page.screenshot({ path: `${OUT}v6-reliquias.png` });

// --- 5. Hold-to-upgrade con TOUCH (el bug reportado) --------------------------------
await page.evaluate(() => {
  window.TH.give(1e9);
  window.TH.step(0.1);
});
await page.click("[data-tab='flota']");
await page.evaluate(() => window.TH.step(0.1));
const spdBtn = await page.$("[data-action='up-speed']");
await spdBtn.scrollIntoViewIfNeeded();
const box = await spdBtn.boundingBox();
const lvl0 = await page.evaluate(() => window.TH.state.boats[0].speedLvl);
await page.touchscreen.touchStart(box.x + box.width / 2, box.y + box.height / 2);
await new Promise((r) => setTimeout(r, 2500));
await page.touchscreen.touchEnd();
const lvl1 = await page.evaluate(() => window.TH.state.boats[0].speedLvl);
check("HOLD TÁCTIL mejora en cadena (bug reportado)", lvl1 - lvl0 >= 4, `${lvl0} → ${lvl1} en 2.5s de dedo`);

// --- 6. Migración v5→v6 -------------------------------------------------------------
const snap = await page.evaluate(() => JSON.parse(JSON.stringify(window.TH.state)));
await page.close();
const v5save = { ...snap, version: 5, repEarned: 20, reputation: 20 };
delete v5save.market;
delete v5save.drift;
delete v5save.driftT;
delete v5save.expedition;
delete v5save.relics;
const page2 = await browser.newPage();
await page2.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
page2.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page2.on("pageerror", (e) => errors.push(e.message));
await page2.evaluateOnNewDocument((json) => localStorage.setItem("tiny-harbor-save", json), JSON.stringify(v5save));
await page2.goto(`${BASE}/?dev=1`, { waitUntil: "networkidle0" });
const migrated = await page2.evaluate(() => {
  const s = window.TH.state;
  return { version: s.version, repEarned: s.repEarned, market: s.market.mult, relics: Array.isArray(s.relics) };
});
check("migración v5→v6 sin tocar la rep", migrated.version === 6 && migrated.repEarned === 20 && migrated.market === 1 && migrated.relics, JSON.stringify(migrated));

// -------------------------------------------------------------------------------------
await browser.close();
if (errors.length) {
  console.error(`\n✗ ${errors.length} errores de consola:`);
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}
console.log(failures === 0 ? "\n✓ verify-v6: todo OK, cero errores de consola" : `\n✗ verify-v6: ${failures} fallos`);
process.exit(failures === 0 ? 0 : 1);
