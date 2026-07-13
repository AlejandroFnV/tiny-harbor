/** Capturas rápidas del look actual para iterar arte. */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:5199";
const OUT = new URL("../art-shots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--no-first-run", "--mute-audio"],
});

for (const [label, w, h] of [["movil", 390, 844], ["desktop", 1440, 900]]) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(`${BASE}/?dev=1`, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.removeItem("tiny-harbor-save"));
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => !!window.TH);
  await sleep(1000);
  await page.screenshot({ path: `${OUT}${label}-dia.png` });

  // Flota variada y barco listo (todos los tiers a la vista).
  await page.evaluate(() => {
    const TH = window.TH;
    TH.give(1e9);
    TH.state.dockLevel = 4;
    for (const t of [1, 2, 3, 4]) {
      TH.state.boats.push({ id: TH.state.nextBoatId++, tier: t, speedLvl: 0, capLvl: 0, phase: "fishing", phaseT: 1, cargo: 0 });
    }
    TH.state.boats[0].phase = "ready";
    TH.state.boats[0].cargo = 50;
    TH.state.boats[1].phase = "out";
    TH.state.boats[1].phaseT = 2;
  });
  await sleep(600);
  await page.screenshot({ path: `${OUT}${label}-flota.png` });

  // Tienda con thumbnails pixel.
  await page.tap("#tabbar [data-tab='flota']");
  await sleep(400);
  await page.screenshot({ path: `${OUT}${label}-tienda.png` });
  await page.tap("#tabbar [data-tab='flota']");

  // Noche.
  await page.evaluate(() => { window.TH.state.playTime = 135; });
  await sleep(700);
  await page.screenshot({ path: `${OUT}${label}-noche.png` });

  // Tormenta activa.
  await page.evaluate(() => {
    window.TH.state.playTime = 40;
    window.TH.state.event = { kind: "storm", stage: "active", choice: "risk", remaining: 20, tapsLeft: 0 };
  });
  await sleep(700);
  await page.screenshot({ path: `${OUT}${label}-tormenta.png` });

  // Banco de peces.
  await page.evaluate(() => {
    window.TH.state.event = { kind: "frenzy", stage: "active", remaining: 15, tapsLeft: 12 };
  });
  await sleep(700);
  await page.screenshot({ path: `${OUT}${label}-frenzy.png` });

  if (errs.length) {
    console.error(`${label}: errores`, errs);
    process.exit(1);
  }
  await page.close();
  console.log(`✓ ${label}`);
}
await browser.close();
