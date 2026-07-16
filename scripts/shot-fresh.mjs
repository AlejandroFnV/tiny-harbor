/** Captura el arranque LIMPIO (sin inyección) para ver el gancho a t=0. */
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
await page.goto(`${BASE}/?dev=1`, { waitUntil: "networkidle0" });
await page.evaluate(() => localStorage.removeItem("tiny-harbor-save"));
await page.reload({ waitUntil: "networkidle0" });
await page.waitForFunction(() => !!window.TH);
await sleep(1200); // dejar que rendericen barco ready + mano del tutorial
const phase0 = await page.evaluate(() => window.TH.state.boats[0].phase);
await page.screenshot({ path: `${OUT}fresh-t0.png` });
console.log("boat[0].phase at start:", phase0);
await browser.close();
