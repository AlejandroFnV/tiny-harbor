import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
const OUT = new URL("../playtest-shots/review/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless:"new", args:["--no-first-run","--mute-audio"] });
for (const [label,w,h] of [["1440",1440,820],["390",390,844]]) {
  const page = await browser.newPage();
  await page.setViewport({ width:w, height:h, deviceScaleFactor:1 });
  await page.goto("http://localhost:5199/?dev=1",{waitUntil:"networkidle0"});
  await page.evaluate(()=>localStorage.removeItem("tiny-harbor-save"));
  await page.reload({waitUntil:"networkidle0"});
  await page.waitForFunction(()=>!!window.TH);
  await page.evaluate(()=>{ const s=window.TH.state; window.TH.give(1e7); s.zonesUnlocked=2; for(let i=0;i<2;i++) s.boats.push({id:s.nextBoatId++,tier:i+1,paint:0,speedLvl:1,capLvl:1,phase:"fishing",phaseT:0.5,cargo:0,skipper:null}); s.playTime=45; for(let i=0;i<20;i++) window.TH.step(0.1); });
  await sleep(500);
  await page.screenshot({ path: `${OUT}tone-${label}.png` });
  await page.close();
}
await browser.close(); console.log("ok");
