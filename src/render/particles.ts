/**
 * Partículas con pooling: capacidad fija, cero alloc por frame.
 * Tipos: coin (vuela en arco hacia el contador), splash, confetti,
 * smoke, ripple, rain, text (números flotantes "+X"), fish (banco de peces).
 */

import { INK } from "./theme";

export type ParticleKind =
  | "coin"
  | "splash"
  | "confetti"
  | "smoke"
  | "ripple"
  | "rain"
  | "text"
  | "fish"
  | "spark";

interface P {
  alive: boolean;
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 0..ttl
  ttl: number;
  size: number;
  rot: number;
  vrot: number;
  color: string;
  text: string;
  // Para coins: destino (contador de dinero) y origen para curva.
  tx: number;
  ty: number;
  ox: number;
  oy: number;
}

const CAPACITY = 320;

export class Particles {
  private pool: P[] = [];
  private cursor = 0;

  constructor() {
    for (let i = 0; i < CAPACITY; i++) {
      this.pool.push({
        alive: false, kind: "spark", x: 0, y: 0, vx: 0, vy: 0, life: 0, ttl: 1,
        size: 2, rot: 0, vrot: 0, color: INK.ink, text: "", tx: 0, ty: 0, ox: 0, oy: 0,
      });
    }
  }

  private take(): P {
    // Anillo: si está lleno, reutiliza la más vieja (jamás crece).
    for (let i = 0; i < CAPACITY; i++) {
      this.cursor = (this.cursor + 1) % CAPACITY;
      if (!this.pool[this.cursor].alive) return this.pool[this.cursor];
    }
    this.cursor = (this.cursor + 1) % CAPACITY;
    return this.pool[this.cursor];
  }

  private spawn(kind: ParticleKind, x: number, y: number): P {
    const p = this.take();
    p.alive = true;
    p.kind = kind;
    p.x = x; p.y = y; p.ox = x; p.oy = y;
    p.vx = 0; p.vy = 0; p.life = 0; p.rot = 0; p.vrot = 0;
    p.text = "";
    return p;
  }

  /** Monedas que saltan en arco hacia el contador (tx,ty). */
  coins(x: number, y: number, tx: number, ty: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const p = this.spawn("coin", x + (Math.random() - 0.5) * 24, y + (Math.random() - 0.5) * 10);
      p.tx = tx; p.ty = ty;
      p.ttl = 0.55 + Math.random() * 0.3;
      p.size = 5 + Math.random() * 3;
      p.color = INK.mustard;
      p.rot = Math.random() * Math.PI;
      p.vrot = 6 + Math.random() * 6;
    }
  }

  splash(x: number, y: number, n = 14, color = "#cfe6dd"): void {
    for (let i = 0; i < n; i++) {
      const p = this.spawn("splash", x, y);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const v = 60 + Math.random() * 140;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v;
      p.ttl = 0.5 + Math.random() * 0.35;
      p.size = 2 + Math.random() * 3;
      p.color = color;
    }
    this.ripple(x, y + 4);
  }

  confetti(x: number, y: number, n = 26): void {
    const colors = [INK.coral, INK.mustard, INK.seaMid, INK.ink, "#fff6e3"];
    for (let i = 0; i < n; i++) {
      const p = this.spawn("confetti", x, y);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const v = 120 + Math.random() * 220;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v;
      p.ttl = 0.9 + Math.random() * 0.8;
      p.size = 3 + Math.random() * 4;
      p.color = colors[i % colors.length];
      p.rot = Math.random() * Math.PI * 2;
      p.vrot = (Math.random() - 0.5) * 14;
    }
  }

  smoke(x: number, y: number): void {
    const p = this.spawn("smoke", x, y);
    p.vx = 6 + Math.random() * 8;
    p.vy = -14 - Math.random() * 8;
    p.ttl = 2.2 + Math.random() * 1.2;
    p.size = 3 + Math.random() * 3;
    p.color = "rgba(240,232,214,0.5)";
  }

  ripple(x: number, y: number): void {
    const p = this.spawn("ripple", x, y);
    p.ttl = 0.9;
    p.size = 4;
    p.color = "rgba(255,255,255,0.55)";
  }

  rain(x: number, y: number): void {
    const p = this.spawn("rain", x, y);
    p.vx = -60;
    p.vy = 420 + Math.random() * 160;
    p.ttl = 1.4;
    p.size = 7 + Math.random() * 5;
    p.color = "rgba(210,225,230,0.5)";
  }

  /** Número flotante "+X". */
  float(x: number, y: number, text: string, color: string = INK.ink): void {
    const p = this.spawn("text", x, y);
    p.vy = -46;
    p.vx = (Math.random() - 0.5) * 10;
    p.ttl = 1.0;
    p.size = 16;
    p.color = color;
    p.text = text;
  }

  /** Pez saltando (banco de peces). */
  fish(x: number, y: number): void {
    const p = this.spawn("fish", x, y);
    const dir = Math.random() < 0.5 ? -1 : 1;
    p.vx = dir * (40 + Math.random() * 60);
    p.vy = -(130 + Math.random() * 90);
    p.ttl = 0.9;
    p.size = 7 + Math.random() * 4;
    p.color = "#b8d4c2";
  }

  spark(x: number, y: number, n = 10, color = INK.mustard): void {
    for (let i = 0; i < n; i++) {
      const p = this.spawn("spark", x, y);
      const a = Math.random() * Math.PI * 2;
      const v = 40 + Math.random() * 110;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v;
      p.ttl = 0.4 + Math.random() * 0.3;
      p.size = 1.5 + Math.random() * 2;
      p.color = color;
    }
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.ttl) {
        p.alive = false;
        continue;
      }
      switch (p.kind) {
        case "coin": {
          // Curva: sube en arco y cae hacia el contador (bezier cuadrática).
          const t = p.life / p.ttl;
          const mx = (p.ox + p.tx) / 2 + 30;
          const my = Math.min(p.oy, p.ty) - 90;
          const u = 1 - t;
          p.x = u * u * p.ox + 2 * u * t * mx + t * t * p.tx;
          p.y = u * u * p.oy + 2 * u * t * my + t * t * p.ty;
          p.rot += p.vrot * dt;
          break;
        }
        case "splash":
        case "confetti":
        case "fish":
        case "spark":
          p.vy += (p.kind === "confetti" ? 420 : 520) * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vrot * dt;
          break;
        case "smoke":
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.size += 7 * dt;
          break;
        case "ripple":
          p.size += 46 * dt;
          break;
        case "rain":
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
        case "text":
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          break;
      }
    }
  }

  /**
   * Dibuja en estilo pixel: coordenadas y tamaños alineados a la rejilla de
   * arte (px = píxeles de pantalla por píxel de arte). Todo son rects.
   */
  draw(ctx: CanvasRenderingContext2D, px = 3): void {
    const snap = (v: number) => Math.round(v / px) * px;
    for (const p of this.pool) {
      if (!p.alive) continue;
      const t = p.life / p.ttl;
      const fade = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      ctx.save();
      ctx.globalAlpha = fade;
      const x = snap(p.x);
      const y = snap(p.y);
      switch (p.kind) {
        case "coin": {
          // Moneda pixel que "gira": el ancho oscila en pasos enteros.
          const d = Math.max(px, snap(p.size * 1.6));
          const wSteps = Math.max(1, Math.round((Math.abs(Math.cos(p.rot)) * d) / px));
          const w = wSteps * px;
          ctx.fillStyle = INK.ink;
          ctx.fillRect(x - w / 2 - px, y - d / 2, w + px * 2, d);
          ctx.fillStyle = p.color;
          ctx.fillRect(x - w / 2, y - d / 2 + px, w, d - px * 2);
          break;
        }
        case "splash":
        case "spark": {
          const s = Math.max(px, snap(p.size * 1.4));
          ctx.fillStyle = p.color;
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
          break;
        }
        case "confetti": {
          const s = Math.max(px, snap(p.size));
          ctx.fillStyle = p.color;
          // alterna horizontal/vertical al "girar"
          if (Math.sin(p.rot) > 0) ctx.fillRect(x - s, y - s / 2, s * 2, s);
          else ctx.fillRect(x - s / 2, y - s, s, s * 2);
          break;
        }
        case "smoke": {
          const s = Math.max(px, snap(p.size * 1.6));
          ctx.fillStyle = p.color;
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
          break;
        }
        case "ripple": {
          // Anillo horizontal que se abre: dos guiones separándose.
          const half = snap(p.size * 1.4);
          ctx.fillStyle = p.color;
          ctx.fillRect(x - half, y, px * 2, px);
          ctx.fillRect(x + half - px * 2, y, px * 2, px);
          break;
        }
        case "rain":
          ctx.fillStyle = p.color;
          ctx.fillRect(x, y, px, px * 3);
          break;
        case "text":
          ctx.font = `700 ${p.size}px 'Bricolage Grotesque Variable', sans-serif`;
          ctx.textAlign = "center";
          ctx.fillStyle = p.color;
          ctx.strokeStyle = "rgba(242,232,213,0.9)";
          ctx.lineWidth = 3;
          ctx.strokeText(p.text, p.x, p.y);
          ctx.fillText(p.text, p.x, p.y);
          break;
        case "fish": {
          // Pececillo: cuerpo horizontal + cola en el lado contrario al avance.
          const dir = p.vx >= 0 ? 1 : -1;
          ctx.fillStyle = p.color;
          ctx.fillRect(x - px * 1.5, y - px / 2, px * 3, px);
          ctx.fillRect(x - dir * px * 2, y - px, px, px);
          ctx.fillRect(x - dir * px * 2, y + px * 0.5 - px, px, px);
          break;
        }
      }
      ctx.restore();
    }
  }
}
