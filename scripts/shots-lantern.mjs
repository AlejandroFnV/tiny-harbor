import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
const OUT = new URL("../art-shots/v19/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-first-run","--mute-audio"] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
const errs=[]; page.on("pageerror",e=>errs.push(e.message)); page.on("console",m=>{if(m.type()==="error")errs.push("[c]"+m.text());});
await page.goto("http://localhost:5199/?dev=1",{waitUntil:"networkidle0"});
await page.evaluate(()=>localStorage.removeItem("tiny-harbor-save"));
await page.reload({waitUntil:"networkidle0"});
await page.waitForFunction(()=>!!window.TH);
await page.evaluate(()=>{const T=window.TH;T.give(1e9);T.state.zonesUnlocked=2;T.state.playTime=145;for(const t of[1,2])T.state.boats.push({id:T.state.nextBoatId++,tier:t,paint:0,speedLvl:0,capLvl:0,phase:"fishing",phaseT:1,cargo:0,skipper:null});T.forceAmbient();});
for(let i=0;i<240;i++){await page.evaluate(()=>window.TH.step(0.05));if(i===120)await page.screenshot({path:`${OUT}movil-faroles-6s.png`});}
await page.screenshot({path:`${OUT}movil-faroles-12s.png`});
if(errs.length){console.error("ERR",errs);process.exit(1);}
console.log("✓ faroles");
await browser.close();
