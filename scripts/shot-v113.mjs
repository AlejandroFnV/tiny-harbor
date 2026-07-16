/** Verifica visualmente v1.13: botón Vender en Flota + ballena tappable (glint). */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
const BASE = process.argv[2] ?? "http://localhost:5199";
const OUT = new URL("../playtest-shots/review/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new", args: ["--no-first-run", "--mute-audio"],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errs.push("[c] " + m.text()); });
await page.goto(`${BASE}/?dev=1`, { waitUntil: "networkidle0" });
await page.evaluate(() => localStorage.removeItem("tiny-harbor-save"));
await page.reload({ waitUntil: "networkidle0" });
await page.waitForFunction(() => !!window.TH);

// Flota con varios barcos → botones Vender.
await page.evaluate(() => {
  const s = window.TH.state;
  window.TH.give(1e9);
  s.dockLevel = 4;
  for (let i = 0; i < 4; i++) s.boats.push({ id: s.nextBoatId++, tier: (i % 4) + 1, paint: 0, speedLvl: 2, capLvl: 2, phase: "fishing", phaseT: 1, cargo: 0, skipper: null });
  window.TH.step(0.3);
  document.querySelector("#tabbar button[data-tab='flota']")?.click();
});
await sleep(500);
await page.screenshot({ path: `${OUT}v113-flota-vender.png` });

// Ballena: forzar aparición, avanzarla a pantalla, tocarla y comprobar tesoro E2E.
await page.evaluate(() => {
  document.querySelector("#tabbar button[data-tab='flota']")?.click(); // cerrar sheet
  window.TH.give(-window.TH.state.money); // dinero a 0 para medir el salto limpio
  window.TH.forceAmbient();
});
let dbg = { hittable: false, x: 0, y: 0 }, tries = 0;
while (!dbg.hittable && tries++ < 600) {
  dbg = await page.evaluate(() => { window.TH.step(0.1); return window.TH.whaleDebug(); });
}
await page.screenshot({ path: `${OUT}v113-whale.png` }); // ballena en pantalla + glint
const money0 = await page.evaluate(() => window.TH.state.money);
// Tap exacto en coords de pantalla (whalePos ya está en px de pantalla).
await page.mouse.click(dbg.x, dbg.y);
await sleep(200);
const res = await page.evaluate(() => ({ money: window.TH.state.money, taps: window.TH.state.stats.whalesTapped, hit: window.TH.whaleDebug().hittable }));
console.log(`ballena tappable a los ${tries} steps @(${Math.round(dbg.x)},${Math.round(dbg.y)})`);
console.log(`tesoro: money ${money0} → ${res.money} (Δ${res.money - money0}) · whalesTapped=${res.taps} · sigue hittable=${res.hit}`);
console.log(errs.length ? "ERRORES: " + errs.join(" | ") : "ok sin errores de página");
await browser.close();
