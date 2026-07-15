/**
 * Verifica que el HUD no se solapa (bug móvil v1.4 y v1.7) midiendo bounding
 * rects reales en varios viewports, con la money-card a su altura MÁXIMA:
 * dinero gordo + sello de reputación + vigía + clima (v1.8: los dos chips
 * nuevos que la hacían crecer por debajo del top fijo de misiones/banners).
 * Comprueba: money-card vs botón Misiones, y money-card vs banners de
 * evento/pedido con una tormenta y un pedido activos a la vez.
 * Uso: node scripts/verify-overlap.mjs [urlBase]
 */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:5199";
const OUT = new URL("../playtest-shots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--no-first-run", "--mute-audio"],
});

function overlaps(a, b) {
  return !(b.top >= a.bottom || b.bottom <= a.top || b.left >= a.right || b.right <= a.left);
}

let failures = 0;
for (const [w, h] of [[390, 844], [360, 740], [414, 896], [1440, 900]]) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/?dev=1`, { waitUntil: "networkidle0" });
  // Card a altura máxima + tormenta y pedido activos (banners apilados).
  await page.evaluate(() => {
    const s = window.TH.state;
    window.TH.give(1.23456e9);
    s.repEarned = 10;
    s.vigia = true;
    s.weather = 3; // marejada: chip visible
    s.event = { kind: "storm", stage: "warning", remaining: 9, tapsLeft: 0 };
    s.order = { stage: "active", goal: 1e6, progress: 2e5, remaining: 60, reward: 6e5 };
    window.TH.step(0.3);
  });
  const r = await page.evaluate(() => {
    const rect = (id) => document.getElementById(id).getBoundingClientRect();
    const card = rect("money-card");
    const btn = rect("missions-btn");
    const banner = document.querySelector("#event-slot .event-banner")?.getBoundingClientRect() ?? null;
    return {
      card: { top: card.top, bottom: card.bottom, left: card.left, right: card.right },
      btn: { top: btn.top, bottom: btn.bottom, left: btn.left, right: btn.right },
      banner: banner ? { top: banner.top, bottom: banner.bottom, left: banner.left, right: banner.right } : null,
    };
  });
  const btnOverlap = overlaps(r.card, r.btn);
  const btnGap = Math.round(r.btn.top - r.card.bottom);
  const bannerOverlapCard = r.banner ? overlaps(r.card, r.banner) : false;
  const bannerOverlapBtn = r.banner ? overlaps(r.btn, r.banner) : false;
  const ok = !btnOverlap && btnGap >= 4 && !bannerOverlapCard && !bannerOverlapBtn && r.banner !== null;
  console.log(
    `${ok ? "✓" : "✗"} ${w}×${h}: card→botón hueco ${btnGap}px` +
      (r.banner
        ? ` · banner en ${Math.round(r.banner.top)}px (${bannerOverlapCard ? "PISA card" : "libre de card"}, ${bannerOverlapBtn ? "PISA misiones" : "libre de misiones"})`
        : " · SIN banner (esperaba tormenta)"),
  );
  if (!ok) failures++;
  if (w === 390) await page.screenshot({ path: `${OUT}v18-overlap-max-hud.png` });
  await page.close();
}
await browser.close();
console.log(failures === 0 ? "✓ sin solapes en ningún viewport" : `✗ ${failures} viewports con solape`);
process.exit(failures === 0 ? 0 : 1);
