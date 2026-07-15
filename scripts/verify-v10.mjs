/**
 * Verificación v1.7 en navegador real:
 *  1. Clima: niebla visible en escena + chip; marejada pica el mar.
 *  2. Desafío del día: asignado al abrir, card presidiendo el panel de misiones.
 *  3. Pintura: el botón cicla el color y el casco cambia en escena.
 *  4. Migración v9→v10.
 * Uso: node scripts/verify-v10.mjs [urlBase]
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
await page.evaluate(() => localStorage.clear());
await page.goto(`${BASE}/?dev=1`, { waitUntil: "networkidle0" });

// --- 1. Clima -------------------------------------------------------------------
const daily = await page.evaluate(() => ({
  assigned: window.TH.state.daily !== null,
  def: window.TH.state.daily?.def,
}));
check("el desafío del día se asigna al abrir", daily.assigned, `def=${daily.def}`);

await page.evaluate(() => {
  window.TH.state.weather = 1; // niebla
  window.TH.step(0.3);
});
const fogChip = await page.evaluate(() => {
  const chip = document.getElementById("weather-chip");
  return { hidden: chip.hidden, txt: chip.textContent };
});
check("chip de clima con niebla", !fogChip.hidden && fogChip.txt === "niebla", fogChip.txt);
await page.screenshot({ path: `${OUT}v10-niebla.png` });
await page.evaluate(() => {
  window.TH.state.weather = 3; // marejada
  window.TH.step(0.3);
});
await page.screenshot({ path: `${OUT}v10-marejada.png` });

// --- 2. Desafío en el panel de misiones ---------------------------------------------
await page.click("#missions-btn");
await page.evaluate(() => window.TH.step(0.2));
const dailyCard = await page.evaluate(() => {
  const card = document.querySelector(".mission-card.daily");
  return { visible: !!card, txt: card?.textContent ?? "" };
});
check("el desafío preside el panel de misiones", dailyCard.visible && /DESAFÍO DEL DÍA/.test(dailyCard.txt), dailyCard.txt.slice(0, 60));
await page.screenshot({ path: `${OUT}v10-desafio.png` });
await page.click("#missions-btn");

// --- 3. Pintura ------------------------------------------------------------------------
await page.click("[data-tab='flota']");
await page.evaluate(() => window.TH.step(0.1));
const paintBtn = await page.$(".paint-btn");
await paintBtn.scrollIntoViewIfNeeded();
await page.click(".paint-btn");
await page.click(".paint-btn");
const paint = await page.evaluate(() => {
  window.TH.step(0.1);
  return window.TH.state.boats[0].paint;
});
check("pintar el casco cicla colores", paint === 2, `paint=${paint}`);
await page.click("[data-tab='flota']"); // cierra sheet para ver el barco
await page.evaluate(() => window.TH.step(0.3));
await page.screenshot({ path: `${OUT}v10-pintura.png` });

// --- 4. Migración v9→v10 ------------------------------------------------------------------
const snap = await page.evaluate(() => JSON.parse(JSON.stringify(window.TH.state)));
await page.close();
const v9save = { ...snap, version: 9 };
delete v9save.weather;
delete v9save.daily;
for (const b of v9save.boats) delete b.paint;
const page2 = await browser.newPage();
await page2.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
page2.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page2.on("pageerror", (e) => errors.push(e.message));
await page2.evaluateOnNewDocument((json) => localStorage.setItem("tiny-harbor-save", json), JSON.stringify(v9save));
await page2.goto(`${BASE}/?dev=1`, { waitUntil: "networkidle0" });
const migrated = await page2.evaluate(() => {
  const s = window.TH.state;
  return { version: s.version, weather: s.weather, paint: s.boats[0].paint, daily: s.daily !== null };
});
check("migración v9→v10 (y el desafío se asigna al abrir)", migrated.version === 10 && migrated.paint === 0 && migrated.daily, JSON.stringify(migrated));

// -------------------------------------------------------------------------------------------
await browser.close();
if (errors.length) {
  console.error(`\n✗ ${errors.length} errores de consola:`);
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}
console.log(failures === 0 ? "\n✓ verify-v10: todo OK, cero errores de consola" : `\n✗ verify-v10: ${failures} fallos`);
process.exit(failures === 0 ? 0 : 1);
