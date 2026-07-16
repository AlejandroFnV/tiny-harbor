/** Mide rects concretos del HUD para afinar fixes de pulido (no adivinar offsets). */
import puppeteer from "puppeteer-core";
const BASE = process.argv[2] ?? "http://localhost:5199";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new", args: ["--no-first-run", "--mute-audio"],
});

async function measure(w, h) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/?dev=1`, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.removeItem("tiny-harbor-save"));
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => !!window.TH);
  await page.evaluate(() => {
    const TH = window.TH, s = TH.state;
    TH.give(9.876e9); s.dockLevel = 6; s.zonesUnlocked = 4; s.reputation = 25; s.repEarned = 25; s.vigia = true; s.prestiges = 4; s.combo = 12;
    for (let i = 0; i < 6; i++) s.boats.push({ id: s.nextBoatId++, tier: 2, paint: 0, speedLvl: 3, capLvl: 3, phase: "fishing", phaseT: 1, cargo: 20, skipper: { name: "Marina", trait: "veloz" } });
    TH.step(0.3);
  });
  // Abrir sheet en flota (para ver tabbar activo + skipper-chip).
  await page.evaluate(() => document.querySelector("#tabbar button[data-tab='flota']")?.click());
  await sleep(400);
  const r = await page.evaluate(() => {
    const g = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { t: +b.top.toFixed(1), b: +b.bottom.toFixed(1), l: +b.left.toFixed(1), r: +b.right.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
    const activeBtn = document.querySelector("#tabbar button.active");
    // label = último nodo de texto del botón activo: medir vía range
    let labelRect = null;
    if (activeBtn) {
      const tn = [...activeBtn.childNodes].reverse().find((n) => n.nodeType === 3 && n.textContent.trim());
      if (tn) { const rg = document.createRange(); rg.selectNodeContents(tn); const rb = rg.getBoundingClientRect(); labelRect = { t: +rb.top.toFixed(1), b: +rb.bottom.toFixed(1) }; }
    }
    const after = activeBtn ? (() => { const cs = getComputedStyle(activeBtn, "::after"); return { bottom: cs.bottom, height: cs.height }; })() : null;
    const mute = g(document.getElementById("mute-btn"));
    const skip = g(document.querySelector(".skipper-chip"));
    return { btn: g(activeBtn), label: labelRect, after, mute, muteOffscreen: mute ? +(mute.r - window.innerWidth).toFixed(1) : null, skip };
  });
  console.log(`\n=== ${w}×${h} ===`);
  console.log("tabbar activeBtn:", JSON.stringify(r.btn));
  console.log("  label textbox :", JSON.stringify(r.label), "| ::after", JSON.stringify(r.after));
  console.log("mute-btn:", JSON.stringify(r.mute), "| overflow px:", r.muteOffscreen);
  console.log("skipper-chip:", JSON.stringify(r.skip));
  await page.close();
}
await measure(390, 844);
await measure(360, 740);
await browser.close();
