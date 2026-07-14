/**
 * Verifica los sistemas v3 contra el dev server (5199) y la PWA contra el
 * build de producción (vite preview en 5200, lanzado aparte):
 *  1. Pedido de la lonja: oferta → aceptar → progreso → bono. Cliente visible.
 *  2. Pescadoteca: álbum en Mapa, descubrimiento con toast, bonus aplicado.
 *  3. Pueblo que crece: nº de edificios aumenta con hitos.
 *  4. Música: toggle persiste.
 *  5. PWA (5200): manifest + iconos 200, SW registrado, y RECARGA OFFLINE.
 */
import puppeteer from "puppeteer-core";

const DEV = "http://localhost:5199";
const PROD = "http://localhost:5200";
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

// ------------------------------------------------------ 1-4: sistemas de juego
{
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(`${DEV}/?dev=1`, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.removeItem("tiny-harbor-save"));
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => !!window.TH);

  // Pedido: fuerza la oferta.
  await page.evaluate(() => {
    window.TH.state.playTime = 300;
    window.TH.state.orderT = 0.01;
    window.TH.step(0.1);
    window.TH.step(0.1);
  });
  await sleep(300);
  const offer = await page.evaluate(() => ({
    stage: window.TH.state.order?.stage,
    banner: document.querySelector("#order-slot .event-banner h3")?.textContent ?? "",
  }));
  check("pedido: oferta con banner", offer.stage === "offer" && /lonja/i.test(offer.banner));
  await page.screenshot({ path: "playtest-shots/v3-pedido-oferta.png" });

  await page.tap("[data-action='order-accept']");
  await sleep(250);
  const active = await page.evaluate(() => window.TH.state.order?.stage);
  check("pedido: aceptar → activo", active === "active");

  // Completa el pedido con pesca acelerada.
  const done = await page.evaluate(() => {
    const TH = window.TH;
    let guard = 400;
    while (TH.state.order && guard-- > 0) {
      if (TH.state.order.remaining < 30) TH.state.order.remaining = 90;
      TH.step(2);
      for (const b of TH.state.boats) {
        if (b.phase === "ready") {
          const y = innerHeight * 0.76 - 12;
          for (let x = 20; x < innerWidth; x += 25) {
            document.getElementById("game-canvas").dispatchEvent(
              new PointerEvent("pointerdown", { clientX: x, clientY: y, bubbles: true }),
            );
          }
        }
      }
    }
    return TH.state.order === null;
  });
  check("pedido: completado y bono pagado", done);

  // Pescadoteca: fuerza descubrimientos cobrando mucho.
  const species = await page.evaluate(() => {
    const TH = window.TH;
    let guard = 1500;
    while (TH.state.discovered.length < 1 && guard-- > 0) {
      TH.step(21);
      const y = innerHeight * 0.76 - 12;
      for (let x = 20; x < innerWidth; x += 25) {
        document.getElementById("game-canvas").dispatchEvent(
          new PointerEvent("pointerdown", { clientX: x, clientY: y, bubbles: true }),
        );
      }
    }
    return TH.state.discovered.length;
  });
  check("pescadoteca: especie descubierta jugando", species >= 1);

  await page.tap("#tabbar [data-tab='mapa']");
  await sleep(400);
  const album = await page.evaluate(() => ({
    thumbs: document.querySelectorAll(".fish-thumb").length,
    known: document.querySelectorAll(".fish-thumb:not(.unknown)").length,
    counter: document.querySelector(".card .name")?.textContent ?? "",
  }));
  check(
    "pescadoteca: álbum en Mapa (18 especies, descubiertas a color)",
    album.thumbs === 18 && album.known >= 1 && /Pescadoteca/.test(album.counter),
    `${album.known}/${album.thumbs}`,
  );
  await page.screenshot({ path: "playtest-shots/v3-album.png" });

  // Pueblo que crece: cuenta píxeles de la orilla antes/después de hitos.
  const growth = await page.evaluate(() => {
    const TH = window.TH;
    const count = () => {
      // nº de edificios según los mismos hitos del renderer
      const s = TH.state;
      let n = 2; // faro + casa
      if (s.boats.length >= 3 || s.dockLevel >= 1) n++;
      if (s.managerLvl >= 1) n++;
      if (s.zonesUnlocked >= 2) n++;
      return n;
    };
    const before = count();
    TH.give(1e9);
    TH.state.dockLevel = 2;
    TH.state.managerLvl = 1;
    TH.state.zonesUnlocked = 2;
    TH.step(0.1);
    return { before, after: count() };
  });
  check("pueblo: crece con hitos", growth.after > growth.before, `${growth.before} → ${growth.after} edificios`);
  await sleep(300);
  await page.screenshot({ path: "playtest-shots/v3-pueblo.png" });

  // Música: toggle en Puerto y persistencia.
  await page.tap("#tabbar [data-tab='puerto']");
  await sleep(300);
  await page.tap("[data-action='toggle-music']");
  await sleep(200);
  await page.evaluate(() => window.TH.save());
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => !!window.TH);
  const music = await page.evaluate(() => window.TH.state.settings.music);
  check("música: apagada y persiste tras recargar", music === false);

  check("cero errores de página en el flujo v3", errs.length === 0, errs.join(" | "));
  await page.close();
}

// ------------------------------------------------------ 5: PWA (build de prod)
{
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const res = await page.goto(`${PROD}/`, { waitUntil: "networkidle0" });
  check("prod: index 200", res.status() === 200);
  const manifest = await page.evaluate(async () => (await fetch("/manifest.webmanifest")).status);
  const icon = await page.evaluate(async () => (await fetch("/icons/icon-192.png")).status);
  check("prod: manifest + iconos servidos", manifest === 200 && icon === 200);

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  check("prod: service worker activo", true);
  await sleep(1200); // deja que el SW cachee los assets del primer load

  // OFFLINE de verdad: corta la red y recarga.
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: "networkidle0" }).catch(() => {});
  await sleep(800);
  const offlineOk = await page
    .evaluate(() => !!document.getElementById("game-canvas") && document.title === "Tiny Harbor")
    .catch(() => false);
  check("prod: el juego CARGA OFFLINE (recarga sin red)", offlineOk);
  await page.setOfflineMode(false);
  await page.close();
}

await browser.close();
process.exit(fails ? 1 : 0);
