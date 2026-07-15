/**
 * renderer.ts — escena pixel art marina.
 * Dibuja en un canvas offscreen a resolución de arte (1 unidad = 1 píxel de
 * arte) y lo escala entero al canvas visible (imageSmoothing off) → píxel
 * perfecto. Solo LEE el GameState. API pública estable para main/ui/tutorial.
 */

import { DAY_CYCLE_S, PAINTS } from "../sim/config";
import { phaseDuration } from "../sim/sim";
import type { Boat, GameState, SimEvent } from "../sim/types";
import { Particles } from "./particles";
import { mix, nightness, visRand } from "./theme";
import {
  BARRELS,
  BOATS,
  BOLLARD,
  BUBBLE,
  CLIENT,
  CLOUDS,
  CRATE_PILE,
  CRATES,
  DRIFT_CHESTS,
  GULL_A,
  GULL_B,
  HOUSE,
  KRAKEN_EYES,
  KRAKEN_TENTACLE,
  LAMP,
  LIGHTHOUSE,
  MARKET,
  MOON,
  NET_RACK,
  NIGHT_STEPS,
  palette,
  raster,
  SUN,
  WAREHOUSE,
  WHALE,
  type PixelPalette,
  type Sprite,
} from "./sprites";

interface Gull {
  x: number;
  y: number;
  vx: number;
  active: boolean;
  flap: number;
}

export interface HitResult {
  type: "boat" | "shoal" | "drift" | "kraken";
  boatId?: number;
  x: number;
  y: number;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private off: HTMLCanvasElement;
  private ictx: CanvasRenderingContext2D; // contexto del arte (offscreen)
  private w = 360; // CSS px
  private h = 640;
  private dpr = 1;
  private px = 3; // píxeles de pantalla (CSS) por píxel de arte
  private aw = 120; // resolución de arte
  private ah = 213;
  t = 0;
  particles = new Particles();

  coinTarget = { x: 80, y: 40 };

  private gulls: Gull[] = [];
  private gullTimer = 4;
  private smokeTimer = 0;
  private fishTimer = 0;
  private lightning = 0;
  private lightningTimer = 8;
  private clouds: { x: number; y: number; v: number; spr: number }[] = [];
  private stars: { x: number; y: number; tw: number }[] = [];
  private glints: { x: number; y: number; ph: number }[] = [];
  private boatRects = new Map<number, { x: number; y: number; r: number }>();
  private shoalPos = { x: 0, y: 0 };
  private driftPos = { x: 0, y: 0 };
  private krakenPos = { x: 0, y: 0 };
  private whale = { x: -30, dir: 1, active: false, timer: 40 };
  private lastTownKey = "";
  private lastTownCount = 0;
  private clientVisible = false;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d no disponible");
    this.ctx = ctx;
    this.off = document.createElement("canvas");
    this.ictx = this.off.getContext("2d")!;
    const r = visRand(99);
    for (let i = 0; i < 3; i++) {
      this.clouds.push({ x: r(), y: 0.04 + r() * 0.18, v: 1.2 + r() * 1.6, spr: i % CLOUDS.length });
    }
    for (let i = 0; i < 70; i++) this.stars.push({ x: r(), y: r() * 0.3, tw: r() * Math.PI * 2 });
    for (let i = 0; i < 26; i++) this.glints.push({ x: r(), y: r(), ph: r() * Math.PI * 2 });
    for (let i = 0; i < 3; i++) this.gulls.push({ x: 0, y: 0, vx: 0, active: false, flap: 0 });
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.px = this.w < 640 ? 3 : 4;
    this.aw = Math.ceil(this.w / this.px);
    this.ah = Math.ceil(this.h / this.px);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.off.width = this.aw;
    this.off.height = this.ah;
  }

  // --- métricas de escena (en píxeles de ARTE) --------------------------------
  private get horizonY(): number {
    return Math.round(this.ah * 0.36);
  }
  private get pierY(): number {
    return Math.round(this.ah * 0.76);
  }
  private get seaH(): number {
    return this.pierY - this.horizonY;
  }

  /** Amarre del slot (arte). Los barcos atracan pegados al muelle. */
  private berthPos(slot: number, total: number): { x: number; y: number } {
    const n = Math.max(total, 3);
    const margin = Math.round(this.aw * 0.12);
    const usable = this.aw - margin * 2;
    return { x: Math.round(margin + (usable * (slot + 0.5)) / n), y: this.pierY - 2 };
  }

  private fishingSpot(boat: Boat, zone: number): { x: number; y: number } {
    const r = visRand(boat.id * 7919 + 13);
    // Reparto áureo: los caladeros no se apelotonan aunque haya muchos barcos.
    const fx = 0.08 + ((boat.id * 0.618034) % 1) * 0.84;
    const depth = 0.52 - zone * 0.09 + r() * 0.1;
    return {
      x: Math.round(this.aw * fx),
      y: Math.round(this.horizonY + this.seaH * Math.max(0.14, depth)),
    };
  }

  /** Posición en PANTALLA (CSS px) del barco — API para tutorial/hit-test. */
  boatScreenPos(state: GameState, boat: Boat, index: number): { x: number; y: number; s: number } {
    const p = this.boatArtPos(state, boat, index);
    return { x: p.x * this.px, y: p.y * this.px, s: 1 };
  }

  private boatArtPos(state: GameState, boat: Boat, index: number): { x: number; y: number } {
    const berth = this.berthPos(index, state.boats.length);
    const spot = this.fishingSpot(boat, state.zonesUnlocked);
    const bob = Math.round(Math.sin(this.t * 2 + boat.id * 1.7));
    let x = berth.x;
    let y = berth.y;
    if (boat.phase === "out" || boat.phase === "in") {
      const dur = phaseDuration(state, boat, boat.phase);
      let p = dur > 0 ? boat.phaseT / dur : 1;
      p = Math.max(0, Math.min(1, p));
      const from = boat.phase === "out" ? berth : spot;
      const to = boat.phase === "out" ? spot : berth;
      x = Math.round(from.x + (to.x - from.x) * p);
      y = Math.round(from.y + (to.y - from.y) * (p * p * (3 - 2 * p)));
    } else if (boat.phase === "fishing") {
      x = spot.x + Math.round(Math.sin(this.t * 0.5 + boat.id) * 2);
      y = spot.y;
    }
    return { x, y: y + bob };
  }

  hitTest(pxX: number, pxY: number, state: GameState): HitResult | null {
    if (state.event?.kind === "frenzy") {
      const dx = pxX - this.shoalPos.x;
      const dy = pxY - this.shoalPos.y;
      const r = 62;
      if (dx * dx + dy * dy < r * r) return { type: "shoal", x: this.shoalPos.x, y: this.shoalPos.y };
    }
    if (state.event?.kind === "kraken" && state.event.stage === "active") {
      const dx = pxX - this.krakenPos.x;
      const dy = pxY - this.krakenPos.y;
      const r = 85;
      if (dx * dx + dy * dy < r * r) return { type: "kraken", x: this.krakenPos.x, y: this.krakenPos.y };
    }
    if (state.drift) {
      const dx = pxX - this.driftPos.x;
      const dy = pxY - this.driftPos.y;
      const r = 46;
      if (dx * dx + dy * dy < r * r) return { type: "drift", x: this.driftPos.x, y: this.driftPos.y };
    }
    for (const [id, r] of this.boatRects) {
      const dx = pxX - r.x;
      const dy = pxY - r.y;
      if (dx * dx + dy * dy < r.r * r.r) return { type: "boat", boatId: id, x: r.x, y: r.y };
    }
    return null;
  }

  getShoalPos(): { x: number; y: number } {
    return this.shoalPos;
  }

  onSimEvents(events: SimEvent[], state: GameState): void {
    for (const ev of events) {
      switch (ev.kind) {
        case "collect": {
          const r = this.boatRects.get(ev.boatId);
          const x = r?.x ?? this.w / 2;
          const y = r?.y ?? this.pierY * this.px;
          const n = Math.min(10, 3 + Math.floor(Math.log10(Math.max(1, ev.amount))));
          this.particles.coins(x, y - 10, this.coinTarget.x, this.coinTarget.y, n);
          break;
        }
        case "depart": {
          const idx = state.boats.findIndex((b) => b.id === ev.boatId);
          if (idx >= 0) {
            const p = this.berthPos(idx, state.boats.length);
            this.particles.splash(p.x * this.px, (p.y + 2) * this.px, 10);
          }
          break;
        }
        case "arrive": {
          const idx = state.boats.findIndex((b) => b.id === ev.boatId);
          if (idx >= 0) {
            const bp = this.boatScreenPos(state, state.boats[idx], idx);
            this.particles.ripple(bp.x, bp.y + 6);
          }
          break;
        }
        case "cargo_lost": {
          const r = this.boatRects.get(ev.boatId);
          if (r) this.particles.float(r.x, r.y - 24, "carga perdida", "#3b4a63");
          break;
        }
        case "mission_done":
          this.particles.confetti(this.w / 2, this.h * 0.24, 30);
          break;
        default:
          break;
      }
    }
  }

  boatLaunchFx(state: GameState): void {
    const idx = state.boats.length - 1;
    if (idx < 0) return;
    const p = this.berthPos(idx, state.boats.length);
    this.particles.splash(p.x * this.px, (p.y + 2) * this.px, 20);
    this.particles.confetti(p.x * this.px, (p.y - 8) * this.px, 16);
  }

  upgradeFx(boatId: number): void {
    const r = this.boatRects.get(boatId);
    if (r) this.particles.spark(r.x, r.y - 8, 14);
  }

  // ---------------------------------------------------------------------------
  render(state: GameState, dt: number): void {
    this.t += dt;
    const g = this.ictx;
    const dayT = (state.playTime % DAY_CYCLE_S) / DAY_CYCLE_S;
    const night = nightness(dayT);
    const step = Math.round(night * NIGHT_STEPS);
    const pal = palette(step);
    const stormActive = state.event?.kind === "storm" && state.event.stage === "active";
    const stormWarn = state.event?.kind === "storm" && state.event.stage === "warning";
    const storm = stormActive ? 1 : stormWarn ? 0.5 : 0;

    const weather = storm > 0 ? 0 : state.weather; // la tormenta manda sobre el clima

    g.clearRect(0, 0, this.aw, this.ah);
    this.drawSky(g, pal, step, dayT, night, storm);
    this.drawShore(g, state, pal, step, night, dt); // pueblo en la orilla del fondo
    this.drawSea(g, pal, storm + (weather === 3 ? 0.5 : 0)); // marejada: mar picada
    this.updateGulls(dt, night, storm, g);
    this.drawFishSchool(g, dt, pal);

    this.drawWhale(g, dt, night);

    // Barcos por profundidad (y ascendente = más lejos primero).
    this.boatRects.clear();
    const away = state.expedition?.boatId ?? -1;
    const order = state.boats
      .filter((b) => b.id !== away) // el barco de expedición está mar adentro
      .map((boat, idx) => ({ boat, idx, pos: this.boatArtPos(state, boat, idx) }))
      .sort((a, b) => a.pos.y - b.pos.y);
    for (const { boat, pos } of order) this.drawBoat(g, boat, pos, step, pal, state.prestiges);

    this.drawDrift(g, state, pal);
    this.drawFrenzy(g, state, dt, pal);
    this.drawKraken(g, state, pal);
    this.clientVisible = state.order !== null;
    this.drawPier(g, pal, step, night);

    if (storm > 0) this.drawStorm(g, dt, storm, stormActive, pal);
    if (storm === 0) this.drawWeather(g, weather, pal, dt);

    // Blit entero al canvas visible.
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.drawImage(this.off, 0, 0, this.aw * this.px, this.ah * this.px);

    // Partículas encima, alineadas a la rejilla de arte.
    this.particles.update(dt);
    this.particles.draw(ctx, this.px);
    ctx.restore();
  }

  // --- cielo -------------------------------------------------------------------
  private drawSky(
    g: CanvasRenderingContext2D,
    pal: PixelPalette,
    step: number,
    dayT: number,
    night: number,
    storm: number,
  ): void {
    const H = this.horizonY;
    // 4 bandas discretas + fila de dithering entre bandas (cielo de gradiente pixel).
    const bands = 4;
    for (let i = 0; i < bands; i++) {
      const c = mix(pal.skyHi, pal.skyLo, i / (bands - 1));
      const y0 = Math.round((H * i) / bands);
      const y1 = Math.round((H * (i + 1)) / bands);
      g.fillStyle = c;
      g.fillRect(0, y0, this.aw, y1 - y0);
      if (i > 0) {
        // dithering: damero de 1px con la banda anterior
        g.fillStyle = mix(pal.skyHi, pal.skyLo, (i - 1) / (bands - 1));
        for (let x = 0; x < this.aw; x += 2) g.fillRect(x + (y0 % 2), y0, 1, 1);
      }
    }

    // Sol / luna en arco (a 2×: son protagonistas discretos, no motas).
    if (night < 0.95) {
      const p = Math.min(1, dayT / 0.55);
      const sx = Math.round(this.aw * (0.12 + 0.76 * p)) - SUN.w;
      const sy = Math.max(3, Math.round(H * (0.72 - Math.sin(p * Math.PI) * 0.5)) - SUN.h);
      g.globalAlpha = 1 - night;
      g.drawImage(raster(SUN, step), sx, sy, SUN.w * 2, SUN.h * 2);
      g.globalAlpha = 1;
    }
    if (night > 0.05) {
      g.globalAlpha = night;
      g.drawImage(raster(MOON, step), Math.round(this.aw * 0.72), Math.round(H * 0.15), MOON.w * 2, MOON.h * 2);
      for (const s of this.stars) {
        const tw = Math.sin(this.t * 1.4 + s.tw);
        if (tw > -0.2) {
          g.globalAlpha = night * (0.35 + 0.4 * Math.max(0, tw));
          g.fillStyle = pal.white;
          g.fillRect(Math.round(s.x * this.aw), Math.round(s.y * this.ah), 1, 1);
        }
      }
      g.globalAlpha = 1;
    }

    // Nubes a 2× (oscurecen con tormenta).
    for (const c of this.clouds) {
      const spr = CLOUDS[c.spr];
      const cx = Math.round((((c.x + this.t * c.v * 0.003) % 1.25) * 1.25 - 0.12) * this.aw);
      const cy = Math.round(c.y * this.ah);
      g.globalAlpha = 0.92;
      g.drawImage(raster(spr, storm > 0 ? Math.max(step, 11) : step), cx, cy, spr.w * 2, spr.h * 2);
      g.globalAlpha = 1;
    }
  }

  private updateGulls(
    dt: number,
    night: number,
    storm: number,
    g: CanvasRenderingContext2D,
  ): void {
    this.gullTimer -= dt;
    if (this.gullTimer <= 0 && night < 0.5 && storm === 0) {
      const gl = this.gulls.find((x) => !x.active);
      if (gl) {
        gl.active = true;
        const dir = Math.random() < 0.5 ? 1 : -1;
        gl.x = dir === 1 ? -8 : this.aw + 8;
        gl.vx = dir * (6 + Math.random() * 7);
        gl.y = this.ah * (0.06 + Math.random() * 0.16);
        gl.flap = Math.random() * 10;
      }
      this.gullTimer = 5 + Math.random() * 9;
    }
    for (const gl of this.gulls) {
      if (!gl.active) continue;
      gl.x += gl.vx * dt;
      gl.y += Math.sin(this.t * 1.8 + gl.flap) * 2 * dt;
      gl.flap += dt * 8;
      if (gl.x < -10 || gl.x > this.aw + 10) gl.active = false;
      const spr = Math.sin(gl.flap * 2) > 0 ? GULL_A : GULL_B;
      g.drawImage(raster(spr, 0), Math.round(gl.x), Math.round(gl.y));
    }
  }

  // --- mar --------------------------------------------------------------------
  private drawSea(g: CanvasRenderingContext2D, pal: PixelPalette, storm: number): void {
    const top = this.horizonY;
    const bottom = this.pierY;
    const H = bottom - top;
    const ramp = [pal.seaFar, pal.sea1, pal.sea2, pal.sea3];
    // Bandas con borde ondulante + dithering animado entre pasos.
    for (let i = 0; i < ramp.length; i++) {
      const y0 = top + Math.round((H * i) / ramp.length);
      const y1 = i === ramp.length - 1 ? bottom : top + Math.round((H * (i + 1)) / ramp.length);
      g.fillStyle = ramp[i];
      g.fillRect(0, y0, this.aw, y1 - y0);
      if (i > 0) {
        // fila de damero desplazándose (marea)
        const off = Math.floor(this.t * (i % 2 === 0 ? 3 : -3));
        g.fillStyle = ramp[i - 1];
        for (let x = 0; x < this.aw; x += 2) {
          g.fillRect((((x + off) % this.aw) + this.aw) % this.aw, y0, 1, 1);
        }
      }
    }
    // Línea de horizonte.
    g.fillStyle = pal.ink;
    g.globalAlpha = 0.35;
    g.fillRect(0, top, this.aw, 1);
    g.globalAlpha = 1;

    // Crestas de espuma: guiones que aparecen y desaparecen (más con tormenta).
    const rows = 6;
    for (let r = 0; r < rows; r++) {
      const y = top + Math.round(H * (0.12 + (r * 0.8) / rows));
      const seed = visRand(r * 131 + 7);
      const count = Math.round(this.aw / 26) + (storm > 0 ? 3 : 0);
      for (let i = 0; i < count; i++) {
        const bx = seed() * this.aw;
        const ph = seed() * Math.PI * 2;
        const vis = Math.sin(this.t * (0.7 + storm * 0.8) + ph);
        if (vis > 0.3) {
          const drift = Math.floor(this.t * 2 * (r % 2 === 0 ? 1 : -1));
          g.globalAlpha = Math.min(0.9, (vis - 0.3) * 1.4);
          g.fillStyle = pal.foam;
          g.fillRect((((Math.round(bx) + drift) % this.aw) + this.aw) % this.aw, y, 3 + (r % 2), 1);
        }
      }
    }
    // Destellos de sol/luna en la franja alta.
    for (const gl of this.glints) {
      const tw = Math.sin(this.t * 2.2 + gl.ph);
      if (tw > 0.55) {
        g.globalAlpha = (tw - 0.55) * 1.4;
        g.fillStyle = pal.foam;
        g.fillRect(Math.round(gl.x * this.aw), top + 2 + Math.round(gl.y * H * 0.3), 1, 1);
      }
    }
    g.globalAlpha = 1;
  }

  // --- barcos -----------------------------------------------------------------
  private drawBoat(
    g: CanvasRenderingContext2D,
    boat: Boat,
    pos: { x: number; y: number },
    step: number,
    pal: PixelPalette,
    prestiges = 0,
  ): void {
    const spr = BOATS[Math.min(boat.tier, BOATS.length - 1)];
    const flip = boat.phase === "in"; // vuelve mirando a puerto
    const paint = boat.paint > 0 ? PAINTS[boat.paint] : undefined;
    const img = raster(spr, step, { hullTier: boat.tier, flip, paint });
    const x = pos.x - Math.floor(spr.w / 2);
    const y = pos.y - spr.h + 2; // la quilla se hunde 2px

    this.boatRects.set(boat.id, {
      x: pos.x * this.px,
      y: (pos.y - spr.h / 2) * this.px,
      r: Math.max(30, spr.w * this.px * 0.7),
    });

    // "Listo para cobrar": la línea de flotación brilla en dorado (pulso).
    if (boat.phase === "ready") {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 3.4);
      g.globalAlpha = 0.35 + 0.45 * pulse;
      g.fillStyle = pal.must;
      g.fillRect(x - 2, pos.y + 1, spr.w + 4, 2);
      g.globalAlpha = 1;
    }

    // Estela navegando.
    if (boat.phase === "out" || boat.phase === "in") {
      const dir = boat.phase === "out" ? -1 : 1;
      g.fillStyle = pal.foam;
      g.globalAlpha = 0.7;
      for (let i = 1; i <= 3; i++) {
        const wx = pos.x + dir * (Math.floor(spr.w / 2) + i * 3 + (Math.floor(this.t * 6) % 3));
        g.fillRect(wx, pos.y + (i % 2), 2, 1);
        g.globalAlpha *= 0.6;
      }
      g.globalAlpha = 1;
    }

    g.drawImage(img, x, y);

    // Banderín de armador: recuerdo visible de los puertos vendidos.
    // 1+: coral · 4+: dorado · 10+: doble banderín.
    if (prestiges >= 1) {
      const mastX = pos.x + (flip ? -1 : 1);
      const wave = Math.sin(this.t * 5 + boat.id) > 0 ? 1 : 0;
      g.fillStyle = prestiges >= 4 ? pal.must : pal.coral;
      g.fillRect(mastX + wave, y - 2, 2, 1);
      g.fillRect(mastX, y - 1, 2, 1);
      if (prestiges >= 10) {
        g.fillStyle = pal.coral;
        g.fillRect(mastX + wave, y - 4, 2, 1);
      }
    }

    // Línea de flotación: 1px de espuma pegado al casco.
    g.fillStyle = pal.foam;
    g.globalAlpha = 0.5;
    g.fillRect(x + 1, pos.y + 1, spr.w - 2, 1);
    g.globalAlpha = 1;

    // Pescando: sedal desde la proa + boya pegada al casco.
    if (boat.phase === "fishing") {
      const fx = pos.x + Math.floor(spr.w / 2) + 2;
      g.fillStyle = pal.ink;
      g.globalAlpha = 0.55;
      g.fillRect(fx, pos.y - 3, 1, 4);
      g.globalAlpha = 1;
      g.fillStyle = pal.coral;
      g.fillRect(fx - 1, pos.y + (Math.sin(this.t * 2.3 + boat.id) > 0 ? 1 : 0), 2, 2);
    }

    // Listo: burbuja de cobro botando (+cajas en cubierta si el barco es grande).
    if (boat.phase === "ready") {
      let topY = y;
      if (boat.tier >= 2) {
        g.drawImage(raster(CRATES, step), pos.x + Math.floor(spr.w * 0.12), y - CRATES.h + 3);
      }
      const bounce = Math.round(Math.abs(Math.sin(this.t * 3)) * 3);
      g.drawImage(raster(BUBBLE, step), pos.x - Math.floor(BUBBLE.w / 2), topY - BUBBLE.h - 2 - bounce);
    }
  }

  // --- cofre a la deriva ---------------------------------------------------------
  private drawDrift(g: CanvasRenderingContext2D, state: GameState, pal: PixelPalette): void {
    const drift = state.drift;
    if (!drift) return;
    const spr = DRIFT_CHESTS[Math.min(drift.kind, DRIFT_CHESTS.length - 1)];
    const cx = Math.round(this.aw * drift.x);
    const cy = Math.round(this.horizonY + this.seaH * 0.62 + Math.sin(this.t * 1.8) * 1.5);
    this.driftPos = { x: cx * this.px, y: cy * this.px };

    // Se hunde: parpadea los últimos 5 s.
    if (drift.remaining < 5 && Math.sin(this.t * 8) < 0) return;

    g.drawImage(raster(spr, 0), cx - Math.floor(spr.w / 2), cy - spr.h + 2);
    // Anillo de atención (mismo lenguaje que el banco de peces, discreto).
    const rx = 12;
    const ry = 5;
    g.fillStyle = drift.kind === 2 ? pal.must : pal.foam;
    const spin = this.t * 1.1;
    for (let i = 0; i < 10; i++) {
      if (i % 2 === 0) continue;
      const a = (i / 10) * Math.PI * 2 + spin;
      g.fillRect(cx + Math.round(Math.cos(a) * rx) - 1, cy + Math.round(Math.sin(a) * ry), 2, 1);
    }
    // Destello dorado del cofre de oro.
    if (drift.kind === 2 && Math.sin(this.t * 6) > 0.6) {
      g.fillStyle = pal.white;
      g.fillRect(cx - 1, cy - spr.h - 1, 1, 1);
      g.fillRect(cx + 2, cy - spr.h + 1, 1, 1);
    }
  }

  // --- kraken: tentáculos saliendo del agua, tapeables --------------------------------
  private drawKraken(g: CanvasRenderingContext2D, state: GameState, pal: PixelPalette): void {
    const ev = state.event;
    if (ev?.kind !== "kraken") return;
    const cx = Math.round(this.aw * 0.5);
    const cy = Math.round(this.horizonY + this.seaH * 0.5);
    this.krakenPos = { x: cx * this.px, y: cy * this.px };

    if (ev.stage === "warning") {
      // Sombra creciendo bajo el agua + burbujas: algo enorme sube.
      const grow = 1 - ev.remaining / 6;
      g.fillStyle = pal.roof;
      g.globalAlpha = 0.25 + grow * 0.3;
      const rx = Math.round(14 + grow * 16);
      const ry = Math.round(5 + grow * 5);
      g.beginPath();
      g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      if (Math.sin(this.t * 9) > 0.4) {
        g.fillStyle = pal.foam;
        g.fillRect(cx - 6 + (Math.floor(this.t * 7) % 12), cy - 2, 1, 1);
        g.fillRect(cx + 3 - (Math.floor(this.t * 5) % 9), cy + 2, 1, 1);
      }
      return;
    }

    // Activo: tentáculos oscilando + ojos + anillo de "¡tócalo!".
    const spr = KRAKEN_TENTACLE;
    const arms = [
      { dx: -16, ph: 0, flip: false },
      { dx: -2, ph: 1.4, flip: true },
      { dx: 12, ph: 2.7, flip: false },
    ];
    for (const a of arms) {
      const rise = Math.round(Math.sin(this.t * 2.2 + a.ph) * 2);
      const img = raster(spr, 0, { flip: a.flip });
      g.drawImage(img, cx + a.dx, cy - spr.h + 3 + rise);
    }
    // Espuma en la base: el agua hierve.
    g.fillStyle = pal.foam;
    for (let i = -14; i <= 18; i += 4) {
      if (Math.sin(this.t * 6 + i) > 0) g.fillRect(cx + i, cy + 2 + (i % 2), 2, 1);
    }
    // Ojos asomando entre los tentáculos.
    if (Math.sin(this.t * 0.9) > -0.6) {
      g.drawImage(raster(KRAKEN_EYES, 0), cx - Math.floor(KRAKEN_EYES.w / 2) + 2, cy - 4);
    }
    // Anillo rojo de atención (más urgente que el del banco de peces).
    const rx = 26;
    const ry = 10;
    g.fillStyle = pal.coral;
    const spin = this.t * 1.6;
    for (let i = 0; i < 18; i++) {
      if (i % 2 === 0) continue;
      const a = (i / 18) * Math.PI * 2 + spin;
      g.fillRect(cx + Math.round(Math.cos(a) * rx) - 1, cy + Math.round(Math.sin(a) * ry), 2, 1);
    }
  }

  // --- clima del día ---------------------------------------------------------------
  private drawWeather(g: CanvasRenderingContext2D, weather: number, pal: PixelPalette, _dt: number): void {
    if (weather === 1) {
      // Niebla: bandas horizontales que respiran sobre el mar y comen el horizonte.
      const top = this.horizonY - 6;
      for (let i = 0; i < 5; i++) {
        const y = top + i * 7 + Math.round(Math.sin(this.t * 0.4 + i) * 2);
        g.globalAlpha = 0.16 - i * 0.02 + Math.sin(this.t * 0.6 + i * 2) * 0.03;
        g.fillStyle = pal.foam;
        g.fillRect(0, y, this.aw, 5);
      }
      g.globalAlpha = 1;
    } else if (weather === 2) {
      // Llovizna: gotas finas y espaciadas, sin oscurecer el día.
      g.fillStyle = pal.foam;
      g.globalAlpha = 0.25;
      const n = Math.round(this.aw / 18);
      for (let i = 0; i < n; i++) {
        const x = (i * 131 + Math.floor(this.t * 60) * 11) % this.aw;
        const y = (i * 73 + Math.floor(this.t * 110) * 5) % this.ah;
        g.fillRect(x, y, 1, 2);
      }
      g.globalAlpha = 1;
    }
    // Marejada (3): se dibuja vía drawSea con más crestas.
  }

  // --- cardumen ambiental: pececillos cruzando en grupo -------------------------------
  private school = { x: -20, y: 0, dir: 1, active: false, timer: 25 };
  private drawFishSchool(g: CanvasRenderingContext2D, dt: number, pal: PixelPalette): void {
    const s = this.school;
    if (!s.active) {
      s.timer -= dt;
      if (s.timer <= 0) {
        s.active = true;
        s.dir = Math.random() < 0.5 ? 1 : -1;
        s.x = s.dir === 1 ? -16 : this.aw + 16;
        s.y = this.horizonY + this.seaH * (0.25 + Math.random() * 0.5);
      }
      return;
    }
    s.x += s.dir * 9 * dt;
    if (s.x < -24 || s.x > this.aw + 24) {
      s.active = false;
      s.timer = 30 + Math.random() * 60;
      return;
    }
    g.fillStyle = pal.ink;
    g.globalAlpha = 0.35;
    for (let i = 0; i < 5; i++) {
      const fx = Math.round(s.x - s.dir * (i * 5 + (i % 2) * 2));
      const fy = Math.round(s.y + Math.sin(this.t * 3 + i * 1.3) * 2 + (i % 3));
      g.fillRect(fx, fy, 2, 1);
      g.fillRect(fx - s.dir, fy, 1, 1);
    }
    g.globalAlpha = 1;
  }

  // --- ballena ambiental (silueta lejana, puro sabor) ------------------------------
  private drawWhale(g: CanvasRenderingContext2D, dt: number, night: number): void {
    const w = this.whale;
    if (!w.active) {
      w.timer -= dt;
      if (w.timer <= 0) {
        w.active = true;
        w.dir = Math.random() < 0.5 ? 1 : -1;
        w.x = w.dir === 1 ? -WHALE.w : this.aw + WHALE.w;
      }
      return;
    }
    w.x += w.dir * 3.2 * dt;
    if (w.x < -WHALE.w - 10 || w.x > this.aw + WHALE.w + 10) {
      w.active = false;
      w.timer = 90 + Math.random() * 120;
      return;
    }
    const y = this.horizonY + Math.round(this.seaH * 0.16 + Math.sin(this.t * 0.7) * 1.5);
    g.globalAlpha = 0.5 - night * 0.2;
    g.drawImage(raster(WHALE, NIGHT_STEPS), Math.round(w.x), y);
    g.globalAlpha = 1;
    // Chorro intermitente.
    if (Math.sin(this.t * 1.1) > 0.75) {
      this.particles.splash((w.x + WHALE.w * (w.dir === 1 ? 0.82 : 0.18)) * this.px, (y - 1) * this.px, 3);
    }
  }

  // --- banco de peces -----------------------------------------------------------
  private drawFrenzy(g: CanvasRenderingContext2D, state: GameState, dt: number, pal: PixelPalette): void {
    if (state.event?.kind !== "frenzy") return;
    const cx = Math.round(this.aw * 0.5);
    const cy = Math.round(this.horizonY + this.seaH * 0.5);
    this.shoalPos = { x: cx * this.px, y: cy * this.px };
    this.fishTimer -= dt;
    if (this.fishTimer <= 0) {
      this.particles.fish(
        this.shoalPos.x + (Math.random() - 0.5) * 60 * (this.px / 3),
        this.shoalPos.y + (Math.random() - 0.5) * 10,
      );
      this.fishTimer = 0.18;
    }
    // Anillo punteado limpio (elipse de guiones que rota despacio).
    const rx = 21;
    const ry = 8;
    g.fillStyle = pal.must;
    const dashes = 16;
    const spin = this.t * 0.8;
    for (let i = 0; i < dashes; i++) {
      if (i % 2 === 0) continue;
      const a = (i / dashes) * Math.PI * 2 + spin;
      g.fillRect(cx + Math.round(Math.cos(a) * rx) - 1, cy + Math.round(Math.sin(a) * ry), 2, 1);
    }
  }

  // --- orilla del fondo: el pueblo crece con tu progreso ---------------------------
  private drawShore(
    g: CanvasRenderingContext2D,
    state: GameState,
    pal: PixelPalette,
    step: number,
    night: number,
    dt: number,
  ): void {
    const hy = this.horizonY;
    // Franja de tierra sobre la línea de horizonte.
    g.fillStyle = pal.wood2;
    g.fillRect(0, hy - 2, this.aw, 2);
    g.fillStyle = pal.ink;
    g.globalAlpha = 0.4;
    g.fillRect(0, hy - 1, this.aw, 1);
    g.globalAlpha = 1;

    // Hitos de la vuelta → el pueblo se construye delante de tus ojos.
    const hasMarket = state.boats.length >= 3 || state.dockLevel >= 1;
    const hasHouse2 = state.managerLvl >= 1;
    const hasWarehouse = state.zonesUnlocked >= 2;
    const hasHouse3 = state.zonesUnlocked >= 3 || state.boats.length >= 8;

    const base = hy - 2;
    const spots: { spr: Sprite; x: number }[] = [];
    spots.push({ spr: LIGHTHOUSE, x: Math.round(this.aw * 0.05) });
    spots.push({ spr: HOUSE, x: Math.round(this.aw * 0.05) + LIGHTHOUSE.w + 3 });
    const whX = this.aw - WAREHOUSE.w - Math.round(this.aw * 0.04);
    const mkX = whX - MARKET.w - 5;
    if (hasWarehouse) spots.push({ spr: WAREHOUSE, x: whX });
    if (hasMarket) spots.push({ spr: MARKET, x: hasWarehouse ? mkX : whX + WAREHOUSE.w - MARKET.w });
    if (hasHouse2 && this.aw > 200) spots.push({ spr: HOUSE, x: Math.round(this.aw * 0.34) });
    if (hasHouse3 && this.aw > 260) spots.push({ spr: HOUSE, x: mkX - HOUSE.w - 8 });
    for (const b of spots) g.drawImage(raster(b.spr, step), b.x, base - b.spr.h + 1);

    // Obra nueva: destello la primera vez que aparece un edificio.
    const townKey = `${spots.length}:${state.prestiges}`;
    if (townKey !== this.lastTownKey) {
      if (this.lastTownKey !== "" && spots.length > this.lastTownCount) {
        const nb = spots[spots.length - 1];
        this.particles.spark((nb.x + nb.spr.w / 2) * this.px, (base - nb.spr.h / 2) * this.px, 14);
      }
      this.lastTownKey = townKey;
      this.lastTownCount = spots.length;
    }

    // Guirnalda de luces entre el faro y el pueblo: recuerdo permanente del prestigio.
    if (state.reputation > 0) {
      const x0 = Math.round(this.aw * 0.05) + LIGHTHOUSE.w;
      const x1 = hasWarehouse || hasMarket ? (hasMarket ? mkX : whX) + 3 : this.aw - 20;
      for (let x = x0; x < x1; x += 3) {
        const tt = (x - x0) / Math.max(1, x1 - x0);
        const sag = Math.round(Math.sin(tt * Math.PI * 3) * 2 + 2);
        const on = night > 0.25 ? Math.sin(this.t * 4 + x) > -0.4 : true;
        g.fillStyle = night > 0.25 && on ? pal.glassLit : pal.coral;
        g.globalAlpha = night > 0.25 ? 0.95 : 0.8;
        g.fillRect(x, base - LIGHTHOUSE.h + 6 + sag, 1, 1);
      }
      g.globalAlpha = 1;
    }

    // Humo de la chimenea del almacén (en coords de pantalla para las partículas).
    if (hasWarehouse) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.particles.smoke((whX + WAREHOUSE.w * 0.5) * this.px, (base - WAREHOUSE.h - 1) * this.px);
        this.smokeTimer = 0.7 + Math.random() * 0.7;
      }
    }

    // Haz del faro barriendo el MAR de noche (siempre hacia abajo) + linterna.
    const lhX = Math.round(this.aw * 0.05);
    if (night > 0.3) {
      const ang = 0.18 + ((Math.sin(this.t * 0.35) + 1) / 2) * 0.5; // [0.18, 0.68] rad: sobre el agua
      const lx = lhX + LIGHTHOUSE.w / 2;
      const ly = base - LIGHTHOUSE.h + 4;
      g.save();
      g.globalAlpha = 0.1 * night * (0.85 + 0.15 * Math.sin(this.t * 3));
      g.fillStyle = pal.must;
      g.beginPath();
      g.moveTo(lx, ly);
      g.lineTo(lx + Math.cos(ang - 0.08) * 95, ly + Math.sin(ang - 0.08) * 95);
      g.lineTo(lx + Math.cos(ang + 0.08) * 95, ly + Math.sin(ang + 0.08) * 95);
      g.closePath();
      g.fill();
      g.restore();
      g.globalAlpha = 0.5 + 0.5 * Math.sin(this.t * 3);
      g.fillStyle = pal.glassLit;
      g.fillRect(lhX + 4, base - LIGHTHOUSE.h + 3, 4, 2);
      g.globalAlpha = 1;
    }
  }

  // --- muelle cercano: deck bajo con props, los barcos amarran delante -------------
  private drawPier(g: CanvasRenderingContext2D, pal: PixelPalette, step: number, night: number): void {
    const y = this.pierY;
    const deckH = 6;

    // Agua de primer plano (bajo el muelle) con brillo tenue.
    g.fillStyle = pal.seaFg;
    g.fillRect(0, y + deckH, this.aw, this.ah - y - deckH);
    g.globalAlpha = 0.12;
    g.fillStyle = pal.foam;
    for (let ry = y + deckH + 4; ry < this.ah; ry += 5) {
      const off = Math.floor(this.t * 4 * ((ry / 5) % 2 === 0 ? 1 : -1));
      for (let x = 0; x < this.aw; x += 9) {
        g.fillRect((((x + off) % this.aw) + this.aw) % this.aw, ry, 3, 1);
      }
    }
    g.globalAlpha = 1;

    // Pilotes.
    for (let x = 6; x < this.aw; x += 14) {
      g.fillStyle = pal.wood2;
      g.fillRect(x, y + deckH - 1, 3, this.ah - y - deckH + 1);
      g.fillStyle = pal.ink;
      g.globalAlpha = 0.3;
      g.fillRect(x + 2, y + deckH - 1, 1, this.ah - y - deckH + 1);
      g.globalAlpha = 1;
    }

    // Tablero: highlight arriba, tablones con juntas.
    g.fillStyle = pal.wood;
    g.fillRect(0, y, this.aw, deckH);
    g.fillStyle = pal.white;
    g.globalAlpha = 0.35;
    g.fillRect(0, y, this.aw, 1);
    g.globalAlpha = 1;
    g.fillStyle = pal.wood2;
    for (let x = 4; x < this.aw; x += 7) g.fillRect(x, y + 1, 1, deckH - 1);
    g.fillStyle = pal.ink;
    g.globalAlpha = 0.5;
    g.fillRect(0, y + deckH - 1, this.aw, 1);
    g.globalAlpha = 1;

    // Props bajos repartidos (no tapan barcos: máx 6px de alto sobre el deck).
    const props: { spr: Sprite; fx: number }[] = [
      { spr: CRATE_PILE, fx: 0.08 },
      { spr: BARRELS, fx: 0.36 },
      { spr: NET_RACK, fx: 0.62 },
      { spr: CRATE_PILE, fx: 0.88 },
    ];
    for (const p of props) {
      if (this.aw < 200 && (p.fx === 0.36 || p.fx === 0.88)) continue; // móvil: menos
      g.drawImage(raster(p.spr, step), Math.round(this.aw * p.fx), y - p.spr.h + 1);
    }

    // Cliente de la lonja esperando su pedido (balanceo sutil).
    if (this.clientVisible) {
      const cx = Math.round(this.aw * 0.68);
      const bob = Math.sin(this.t * 2.2) > 0.6 ? -1 : 0;
      g.drawImage(raster(CLIENT, step), cx, y - CLIENT.h + 1 + bob);
      // Signo de "tengo un encargo" flotando encima.
      g.fillStyle = pal.must;
      const by = y - CLIENT.h - 4 + Math.round(Math.sin(this.t * 3) * 1);
      g.fillRect(cx + 2, by, 2, 2);
      g.fillRect(cx + 2, by - 3, 2, 2);
    }

    // Bolardos + cuerda entre ellos (curva muestreada a píxeles).
    const bollXs: number[] = [];
    for (let x = 14; x < this.aw - 6; x += 26) bollXs.push(x);
    g.fillStyle = pal.ink;
    g.globalAlpha = 0.55;
    for (let i = 0; i < bollXs.length - 1; i++) {
      const x0 = bollXs[i] + 2;
      const x1 = bollXs[i + 1];
      for (let xx = x0; xx <= x1; xx += 2) {
        const tt = (xx - x0) / (x1 - x0);
        const sag = Math.round(Math.sin(tt * Math.PI) * 3);
        g.fillRect(xx, y - 2 + sag, 1, 1);
      }
    }
    g.globalAlpha = 1;
    for (const x of bollXs) g.drawImage(raster(BOLLARD, step), x, y - BOLLARD.h + 1);

    // Farolas en el muelle cercano.
    const lampXs = [Math.round(this.aw * 0.22), Math.round(this.aw * 0.5), Math.round(this.aw * 0.78)];
    for (const lx of lampXs) {
      g.drawImage(raster(LAMP, step), lx, y - LAMP.h + 1);
      if (night > 0.25) {
        const flick = 0.7 + 0.3 * Math.sin(this.t * 7 + lx);
        g.globalAlpha = 0.22 * night * flick;
        g.fillStyle = pal.must;
        g.fillRect(lx - 4, y - LAMP.h - 2, LAMP.w + 8, 6);
        g.globalAlpha = 0.1 * night * flick;
        g.fillRect(lx - 7, y - LAMP.h, LAMP.w + 14, LAMP.h);
        // Reflejo en el agua del primer plano.
        g.globalAlpha = 0.25 * night;
        for (let ry = y + deckH + 2; ry < this.ah - 1; ry += 3) {
          const wob = Math.round(Math.sin(this.t * 2 + ry));
          g.fillRect(lx + 2 + wob, ry, 2, 1);
        }
        g.globalAlpha = 1;
      }
    }
  }

  // --- tormenta ---------------------------------------------------------------
  private drawStorm(
    g: CanvasRenderingContext2D,
    dt: number,
    storm: number,
    active: boolean,
    pal: PixelPalette,
  ): void {
    g.fillStyle = pal.roof;
    g.globalAlpha = 0.22 * storm;
    g.fillRect(0, 0, this.aw, this.ah);
    g.globalAlpha = 1;
    if (active) {
      // Lluvia en píxeles de arte.
      g.fillStyle = pal.foam;
      g.globalAlpha = 0.5;
      const n = Math.round(this.aw / 9);
      for (let i = 0; i < n; i++) {
        const x = (i * 97 + Math.floor(this.t * 90) * 13) % this.aw;
        const yy = (i * 61 + Math.floor(this.t * 140) * 7) % this.ah;
        g.fillRect(x, yy, 1, 3);
      }
      g.globalAlpha = 1;
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightning = 0.3;
        this.lightningTimer = 3 + Math.random() * 6;
      }
    }
    if (this.lightning > 0) {
      g.globalAlpha = this.lightning;
      g.fillStyle = pal.white;
      g.fillRect(0, 0, this.aw, this.ah);
      g.globalAlpha = 1;
      this.lightning = Math.max(0, this.lightning - dt * 1.5);
    }
  }
}
