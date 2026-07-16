/** Review round: capturas del HUD late-game a 390×844 y 1440 para ver saturación real. */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:5199";
const OUT = new URL("../playtest-shots/review/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--no-first-run", "--mute-audio"],
});

const errs = [];
for (const [label, w, h] of [["movil", 390, 844], ["desktop", 1440, 900]]) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => errs.push(`${label}: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errs.push(`${label} [console] ${m.text()}`); });
  await page.goto(`${BASE}/?dev=1`, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.removeItem("tiny-harbor-save"));
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => !!window.TH);

  // Estado late-game pesado: dinero enorme (overflow del contador), flota llena,
  // todo desbloqueado, reliquias/logros al máximo, banners apilados.
  await page.evaluate(() => {
    const TH = window.TH, s = TH.state;
    TH.give(9.876e9);
    s.dockLevel = 6;
    s.zonesUnlocked = 4;
    s.lonjaLvl = 8;
    s.managerLvl = 3;
    s.reputation = 25;
    s.repEarned = 25;
    s.vigia = true;
    s.weather = 3;
    s.prestiges = 4;
    for (let i = 0; i < 7; i++) {
      s.boats.push({ id: s.nextBoatId++, tier: (i % 5) + 1, paint: i % 4, speedLvl: 3, capLvl: 3, phase: "fishing", phaseT: 1, cargo: 20, skipper: i < 2 ? { name: "Marina", face: 0 } : null });
    }
    s.boats[0].phase = "ready"; s.boats[0].cargo = 90;
    s.event = { kind: "storm", stage: "warning", remaining: 9, tapsLeft: 0 };
    s.order = { stage: "active", goal: 1e6, progress: 2e5, remaining: 60, reward: 6e5 };
    TH.step(0.3);
  });

  // HUD base (sheet cerrada) con dinero gordo + banners.
  await sleep(500);
  await page.screenshot({ path: `${OUT}${label}-hud-base.png` });

  // Panel de misiones abierto.
  await page.evaluate(() => document.getElementById("missions-btn")?.click());
  await sleep(400);
  await page.screenshot({ path: `${OUT}${label}-misiones.png` });
  await page.evaluate(() => document.getElementById("missions-btn")?.click());

  // Cada tab del sheet.
  for (const tab of ["flota", "puerto", "mapa", "prestigio"]) {
    await page.evaluate((t) => {
      const btn = document.querySelector(`#tabbar button[data-tab="${t}"]`);
      btn?.click();
    }, tab);
    await sleep(450);
    await page.screenshot({ path: `${OUT}${label}-tab-${tab}.png` });
  }
  await page.close();
  console.log(`✓ ${label}`);
}
await browser.close();
if (errs.length) { console.error("ERRORES:", errs); process.exit(1); }
console.log("✓ sin errores de página/consola");
