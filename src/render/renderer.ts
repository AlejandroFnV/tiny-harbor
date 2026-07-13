/**
 * renderer.ts — escena canvas estilo "cartel de puerto / risografía".
 * Solo LEE el GameState; nunca lo muta. Todo el movimiento visual sale de
 * un reloj visual propio (this.t) + el estado de la sim.
 */

import { BOAT_TIERS, DAY_CYCLE_S } from "../sim/config";
import { phaseDuration } from "../sim/sim";
import type { Boat, GameState, SimEvent } from "../sim/types";
import { Particles } from "./particles";
import { INK, mix, nightness, scenePalette, visRand, type ScenePalette } from "./theme";

interface Gull {
  x: number;
  y: number;
  vx: number;
  active: boolean;
  flap: number;
}

export interface HitResult {
  type: "boat" | "shoal";
  boatId?: number;
  x: number;
  y: number;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private w = 360;
  private h = 640;
  private dpr = 1;
  t = 0; // reloj visual (s)
  particles = new Particles();

  /** Destino de las monedas (contador de dinero en pantalla). Lo fija la UI. */
  coinTarget = { x: 80, y: 40 };

  private gulls: Gull[] = [];
  private gullTimer = 4;
  private smokeTimer = 0;
  private fishTimer = 0;
  private lightning = 0;
  private lightningTimer = 8;
  private cloudSeeds: { x: number; y: number; s: number; v: number }[] = [];
  private stars: { x: number; y: number; r: number; tw: number }[] = [];
  private boatRects = new Map<number, { x: number; y: number; r: number }>();
  private shoalPos = { x: 0, y: 0 };

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d no disponible");
    this.ctx = ctx;
    const r = visRand(99);
    for (let i = 0; i < 4; i++) {
      this.cloudSeeds.push({ x: r(), y: 0.05 + r() * 0.2, s: 0.6 + r() * 0.9, v: 3 + r() * 5 });
    }
    for (let i = 0; i < 60; i++) {
      this.stars.push({ x: r(), y: r() * 0.32, r: 0.6 + r() * 1.2, tw: r() * Math.PI * 2 });
    }
    for (let i = 0; i < 3; i++) this.gulls.push({ x: 0, y: 0, vx: 0, active: false, flap: 0 });
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
  }

  // --- métricas de escena ----------------------------------------------------
  private get horizonY(): number {
    return this.h * 0.34;
  }
  private get pierY(): number {
    // En pantallas muy anchas (desktop) el muelle sube un poco para dejar aire.
    return this.h * (this.w > 900 ? 0.62 : 0.58);
  }
  private get seaH(): number {
    return this.pierY - this.horizonY;
  }

  private berthPos(slot: number, total: number): { x: number; y: number } {
    const n = Math.max(total, 3);
    const margin = this.w * 0.1;
    const usable = this.w - margin * 2;
    const x = margin + (usable * (slot + 0.5)) / n;
    return { x, y: this.pierY - 6 };
  }

  private fishingSpot(boat: Boat, zone: number): { x: number; y: number } {
    const r = visRand(boat.id * 7919 + 13);
    const fx = 0.12 + r() * 0.76;
    // Franja visible entre la banda de olas del fondo y la frontal;
    // zona más lejana = más cerca del horizonte (y más pequeño el barco).
    const depth = 0.46 - zone * 0.07 + r() * 0.06;
    return { x: this.w * fx, y: this.horizonY + this.seaH * Math.max(0.12, depth) };
  }

  private scaleAt(y: number): number {
    const t = (this.pierY - y) / this.seaH;
    return 1 - 0.55 * Math.max(0, Math.min(1, t));
  }

  /** Posición de pantalla del barco según su fase (para dibujar y para hit-test). */
  boatScreenPos(state: GameState, boat: Boat, index: number): { x: number; y: number; s: number } {
    const berth = this.berthPos(index, state.boats.length);
    const spot = this.fishingSpot(boat, state.zonesUnlocked);
    const bob = Math.sin(this.t * 2.1 + boat.id * 1.7) * 2.5;
    let x = berth.x;
    let y = berth.y;
    if (boat.phase === "out" || boat.phase === "in") {
      const dur = phaseDuration(state, boat, boat.phase);
      let p = dur > 0 ? boat.phaseT / dur : 1;
      p = Math.max(0, Math.min(1, p));
      const from = boat.phase === "out" ? berth : spot;
      const to = boat.phase === "out" ? spot : berth;
      // Curva suave con deriva lateral (se ve "navegar", no teletransporte).
      const cx = (from.x + to.x) / 2 + (boat.id % 2 === 0 ? 40 : -40);
      const cy = (from.y + to.y) / 2;
      const u = 1 - p;
      x = u * u * from.x + 2 * u * p * cx + p * p * to.x;
      y = u * u * from.y + 2 * u * p * cy + p * p * to.y;
    } else if (boat.phase === "fishing") {
      x = spot.x + Math.sin(this.t * 0.6 + boat.id) * 6;
      y = spot.y;
    }
    return { x, y: y + bob, s: this.scaleAt(y) };
  }

  hitTest(px: number, py: number, state: GameState): HitResult | null {
    if (state.event?.kind === "frenzy") {
      const dx = px - this.shoalPos.x;
      const dy = py - this.shoalPos.y;
      if (dx * dx + dy * dy < 60 * 60) return { type: "shoal", x: this.shoalPos.x, y: this.shoalPos.y };
    }
    for (const [id, r] of this.boatRects) {
      const dx = px - r.x;
      const dy = py - r.y;
      if (dx * dx + dy * dy < r.r * r.r) return { type: "boat", boatId: id, x: r.x, y: r.y };
    }
    return null;
  }

  getShoalPos(): { x: number; y: number } {
    return this.shoalPos;
  }

  /** Reacciones visuales a eventos de la sim. */
  onSimEvents(events: SimEvent[], state: GameState): void {
    for (const ev of events) {
      switch (ev.kind) {
        case "collect": {
          const r = this.boatRects.get(ev.boatId);
          const x = r?.x ?? this.w / 2;
          const y = r?.y ?? this.pierY;
          const n = Math.min(10, 3 + Math.floor(Math.log10(Math.max(1, ev.amount))));
          this.particles.coins(x, y - 10, this.coinTarget.x, this.coinTarget.y, n);
          break;
        }
        case "depart": {
          const idx = state.boats.findIndex((b) => b.id === ev.boatId);
          if (idx >= 0) {
            const p = this.berthPos(idx, state.boats.length);
            this.particles.splash(p.x, p.y + 6, 10);
          }
          break;
        }
        case "arrive": {
          const idx = state.boats.findIndex((b) => b.id === ev.boatId);
          if (idx >= 0) {
            const bp = this.boatScreenPos(state, state.boats[idx], idx);
            this.particles.ripple(bp.x, bp.y + 8);
          }
          break;
        }
        case "cargo_lost": {
          const r = this.boatRects.get(ev.boatId);
          if (r) this.particles.float(r.x, r.y - 24, "carga perdida", INK.inkSoft);
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
    this.particles.splash(p.x, p.y + 6, 22);
    this.particles.confetti(p.x, p.y - 20, 16);
  }

  upgradeFx(boatId: number): void {
    const r = this.boatRects.get(boatId);
    if (r) this.particles.spark(r.x, r.y - 8, 14);
  }

  // ---------------------------------------------------------------------------
  render(state: GameState, dt: number): void {
    this.t += dt;
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    const dayT = (state.playTime % DAY_CYCLE_S) / DAY_CYCLE_S;
    const night = nightness(dayT);
    const pal = scenePalette(night);
    const stormActive = state.event?.kind === "storm" && state.event.stage === "active";
    const stormWarn = state.event?.kind === "storm" && state.event.stage === "warning";
    const storm = stormActive ? 1 : stormWarn ? 0.5 : 0;
    const waveAmp = 1 + storm * 0.9;

    this.drawSky(pal, dayT, storm);
    this.drawSeaBack(pal);
    this.updateGulls(dt, night, storm);

    // Barcos por profundidad: pescando (lejos) → navegando → amarrados.
    this.boatRects.clear();
    const groups: { boat: Boat; idx: number; pos: { x: number; y: number; s: number } }[][] = [[], [], []];
    state.boats.forEach((boat, idx) => {
      const pos = this.boatScreenPos(state, boat, idx);
      const g = boat.phase === "fishing" ? 0 : boat.phase === "ready" ? 2 : 1;
      groups[g].push({ boat, idx, pos });
    });

    this.drawWaveBand(pal, 0, waveAmp);
    for (const { boat, pos } of groups[0]) this.drawBoat(boat, pos, pal);
    this.drawWaveBand(pal, 1, waveAmp);
    for (const { boat, pos } of groups[1]) this.drawBoat(boat, pos, pal);
    this.drawFrenzy(state, dt);
    this.drawWaveBand(pal, 2, waveAmp);
    for (const { boat, pos } of groups[2]) this.drawBoat(boat, pos, pal);

    this.drawPier(pal);
    this.drawBuildings(pal, dt);
    this.drawLighthouse(pal);

    // Partículas encima de la escena.
    this.particles.update(dt);
    this.particles.draw(ctx);

    // Tormenta: velo + lluvia + relámpago.
    if (storm > 0) this.drawStorm(dt, storm, stormActive);

    // Viñeta de cartel: bordes ligeramente oscurecidos.
    const vg = ctx.createRadialGradient(
      this.w / 2, this.h * 0.45, this.h * 0.35,
      this.w / 2, this.h * 0.45, this.h * 0.85,
    );
    vg.addColorStop(0, "rgba(35,48,71,0)");
    vg.addColorStop(1, "rgba(35,48,71,0.14)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, this.w, this.h);

    ctx.restore();
  }

  // --- cielo -------------------------------------------------------------------
  private drawSky(pal: ScenePalette, dayT: number, storm: number): void {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, this.horizonY * 1.2);
    g.addColorStop(0, pal.skyTop);
    g.addColorStop(1, pal.skyLow);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.horizonY + 2);

    // Sol de cartel (día) / luna y estrellas (noche).
    if (pal.night < 0.98) {
      const p = Math.min(1, dayT / 0.55);
      const sx = this.w * (0.15 + 0.7 * p);
      const sy = this.horizonY * (0.62 - Math.sin(p * Math.PI) * 0.38);
      const r = Math.min(this.w, this.h) * 0.085;
      ctx.save();
      ctx.globalAlpha = 1 - pal.night;
      // rayos triangulares girando muy despacio
      ctx.translate(sx, sy);
      ctx.rotate(this.t * 0.03);
      ctx.fillStyle = mix(INK.mustard, INK.coral, 0.25);
      for (let i = 0; i < 12; i++) {
        ctx.rotate(Math.PI / 6);
        ctx.beginPath();
        ctx.moveTo(r * 1.25, -r * 0.12);
        ctx.lineTo(r * 1.65, 0);
        ctx.lineTo(r * 1.25, r * 0.12);
        ctx.closePath();
        ctx.fill();
      }
      ctx.rotate(-this.t * 0.03);
      ctx.fillStyle = INK.mustard;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = mix(INK.mustard, INK.ink, 0.35);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (pal.night > 0.02) {
      ctx.save();
      ctx.globalAlpha = pal.night;
      for (const s of this.stars) {
        const tw = 0.55 + 0.45 * Math.sin(this.t * 1.3 + s.tw);
        ctx.globalAlpha = pal.night * tw;
        ctx.fillStyle = "#efe6cf";
        ctx.fillRect(s.x * this.w, s.y * this.h, s.r, s.r);
      }
      // luna creciente
      ctx.globalAlpha = pal.night;
      const mx = this.w * 0.78;
      const my = this.horizonY * 0.34;
      const mr = Math.min(this.w, this.h) * 0.05;
      ctx.fillStyle = "#efe6cf";
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pal.skyTop;
      ctx.beginPath();
      ctx.arc(mx - mr * 0.45, my - mr * 0.18, mr * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Nubes planas de papel (oscurecen con tormenta).
    for (const c of this.cloudSeeds) {
      const cx = ((c.x + this.t * c.v * 0.004) % 1.3) * this.w * 1.3 - this.w * 0.15;
      const cy = c.y * this.h;
      const s = c.s * Math.min(this.w, 520) * 0.14;
      ctx.fillStyle = mix(mix("#faf3e2", "#3b4a63", pal.night * 0.75), INK.inkSoft, storm * 0.6);
      ctx.beginPath();
      ctx.ellipse(cx, cy, s, s * 0.34, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + s * 0.55, cy - s * 0.16, s * 0.6, s * 0.26, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - s * 0.55, cy - s * 0.1, s * 0.5, s * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Gaviotas.
    for (const gl of this.gulls) {
      if (!gl.active) continue;
      const flap = Math.sin(gl.flap) * 0.7;
      this.ctx.strokeStyle = pal.night > 0.5 ? "#a9b3c4" : INK.ink;
      this.ctx.lineWidth = 2;
      this.ctx.lineCap = "round";
      this.ctx.beginPath();
      this.ctx.moveTo(gl.x - 7, gl.y - flap * 4);
      this.ctx.quadraticCurveTo(gl.x - 3, gl.y + 3, gl.x, gl.y);
      this.ctx.quadraticCurveTo(gl.x + 3, gl.y + 3, gl.x + 7, gl.y - flap * 4);
      this.ctx.stroke();
    }
  }

  private updateGulls(dt: number, night: number, storm: number): void {
    this.gullTimer -= dt;
    if (this.gullTimer <= 0 && night < 0.5 && storm === 0) {
      const g = this.gulls.find((x) => !x.active);
      if (g) {
        g.active = true;
        const dir = Math.random() < 0.5 ? 1 : -1;
        g.x = dir === 1 ? -20 : this.w + 20;
        g.vx = dir * (22 + Math.random() * 26);
        g.y = this.h * (0.08 + Math.random() * 0.18);
        g.flap = Math.random() * 10;
      }
      this.gullTimer = 5 + Math.random() * 9;
    }
    for (const g of this.gulls) {
      if (!g.active) continue;
      g.x += g.vx * dt;
      g.y += Math.sin(this.t * 1.8 + g.flap) * 6 * dt;
      g.flap += dt * 9;
      if (g.x < -30 || g.x > this.w + 30) g.active = false;
    }
  }

  // --- mar -----------------------------------------------------------------------
  private drawSeaBack(pal: ScenePalette): void {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, this.horizonY, 0, this.pierY);
    g.addColorStop(0, pal.seaFoam);
    g.addColorStop(0.5, pal.seaMid);
    g.addColorStop(1, pal.seaDeep);
    ctx.fillStyle = g;
    ctx.fillRect(0, this.horizonY, this.w, this.h - this.horizonY);
    // línea de horizonte a tinta
    ctx.fillStyle = "rgba(35,48,71,0.35)";
    ctx.fillRect(0, this.horizonY, this.w, 1.5);
  }

  /** Banda de olas festoneada (paper-cut) con parallax. */
  private drawWaveBand(pal: ScenePalette, i: number, amp: number): void {
    const ctx = this.ctx;
    const yBase = this.horizonY + this.seaH * (0.34 + 0.24 * i);
    const r = 14 + i * 9; // festón más grande cuanto más cerca
    const speed = (i + 1) * 9 * (i % 2 === 0 ? 1 : -1);
    const off = ((this.t * speed) % (r * 2) + r * 2) % (r * 2);
    const colors = [pal.seaMid, mix(pal.seaMid, pal.seaDeep, 0.55), pal.seaDeep];
    ctx.fillStyle = colors[i];
    ctx.beginPath();
    ctx.moveTo(-r * 2, this.h);
    ctx.lineTo(-r * 2, yBase);
    for (let x = -r * 2; x < this.w + r * 2; x += r * 2) {
      const bobY = Math.sin((x + this.t * 30) * 0.01 + i * 2) * 3 * amp;
      ctx.arc(x + r - off, yBase + bobY, r, Math.PI, 0, false);
    }
    ctx.lineTo(this.w + r * 2, this.h);
    ctx.closePath();
    ctx.fill();
    // espuma: puntadas sobre el festón
    ctx.strokeStyle = "rgba(242,232,213,0.35)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 9]);
    ctx.beginPath();
    for (let x = -r * 2; x < this.w + r * 2; x += r * 2) {
      const bobY = Math.sin((x + this.t * 30) * 0.01 + i * 2) * 3 * amp;
      ctx.arc(x + r - off, yBase + bobY, r * 0.99, Math.PI * 1.15, Math.PI * 1.85, false);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // --- barcos -----------------------------------------------------------------------
  private drawBoat(
    boat: Boat,
    pos: { x: number; y: number; s: number },
    pal: ScenePalette,
  ): void {
    const ctx = this.ctx;
    const def = BOAT_TIERS[boat.tier];
    const L = 26 * def.size * pos.s; // media eslora
    const H = 11 * Math.sqrt(def.size) * pos.s;
    const { x, y } = pos;
    this.boatRects.set(boat.id, { x, y: y - H * 0.4, r: Math.max(30, L * 1.25) });

    ctx.save();
    ctx.translate(x, y);

    // Glow de "listo para cobrar": pulso coral detrás del barco.
    if (boat.phase === "ready") {
      const pulse = 0.55 + 0.45 * Math.sin(this.t * 3.4);
      const rg = ctx.createRadialGradient(0, -H * 0.3, 4, 0, -H * 0.3, L * 1.6);
      rg.addColorStop(0, `rgba(224,104,75,${0.34 * pulse})`);
      rg.addColorStop(1, "rgba(224,104,75,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(-L * 1.8, -H * 3 - L, L * 3.6, H * 3 + L * 2);
    }

    // Estela al navegar.
    if (boat.phase === "out" || boat.phase === "in") {
      ctx.strokeStyle = "rgba(242,232,213,0.4)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(-L * 1.2, H * 0.55);
      ctx.quadraticCurveTo(-L * 1.9, H * 0.8, -L * 2.6, H * 0.6);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const lw = Math.max(1.4, 2.4 * pos.s);
    ctx.lineWidth = lw;
    ctx.strokeStyle = pal.ink;
    ctx.lineJoin = "round";

    // Casco: proa curva, popa recta (silueta con carácter, no caja).
    const hull = mix(def.hull, "#1c2438", pal.night * 0.45);
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.moveTo(-L, -H * 0.55);
    ctx.lineTo(L * 0.62, -H * 0.55);
    ctx.quadraticCurveTo(L * 1.08, -H * 0.5, L * 0.86, H * 0.28);
    ctx.quadraticCurveTo(L * 0.5, H * 0.62, 0, H * 0.62);
    ctx.lineTo(-L * 0.78, H * 0.62);
    ctx.quadraticCurveTo(-L * 1.05, H * 0.55, -L, -H * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Franja de regala en papel.
    ctx.fillStyle = mix(INK.paper, "#8a8272", pal.night * 0.5);
    ctx.fillRect(-L * 0.92, -H * 0.55, L * 1.6, H * 0.2);
    ctx.strokeRect(-L * 0.92, -H * 0.55, L * 1.6, H * 0.2);

    // Cabina (a partir de chalana) con ventana que se enciende de noche.
    if (boat.tier >= 1) {
      const cw = L * 0.52;
      const ch = H * 0.75;
      ctx.fillStyle = mix(INK.paper, "#6d675c", pal.night * 0.5);
      ctx.beginPath();
      ctx.roundRect(-L * 0.55, -H * 0.55 - ch, cw, ch, 2.5 * pos.s);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = pal.night > 0.4 ? INK.mustard : mix(INK.seaMid, INK.ink, 0.3);
      ctx.beginPath();
      ctx.roundRect(-L * 0.55 + cw * 0.2, -H * 0.55 - ch * 0.75, cw * 0.42, ch * 0.42, 2 * pos.s);
      ctx.fill();
      ctx.stroke();
    }

    // Mástil + banderín ondeando (coral).
    const mastX = boat.tier >= 1 ? L * 0.28 : 0;
    const mastH = H * (boat.tier >= 2 ? 2.6 : 2.0);
    ctx.beginPath();
    ctx.moveTo(mastX, -H * 0.55);
    ctx.lineTo(mastX, -H * 0.55 - mastH);
    ctx.stroke();
    const wave = Math.sin(this.t * 5 + boat.id);
    ctx.fillStyle = INK.coral;
    ctx.beginPath();
    ctx.moveTo(mastX, -H * 0.55 - mastH);
    ctx.quadraticCurveTo(
      mastX + L * 0.42, -H * 0.55 - mastH + wave * 2.2,
      mastX + L * 0.5, -H * 0.55 - mastH + H * 0.3 + wave * 2.8,
    );
    ctx.lineTo(mastX, -H * 0.55 - mastH + H * 0.42);
    ctx.closePath();
    ctx.fill();

    // Pescando: red + boya.
    if (boat.phase === "fishing") {
      ctx.strokeStyle = "rgba(242,232,213,0.5)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(L * 0.7, H * 0.1);
      ctx.quadraticCurveTo(L * 1.5, H * 1.4, L * 2.1, H * 0.9);
      ctx.stroke();
      ctx.fillStyle = INK.coral;
      ctx.beginPath();
      ctx.arc(L * 2.1, H * 0.9 + Math.sin(this.t * 2.4 + boat.id) * 2, 3 * pos.s, 0, Math.PI * 2);
      ctx.fill();
    }

    // Listo: cajas de carga + burbuja de cobro botando.
    if (boat.phase === "ready") {
      ctx.fillStyle = INK.mustard;
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = lw;
      const bx = -L * 0.15;
      ctx.beginPath();
      ctx.roundRect(bx - L * 0.28, -H * 1.3, L * 0.56, H * 0.75, 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(bx, -H * 1.85, L * 0.44, H * 0.6, 2);
      ctx.fill();
      ctx.stroke();

      const bounce = Math.abs(Math.sin(this.t * 3.2 + boat.id)) * 7;
      const by = -H * 2.6 - mastH * 0.4 - bounce;
      ctx.fillStyle = INK.paper;
      ctx.beginPath();
      ctx.arc(0, by, 13 * Math.max(0.8, pos.s), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // pico de bocadillo
      ctx.beginPath();
      ctx.moveTo(-4, by + 11);
      ctx.lineTo(0, by + 18);
      ctx.lineTo(4, by + 11);
      ctx.closePath();
      ctx.fillStyle = INK.paper;
      ctx.fill();
      ctx.stroke();
      // moneda dentro
      ctx.fillStyle = INK.mustard;
      ctx.beginPath();
      ctx.arc(0, by, 7 * Math.max(0.8, pos.s), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  // --- banco de peces -------------------------------------------------------------
  private drawFrenzy(state: GameState, dt: number): void {
    if (state.event?.kind !== "frenzy") return;
    this.shoalPos = { x: this.w * 0.5, y: this.horizonY + this.seaH * 0.5 };
    this.fishTimer -= dt;
    if (this.fishTimer <= 0) {
      this.particles.fish(
        this.shoalPos.x + (Math.random() - 0.5) * 70,
        this.shoalPos.y + (Math.random() - 0.5) * 16,
      );
      this.particles.ripple(this.shoalPos.x + (Math.random() - 0.5) * 60, this.shoalPos.y + 8);
      this.fishTimer = 0.16;
    }
    // Halo tenue para que se lea como zona tocable.
    const ctx = this.ctx;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 4);
    ctx.strokeStyle = `rgba(223,169,62,${0.5 + 0.3 * pulse})`;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.ellipse(this.shoalPos.x, this.shoalPos.y, 56 + pulse * 6, 22 + pulse * 3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // --- muelle y edificios ------------------------------------------------------------
  private drawPier(pal: ScenePalette): void {
    const ctx = this.ctx;
    const y = this.pierY;
    const deckH = Math.max(26, this.h * 0.045);
    const wood = mix("#b58a5c", "#4a4438", pal.night * 0.55);
    const woodDark = mix("#93683f", "#37332a", pal.night * 0.55);

    // Pilotes.
    ctx.fillStyle = woodDark;
    const step = Math.max(70, this.w / 12);
    for (let x = step / 2; x < this.w; x += step) {
      ctx.beginPath();
      ctx.roundRect(x - 5, y + deckH - 4, 10, this.h - y, 3);
      ctx.fill();
    }
    // Tablones.
    ctx.fillStyle = wood;
    ctx.fillRect(0, y, this.w, deckH);
    ctx.strokeStyle = "rgba(35,48,71,0.5)";
    ctx.lineWidth = 2;
    ctx.strokeRect(-2, y, this.w + 4, deckH);
    ctx.strokeStyle = "rgba(35,48,71,0.22)";
    ctx.lineWidth = 1;
    for (let x = 14; x < this.w; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x, y + 2);
      ctx.lineTo(x, y + deckH - 2);
      ctx.stroke();
    }

    // Agua de primer plano bajo el muelle.
    const g = ctx.createLinearGradient(0, y + deckH, 0, this.h);
    g.addColorStop(0, pal.seaDeep);
    g.addColorStop(1, mix(pal.seaDeep, "#0c2129", 0.5));
    ctx.fillStyle = g;
    ctx.fillRect(0, y + deckH, this.w, this.h - y - deckH);

    // Bolardos + guirnalda de cuerda.
    ctx.fillStyle = INK.ink;
    for (let x = step / 2; x < this.w; x += step) {
      ctx.beginPath();
      ctx.roundRect(x - 4, y - 9, 8, 9, 2);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(35,48,71,0.6)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = step / 2; x + step < this.w + step; x += step) {
      ctx.moveTo(x, y - 5);
      ctx.quadraticCurveTo(x + step / 2, y + 7, x + step, y - 5);
    }
    ctx.stroke();

    // Farolas: 3, con glow de noche.
    const lampXs = [this.w * 0.18, this.w * 0.5, this.w * 0.82];
    for (const lx of lampXs) {
      ctx.strokeStyle = INK.ink;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(lx, y);
      ctx.lineTo(lx, y - 38);
      ctx.stroke();
      const flick = pal.night * (0.85 + 0.15 * Math.sin(this.t * 7 + lx));
      if (pal.night > 0.25) {
        const rg = ctx.createRadialGradient(lx, y - 42, 2, lx, y - 42, 46);
        rg.addColorStop(0, `rgba(223,169,62,${0.5 * flick})`);
        rg.addColorStop(1, "rgba(223,169,62,0)");
        ctx.fillStyle = rg;
        ctx.fillRect(lx - 48, y - 92, 96, 100);
      }
      ctx.fillStyle = pal.night > 0.25 ? INK.mustard : INK.paper;
      ctx.strokeStyle = INK.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(lx, y - 42, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  private drawBuildings(pal: ScenePalette, dt: number): void {
    const ctx = this.ctx;
    const y = this.pierY;
    const s = Math.min(1.25, Math.max(0.8, this.w / 520));
    const baseX = this.w - 150 * s;

    // Almacén con chimenea (humo).
    const wW = 96 * s;
    const wH = 58 * s;
    ctx.fillStyle = mix("#cf7f57", "#4c3a33", pal.night * 0.55);
    ctx.strokeStyle = INK.ink;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.rect(baseX, y - wH, wW, wH);
    ctx.fill();
    ctx.stroke();
    // tejado a dos aguas
    ctx.fillStyle = mix(INK.ink, "#0e1524", pal.night * 0.4);
    ctx.beginPath();
    ctx.moveTo(baseX - 7 * s, y - wH);
    ctx.lineTo(baseX + wW / 2, y - wH - 26 * s);
    ctx.lineTo(baseX + wW + 7 * s, y - wH);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // chimenea
    const chX = baseX + wW * 0.72;
    ctx.fillStyle = mix(INK.paper, "#6d675c", pal.night * 0.5);
    ctx.fillRect(chX, y - wH - 34 * s, 10 * s, 22 * s);
    ctx.strokeRect(chX, y - wH - 34 * s, 10 * s, 22 * s);
    this.smokeTimer -= dt;
    if (this.smokeTimer <= 0) {
      this.particles.smoke(chX + 5 * s, y - wH - 36 * s);
      this.smokeTimer = 0.5 + Math.random() * 0.5;
    }
    // puerta + ventana redonda (encendida de noche)
    ctx.fillStyle = mix(INK.ink, "#0e1524", 0.2);
    ctx.beginPath();
    ctx.roundRect(baseX + 12 * s, y - 30 * s, 22 * s, 30 * s, 3);
    ctx.fill();
    ctx.fillStyle = pal.night > 0.4 ? INK.mustard : INK.paper;
    ctx.beginPath();
    ctx.arc(baseX + wW * 0.62, y - wH * 0.55, 7.5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Lonja con toldo a rayas.
    const mX = baseX - 86 * s;
    const mW = 72 * s;
    const mH = 42 * s;
    ctx.fillStyle = mix(INK.paper, "#6d675c", pal.night * 0.5);
    ctx.beginPath();
    ctx.rect(mX, y - mH, mW, mH);
    ctx.fill();
    ctx.stroke();
    // toldo: festón a rayas coral/papel
    const scallops = 5;
    const sw = mW / scallops;
    for (let i = 0; i < scallops; i++) {
      ctx.fillStyle = i % 2 === 0 ? INK.coral : mix(INK.paper, "#8d8574", pal.night * 0.4);
      ctx.beginPath();
      ctx.rect(mX + i * sw, y - mH - 4 * s, sw, 10 * s);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(mX + i * sw + sw / 2, y - mH + 6 * s, sw / 2, 0, Math.PI);
      ctx.fill();
      ctx.stroke();
    }
    // ventana lonja
    ctx.fillStyle = pal.night > 0.4 ? INK.mustard : mix(INK.seaMid, INK.ink, 0.25);
    ctx.beginPath();
    ctx.roundRect(mX + mW * 0.28, y - mH * 0.62, mW * 0.44, mH * 0.34, 2);
    ctx.fill();
    ctx.stroke();
    // cajas apiladas al lado
    ctx.fillStyle = INK.mustard;
    ctx.beginPath();
    ctx.roundRect(mX - 20 * s, y - 14 * s, 16 * s, 14 * s, 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(mX - 16 * s, y - 26 * s, 13 * s, 12 * s, 2);
    ctx.fill();
    ctx.stroke();
  }

  private drawLighthouse(pal: ScenePalette): void {
    const ctx = this.ctx;
    const s = Math.min(1.25, Math.max(0.8, this.w / 520));
    const x = 44 * s;
    const y = this.pierY;
    const h = 84 * s;
    const wTop = 16 * s;
    const wBase = 26 * s;

    ctx.strokeStyle = INK.ink;
    ctx.lineWidth = 2.5;
    // torre troncocónica con franjas coral
    ctx.fillStyle = mix(INK.paper, "#6d675c", pal.night * 0.5);
    ctx.beginPath();
    ctx.moveTo(x - wBase / 2, y);
    ctx.lineTo(x - wTop / 2, y - h);
    ctx.lineTo(x + wTop / 2, y - h);
    ctx.lineTo(x + wBase / 2, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = INK.coral;
    ctx.fillRect(x - wBase, y - h * 0.32, wBase * 2, h * 0.15);
    ctx.fillRect(x - wBase, y - h * 0.68, wBase * 2, h * 0.15);
    ctx.restore();
    ctx.stroke();
    // linterna
    ctx.fillStyle = pal.night > 0.3 ? INK.mustard : INK.paper;
    ctx.beginPath();
    ctx.roundRect(x - wTop / 2 - 2, y - h - 14 * s, wTop + 4, 14 * s, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = mix(INK.ink, "#0e1524", 0.3);
    ctx.beginPath();
    ctx.moveTo(x - wTop / 2 - 4, y - h - 14 * s);
    ctx.lineTo(x, y - h - 24 * s);
    ctx.lineTo(x + wTop / 2 + 4, y - h - 14 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Haz de luz giratorio de noche (el detalle que da vida).
    if (pal.night > 0.3) {
      const ang = this.t * 0.7;
      const ly = y - h - 7 * s;
      ctx.save();
      ctx.globalAlpha = 0.16 * pal.night * (0.8 + 0.2 * Math.sin(this.t * 3));
      ctx.fillStyle = INK.mustard;
      for (const dir of [0, Math.PI]) {
        ctx.save();
        ctx.translate(x, ly);
        ctx.rotate(ang + dir);
        ctx.beginPath();
        ctx.moveTo(0, -3);
        ctx.lineTo(150 * s, -17 * s);
        ctx.lineTo(150 * s, 17 * s);
        ctx.lineTo(0, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
  }

  // --- tormenta ------------------------------------------------------------------------
  private drawStorm(dt: number, storm: number, active: boolean): void {
    const ctx = this.ctx;
    ctx.fillStyle = `rgba(27,39,64,${0.24 * storm})`;
    ctx.fillRect(0, 0, this.w, this.h);
    if (active) {
      for (let i = 0; i < 3; i++) {
        if (Math.random() < 0.8) {
          this.particles.rain(Math.random() * this.w, this.horizonY * (0.2 + Math.random() * 0.5));
        }
      }
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightning = 0.24;
        this.lightningTimer = 3 + Math.random() * 6;
      }
    }
    if (this.lightning > 0) {
      ctx.fillStyle = `rgba(242,232,213,${this.lightning})`;
      ctx.fillRect(0, 0, this.w, this.h);
      this.lightning = Math.max(0, this.lightning - dt * 1.4);
    }
  }
}
