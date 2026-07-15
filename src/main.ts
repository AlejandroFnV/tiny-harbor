/**
 * main.ts — arranque y game loop.
 * rAF + delta time: la simulación NO depende del framerate (pasos troceados
 * a MAX_TICK_STEP_S). Autosave cada 10s y en visibilitychange. Ausencias
 * largas pasan por applyOffline (cofre), incluidas las que ocurren con la
 * pestaña en background.
 */

import "@fontsource-variable/bricolage-grotesque";
import "./style.css";

import * as C from "./sim/config";
import { applyOffline } from "./sim/offline";
import { loadFromStorage, saveToStorage, clearStorage } from "./sim/save";
import {
  acceptOrder,
  buyBoat,
  buyLegacy,
  buyVigia,
  checkDaily,
  claimGift,
  collectAll,
  collectBoat,
  declineOrder,
  doPrestige,
  hireManager,
  hireSkipper,
  paintBoat,
  renamePort,
  resolveStorm,
  startExpedition,
  tapDrift,
  tapKraken,
  tapShoal,
  tick,
  unlockZone,
  upgradeBoat,
  upgradeDock,
  upgradeLonja,
} from "./sim/sim";
import { completionPct } from "./sim/economy";
import { formatMoney } from "./sim/format";
import { newGame } from "./sim/state";
import type { GameState, SimEvent } from "./sim/types";
import { Renderer } from "./render/renderer";
import { boatThumbURL } from "./render/sprites";
import { AudioEngine } from "./audio/audio";
import { UI } from "./ui/ui";
import { Tutorial } from "./ui/tutorial";

// ---------------------------------------------------------------------------- boot
const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const uiRoot = document.getElementById("ui-root")!;

let state: GameState = loadFromStorage() ?? newGame(Date.now(), (Date.now() % 4294967291) >>> 0);

const renderer = new Renderer(canvas);
renderer.resize();
const audio = new AudioEngine();
audio.setMuted(state.settings.muted);
audio.setMusic(state.settings.music);

let saveFailWarned = false;
function persist(): void {
  state.lastSeen = Date.now();
  const ok = saveToStorage(state);
  if (!ok && !saveFailWarned) {
    saveFailWarned = true;
    ui.toast("No se puede guardar en este navegador (¿incógnito?). La partida vive en memoria.");
  }
}

// --------------------------------------------------------------------------- acciones
const RARITY_TEXT = { comun: "", rara: " (¡rara!)", epica: " (¡¡ÉPICA!!)", leyenda: " (¡¡¡LEYENDA!!!)" } as const;

function handleEvents(events: SimEvent[]): void {
  if (events.length === 0) return;
  renderer.onSimEvents(events, state);
  for (const ev of events) {
    switch (ev.kind) {
      case "mission_done":
        ui.toast(`Misión cumplida: ${ev.text} (+${Math.round(ev.reward)})`);
        audio.play("mission");
        break;
      case "event_start":
        audio.play(ev.event === "frenzy" ? "event" : "storm");
        break;
      case "kraken_repelled":
        ui.toast(`¡El Kraken huye! Botín de leyenda: +${formatMoney(ev.amount)}.`);
        audio.play("prestige");
        renderer.particles.confetti(window.innerWidth / 2, window.innerHeight * 0.5, 44);
        break;
      case "kraken_escaped":
        ui.toast(`El Kraken se sumerge con ${formatMoney(ev.lost)} de tu carga…`);
        audio.play("error");
        break;
      case "weather_change": {
        const w = C.WEATHERS[ev.weather];
        if (w && ev.weather !== 0) ui.toast(`Amanece con ${w.name.toLowerCase()}: ${w.desc.toLowerCase()}.`);
        break;
      }
      case "daily_done":
        ui.toast(`Desafío del día cumplido: ${ev.text}. +${formatMoney(ev.reward)}.`);
        audio.play("chest");
        renderer.particles.confetti(window.innerWidth / 2, window.innerHeight * 0.3, 30);
        break;
      case "order_offer":
        audio.play("event");
        break;
      case "order_done":
        ui.toast(`Pedido entregado. Bono +${Math.round(ev.reward)}.`);
        audio.play("chest");
        renderer.particles.confetti(window.innerWidth * 0.68, window.innerHeight * 0.72, 20);
        break;
      case "skipper_hired":
        ui.toast(`${ev.name} toma el timón del barco nº${ev.boatId}.`);
        audio.play("upgrade");
        break;
      case "achievement": {
        const a = C.ACHIEVEMENTS.find((x) => x.id === ev.id);
        if (a) {
          ui.toast(`Logro: ${a.name} · +${C.ACHIEVEMENT_INCOME_BONUS * 100}% ingresos para siempre`);
          audio.play("mission");
          renderer.particles.confetti(window.innerWidth / 2, window.innerHeight * 0.25, 18);
        }
        break;
      }
      case "golden": {
        ui.toast(`¡Captura dorada! ×${C.GOLDEN_MULT} (+${Math.round(ev.amount)})`);
        audio.play("chest");
        renderer.particles.confetti(window.innerWidth / 2, window.innerHeight * 0.55, 26);
        renderer.particles.spark(window.innerWidth / 2, window.innerHeight * 0.55, 18, "#dfa93e");
        break;
      }
      case "drift_spawn":
        audio.play("event");
        if (ev.drift === 2) ui.toast("¡Un cofre de ORO flota en el agua!");
        break;
      case "relic_found": {
        const r = C.RELICS.find((x) => x.id === ev.id);
        if (r) {
          ui.toast(`Reliquia: ${r.name} — ${r.desc}. Para siempre.`);
          audio.play("prestige");
          renderer.particles.confetti(window.innerWidth / 2, window.innerHeight * 0.35, 34);
        }
        break;
      }
      case "expedition_done":
        ui.toast(`El barco nº${ev.boatId} vuelve de expedición: +${formatMoney(ev.amount)}.`);
        audio.play("chest");
        renderer.particles.confetti(window.innerWidth * 0.5, window.innerHeight * 0.6, 24);
        break;
      case "species_found": {
        const sp = C.SPECIES.find((x) => x.id === ev.id);
        if (sp) {
          ui.toast(`Nueva especie: ${sp.name}${RARITY_TEXT[sp.rarity]} · pescadoteca +1% ingresos`);
          audio.play("mission");
          renderer.particles.spark(window.innerWidth / 2, window.innerHeight * 0.5, 16, "#8fbfae");
        }
        break;
      }
      default:
        break;
    }
  }
}

const actions = {
  buyBoat(tier: number) {
    const events: SimEvent[] = [];
    const r = buyBoat(state, tier, events);
    if (r.ok) {
      audio.play("buy");
      renderer.boatLaunchFx(state);
      persist();
    } else {
      audio.play("error");
    }
    handleEvents(events);
    ui.renderTab();
  },
  upgradeBoat(boatId: number, what: "speed" | "cap") {
    const events: SimEvent[] = [];
    const r = upgradeBoat(state, boatId, what, events);
    if (r.ok) {
      audio.play("upgrade");
      renderer.upgradeFx(boatId);
      persist();
    } else {
      audio.play("error");
    }
    handleEvents(events);
    ui.renderTab();
  },
  upgradeDock() {
    const events: SimEvent[] = [];
    if (upgradeDock(state, events).ok) {
      audio.play("buy");
      persist();
    } else audio.play("error");
    handleEvents(events);
    ui.renderTab();
  },
  upgradeLonja() {
    const events: SimEvent[] = [];
    if (upgradeLonja(state, events).ok) {
      audio.play("buy");
      ui.toast(`La lonja crece: +${Math.round(state.lonjaLvl * C.LONJA_INCOME_BONUS * 100)}% de ingresos esta vuelta.`);
      persist();
    } else audio.play("error");
    handleEvents(events);
    ui.renderTab();
  },
  startExpedition(defIndex: number) {
    const events: SimEvent[] = [];
    if (startExpedition(state, defIndex, events).ok) {
      audio.play("prestige");
      ui.toast(`${C.EXPEDITIONS[defIndex].name}: tu mejor barco pone rumbo mar adentro.`);
      persist();
    } else audio.play("error");
    handleEvents(events);
    ui.renderTab();
  },
  paintBoat(boatId: number) {
    if (paintBoat(state, boatId).ok) {
      audio.play("ui");
      persist();
      ui.renderTab();
    }
  },
  renamePort(name: string) {
    renamePort(state, name);
    audio.play("ui");
    ui.toast(`Puerto de ${state.portName || "Tiny Harbor"}. Suena bien.`);
    persist();
  },
  shareCard() {
    audio.play("ui");
    void buildShareCard();
  },
  hireManager() {
    const events: SimEvent[] = [];
    if (hireManager(state, events).ok) {
      audio.play("upgrade");
      ui.toast("El gestor cobra las cargas por ti.");
      persist();
    } else audio.play("error");
    handleEvents(events);
    ui.renderTab();
  },
  hireSkipper(index: number) {
    const events: SimEvent[] = [];
    if (hireSkipper(state, index, events).ok) {
      audio.play("buy");
      persist();
    } else audio.play("error");
    handleEvents(events);
    ui.renderTab();
  },
  buyLegacy(branch: C.LegacyBranch) {
    const events: SimEvent[] = [];
    if (buyLegacy(state, branch, events).ok) {
      audio.play("prestige");
      ui.toast("El legado del puerto crece. Esto ya no se pierde.");
      persist();
    } else audio.play("error");
    handleEvents(events);
    ui.renderTab();
  },
  unlockZone() {
    const events: SimEvent[] = [];
    if (unlockZone(state, events).ok) {
      audio.play("prestige");
      ui.toast(`Nueva zona: ${C.ZONES[state.zonesUnlocked].name}. La flota pone rumbo.`);
      renderer.particles.confetti(window.innerWidth / 2, window.innerHeight * 0.3, 24);
      persist();
    } else audio.play("error");
    handleEvents(events);
    ui.renderTab();
  },
  prestige(buyerId: string) {
    const events: SimEvent[] = [];
    const r = doPrestige(state, Date.now(), buyerId, events);
    if (r.ok) {
      const buyer = C.BUYERS.find((b) => b.id === buyerId);
      audio.play("prestige");
      renderer.particles.confetti(window.innerWidth / 2, window.innerHeight * 0.4, 60);
      ui.toast(`Vendido a ${buyer?.name ?? "La Naviera"}. Reputación +${r.gained}. Empieza la leyenda otra vez.`);
      persist();
      handleEvents(events);
      ui.renderTab();
    }
  },
  buyVigia() {
    if (buyVigia(state).ok) {
      audio.play("buy");
      ui.toast("La Torre del Vigía se alza. Ahora ves venir las cosas.");
      persist();
    } else audio.play("error");
    ui.renderTab();
  },
  resolveStorm(choice: "shelter" | "risk") {
    resolveStorm(state, choice);
    audio.play("ui");
  },
  collectAll() {
    const events: SimEvent[] = [];
    const r = collectAll(state, events);
    if (r.ok) audio.play("collect");
    handleEvents(events);
  },
  acceptOrder() {
    if (acceptOrder(state).ok) {
      audio.play("ui");
      ui.toast("Pedido aceptado: ¡a pescar!");
    }
  },
  declineOrder() {
    if (declineOrder(state).ok) audio.play("ui");
  },
  toggleMute(): boolean {
    state.settings.muted = !state.settings.muted;
    audio.setMuted(state.settings.muted);
    persist();
    return state.settings.muted;
  },
  toggleMusic(): boolean {
    state.settings.music = !state.settings.music;
    audio.setMusic(state.settings.music);
    persist();
    return state.settings.music;
  },
  resetGame() {
    clearStorage();
    state = newGame(Date.now(), (Date.now() % 4294967291) >>> 0);
    audio.setMuted(state.settings.muted);
    ui.renderTab();
    ui.toast("Partida nueva. Este bote viejo aún flota.");
  },
  uiSound() {
    audio.play("ui");
  },
};

const ui = new UI(uiRoot, () => state, actions);
const tutorial = new Tutorial(() => state, renderer, ui);

// ------------------------------------------------------------- tarjeta de capitán
/** Genera una tarjeta PNG con el puerto y sus récords, y la comparte (o descarga). */
async function buildShareCard(): Promise<void> {
  const W = 640;
  const H = 800;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;

  // Fondo: atardecer del juego en bandas pixel.
  const sky = ["#f7dca8", "#f4c88f", "#f1b377"];
  sky.forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect(0, (H * 0.42 * i) / 3, W, H);
  });
  const sea = ["#8fc9b6", "#4aa39b", "#2f8289", "#216271"];
  sea.forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect(0, H * 0.42 + ((H * 0.58) * i) / 4, W, H);
  });
  // Marco tipo sello.
  g.strokeStyle = "#2b3245";
  g.lineWidth = 6;
  g.strokeRect(12, 12, W - 24, H - 24);

  // El mejor barco de la flota, en grande y pixelado.
  const bestTier = state.boats.length ? Math.max(...state.boats.map((b) => b.tier)) : 0;
  const img = new Image();
  img.src = boatThumbURL(bestTier);
  await img.decode();
  g.imageSmoothingEnabled = false;
  const scale = Math.min(8, Math.floor((W * 0.6) / img.width));
  g.drawImage(img, (W - img.width * scale) / 2, H * 0.40 - (img.height * scale) / 2, img.width * scale, img.height * scale);

  const port = state.portName || "Tiny Harbor";
  g.fillStyle = "#2b3245";
  g.textAlign = "center";
  g.font = "800 42px 'Bricolage Grotesque Variable', sans-serif";
  g.fillText(`Puerto de ${port}`, W / 2, 88);
  g.font = "600 20px 'Bricolage Grotesque Variable', sans-serif";
  g.fillText("TARJETA DE CAPITÁN", W / 2, 122);

  g.fillStyle = "#f7efdb";
  const lines = [
    `${formatMoney(state.totalEarned)} ganados · ${state.prestiges} puertos vendidos`,
    `${state.discovered.length}/${C.SPECIES.length} especies · ${state.relics.length}/${C.RELICS.length} reliquias`,
    `${state.achievements.length}/${C.ACHIEVEMENTS.length} logros · ${state.stats.krakensRepelled} krakens ahuyentados`,
    `puerto completado al ${completionPct(state)}%`,
  ];
  g.font = "700 24px 'Bricolage Grotesque Variable', sans-serif";
  lines.forEach((l, i) => g.fillText(l, W / 2, H * 0.62 + i * 44));

  g.font = "600 18px 'Bricolage Grotesque Variable', sans-serif";
  g.fillStyle = "#eab14e";
  g.fillText("tinyharbor.alejandrofnv.es", W / 2, H - 44);

  c.toBlob(async (blob) => {
    if (!blob) return;
    const file = new File([blob], "tiny-harbor.png", { type: "image/png" });
    // Web Share con imagen si el dispositivo puede; si no, descarga.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `Puerto de ${port} — Tiny Harbor` });
        return;
      } catch {
        /* cancelado → descarga */
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tiny-harbor.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    ui.toast("Tarjeta guardada. Presume de puerto.");
  }, "image/png");
}

// ------------------------------------------------------------- regalo diario
function checkGift(): void {
  const events: SimEvent[] = [];
  const gift = claimGift(state, Date.now(), events);
  if (gift) {
    ui.showGiftModal(gift.day, gift.amount, () => {
      audio.play("chest");
      const t = ui.coinTarget();
      renderer.particles.coins(window.innerWidth / 2, window.innerHeight / 2, t.x, t.y, 14);
    });
    persist();
  }
  handleEvents(events);
}

// (El grano riso de la v1 se retiró: el pixel art va limpio.)

// --------------------------------------------------------------------------- input
function canvasTap(x: number, y: number): void {
  const hit = renderer.hitTest(x, y, state);
  if (!hit) return;
  const events: SimEvent[] = [];
  if (hit.type === "boat") {
    const r = collectBoat(state, hit.boatId!, events);
    if (r.ok) {
      audio.play("collect");
      renderer.particles.float(hit.x, hit.y - 30, `+${Math.round(r.gained!)}`);
      // Racha viva: el segundo texto vende el juego activo.
      if (state.combo.n >= 2) {
        renderer.particles.float(hit.x, hit.y - 52, `racha ×${(1 + (state.combo.n - 1) * C.COMBO_STEP).toFixed(2)}`, "#dfa93e");
      }
    }
  } else if (hit.type === "shoal") {
    const r = tapShoal(state, events);
    if (r.ok) {
      audio.play("collect");
      renderer.particles.float(hit.x, hit.y - 20, `+${Math.round(r.gained!)}`, "#dfa93e");
      renderer.particles.fish(hit.x, hit.y);
      renderer.particles.splash(hit.x, hit.y, 8);
    }
  } else if (hit.type === "kraken") {
    const r = tapKraken(state, events);
    if (r.ok) {
      audio.play("collect");
      renderer.particles.splash(hit.x, hit.y, 10);
      renderer.particles.spark(hit.x, hit.y, 6, "#e3664b");
    }
  } else if (hit.type === "drift") {
    const r = tapDrift(state, events);
    if (r.ok) {
      audio.play("chest");
      renderer.particles.float(hit.x, hit.y - 24, `+${formatMoney(r.gained!)}`, "#dfa93e");
      renderer.particles.splash(hit.x, hit.y, 12);
      const t = ui.coinTarget();
      renderer.particles.coins(hit.x, hit.y, t.x, t.y, 10);
    }
  }
  handleEvents(events);
}

canvas.addEventListener("pointerdown", (e) => {
  audio.unlock();
  canvasTap(e.clientX, e.clientY);
});
// El primer gesto en CUALQUIER parte desbloquea el audio (requisito móvil).
window.addEventListener("pointerdown", () => audio.unlock(), { capture: true });

window.addEventListener("resize", () => renderer.resize());

// --------------------------------------------------------------------------- offline
function checkOffline(showModal: boolean): void {
  const r = applyOffline(state, Date.now());
  if (r.earned > 0 && r.seconds >= C.OFFLINE_MIN_S && showModal) {
    // El dinero ya está aplicado; el modal es la celebración.
    ui.showOfflineModal(r, () => {
      audio.play("chest");
      const t = ui.coinTarget();
      renderer.particles.coins(window.innerWidth / 2, window.innerHeight / 2, t.x, t.y, 12);
    });
  }
  persist();
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    persist();
    audio.suspend();
  } else {
    audio.resume();
    checkOffline(true);
    checkGift();
    if (checkDaily(state, Date.now())) persist();
  }
});
window.addEventListener("pagehide", persist);

// Al arrancar: cofre si venías de una ausencia, paquete del pescador y desafío del día.
checkOffline(true);
checkGift();
if (checkDaily(state, Date.now())) {
  const def = C.DAILIES[state.daily!.def];
  ui.toast(`☀ Desafío del día: ${def.text}. Todo el mundo pesca lo mismo hoy.`);
  persist();
}

// --------------------------------------------------------------------------- loop
let last = performance.now();
let saveT = 0;
let uiT = 0;
let timeScale = 1; // solo dev (?dev=1)
let wasNight = false;

function frame(now: number): void {
  let dt = (now - last) / 1000;
  last = now;
  if (!Number.isFinite(dt) || dt < 0) dt = 0;

  // Hueco enorme sin visibilitychange (suspensión del sistema): ruta offline.
  if (dt > 30) {
    checkOffline(true);
    dt = 0.016;
  }
  dt = Math.min(dt, 2) * timeScale;

  // Simulación en pasos acotados: estable a cualquier framerate.
  const events: SimEvent[] = [];
  let remaining = dt;
  let guard = 64;
  while (remaining > 0 && guard-- > 0) {
    const step = Math.min(remaining, C.MAX_TICK_STEP_S);
    tick(state, step, events);
    remaining -= step;
  }
  handleEvents(events);

  renderer.coinTarget = ui.coinTarget();
  renderer.render(state, Math.min(dt, 0.1) / timeScale + (timeScale > 1 ? 0.016 : 0));
  ui.update();
  tutorial.update();

  // Campana de puerto al cruzar amanecer/anochecer.
  const dayT = (state.playTime % C.DAY_CYCLE_S) / C.DAY_CYCLE_S;
  const isNight = dayT >= 0.58 && dayT < 0.95;
  if (isNight !== wasNight) {
    wasNight = isNight;
    audio.bell();
  }

  uiT += dt;
  if (uiT >= 0.25) {
    uiT = 0;
    ui.refreshDynamic();
  }
  saveT += dt;
  if (saveT >= C.AUTOSAVE_INTERVAL_S) {
    saveT = 0;
    persist();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Con la pestaña oculta rAF se pausa: un ticker lento mantiene la sim al día
// (huecos cortos; los largos van por la ruta offline de checkOffline).
window.setInterval(() => {
  if (!document.hidden) return;
  const now = performance.now();
  let dt = (now - last) / 1000;
  last = now;
  if (!Number.isFinite(dt) || dt <= 0) return;
  if (dt > 30) {
    checkOffline(false);
    return;
  }
  const events: SimEvent[] = [];
  let remaining = dt;
  let guard = 64;
  while (remaining > 0 && guard-- > 0) {
    const step = Math.min(remaining, C.MAX_TICK_STEP_S);
    tick(state, step, events);
    remaining -= step;
  }
  // Sin render ni sonido: la pestaña no se ve. Los eventos visuales se descartan.
}, 1000);

// --------------------------------------------------------------------------- PWA
// Service worker solo en producción (en dev rompería el HMR de Vite).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* sin SW: el juego funciona igual, solo pierde el modo offline instalado */
    });
  });
}

// --------------------------------------------------------------------------- dev
// ?dev=1 → herramientas de playtest (aceleración honesta del reloj de la sim).
if (new URLSearchParams(location.search).has("dev")) {
  (window as unknown as { TH: unknown }).TH = {
    get state() {
      return state;
    },
    setTimeScale(n: number) {
      timeScale = Math.max(0.1, Math.min(1000, n));
    },
    skipMinutes(min: number) {
      const events: SimEvent[] = [];
      const total = min * 60;
      let left = total;
      while (left > 0) {
        tick(state, Math.min(left, 1), events);
        left -= 1;
      }
      events.length = 0;
      ui.renderTab();
    },
    /** Un frame síncrono (sim + render + UI). Para playtest con pestaña oculta. */
    step(seconds = 0.016) {
      const events: SimEvent[] = [];
      let leftS = seconds;
      let g = 4096;
      while (leftS > 0 && g-- > 0) {
        const st = Math.min(leftS, C.MAX_TICK_STEP_S);
        tick(state, st, events);
        leftS -= st;
      }
      handleEvents(events);
      renderer.coinTarget = ui.coinTarget();
      renderer.render(state, Math.min(seconds, 0.1));
      ui.update();
      tutorial.update();
      ui.refreshDynamic();
      last = performance.now();
    },
    give(n: number) {
      state.money += n;
      state.lifetime += n;
      state.totalEarned += n;
    },
    save: persist,
    wipe() {
      clearStorage();
      location.reload();
    },
  };
  console.info("[TH] dev mode: window.TH = {state, setTimeScale, skipMinutes, give, save, wipe}");
}
