/**
 * Verificación v1.6 en navegador real:
 *  1. Venta con compradores: modal con 3 ofertas, vender a una especial funciona.
 *  2. Torre del Vigía: comprar → chip con countdowns bajo el dinero.
 *  3. El Alba: con las 4 leyendas aparece su vitrina y se bota (dorada, en escena).
 *  4. Puerto completado: barra y % en Legado.
 *  5. Migración v7→v8.
 * Uso: node scripts/verify-v8.mjs [urlBase]
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

// --- 1. Compradores -------------------------------------------------------------
await page.evaluate(() => {
  window.TH.give(500_000); // lifetime > umbral de venta
  window.TH.state.boats.push({ id: 99, tier: 2, speedLvl: 0, capLvl: 0, phase: "out", phaseT: 0, cargo: 0, skipper: null });
  window.TH.step(0.2);
});
await page.click("[data-tab='prestigio']");
await page.evaluate(() => window.TH.step(0.1));
const sellBtn = await page.$("[data-action='prestige']");
await sellBtn.scrollIntoViewIfNeeded();
await page.click("[data-action='prestige']");
const buyers = await page.evaluate(() => {
  const cards = [...document.querySelectorAll(".buyer-card")];
  return { n: cards.length, names: cards.map((c) => c.querySelector(".bname").textContent) };
});
check("modal de venta con 3 compradores", buyers.n === 3 && buyers.names[0] === "La Naviera", JSON.stringify(buyers.names));
await page.screenshot({ path: `${OUT}v8-compradores.png` });
// Vende al segundo (especial).
await page.evaluate(() => {
  const specials = document.querySelectorAll(".buyer-card.special");
  specials[0].click();
});
const afterSale = await page.evaluate(() => {
  window.TH.step(0.1);
  const s = window.TH.state;
  return { prestiges: s.prestiges, special: s.stats.specialSales, rep: s.repEarned };
});
check("vender a un comprador especial", afterSale.prestiges === 1 && afterSale.special === 1 && afterSale.rep > 0, JSON.stringify(afterSale));

// --- 2. Vigía ---------------------------------------------------------------------
await page.evaluate(() => {
  window.TH.give(100_000);
  window.TH.step(0.1);
});
await page.click("[data-tab='puerto']");
await page.evaluate(() => window.TH.step(0.1));
const vigiaBtn = await page.$("[data-action='buy-vigia']");
await vigiaBtn.scrollIntoViewIfNeeded();
await page.click("[data-action='buy-vigia']");
const vigia = await page.evaluate(() => {
  window.TH.step(0.3);
  const chip = document.getElementById("vigia-chip");
  return { owned: window.TH.state.vigia, chipHidden: chip.hidden, txt: chip.textContent };
});
check("vigía comprado y chip oteando", vigia.owned && !vigia.chipHidden && /vigía:/.test(vigia.txt), vigia.txt);

// --- 3. El Alba --------------------------------------------------------------------
await page.evaluate(() => {
  const s = window.TH.state;
  s.discovered.push("reysol", "sierpe", "farolreal", "fantasma");
  window.TH.give(300_000_000);
  window.TH.step(0.1);
});
await page.click("[data-tab='flota']");
await page.evaluate(() => window.TH.step(0.1));
const albaCard = await page.evaluate(() => {
  const card = document.querySelector(".alba-card");
  return { visible: !!card, txt: card?.textContent ?? "" };
});
check("la vitrina de El Alba aparece con las 4 leyendas", albaCard.visible && /leyenda/.test(albaCard.txt), "");
await page.evaluate(() => {
  document.querySelector(".alba-card [data-action='buy-boat']").click();
  window.TH.step(0.2);
});
const alba = await page.evaluate(() => ({
  owned: window.TH.state.boats.some((b) => b.tier === 8),
  achievement: window.TH.state.achievements.includes("alba1"),
}));
check("El Alba botada + logro", alba.owned && alba.achievement, JSON.stringify(alba));
await page.screenshot({ path: `${OUT}v8-alba.png` });

// --- 4. Completado -----------------------------------------------------------------
await page.click("[data-tab='prestigio']");
await page.evaluate(() => window.TH.step(0.1));
const completion = await page.evaluate(() => {
  const bar = document.querySelector(".completion-bar i");
  const label = [...document.querySelectorAll(".section-title")].find((el) => /COMPLETADO/.test(el.textContent));
  return { bar: !!bar, label: label?.textContent.replace(/\s+/g, " ") ?? "" };
});
check("barra de puerto completado con %", completion.bar && /%/.test(completion.label), completion.label);
await page.screenshot({ path: `${OUT}v8-completado.png` });

// --- 5. Migración v7→v8 --------------------------------------------------------------
const snap = await page.evaluate(() => JSON.parse(JSON.stringify(window.TH.state)));
await page.close();
const v7save = { ...snap, version: 7 };
delete v7save.vigia;
delete v7save.stats.specialSales;
const page2 = await browser.newPage();
await page2.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
page2.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page2.on("pageerror", (e) => errors.push(e.message));
await page2.evaluateOnNewDocument((json) => localStorage.setItem("tiny-harbor-save", json), JSON.stringify(v7save));
await page2.goto(`${BASE}/?dev=1`, { waitUntil: "networkidle0" });
const migrated = await page2.evaluate(() => {
  const s = window.TH.state;
  return { version: s.version, vigia: s.vigia, alba: s.boats.some((b) => b.tier === 8) };
});
check("migración v7→v8 (El Alba sobrevive el save)", migrated.version === 8 && migrated.vigia === false && migrated.alba, JSON.stringify(migrated));

// ---------------------------------------------------------------------------------------
await browser.close();
if (errors.length) {
  console.error(`\n✗ ${errors.length} errores de consola:`);
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}
console.log(failures === 0 ? "\n✓ verify-v8: todo OK, cero errores de consola" : `\n✗ verify-v8: ${failures} fallos`);
process.exit(failures === 0 ? 0 : 1);
