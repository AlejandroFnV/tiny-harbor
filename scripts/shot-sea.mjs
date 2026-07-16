import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
const OUT = new URL("../playtest-shots/review/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r=>setTimeout(r,ms));
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-first-run","--mute-audio"] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
const errs=[]; page.on("pageerror",e=>errs.push(e.message));
await page.goto("http://localhost:5199/?dev=1", { waitUntil: "networkidle0" });
await page.evaluate(() => localStorage.removeItem("tiny-harbor-save"));
await page.reload({ waitUntil: "networkidle0" });
await page.waitForFunction(() => !!window.TH);
await page.evaluate(() => { const s=window.TH.state; window.TH.give(1e8); s.zonesUnlocked=3; for(let i=0;i<3;i++) s.boats.push({id:s.nextBoatId++,tier:i+1,paint:0,speedLvl:1,capLvl:1,phase:"fishing",phaseT:0.5,cargo:0,skipper:null}); });
for (const [label, pt] of [["mediodia",45],["noche",145]]) {
  await page.evaluate((p)=>{ window.TH.state.playTime=p; for(let i=0;i<20;i++) window.TH.step(0.1); }, pt);
  await sleep(500);
  await page.screenshot({ path: `${OUT}sea-${label}.png` });
}
console.log(errs.length?"ERR "+errs.join(" | "):"ok");
await browser.close();
