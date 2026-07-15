/**
 * Verifica los sistemas v1.2 contra el dev server (5199):
 *  1. Arranque limpio sin errores de página (el primer frame no muere).
 *  2. Taberna: candidatos llegan, fichar cobra y pone el chip en Flota.
 *  3. Árbol de legado: comprar gasta rep, pips y efecto visibles.
 *  4. Logros: se desbloquean, aparecen en la pestaña Legado.
 *  5. Contenido nuevo: 8 tiers y 8 zonas navegables, 30 especies en el mapa,
 *     sprites nuevos renderizan sin matar el loop.
 *  6. Migración: un save v3 inyectado carga como v4 conservando reputación.
 */
import puppeteer from "puppeteer-core";

const DEV = "http://localhost:5199";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
  if (!ok) fails++;
};

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--no-first-run", "--mute-audio"],
});

const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
await page.goto(`${DEV}/?dev=1`, { waitUntil: "networkidle0" });
await page.evaluate(() => localStorage.removeItem("tiny-harbor-save"));
await page.reload({ waitUntil: "networkidle0" });
await page.waitForFunction(() => !!window.TH);
await sleep(400);

// ---------------------------------------------------------------- 1. arranque
check("arranque sin errores de página", errs.length === 0, errs.join(" | "));

// ---------------------------------------------------------------- 2. taberna
await page.evaluate(() => {
  const TH = window.TH;
  TH.give(2000);
  TH.step(0.1);
});
await page.tap("[data-tab='flota']"); // abre la hoja para poder comprar
await sleep(300);
await page.tap("[data-action='buy-boat']"); // segundo barco → abre la taberna
await page.evaluate(() => {
  const TH = window.TH;
  // Avanza hasta que la taberna se llene.
  let guard = 10;
  while (TH.state.tavern.candidates.length < 2 && guard-- > 0) TH.step(125);
});
const tavern = await page.evaluate(() => window.TH.state.tavern.candidates.length);
check("taberna: 2 candidatos esperando", tavern === 2);

// Abre Puerto y ficha al primero.
await page.tap("[data-tab='puerto']");
await sleep(300);
const tavernUI = await page.evaluate(() => ({
  cards: document.querySelectorAll(".tavern-card").length,
  portraits: [...document.querySelectorAll(".tavern-card .portrait")].every((i) => i.src.startsWith("data:")),
}));
check("taberna: cartas con retrato en Puerto", tavernUI.cards === 2 && tavernUI.portraits);
await page.screenshot({ path: "playtest-shots/v4-taberna.png" });

const hired = await page.evaluate(() => {
  const TH = window.TH;
  const cand = TH.state.tavern.candidates[0];
  TH.give(cand.cost);
  TH.step(0.1);
  document.querySelector("[data-action='hire-skipper']").click();
  TH.step(0.1);
  return {
    name: cand.name,
    onBoat: TH.state.boats.some((b) => b.skipper?.name === cand.name),
    left: TH.state.tavern.candidates.length,
  };
});
check("taberna: fichar asigna patrón al barco", hired.onBoat && hired.left === 1, hired.name);

await page.tap("[data-tab='flota']");
await sleep(300);
const chip = await page.evaluate(() => document.querySelector(".skipper-chip")?.textContent ?? "");
check("flota: chip del patrón visible", chip.includes(hired.name));
await page.screenshot({ path: "playtest-shots/v4-chip-patron.png" });

// ---------------------------------------------------------------- 3. legado
await page.evaluate(() => {
  const TH = window.TH;
  TH.state.reputation = 10;
  TH.state.repEarned = 10;
  TH.step(0.1);
});
await page.tap("[data-tab='prestigio']");
await sleep(300);
const legacyUI = await page.evaluate(() => ({
  cards: document.querySelectorAll(".legacy-card").length,
  balance: document.querySelector(".rep-balance")?.textContent ?? "",
}));
check("legado: 3 ramas y saldo visible", legacyUI.cards === 3 && legacyUI.balance.includes("10"));

const legacyBuy = await page.evaluate(() => {
  document.querySelector("[data-action='buy-legacy'][data-branch='astillero']").click();
  window.TH.step(0.1);
  return {
    lvl: window.TH.state.legacy.astillero,
    rep: window.TH.state.reputation,
    pipOn: document.querySelectorAll(".legacy-card .pips i.on").length,
  };
});
check("legado: comprar sube nivel y gasta rep", legacyBuy.lvl === 1 && legacyBuy.rep === 9 && legacyBuy.pipOn === 1);
await page.screenshot({ path: "playtest-shots/v4-legado.png" });

// ---------------------------------------------------------------- 4. logros
await page.tap("[data-tab='flota']");
await sleep(300);
const ach = await page.evaluate(() => {
  const TH = window.TH;
  TH.give(1e7);
  TH.state.dockLevel = 8; // amarres de sobra para el test
  TH.step(0.1);
  let guard = 30;
  while (TH.state.boats.length < 5 && guard-- > 0) {
    const btn = document.querySelector("[data-action='buy-boat']");
    if (btn && !btn.disabled) btn.click();
    TH.step(0.1);
  }
  TH.step(1);
  return {
    boats: TH.state.boats.length,
    has: TH.state.achievements.includes("flota5"),
    legado1: TH.state.achievements.includes("legado1"),
  };
});
check("logros: flota5 y legado1 desbloqueados", ach.has && ach.legado1, `barcos=${ach.boats}`);

await page.tap("[data-tab='prestigio']");
await sleep(300);
const achUI = await page.evaluate(() => document.querySelectorAll(".ach.got").length);
check("logros: estrellas en la pestaña Legado", achUI >= 2, `got=${achUI}`);
await page.screenshot({ path: "playtest-shots/v4-logros.png" });

// ------------------------------------------------ 5. contenido nuevo (tiers/zonas)
await page.tap("[data-tab='mapa']");
await sleep(300);
const content = await page.evaluate(() => {
  const TH = window.TH;
  TH.give(2e10); // cubre los 12.7B de desbloqueos acumulados
  TH.step(0.1);
  let guard = 20;
  while (TH.state.zonesUnlocked < 7 && guard-- > 0) {
    const btn = document.querySelector("[data-action='unlock-zone']");
    if (!btn || btn.disabled) break;
    btn.click();
    TH.step(0.1);
  }
  return { zones: TH.state.zonesUnlocked };
});
check("mapa: llegamos a El Fin del Mapa (zona 8/8)", content.zones === 7);

await page.tap("[data-tab='flota']");
await sleep(300);
const bigBoats = await page.evaluate(() => {
  const TH = window.TH;
  TH.give(2e12);
  TH.state.dockLevel = 11; // muelle al máximo (14 amarres)
  TH.step(0.1);
  const before = TH.state.boats.length;
  for (const tier of [5, 6, 7]) {
    const btns = [...document.querySelectorAll("[data-action='buy-boat']")];
    const btn = btns.find((b) => Number(b.dataset.tier) === tier);
    if (btn && !btn.disabled) {
      btn.click();
      TH.step(0.1);
    }
  }
  TH.step(2);
  return {
    bought: TH.state.boats.length - before,
    tiers: [...new Set(TH.state.boats.map((b) => b.tier))].sort((a, b) => a - b).join(","),
  };
});
check("flota: los 3 tiers nuevos se botan y navegan", bigBoats.bought === 3, `tiers=${bigBoats.tiers}`);
await sleep(400);
check("render: sprites nuevos no matan el loop", errs.length === 0, errs.join(" | "));
await page.screenshot({ path: "playtest-shots/v4-flota-grande.png" });

await page.tap("[data-tab='mapa']");
await sleep(300);
const mapa = await page.evaluate(() => ({
  zonas: document.querySelectorAll(".zone-item").length,
  peces: document.querySelectorAll(".fish-thumb").length,
  titulo: document.querySelector(".card .name")?.textContent ?? "",
}));
check("mapa: 8 zonas y 30 especies listadas", mapa.zonas === 8 && mapa.peces === 30, mapa.titulo);
await page.screenshot({ path: "playtest-shots/v4-mapa.png" });

// ---------------------------------------------------------------- 6. migración v3
const migrated = await page.evaluate(() => {
  const v3 = {
    version: 3,
    money: 1234,
    lifetime: 5000,
    totalEarned: 9999,
    reputation: 6,
    prestiges: 2,
    boats: [{ id: 1, tier: 1, speedLvl: 2, capLvl: 1, phase: "out", phaseT: 0, cargo: 0 }],
    nextBoatId: 2,
    dockLevel: 1,
    managerLvl: 1,
    managerT: 3,
    zonesUnlocked: 2,
    missions: [],
    nextMissionId: 1,
    missionsDone: 4,
    event: null,
    eventT: 100,
    order: null,
    orderT: 200,
    discovered: ["sardina", "pulpo"],
    lastSeen: Date.now(),
    playTime: 600,
    tutorialStep: 99,
    settings: { muted: true, music: false },
    stats: { collects: 10, boatsBought: 2, upgrades: 3, taps: 5 },
    rngSeed: 42,
  };
  localStorage.setItem("tiny-harbor-save", JSON.stringify(v3));
  // El autosave de pagehide NO debe machacar el save inyectado al recargar.
  localStorage.setItem = () => {};
  return true;
});
await page.reload({ waitUntil: "networkidle0" });
await page.waitForFunction(() => !!window.TH);
await sleep(300);
const v4 = await page.evaluate(() => {
  const s = window.TH.state;
  return {
    version: s.version,
    rep: s.reputation,
    repEarned: s.repEarned,
    discovered: s.discovered.length,
    legacy: s.legacy,
    muted: s.settings.muted,
  };
});
check(
  "migración v3→v4: conserva rep/pescadoteca y añade lo nuevo",
  v4.version === 4 && v4.rep === 6 && v4.repEarned === 6 && v4.discovered === 2 && v4.legacy.astillero === 0 && v4.muted === true,
  JSON.stringify(v4),
);
check("migración: sin errores tras recargar", migrated && errs.length === 0, errs.join(" | "));

await browser.close();
console.log(fails === 0 ? "\nTODO OK (v4)" : `\n${fails} FALLOS`);
process.exit(fails === 0 ? 0 : 1);
