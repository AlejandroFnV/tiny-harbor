/**
 * Edge cases de entorno que los unit tests no cubren:
 * 1. localStorage bloqueado (incógnito estricto) → el juego corre en memoria + avisa.
 * 2. Rotación del móvil (portrait ⇄ landscape) → el canvas se reajusta.
 * 3. Mute persiste en el save.
 * Uso: node scripts/edge-cases.mjs [urlBase]
 */
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] ?? "http://localhost:5199";
const errors = [];
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--no-first-run", "--mute-audio"],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok) => {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
  if (!ok) fails++;
};

// --- 1. localStorage bloqueado --------------------------------------------------
{
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.evaluateOnNewDocument(() => {
    const deny = () => {
      throw new DOMException("QuotaExceededError");
    };
    Object.defineProperty(window, "localStorage", {
      get() {
        return { getItem: deny, setItem: deny, removeItem: deny };
      },
    });
  });
  await page.goto(`${BASE}/?dev=1`, { waitUntil: "networkidle0" });
  await sleep(1500);
  const alive = await page.evaluate(() => {
    window.TH.step(1);
    return Number.isFinite(window.TH.state.playTime) && window.TH.state.playTime > 0;
  });
  check("localStorage bloqueado: el juego corre en memoria", alive);
  // El aviso salta en el primer intento de guardado (autosave a los 10s).
  await page.evaluate(() => {
    for (let i = 0; i < 25; i++) window.TH.step(0.5);
  });
  await page.evaluate(() => window.TH.save());
  await sleep(300);
  const toast = await page.$eval(".toasts", (el) => el.textContent).catch(() => "");
  check("localStorage bloqueado: aviso al jugador", /guardar/i.test(toast ?? ""));
  await page.close();
}

// --- 2. Rotación ------------------------------------------------------------------
{
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/?dev=1`, { waitUntil: "networkidle0" });
  await sleep(800);
  await page.setViewport({ width: 844, height: 390 }); // landscape
  await sleep(500);
  const r1 = await page.evaluate(() => {
    window.TH.step(0.1);
    const c = document.getElementById("game-canvas");
    return { w: c.width, cssW: c.style.width, inner: window.innerWidth };
  });
  check("rotación → landscape: canvas reajustado", r1.cssW === `${r1.inner}px`);
  await page.setViewport({ width: 390, height: 844 }); // de vuelta
  await sleep(500);
  const r2 = await page.evaluate(() => {
    window.TH.step(0.1);
    return { cssW: document.getElementById("game-canvas").style.width, inner: window.innerWidth };
  });
  check("rotación → portrait: canvas reajustado", r2.cssW === `${r2.inner}px`);
  await page.close();
}

// --- 3. Mute persiste ---------------------------------------------------------------
{
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/?dev=1`, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.removeItem("tiny-harbor-save"));
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => !!window.TH);
  await page.tap("#mute-btn");
  await sleep(200);
  await page.evaluate(() => window.TH.save());
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => !!window.TH);
  const muted = await page.evaluate(() => window.TH.state.settings.muted);
  check("mute persiste tras recargar", muted === true);
  await page.close();
}

await browser.close();
if (errors.length) {
  console.error(`✗ errores de página: ${errors.join(" | ")}`);
  process.exit(1);
}
process.exit(fails ? 1 : 0);
