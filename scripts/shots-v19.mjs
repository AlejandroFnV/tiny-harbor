/** Capturas v1.9 para iterar el look nuevo (cielo, reflejo, fauna). */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:5199";
const OUT = new URL("../art-shots/v19/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--no-first-run", "--mute-audio"],
});

// dayT: día <0.55, dusk 0.55-0.65, noche 0.65-0.9, dawn 0.9-1.0. ciclo=180s.
const TIMES = [
  ["mediodia", 45],
  ["dusk", 110],
  ["noche", 145],
  ["dawn", 173],
];

for (const [label, w, h] of [["movil", 390, 844], ["desktop", 1440, 900]]) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("[console] " + m.text()); });
  await page.goto(`${BASE}/?dev=1`, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.removeItem("tiny-harbor-save"));
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => !!window.TH);
  // Flota variada mar adentro para ver el mar poblado.
  await page.evaluate(() => {
    const TH = window.TH;
    TH.give(1e9);
    TH.state.dockLevel = 6;
    TH.state.zonesUnlocked = 4;
    for (const t of [1, 2, 3, 4, 5]) {
      TH.state.boats.push({ id: TH.state.nextBoatId++, tier: t, paint: 0, speedLvl: 0, capLvl: 0, phase: "fishing", phaseT: 1, cargo: 0, skipper: null });
    }
    TH.state.boats[0].phase = "ready";
    TH.state.boats[0].cargo = 50;
  });
  for (const [tl, pt] of TIMES) {
    await page.evaluate((p) => { window.TH.state.playTime = p; }, pt);
    await sleep(900);
    await page.screenshot({ path: `${OUT}${label}-${tl}.png` });
  }
  if (errs.length) { console.error(`${label}: errores`, errs); process.exit(1); }
  await page.close();
  console.log(`✓ ${label}`);
}
await browser.close();
