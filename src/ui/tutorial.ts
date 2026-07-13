/**
 * tutorial.ts — tutorial jugable de 5 pasos con dedo-guía animado.
 * Sin muros de texto: una frase + mano señalando el sitio exacto.
 * El paso avanza cuando el jugador HACE la acción (no al pulsar "siguiente").
 */

import type { GameState } from "../sim/types";
import type { Renderer } from "../render/renderer";
import type { UI } from "./ui";

interface Step {
  text: string;
  /** Dónde apunta la mano: coords de pantalla o null (sin objetivo visible aún). */
  target: () => { x: number; y: number } | null;
  done: (s: GameState) => boolean;
}

const HAND_SVG = `<svg viewBox="0 0 54 54" fill="none">
  <path d="M22 47c-5-3-9-8-11-13-1.2-2.8 2.4-5 4.4-2.7l3 3.4V16c0-4.4 6-4.4 6 0v10l10.8 2.3c3.4.7 5.3 3 4.8 6.6l-1.3 8.2c-.5 3-3 4.9-6 4.9H22z"
    fill="#f2e8d5" stroke="#233047" stroke-width="2.6" stroke-linejoin="round"/>
</svg>`;

export class Tutorial {
  private hand: HTMLElement;
  private tip: HTMLElement;

  constructor(
    private getState: () => GameState,
    private renderer: Renderer,
    private ui: UI,
  ) {
    this.hand = document.createElement("div");
    this.hand.className = "tutor-hand";
    this.hand.innerHTML = HAND_SVG;
    this.tip = document.createElement("div");
    this.tip.className = "tutor-tip";
    document.getElementById("ui-root")!.append(this.hand, this.tip);
    this.hand.hidden = true;
    this.tip.hidden = true;
  }

  private elCenter(sel: string): { x: number; y: number } | null {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  private steps: Step[] = [
    {
      text: "Tu bote ha vuelto cargado. ¡Toca el barco para cobrar!",
      target: () => {
        const s = this.getState();
        const idx = s.boats.findIndex((b) => b.phase === "ready");
        if (idx < 0) return null; // aún faenando: la mano espera
        return this.renderer.boatScreenPos(s, s.boats[idx], idx);
      },
      done: (s) => s.stats.collects >= 1,
    },
    {
      text: "Con monedas se crece: bota un segundo barco en FLOTA.",
      target: () => {
        if (!this.ui.sheetOpen || this.ui.activeTab !== "flota") {
          return this.elCenter("#tabbar [data-tab='flota']");
        }
        return this.elCenter("[data-action='buy-boat']:not(:disabled)");
      },
      done: (s) => s.stats.boatsBought >= 1,
    },
    {
      text: "Mejora un barco: más velocidad o mejores redes.",
      target: () => {
        if (!this.ui.sheetOpen || this.ui.activeTab !== "flota") {
          return this.elCenter("#tabbar [data-tab='flota']");
        }
        return (
          this.elCenter(".boat-row [data-action='up-speed']:not(:disabled)") ??
          this.elCenter(".boat-row [data-action='up-cap']:not(:disabled)")
        );
      },
      done: (s) => s.stats.upgrades >= 1,
    },
    {
      text: "El MAPA guarda caladeros mejores. Échale un ojo.",
      target: () => this.elCenter("#tabbar [data-tab='mapa']"),
      done: () => this.ui.mapVisited,
    },
    {
      text: "Las misiones pagan extra y se renuevan solas.",
      target: () => this.elCenter("#missions-btn"),
      done: () => this.ui.missionsOpened,
    },
  ];

  get finished(): boolean {
    return this.getState().tutorialStep >= this.steps.length;
  }

  /** Llamar cada frame. Muestra la mano, comprueba avance. */
  update(): void {
    const s = this.getState();
    if (this.finished) {
      if (!this.hand.hidden) {
        this.hand.hidden = true;
        this.tip.hidden = true;
      }
      return;
    }
    const step = this.steps[s.tutorialStep];
    if (step.done(s)) {
      s.tutorialStep++; // persiste con el autosave
      return;
    }
    const target = step.target();
    if (!target) {
      this.hand.hidden = true;
      this.tip.hidden = true;
      return;
    }
    this.hand.hidden = false;
    this.tip.hidden = false;
    this.hand.style.left = `${target.x - 6}px`;
    this.hand.style.top = `${target.y + 4}px`;
    this.tip.textContent = step.text;
    const tw = this.tip.offsetWidth;
    const tx = Math.max(8, Math.min(window.innerWidth - tw - 8, target.x - tw / 2));
    this.tip.style.left = `${tx}px`;
    const above = target.y - this.tip.offsetHeight - 26;
    this.tip.style.top = `${Math.max(8, above)}px`;
  }
}
