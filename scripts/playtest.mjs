/**
 * Playtest headless: móvil 390×844 y desktop 1440×900.
 * Juega el loop completo con el juego CORRIENDO (rAF real):
 * cobrar → comprar → mejorar → evento → offline → reload-persistencia.
 * Vigila la consola: cualquier error tumba el script (exit 1).
 * Uso: node scripts/playtest.mjs [urlBase]   (default http://localhost:5199)
 */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:5199";
const OUT = new URL("../playtest-shots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const errors = [];

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--no-first-run", "--mute-audio"],
});

async function newPage(w, h) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`[console.error] ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`));
  return page;
}

const step = (page, s) => page.evaluate((sec) => window.TH.step(sec), s);
const state = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.TH.state)));
const shot = (page, name) => page.screenshot({ path: `${OUT}${name}.png` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tapBoat(page) {
  // Tap real sobre el canvas en la posición del primer barco listo.
  return page.evaluate(() => {
    const s = window.TH.state;
    const idx = s.boats.findIndex((b) => b.phase === "ready");
    if (idx < 0) return false;
    // Amárre visible: barre la línea de amarres (misma ruta que un pulgar impreciso).
    const c = document.getElementById("game-canvas");
    const y = window.innerHeight * (window.innerWidth > 900 ? 0.62 : 0.58) - 14;
    for (let x = 20; x < window.innerWidth; x += 30) {
      c.dispatchEvent(new PointerEvent("pointerdown", { clientX: x, clientY: y, bubbles: true }));
    }
    return true;
  });
}

async function run(label, w, h) {
  const page = await newPage(w, h);
  await page.goto(`${BASE}/?dev=1`, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.removeItem("tiny-harbor-save"));
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => !!window.TH);
  await sleep(1200); // fuentes + primeros frames reales
  await shot(page, `${label}-01-inicio`);

  // 1. COBRAR: acelera hasta que el bote esté listo (rAF real + timeScale).
  await page.evaluate(() => window.TH.setTimeScale(20));
  await page.waitForFunction(() => window.TH.state.boats[0].phase === "ready", { timeout: 15000 });
  await page.evaluate(() => window.TH.setTimeScale(1));
  await sleep(300);
  await shot(page, `${label}-02-barco-listo`);
  await tapBoat(page);
  await sleep(500); // monedas volando
  await shot(page, `${label}-03-cobro-monedas`);
  let s = await state(page);
  if (s.stats.collects < 1) throw new Error(`${label}: el tap no cobró`);

  // 2. COMPRAR: junta dinero acelerado con taps, abre Flota, bota el 2º barco.
  await page.evaluate(() => window.TH.setTimeScale(30));
  const t0 = Date.now();
  while (Date.now() - t0 < 12000) {
    await tapBoat(page);
    await sleep(200);
    s = await state(page);
    if (s.money >= 20) break;
  }
  await page.evaluate(() => window.TH.setTimeScale(1));
  await page.tap("#tabbar [data-tab='flota']");
  await sleep(400);
  await shot(page, `${label}-04-tienda-flota`);
  await page.tap("[data-action='buy-boat']");
  await sleep(400);
  s = await state(page);
  if (s.boats.length < 2) throw new Error(`${label}: no se compró el barco (money=${s.money})`);
  await shot(page, `${label}-05-botadura`);

  // 3. MEJORAR.
  await page.evaluate(() => window.TH.give(100));
  await sleep(300);
  await page.tap(".boat-row [data-action='up-speed']:not([disabled])").catch(() => {});
  await sleep(300);
  s = await state(page);
  if (s.stats.upgrades < 1) throw new Error(`${label}: la mejora no se aplicó`);

  // 4. EVENTOS: banco de peces con tap al banco; tormenta con decisión.
  await page.evaluate(() => {
    window.TH.state.event = { kind: "frenzy", stage: "active", remaining: 15, tapsLeft: 12 };
  });
  await sleep(400);
  await page.evaluate(() => {
    const c = document.getElementById("game-canvas");
    const x = window.innerWidth * 0.5;
    const y = window.innerHeight * 0.34 + (window.innerHeight * (window.innerWidth > 900 ? 0.62 : 0.58) - window.innerHeight * 0.34) * 0.5;
    c.dispatchEvent(new PointerEvent("pointerdown", { clientX: x, clientY: y, bubbles: true }));
  });
  await sleep(300);
  s = await state(page);
  if (s.stats.taps < 1) throw new Error(`${label}: el tap al banco de peces no entró`);
  await shot(page, `${label}-06-banco-peces`);

  await page.evaluate(() => {
    window.TH.state.event = { kind: "storm", stage: "warning", remaining: 10, tapsLeft: 0 };
  });
  await sleep(500);
  await shot(page, `${label}-07-tormenta-aviso`);
  await page.tap("[data-action='storm-shelter']");
  await sleep(600);
  await shot(page, `${label}-08-tormenta-refugio`);

  // 5. MISIONES panel + PUERTO tab.
  await page.evaluate(() => { window.TH.state.event = null; });
  await page.tap("#missions-btn");
  await sleep(300);
  await page.tap("#tabbar [data-tab='puerto']");
  await sleep(400);
  await shot(page, `${label}-09-puerto-misiones`);

  // 6. NOCHE.
  await page.evaluate(() => { window.TH.state.playTime = 135; });
  await sleep(700);
  await shot(page, `${label}-10-noche`);

  // 7. PERSISTENCIA + OFFLINE: guarda, retrasa lastSeen 3h, recarga.
  await page.evaluate(() => {
    window.TH.save();
    const raw = JSON.parse(localStorage.getItem("tiny-harbor-save"));
    raw.lastSeen = Date.now() - 3 * 3600 * 1000;
    const orig = localStorage.setItem.bind(localStorage);
    orig("tiny-harbor-save", JSON.stringify(raw));
    localStorage.setItem = () => {};
  });
  const moneyBefore = (await state(page)).money;
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => !!window.TH);
  await sleep(800);
  const hasModal = await page.$(".modal");
  if (!hasModal) throw new Error(`${label}: sin modal offline tras 3h fuera`);
  await shot(page, `${label}-11-offline-cofre`);
  s = await state(page);
  if (s.money <= moneyBefore) throw new Error(`${label}: la ganancia offline no se aplicó`);
  if (s.boats.length < 2) throw new Error(`${label}: el save no persistió los barcos`);
  await page.tap("#claim-btn");
  await sleep(600);
  await shot(page, `${label}-12-tras-recoger`);

  // 8. Ratón/tap frenético sobre el mismo botón: no debe romper nada.
  for (let i = 0; i < 25; i++) await page.tap("#tabbar [data-tab='mapa']").catch(() => {});
  await sleep(300);
  await shot(page, `${label}-13-mapa`);

  // 9. 60s de juego desatendido a ×30 (≈30 min de juego): sin errores.
  await page.evaluate(() => window.TH.setTimeScale(30));
  await sleep(60_000);
  await page.evaluate(() => window.TH.setTimeScale(1));
  s = await state(page);
  const bad = [s.money, s.lifetime, s.playTime, ...s.boats.map((b) => b.phaseT)].some(
    (v) => !Number.isFinite(v) || v < 0,
  );
  if (bad) throw new Error(`${label}: estado corrupto tras 30min acelerados`);
  await shot(page, `${label}-14-tras-30min`);

  await page.close();
  console.log(`✓ ${label} (${w}x${h}) OK — money final ${Math.round(s.money)}, barcos ${s.boats.length}`);
}

try {
  await run("movil", 390, 844);
  await run("desktop", 1440, 900);
} finally {
  await browser.close();
}

if (errors.length) {
  console.error(`\n✗ ${errors.length} errores de consola:`);
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}
console.log("\n✓ CERO errores de consola en ambos playtests");
