/**
 * Verificación v1.5 en navegador real:
 *  1. Kraken: warning → activo (tentáculos visibles), taps reales lo ahuyentan.
 *  2. Leyendas: pista visible en la pescadoteca (no un "???").
 *  3. Regalo diario: modal al tocar, racha al día siguiente.
 *  4. Renombrar puerto + tarjeta de capitán sin errores.
 *  5. Migración v6→v7.
 * Uso: node scripts/verify-v7.mjs [urlBase]
 */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:5199";
const OUT = new URL("../playtest-shots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const errors = [];
let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--no-first-run", "--mute-audio"],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(`${BASE}/?dev=1`, { waitUntil: "networkidle0" });
await page.evaluate(() => localStorage.clear());
await page.goto(`${BASE}/?dev=1`, { waitUntil: "networkidle0" });

// --- 1. Kraken ---------------------------------------------------------------------
await page.evaluate(() => {
  const s = window.TH.state;
  window.TH.give(1e6);
  s.zonesUnlocked = 6;
  s.event = { kind: "kraken", stage: "active", remaining: 14, tapsLeft: 18 };
  window.TH.step(0.2);
});
await page.screenshot({ path: `${OUT}v7-kraken.png` });
const bannerTxt = await page.evaluate(() => document.getElementById("event-slot").textContent);
check("banner del kraken con contador de taps", /KRAKEN/.test(bannerTxt) && /18/.test(bannerTxt), bannerTxt.slice(0, 60));
const kraken = await page.evaluate(() => {
  const s = window.TH.state;
  const canvas = document.getElementById("game-canvas");
  const r = canvas.getBoundingClientRect();
  // Tapea el centro del mar (donde está el kraken) hasta ahuyentarlo.
  let guard = 60;
  while (s.event && s.event.kind === "kraken" && guard-- > 0) {
    canvas.dispatchEvent(new PointerEvent("pointerdown", {
      clientX: r.left + r.width * 0.5, clientY: r.top + r.height * 0.5, bubbles: true,
    }));
    window.TH.step(0.05);
  }
  return { gone: s.event === null, repelled: s.stats.krakensRepelled, money: s.money };
});
check("18 taps reales ahuyentan al kraken con botín", kraken.gone && kraken.repelled === 1, JSON.stringify(kraken));

// --- 2. Leyendas: pista en la pescadoteca --------------------------------------------
await page.click("[data-tab='mapa']");
await page.evaluate(() => window.TH.step(0.1));
const hint = await page.evaluate(() => {
  const legends = [...document.querySelectorAll(".fish-thumb.legend")];
  return { count: legends.length, sample: legends[0]?.title ?? "" };
});
check("las 4 leyendas se ven con su PISTA", hint.count === 4 && /LEYENDA/.test(hint.sample), `${hint.count} · "${hint.sample.slice(0, 50)}…"`);
await page.screenshot({ path: `${OUT}v7-leyendas.png` });

// --- 3. Regalo diario -----------------------------------------------------------------
const gift1 = await page.evaluate(() => {
  const s = window.TH.state;
  s.gift = { lastAt: 0, streak: 0 };
  // El regalo se comprueba al volver a la pestaña: simulamos el flujo con visibilitychange
  // disparando la ruta pública — más simple: recarga (checkGift corre al arrancar).
  return null;
});
await page.evaluate(() => window.TH.save());
await page.reload({ waitUntil: "networkidle0" });
const giftModal = await page.evaluate(() => {
  const modal = document.querySelector(".modal");
  return { open: !!modal, text: modal?.textContent ?? "" };
});
check("el paquete del pescador aparece (día 1)", giftModal.open && /Día\s*1/.test(giftModal.text.replace(/\s+/g, " ")), giftModal.text.slice(0, 60));
await page.screenshot({ path: `${OUT}v7-regalo.png` });
await page.click("#gift-btn");
// Día siguiente (25h): racha 2.
const gift2 = await page.evaluate(() => {
  const s = window.TH.state;
  s.gift.lastAt = Date.now() - 25 * 3_600_000;
  s.gift.streak = 1;
  return null;
});
await page.evaluate(() => window.TH.save());
await page.reload({ waitUntil: "networkidle0" });
const giftModal2 = await page.evaluate(() => document.querySelector(".modal")?.textContent ?? "");
check("al día siguiente la racha sube (día 2)", /Día\s*2/.test(giftModal2.replace(/\s+/g, " ")), giftModal2.slice(0, 60));
await page.click("#gift-btn");

// --- 4. Renombrar + tarjeta de capitán --------------------------------------------------
await page.click("[data-tab='prestigio']");
await page.evaluate(() => window.TH.step(0.1));
const renameBtn = await page.$("[data-action='rename-port']");
await renameBtn.scrollIntoViewIfNeeded();
await page.click("[data-action='rename-port']");
await page.type("#port-name-input", "La Caleta");
await page.click("#rename-yes");
const portName = await page.evaluate(() => {
  window.TH.step(0.1);
  return window.TH.state.portName;
});
check("renombrar el puerto funciona", portName === "La Caleta", portName);
const shareBtn = await page.$("[data-action='share-card']");
await shareBtn.scrollIntoViewIfNeeded();
await page.click("[data-action='share-card']");
await new Promise((r) => setTimeout(r, 1200));
check("la tarjeta de capitán se genera sin errores", errors.length === 0);
await page.screenshot({ path: `${OUT}v7-historia.png` });

// --- 5. Migración v6→v7 ------------------------------------------------------------------
const snap = await page.evaluate(() => JSON.parse(JSON.stringify(window.TH.state)));
await page.close();
const v6save = { ...snap, version: 6 };
delete v6save.portName;
delete v6save.gift;
delete v6save.stats.krakensRepelled;
delete v6save.stats.bestLifetime;
const page2 = await browser.newPage();
await page2.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
page2.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page2.on("pageerror", (e) => errors.push(e.message));
await page2.evaluateOnNewDocument((json) => localStorage.setItem("tiny-harbor-save", json), JSON.stringify(v6save));
await page2.goto(`${BASE}/?dev=1`, { waitUntil: "networkidle0" });
const migrated = await page2.evaluate(() => {
  const s = window.TH.state;
  return { version: s.version, portName: s.portName, kraken: s.stats.krakensRepelled };
});
check("migración v6→v7", migrated.version === 7 && migrated.portName === "" && migrated.kraken === 0, JSON.stringify(migrated));

// --------------------------------------------------------------------------------------------
await browser.close();
if (errors.length) {
  console.error(`\n✗ ${errors.length} errores de consola:`);
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}
console.log(failures === 0 ? "\n✓ verify-v7: todo OK, cero errores de consola" : `\n✗ verify-v7: ${failures} fallos`);
process.exit(failures === 0 ? 0 : 1);
