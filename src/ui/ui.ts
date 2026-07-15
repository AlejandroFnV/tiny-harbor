/**
 * ui.ts — overlay DOM: contador, misiones, hoja inferior con pestañas,
 * banners de evento, modales y toasts. Lee el estado; las acciones las
 * ejecuta main.ts vía callbacks (la sim no se toca desde aquí).
 */

import * as C from "../sim/config";
import {
  albaUnlocked,
  berths,
  boatCost,
  buyerGain,
  canPrestige,
  capUpgradeCost,
  cargoValue,
  completionPct,
  dockCost,
  expeditionBooty,
  expeditionDuration,
  incomeRate,
  isAway,
  legacyCost,
  lonjaCost,
  managerCost,
  nextZone,
  offlineCapSeconds,
  ownsAlba,
  prestigeGain,
  prestigeMult,
  prestigeOffers,
  prestigeThreshold,
  speedUpgradeCost,
  vigiaCost,
  zoneCost,
} from "../sim/economy";
import { formatDuration, formatMoney } from "../sim/format";
import type { OfflineResult } from "../sim/offline";
import type { GameState } from "../sim/types";
import { boatThumbURL, skipperPortraitURL, speciesThumbURL } from "../render/sprites";

export interface UIActions {
  buyBoat(tier: number): void;
  upgradeBoat(boatId: number, what: "speed" | "cap"): void;
  upgradeDock(): void;
  upgradeLonja(): void;
  startExpedition(defIndex: number): void;
  renamePort(name: string): void;
  shareCard(): void;
  hireManager(): void;
  hireSkipper(index: number): void;
  buyLegacy(branch: C.LegacyBranch): void;
  unlockZone(): void;
  buyVigia(): void;
  prestige(buyerId: string): void;
  resolveStorm(choice: "shelter" | "risk"): void;
  collectAll(): void;
  acceptOrder(): void;
  declineOrder(): void;
  toggleMute(): boolean;
  toggleMusic(): boolean;
  resetGame(): void;
  uiSound(): void;
}

const traitDef = (id: string) => C.TRAITS.find((t) => t.id === id);

type TabName = "flota" | "puerto" | "mapa" | "prestigio";

// Iconos de la escena, mismo lenguaje gráfico (trazo tinta 2px).
const svg = {
  boat: `<svg viewBox="0 0 40 28" fill="none"><path d="M4 17h32l-5 8H9l-5-8z" fill="#e0684b" stroke="#233047" stroke-width="2" stroke-linejoin="round"/><path d="M20 3v14" stroke="#233047" stroke-width="2"/><path d="M20 4c6 1 8 5 8 9h-8V4z" fill="#f2e8d5" stroke="#233047" stroke-width="2" stroke-linejoin="round"/></svg>`,
  anchor: `<svg viewBox="0 0 28 28" fill="none"><circle cx="14" cy="6" r="3" stroke="#233047" stroke-width="2"/><path d="M14 9v14M7 14h14M5 18c1 5 5 7 9 7s8-2 9-7" stroke="#233047" stroke-width="2" stroke-linecap="round"/></svg>`,
  map: `<svg viewBox="0 0 28 28" fill="none"><path d="M4 7l7-3 6 3 7-3v17l-7 3-6-3-7 3V7z" fill="#f2e8d5" stroke="#233047" stroke-width="2" stroke-linejoin="round"/><path d="M11 4v17M17 7v17" stroke="#233047" stroke-width="1.5" stroke-dasharray="3 3"/></svg>`,
  flag: `<svg viewBox="0 0 28 28" fill="none"><path d="M7 25V4" stroke="#233047" stroke-width="2.5" stroke-linecap="round"/><path d="M7 5c5-2.5 9 2.5 14 0v9c-5 2.5-9-2.5-14 0V5z" fill="#dfa93e" stroke="#233047" stroke-width="2" stroke-linejoin="round"/></svg>`,
  sound: `<svg viewBox="0 0 28 28" fill="none"><path d="M5 11v6h5l6 5V6l-6 5H5z" fill="#233047"/><path d="M19 10c1.5 1.2 2.2 2.5 2.2 4s-.7 2.8-2.2 4" stroke="#233047" stroke-width="2" stroke-linecap="round"/></svg>`,
  mute: `<svg viewBox="0 0 28 28" fill="none"><path d="M5 11v6h5l6 5V6l-6 5H5z" fill="#233047"/><path d="M19 11l6 6M25 11l-6 6" stroke="#c4523a" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  scroll: `<svg viewBox="0 0 28 28" fill="none"><rect x="5" y="4" width="18" height="20" rx="3" fill="#f2e8d5" stroke="#233047" stroke-width="2"/><path d="M10 10h8M10 14h8M10 18h5" stroke="#233047" stroke-width="2" stroke-linecap="round"/></svg>`,
};

function boatThumb(tier: number): string {
  // Sprite pixel real del barco (mismo arte que la escena).
  return `<img class="thumb" src="${boatThumbURL(tier)}" alt="" style="image-rendering:pixelated;object-fit:contain">`;
}

const PHASE_TEXT: Record<string, string> = {
  out: "zarpando",
  fishing: "faenando",
  in: "volviendo",
  ready: "¡carga lista!",
};

export class UI {
  private root: HTMLElement;
  activeTab: TabName = "flota";
  sheetOpen = false;
  mapVisited = false;
  missionsOpened = false;
  missionsPanelOpen = false;
  private lastMoneyText = "";
  private lastStructure = "";
  private missionSig = "";
  private bumpTimer: number | null = null;
  private holdTimer: number | null = null;
  private holdSuppressClick = false;

  constructor(
    root: HTMLElement,
    private getState: () => GameState,
    private act: UIActions,
  ) {
    this.root = root;
    this.build();
  }

  // ------------------------------------------------------------------ build
  private build(): void {
    this.root.innerHTML = `
      <div class="topbar">
        <div class="money-card" id="money-card">
          <div class="amount"><span id="money">0</span></div>
          <div class="rate" id="rate">0/s</div>
          <div class="market-chip" id="market-chip" title="Precio de la lonja: sube y baja solo. Cobra caro."><span id="market-arrow">→</span> lonja <b id="market-val">×1.00</b></div>
          <div class="vigia-chip" id="vigia-chip" hidden title="La Torre del Vigía otea el horizonte"></div>
        </div>
        <div class="top-actions">
          <div class="combo-stamp" id="combo-stamp" hidden><span id="combo-val">×1.0</span><small>RACHA</small></div>
          <div class="rep-stamp" id="rep-stamp" hidden><span id="rep-val">×1.0</span><small>REPUTACIÓN</small></div>
          <button class="btn icon" id="mute-btn" data-action="toggle-mute" aria-label="Sonido">${svg.sound}</button>
        </div>
      </div>

      <button class="btn missions-btn" id="missions-btn" data-action="toggle-missions">${svg.scroll} Misiones <span class="badge" id="missions-badge">3</span></button>
      <div class="missions-panel" id="missions-panel" hidden></div>

      <div class="banners"><div id="event-slot"></div><div id="order-slot"></div></div>

      <button class="btn primary collect-all" id="collect-all" data-action="collect-all" hidden>Cobrar todo</button>

      <div class="sheet" id="sheet">
        <div class="tabbar" id="tabbar">
          <button data-tab="flota"><span class="ico">${svg.boat}</span>Flota</button>
          <button data-tab="puerto"><span class="ico">${svg.anchor}</span>Puerto</button>
          <button data-tab="mapa"><span class="ico">${svg.map}</span>Mapa</button>
          <button data-tab="prestigio"><span class="ico">${svg.flag}</span>Legado</button>
        </div>
        <div class="sheet-content" id="sheet-content"></div>
      </div>

      <div class="toasts" id="toasts"></div>
      <div id="modal-slot"></div>
    `;

    // Mantener pulsado = acción en cadena (mejoras y lonja): tap corto = 1,
    // hold = ráfaga que acelera. Para al soltar, al quedarse sin dinero o al MÁX.
    const HOLD_ACTIONS = new Set(["up-speed", "up-cap", "up-lonja"]);
    this.root.addEventListener("pointerdown", (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
      if (!el || !HOLD_ACTIONS.has(el.dataset.action!)) return;
      const action = el.dataset.action!;
      // renderTab() reemplaza el DOM tras cada compra: refrescar la referencia.
      const selector = `[data-action='${action}']${el.dataset.id ? `[data-id='${el.dataset.id}']` : ""}`;
      let delay = 350;
      const fire = () => {
        const btn = this.root.querySelector<HTMLButtonElement>(selector);
        if (!btn || btn.disabled) {
          stop();
          return;
        }
        this.dispatch(action, btn);
        this.holdSuppressClick = true;
        delay = Math.max(60, delay * 0.8);
        this.holdTimer = window.setTimeout(fire, delay);
      };
      const stop = () => {
        if (this.holdTimer !== null) {
          clearTimeout(this.holdTimer);
          this.holdTimer = null;
        }
        // El click de soltar puede no llegar (el DOM se reemplaza en cada compra
        // y mousedown/mouseup acaban en targets distintos): caducar el flag para
        // que no se coma el siguiente tap legítimo.
        window.setTimeout(() => {
          this.holdSuppressClick = false;
        }, 300);
        window.removeEventListener("pointerup", stop);
        window.removeEventListener("pointercancel", stop);
      };
      this.holdTimer = window.setTimeout(fire, 400);
      window.addEventListener("pointerup", stop);
      window.addEventListener("pointercancel", stop);
    });

    // Delegación de eventos para todo lo accionable.
    this.root.addEventListener("click", (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-action],[data-tab]");
      if (!el) return;
      // Si el hold ya disparó la ráfaga, el click de soltar no añade una más.
      if (this.holdSuppressClick) {
        this.holdSuppressClick = false;
        if (el.dataset.action && HOLD_ACTIONS.has(el.dataset.action)) return;
      }
      const tab = el.dataset.tab as TabName | undefined;
      if (tab) {
        this.act.uiSound();
        if (this.sheetOpen && this.activeTab === tab) {
          this.setSheetOpen(false);
        } else {
          this.activeTab = tab;
          if (tab === "mapa") this.mapVisited = true;
          this.setSheetOpen(true);
          this.renderTab();
        }
        this.syncTabbar();
        return;
      }
      const action = el.dataset.action!;
      this.dispatch(action, el);
    });
  }

  private dispatch(action: string, el: HTMLElement): void {
    const id = Number(el.dataset.id ?? -1);
    switch (action) {
      case "buy-boat": this.act.buyBoat(Number(el.dataset.tier)); break;
      case "up-speed": this.act.upgradeBoat(id, "speed"); break;
      case "up-cap": this.act.upgradeBoat(id, "cap"); break;
      case "up-dock": this.act.upgradeDock(); break;
      case "up-lonja": this.act.upgradeLonja(); break;
      case "start-expedition": this.act.startExpedition(Number(el.dataset.exp)); break;
      case "rename-port": this.showRenameModal(); break;
      case "share-card": this.act.shareCard(); break;
      case "hire-manager": this.act.hireManager(); break;
      case "hire-skipper": this.act.hireSkipper(Number(el.dataset.index)); break;
      case "buy-legacy": this.act.buyLegacy(el.dataset.branch as C.LegacyBranch); break;
      case "unlock-zone": this.act.unlockZone(); break;
      case "buy-vigia": this.act.buyVigia(); break;
      case "prestige": this.confirmPrestige(); break;
      case "reset": this.confirmReset(); break;
      case "collect-all": this.act.collectAll(); break;
      case "storm-shelter": this.act.resolveStorm("shelter"); break;
      case "storm-risk": this.act.resolveStorm("risk"); break;
      case "order-accept": this.act.acceptOrder(); break;
      case "order-decline": this.act.declineOrder(); break;
      case "toggle-music": {
        const on = this.act.toggleMusic();
        el.textContent = on ? "Sonando" : "Apagada";
        break;
      }
      case "toggle-missions":
        this.missionsPanelOpen = !this.missionsPanelOpen;
        this.missionsOpened = true;
        this.act.uiSound();
        this.renderMissions(true);
        break;
      case "toggle-mute": {
        const muted = this.act.toggleMute();
        el.innerHTML = muted ? svg.mute : svg.sound;
        break;
      }
      case "close-modal": this.closeModal(); break;
      default: break;
    }
  }

  setSheetOpen(open: boolean): void {
    this.sheetOpen = open;
    document.getElementById("sheet")!.classList.toggle("open", open);
  }

  private syncTabbar(): void {
    document.querySelectorAll<HTMLButtonElement>("#tabbar button").forEach((b) => {
      b.classList.toggle("active", this.sheetOpen && b.dataset.tab === this.activeTab);
    });
  }

  // ------------------------------------------------------------------ render
  /** Re-render estructural (composición de listas). Barato: solo pestaña activa. */
  renderTab(): void {
    const c = document.getElementById("sheet-content")!;
    switch (this.activeTab) {
      case "flota": c.innerHTML = this.renderFlota(); break;
      case "puerto": c.innerHTML = this.renderPuerto(); break;
      case "mapa": c.innerHTML = this.renderMapa(); break;
      case "prestigio": c.innerHTML = this.renderPrestigio(); break;
    }
    this.refreshDynamic();
  }

  private renderFlota(): string {
    const s = this.getState();
    let html = `<div class="section-title">ASTILLERO</div>`;
    const reach = Math.max(s.money * 6, s.lifetime) + 100;
    let shownLocked = false;
    C.BOAT_TIERS.forEach((t, tier) => {
      if (tier === C.ALBA_TIER) return; // El Alba tiene su propia vitrina abajo
      const owned = s.boats.filter((b) => b.tier === tier).length;
      const visible = owned > 0 || t.baseCost <= reach;
      if (!visible && shownLocked) return;
      if (!visible) {
        shownLocked = true;
        html += `<div class="card locked">${boatThumb(tier)}
          <div class="info"><div class="name">???</div><div class="desc">Sigue creciendo para desbloquear</div></div>
        </div>`;
        return;
      }
      html += `<div class="card">${boatThumb(tier)}
        <div class="info">
          <div class="name">${t.name}${owned ? ` <small>×${owned}</small>` : ""}</div>
          <div class="desc">ciclo ${Math.round(t.cycle)}s · carga ${formatMoney(t.baseCargo)}</div>
        </div>
        <button class="btn primary" data-action="buy-boat" data-tier="${tier}" data-cost="${boatCost(s, tier)}">
          Botar<span class="sub" data-cost-label></span>
        </button>
      </div>`;
    });

    // El Alba: la vitrina de leyenda (solo con las 4 leyendas pescadas).
    if (albaUnlocked(s)) {
      const alba = C.BOAT_TIERS[C.ALBA_TIER];
      html += `<div class="card alba-card">${boatThumb(C.ALBA_TIER)}
        <div class="info">
          <div class="name">${alba.name} <small>barco de leyenda</small></div>
          <div class="desc">Único. Inmune a tormentas y al Kraken; los peces raros lo buscan (especies ×${C.ALBA_SPECIES_MULT}).</div>
        </div>
        ${ownsAlba(s)
          ? `<span class="legacy-max">BOTADO</span>`
          : `<button class="btn gold" data-action="buy-boat" data-tier="${C.ALBA_TIER}">Botar<span class="sub" data-cost-label></span></button>`}
      </div>`;
    }

    html += `<div class="section-title">TU FLOTA (${s.boats.length}/${berths(s)} amarres)</div>`;
    for (const b of s.boats) {
      const t = C.BOAT_TIERS[b.tier];
      const tr = b.skipper ? traitDef(b.skipper.trait) : null;
      const chip = b.skipper
        ? `<span class="skipper-chip" title="${tr?.desc ?? ""}"><img src="${skipperPortraitURL(b.skipper.name)}" alt="">${b.skipper.name} · ${tr?.name ?? ""}</span>`
        : "";
      const away = isAway(s, b.id);
      html += `<div class="boat-row ${away ? "away" : ""}" data-boat="${b.id}">
        <div class="head">
          <span class="name">${t.name} <small>nº${b.id}</small></span>
          <span class="status" data-status>${away ? "de expedición" : ""}</span>
        </div>
        ${chip}
        <div class="ups">
          <button class="btn" data-action="up-speed" data-id="${b.id}">Velocidad ${b.speedLvl >= C.SPEED_MAX_LVL ? "MÁX" : `${b.speedLvl + 1}`}<span class="sub" data-cost-label></span></button>
          <button class="btn" data-action="up-cap" data-id="${b.id}">Redes ${b.capLvl >= C.CAP_MAX_LVL ? "MÁX" : `${b.capLvl + 1}`}<span class="sub" data-cost-label></span></button>
        </div>
      </div>`;
    }
    return html;
  }

  private renderPuerto(): string {
    const s = this.getState();
    const rate = incomeRate(s);
    const capH = offlineCapSeconds(s) / 3600;
    let html = `<div class="section-title">EL MUELLE</div>`;
    html += `<div class="card">
      <div class="info"><div class="name">Amarres</div>
      <div class="desc">${s.boats.length}/${berths(s)} ocupados. Más amarres = más barcos.</div></div>
      <button class="btn primary" data-action="up-dock">Ampliar<span class="sub" data-cost-label></span></button>
    </div>`;

    const mLvl = s.managerLvl;
    const mDesc =
      mLvl === 0
        ? "Cobra las cargas por ti. El puerto trabaja solo."
        : mLvl >= C.MANAGER_MAX_LVL
          ? `Cobra cada ${C.MANAGER_INTERVALS[mLvl - 1]}s. Nivel máximo.`
          : `Cobra cada ${C.MANAGER_INTERVALS[mLvl - 1]}s → cada ${C.MANAGER_INTERVALS[mLvl]}s.`;
    html += `<div class="card">
      <div class="info"><div class="name">Gestor del puerto${mLvl > 0 ? ` <small>nv.${mLvl}</small>` : ""}</div>
      <div class="desc">${mDesc}</div></div>
      ${mLvl >= C.MANAGER_MAX_LVL ? "" : `<button class="btn primary" data-action="hire-manager">${mLvl === 0 ? "Contratar" : "Subir"}<span class="sub" data-cost-label></span></button>`}
    </div>`;

    // La Torre del Vigía: anticipación comprable (se pierde al vender).
    html += `<div class="card">
      <div class="info"><div class="name">Torre del Vigía${s.vigia ? " <small>oteando</small>" : ""}</div>
      <div class="desc">${s.vigia ? "El vigía canta lo que viene: eventos y cofres, bajo el dinero." : "Un vigía que anticipa eventos y cofres a la deriva. Se pierde al vender el puerto."}</div></div>
      ${s.vigia ? "" : `<button class="btn primary" data-action="buy-vigia">Construir<span class="sub" data-cost-label></span></button>`}
    </div>`;

    // La Lonja: sumidero infinito — siempre hay algo que comprar.
    html += `<div class="card">
      <div class="info"><div class="name">La Lonja${s.lonjaLvl > 0 ? ` <small>nv.${s.lonjaLvl}</small>` : ""}</div>
      <div class="desc">Mejor puesto = mejor precio: +${C.LONJA_INCOME_BONUS * 100}% de ingresos por ampliación${s.lonjaLvl > 0 ? ` (ahora +${Math.round(s.lonjaLvl * C.LONJA_INCOME_BONUS * 100)}%)` : ""}. Se pierde al vender el puerto.</div></div>
      <button class="btn primary" data-action="up-lonja">Ampliar<span class="sub" data-cost-label></span></button>
    </div>`;

    // Taberna: candidatos a patrón (abre con 2+ barcos).
    if (s.boats.length >= C.TAVERN_MIN_BOATS) {
      html += `<div class="section-title">LA TABERNA</div>`;
      const freeBoats = s.boats.filter((b) => !b.skipper).length;
      if (s.tavern.candidates.length === 0) {
        html += `<div class="card"><div class="info"><div class="name">Nadie en la barra</div>
          <div class="desc">Los patrones van llegando con el tiempo. Vuelve en un rato.</div></div></div>`;
      }
      s.tavern.candidates.forEach((cand, i) => {
        const tr = traitDef(cand.trait);
        html += `<div class="card tavern-card">
          <img class="portrait" src="${skipperPortraitURL(cand.name)}" alt="">
          <div class="info">
            <div class="name">${cand.name} <small>${tr?.name ?? ""}</small></div>
            <div class="desc">${tr?.desc ?? ""}</div>
          </div>
          <button class="btn primary" data-action="hire-skipper" data-index="${i}">
            Fichar<span class="sub" data-cost-label></span>
          </button>
        </div>`;
      });
      if (freeBoats === 0 && s.tavern.candidates.length > 0) {
        html += `<p class="tavern-note">Toda la flota tiene patrón. Bota otro barco para fichar más.</p>`;
      }
    }

    html += `<div class="card">
      <div class="info"><div class="name">Música del puerto</div>
      <div class="desc">Un vals marinero de fondo. El resto de sonidos van aparte.</div></div>
      <button class="btn" data-action="toggle-music">${s.settings.music ? "Sonando" : "Apagada"}</button>
    </div>`;

    html += `<div class="section-title">CUENTAS</div>
    <div class="stat-grid">
      <div class="stat"><b data-live="rate">${formatMoney(rate)}/s</b><span>ingresos de la flota</span></div>
      <div class="stat"><b>${capH.toFixed(1)}h</b><span>cofre offline (crece con el muelle)</span></div>
      <div class="stat"><b data-live="lifetime">${formatMoney(s.lifetime)}</b><span>ganado esta vuelta</span></div>
      <div class="stat"><b>${s.missionsDone}</b><span>misiones completadas</span></div>
    </div>`;
    return html;
  }

  private renderMapa(): string {
    const s = this.getState();
    const next = nextZone(s);
    const found = s.discovered.length;
    const total = C.SPECIES.length;
    let html = `<div class="section-title">CARTA DE PESCA</div>
    <div class="card" style="justify-content:space-between">
      <div class="info"><div class="name">Pescadoteca ${found}/${total}</div>
      <div class="desc">Cada especie descubierta: +${C.SPECIES_INCOME_BONUS * 100}% de ingresos, para siempre.</div></div>
    </div>
    <div class="zone-map">`;
    C.ZONES.forEach((z, i) => {
      const unlocked = i <= s.zonesUnlocked;
      const current = i === s.zonesUnlocked;
      const isNext = next === i;
      const cls = current ? "current" : unlocked ? "unlocked" : "";
      const species = C.SPECIES.filter((sp) => sp.zone === i);
      const fishes = species
        .map((sp) => {
          const disc = s.discovered.includes(sp.id);
          const legend = sp.rarity === "leyenda";
          // Las leyendas sin descubrir enseñan su PISTA, no un "???": el cuándo es el juego.
          const title = disc ? sp.name : legend && sp.hint ? `LEYENDA — ${sp.hint}` : "???";
          return `<img class="fish-thumb ${disc ? "" : "unknown"} ${legend ? "legend" : ""}" src="${speciesThumbURL(sp.id, disc)}"
            alt="${disc ? sp.name : "especie sin descubrir"}" title="${title}">`;
        })
        .join("");
      html += `<div class="zone-item ${cls}">
        <div class="buoy">${current ? `<svg viewBox="0 0 24 24" width="20" fill="none"><path d="M4 14h16l-3 5H7l-3-5z" fill="#f2e8d5" stroke="#233047" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 3v11" stroke="#233047" stroke-width="1.8"/><path d="M12 4c4 1 5 4 5 7h-5V4z" fill="#f2e8d5" stroke="#233047" stroke-width="1.8" stroke-linejoin="round"/></svg>` : unlocked ? "✓" : "·"}</div>
        <div class="info">
          <div class="name">${z.name}</div>
          <div class="desc">pesca ×${z.valueMult}${current ? " · la flota faena aquí" : ""}</div>
          <div class="fish-row">${fishes}</div>
        </div>
        ${isNext ? `<button class="btn primary" data-action="unlock-zone" data-cost="${z.unlockCost}">Desbloquear<span class="sub" data-cost-label></span></button>` : ""}
      </div>`;
    });
    html += `</div><p style="font-size:12px;color:var(--ink-soft);padding:0 4px">La flota entera faena en el caladero más lejano: más lejos, mejor pesca y especies más raras.</p>`;

    // Expediciones: botín gordo diferido a cambio de quedarte sin tu mejor barco.
    html += `<div class="section-title">EXPEDICIONES</div>`;
    if (s.expedition) {
      const exp = s.expedition;
      const def = C.EXPEDITIONS[exp.def];
      const boat = s.boats.find((b) => b.id === exp.boatId);
      const total = expeditionDuration(s, exp.def);
      const pct = Math.min(100, ((total - exp.remaining) / total) * 100);
      html += `<div class="card expedition-card">
        <div class="info">
          <div class="name">${def.name} — ${boat ? C.BOAT_TIERS[boat.tier].name : "barco"} nº${exp.boatId}</div>
          <div class="desc">Vuelve en <span data-exp-remaining>${formatDuration(exp.remaining)}</span> con el botín.</div>
          <div class="bar"><i data-exp-bar style="width:${pct}%"></i></div>
        </div>
      </div>`;
    } else if (s.boats.length < C.EXPEDITION_MIN_BOATS) {
      html += `<div class="card"><div class="info"><div class="name">El muelle manda</div>
        <div class="desc">Con ${C.EXPEDITION_MIN_BOATS}+ barcos podrás mandar uno de expedición sin dejar el puerto vacío.</div></div></div>`;
    } else {
      const best = s.boats.reduce((a, b) => (cargoValue(s, b) > cargoValue(s, a) ? b : a));
      C.EXPEDITIONS.forEach((def, i) => {
        const booty = expeditionBooty(s, best, i);
        html += `<div class="card">
          <div class="info">
            <div class="name">${def.name} <small>${formatDuration(expeditionDuration(s, i))}</small></div>
            <div class="desc">Tu mejor barco vuelve con ~${formatMoney(booty)} (×${def.factor} de su pesca)${def.relicChance >= 1 ? " y una RELIQUIA segura" : def.relicChance >= 0.2 ? " y quizá una reliquia" : ""}.</div>
          </div>
          <button class="btn primary" data-action="start-expedition" data-exp="${i}">Zarpar</button>
        </div>`;
      });
    }
    return html;
  }

  private renderPrestigio(): string {
    const s = this.getState();
    const threshold = prestigeThreshold(s);
    const pct = Math.min(100, (s.lifetime / threshold) * 100);
    const gain = prestigeGain(s);
    const can = canPrestige(s);
    let html = `<div class="prestige-box">
      <h3>Vender el puerto</h3>
      <p>Empiezas de cero con reputación permanente: sube tu multiplicador de ingresos para siempre (ahora <b>×${prestigeMult(s).toFixed(2)}</b>). Cuanto más ganes en la vuelta, más reputación — y cada puerto se vende más caro que el anterior. La reputación también se gasta en el árbol de legado (gastarla no baja el multiplicador).</p>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <p data-live="prestige-progress">${formatMoney(s.lifetime)} / ${formatMoney(threshold)} ganados esta vuelta</p>
      <button class="btn gold" data-action="prestige" ${can ? "" : "disabled"} style="margin-top:10px">
        ${can ? `Vender el puerto (+${gain} reputación)` : "Aún no: sigue pescando"}
      </button>
    </div>`;

    // Árbol de legado: se gasta reputación, sobrevive al prestigio.
    html += `<div class="section-title">ÁRBOL DE LEGADO <span class="rep-balance">${s.reputation} rep disponible</span></div>`;
    if (s.repEarned === 0) {
      html += `<div class="card"><div class="info"><div class="name">Aún sin leyenda</div>
        <div class="desc">Vende tu primer puerto para ganar reputación y abrir el legado.</div></div></div>`;
    } else {
      for (const br of C.LEGACY_BRANCHES) {
        const lvl = s.legacy[br.id];
        const cost = legacyCost(s, br.id);
        const pips = Array.from({ length: C.LEGACY_MAX_LVL }, (_, i) => `<i class="${i < lvl ? "on" : ""}"></i>`).join("");
        html += `<div class="card legacy-card">
          <div class="info">
            <div class="name">${br.name} <span class="pips">${pips}</span></div>
            <div class="desc">${br.desc} por nivel</div>
          </div>
          ${cost === null
            ? `<span class="legacy-max">MÁX</span>`
            : `<button class="btn primary" data-action="buy-legacy" data-branch="${br.id}">Nivel ${lvl + 1}<span class="sub">${cost} rep</span></button>`}
        </div>`;
      }
    }

    // Reliquias del pecio: colección permanente con bonus únicos.
    html += `<div class="section-title">RELIQUIAS DEL PECIO (${s.relics.length}/${C.RELICS.length})</div>`;
    if (s.relics.length === 0 && s.stats.expeditionsDone === 0) {
      html += `<div class="card"><div class="info"><div class="name">El mar guarda secretos</div>
        <div class="desc">Expediciones y cofres de oro traen reliquias: bonus únicos que no se pierden ni vendiendo el puerto.</div></div></div>`;
    } else {
      html += `<div class="ach-grid relic-grid">`;
      for (const r of C.RELICS) {
        const got = s.relics.includes(r.id);
        html += `<div class="ach ${got ? "got" : ""}" title="${r.desc}">
          <b>${got ? "◆" : "◇"}</b><span>${got ? r.name : "???"}</span>
        </div>`;
      }
      html += `</div>`;
    }

    // Logros: permanentes, +2% de ingresos cada uno.
    const done = s.achievements.length;
    html += `<div class="section-title">LOGROS (${done}/${C.ACHIEVEMENTS.length} · +${done * C.ACHIEVEMENT_INCOME_BONUS * 100}% ingresos)</div>
    <div class="ach-grid">`;
    for (const a of C.ACHIEVEMENTS) {
      const got = s.achievements.includes(a.id);
      html += `<div class="ach ${got ? "got" : ""}" title="${a.desc}">
        <b>${got ? "★" : "☆"}</b><span>${a.name}</span>
      </div>`;
    }
    html += `</div>`;

    const port = s.portName || "Tiny Harbor";
    const pctDone = completionPct(s);
    html += `<div class="section-title">PUERTO COMPLETADO <span class="rep-balance">${pctDone}%</span></div>
    <div class="completion-bar"><i style="width:${pctDone}%"></i></div>
    <div class="section-title">TU HISTORIA</div>
    <div class="card port-name-card">
      <div class="info"><div class="name">Puerto de ${port}</div>
      <div class="desc">El nombre sale en tu tarjeta de capitán.</div></div>
      <button class="btn" data-action="rename-port">Renombrar</button>
    </div>
    <div class="stat-grid">
      <div class="stat"><b>${formatMoney(s.totalEarned)}</b><span>ganado en total</span></div>
      <div class="stat"><b>${s.prestiges}</b><span>puertos vendidos</span></div>
      <div class="stat"><b>×${prestigeMult(s).toFixed(2)}</b><span>multiplicador de reputación</span></div>
      <div class="stat"><b>${formatDuration(s.playTime)}</b><span>al timón esta vuelta</span></div>
    </div>
    <div class="section-title">BITÁCORA DE RÉCORDS</div>
    <div class="stat-grid">
      <div class="stat"><b>${formatMoney(s.stats.bestLifetime)}</b><span>mejor vuelta</span></div>
      <div class="stat"><b>${s.stats.bestRepGain > 0 ? "+" + s.stats.bestRepGain : "—"}</b><span>mejor venta (rep)</span></div>
      <div class="stat"><b>${s.stats.bestCombo || "—"}</b><span>racha récord</span></div>
      <div class="stat"><b>${s.stats.goldenCatches}</b><span>capturas doradas</span></div>
      <div class="stat"><b>${s.stats.driftsTapped}</b><span>cofres pescados</span></div>
      <div class="stat"><b>${s.stats.expeditionsDone}</b><span>expediciones</span></div>
      <div class="stat"><b>${s.stats.krakensRepelled}</b><span>krakens ahuyentados</span></div>
      <div class="stat"><b>${s.stats.bestGiftStreak || "—"}</b><span>días seguidos (récord)</span></div>
    </div>
    <button class="btn gold" data-action="share-card" style="margin-top:10px;width:100%">Tarjeta de capitán (compartir)</button>
    <button class="btn" data-action="reset" style="margin-top:6px;font-size:12.5px;opacity:.75">Borrar partida</button>`;
    return html;
  }

  // ------------------------------------------------------------- dynamic bits
  /** Actualiza costes/estados sin reconstruir el DOM (llamar ~4×/s). */
  refreshDynamic(): void {
    const s = this.getState();

    document.querySelectorAll<HTMLButtonElement>("[data-action='buy-boat']").forEach((btn) => {
      const tier = Number(btn.dataset.tier);
      const cost = boatCost(s, tier);
      const label = btn.querySelector("[data-cost-label]")!;
      const noBerth = s.boats.length >= berths(s);
      label.textContent = noBerth ? "sin amarre" : formatMoney(cost);
      btn.disabled = noBerth || s.money < cost;
    });

    document.querySelectorAll<HTMLElement>(".boat-row").forEach((row) => {
      const id = Number(row.dataset.boat);
      const boat = s.boats.find((b) => b.id === id);
      if (!boat) return;
      const status = row.querySelector<HTMLElement>("[data-status]")!;
      status.textContent = isAway(s, boat.id) ? "de expedición" : PHASE_TEXT[boat.phase];
      status.classList.toggle("ready", boat.phase === "ready" && !isAway(s, boat.id));
      const [spd, cap] = row.querySelectorAll<HTMLButtonElement>(".ups .btn");
      const sc = speedUpgradeCost(boat, s);
      const cc = capUpgradeCost(boat, s);
      const sMax = boat.speedLvl >= C.SPEED_MAX_LVL;
      const cMax = boat.capLvl >= C.CAP_MAX_LVL;
      spd.querySelector("[data-cost-label]")!.textContent = sMax ? "" : formatMoney(sc);
      cap.querySelector("[data-cost-label]")!.textContent = cMax ? "" : formatMoney(cc);
      spd.disabled = sMax || s.money < sc;
      cap.disabled = cMax || s.money < cc;
    });

    const dockBtn = document.querySelector<HTMLButtonElement>("[data-action='up-dock']");
    if (dockBtn) {
      const maxed = s.dockLevel >= C.DOCK_MAX_LEVEL;
      const cost = dockCost(s);
      dockBtn.querySelector("[data-cost-label]")!.textContent = maxed ? "MÁX" : formatMoney(cost);
      dockBtn.disabled = maxed || s.money < cost;
    }
    const lonjaBtn = document.querySelector<HTMLButtonElement>("[data-action='up-lonja']");
    if (lonjaBtn) {
      const cost = lonjaCost(s);
      lonjaBtn.querySelector("[data-cost-label]")!.textContent = formatMoney(cost);
      lonjaBtn.disabled = s.money < cost;
    }
    const vigiaBtn = document.querySelector<HTMLButtonElement>("[data-action='buy-vigia']");
    if (vigiaBtn) {
      const cost = vigiaCost(s);
      vigiaBtn.querySelector("[data-cost-label]")!.textContent = formatMoney(cost);
      vigiaBtn.disabled = s.money < cost;
    }
    const mgrBtn = document.querySelector<HTMLButtonElement>("[data-action='hire-manager']");
    if (mgrBtn) {
      const cost = managerCost(s);
      mgrBtn.querySelector("[data-cost-label]")!.textContent = formatMoney(cost);
      mgrBtn.disabled = s.money < cost;
    }
    document.querySelectorAll<HTMLButtonElement>("[data-action='hire-skipper']").forEach((btn) => {
      const cand = s.tavern.candidates[Number(btn.dataset.index)];
      if (!cand) return;
      const freeBoats = s.boats.some((b) => !b.skipper);
      btn.querySelector("[data-cost-label]")!.textContent = freeBoats ? formatMoney(cand.cost) : "sin barco libre";
      btn.disabled = !freeBoats || s.money < cand.cost;
    });
    document.querySelectorAll<HTMLButtonElement>("[data-action='buy-legacy']").forEach((btn) => {
      const cost = legacyCost(s, btn.dataset.branch as C.LegacyBranch);
      btn.disabled = cost === null || s.reputation < cost;
    });
    const zoneBtn = document.querySelector<HTMLButtonElement>("[data-action='unlock-zone']");
    if (zoneBtn) {
      const cost = zoneCost(s);
      if (cost !== null) {
        zoneBtn.querySelector("[data-cost-label]")!.textContent = formatMoney(cost);
        zoneBtn.disabled = s.money < cost;
      }
    }
    const rateEl = document.querySelector("[data-live='rate']");
    if (rateEl) rateEl.textContent = `${formatMoney(incomeRate(s))}/s`;
    const lifeEl = document.querySelector("[data-live='lifetime']");
    if (lifeEl) lifeEl.textContent = formatMoney(s.lifetime);

    // Expedición en curso: cuenta atrás y barra sin re-render.
    if (this.activeTab === "mapa" && s.expedition) {
      const rem = document.querySelector("[data-exp-remaining]");
      if (rem) rem.textContent = formatDuration(s.expedition.remaining);
      const bar = document.querySelector<HTMLElement>("[data-exp-bar]");
      if (bar) {
        const total = expeditionDuration(s, s.expedition.def);
        bar.style.width = `${Math.min(100, ((total - s.expedition.remaining) / total) * 100)}%`;
      }
    }

    // El botón de prestigio cambia de estado sin re-render completo.
    if (this.activeTab === "prestigio") {
      const pBtn = document.querySelector<HTMLButtonElement>("[data-action='prestige']");
      if (pBtn) {
        const can = canPrestige(s);
        if (pBtn.disabled === can) {
          pBtn.disabled = !can;
          pBtn.textContent = can ? `Vender el puerto (+${prestigeGain(s)} reputación)` : "Aún no: sigue pescando";
        }
        const prog = document.querySelector("[data-live='prestige-progress']");
        if (prog) prog.textContent = `${formatMoney(s.lifetime)} / ${formatMoney(prestigeThreshold(s))} ganados esta vuelta`;
        const bar = document.querySelector<HTMLElement>(".prestige-box .bar i");
        if (bar) bar.style.width = `${Math.min(100, (s.lifetime / prestigeThreshold(s)) * 100)}%`;
      }
    }
  }

  /** Llamar cada frame: solo toca lo baratísimo. */
  update(): void {
    const s = this.getState();
    const moneyText = formatMoney(s.money);
    if (moneyText !== this.lastMoneyText) {
      const el = document.getElementById("money")!;
      const grew = moneyText !== this.lastMoneyText && s.money > 0;
      el.textContent = moneyText;
      this.lastMoneyText = moneyText;
      if (grew) {
        const amount = el.parentElement!;
        amount.classList.add("bump");
        if (this.bumpTimer) clearTimeout(this.bumpTimer);
        this.bumpTimer = window.setTimeout(() => amount.classList.remove("bump"), 130);
      }
    }
    document.getElementById("rate")!.textContent = `${formatMoney(incomeRate(s))}/s · ${s.boats.length} ${s.boats.length === 1 ? "barco" : "barcos"}`;

    // Ticker del mercado de la lonja.
    const mv = document.getElementById("market-val")!;
    const txt = `×${s.market.mult.toFixed(2)}`;
    if (mv.textContent !== txt) {
      mv.textContent = txt;
      document.getElementById("market-arrow")!.textContent = s.market.dir > 0 ? "↑" : s.market.dir < 0 ? "↓" : "→";
      const chip = document.getElementById("market-chip")!;
      chip.classList.toggle("up", s.market.mult >= 1.1);
      chip.classList.toggle("down", s.market.mult <= 0.9);
      chip.classList.toggle("hot", s.market.mult >= C.MARKET_HIGH);
    }

    // Sello de reputación (multiplicador sobre la reputación GANADA total).
    const stamp = document.getElementById("rep-stamp")!;
    const show = s.repEarned > 0;
    if (stamp.hidden === show) {
      stamp.hidden = !show;
    }
    if (show) {
      document.getElementById("rep-val")!.textContent = `×${prestigeMult(s).toFixed(2)}`;
    }

    // El vigía canta lo que viene (chip bajo el dinero).
    const vChip = document.getElementById("vigia-chip")!;
    if (vChip.hidden === s.vigia) vChip.hidden = !s.vigia;
    if (s.vigia) {
      const evTxt = s.event ? "¡evento AHORA!" : `evento ~${Math.ceil(s.eventT)}s`;
      const driftTxt = s.drift ? "¡cofre al agua!" : s.playTime < 300 ? "" : ` · cofre ~${Math.ceil(s.driftT)}s`;
      const txt = `vigía: ${evTxt}${driftTxt}`;
      if (vChip.textContent !== txt) vChip.textContent = txt;
    }

    // Sello de racha (combo de cobro manual): visible desde el 2º eslabón.
    const comboStamp = document.getElementById("combo-stamp")!;
    const comboShow = s.combo.n >= 2;
    if (comboStamp.hidden === comboShow) comboStamp.hidden = !comboShow;
    if (comboShow) {
      const bonus = 1 + (s.combo.n - 1) * C.COMBO_STEP;
      document.getElementById("combo-val")!.textContent = `×${bonus.toFixed(2)}`;
    }

    // Cobrar todo: visible con 2+ cargas listas.
    const readyCount = s.boats.reduce((n, b) => (b.phase === "ready" ? n + 1 : n), 0);
    const ca = document.getElementById("collect-all")!;
    const showCa = readyCount >= 2;
    if (ca.hidden === showCa) {
      ca.hidden = !showCa;
      if (showCa) ca.setAttribute("data-action", "collect-all");
    }

    this.renderEventBanner(s);
    this.renderOrderBanner(s);
    this.renderMissions(false);

    // ¿La estructura cambió por debajo? (compra desde otra vía, prestigio…)
    const sig = `${s.boats.length}:${s.boats.map((b) => `${b.id}.${b.speedLvl}.${b.capLvl}.${b.skipper?.name ?? ""}`).join(",")}:${s.zonesUnlocked}:${s.dockLevel}:${s.lonjaLvl}:${s.managerLvl}:${s.prestiges}:${s.tavern.candidates.map((c) => c.name).join(",")}:${s.reputation}:${s.legacy.astillero}${s.legacy.escuela}${s.legacy.faro}:${s.achievements.length}:${s.expedition?.boatId ?? "-"}:${s.relics.length}`;
    if (sig !== this.lastStructure) {
      this.lastStructure = sig;
      if (this.sheetOpen) this.renderTab();
    }
  }

  // ------------------------------------------------------------------ missions
  private renderMissions(force: boolean): void {
    const s = this.getState();
    const live = s.missions.filter((m) => !m.done);
    document.getElementById("missions-badge")!.textContent = String(live.length);
    const panel = document.getElementById("missions-panel")!;
    if (panel.hidden === this.missionsPanelOpen) panel.hidden = !this.missionsPanelOpen;
    if (!this.missionsPanelOpen) return;

    const sig = live.map((m) => `${m.id}:${Math.floor(m.progress)}`).join("|");
    if (!force && sig === this.missionSig) return;
    this.missionSig = sig;
    panel.innerHTML = live
      .map(
        (m) => `<div class="mission-card">
          <div class="mtext"><span>${m.text}</span><span class="reward">+${formatMoney(m.reward)}</span></div>
          <div class="bar"><i style="width:${Math.min(100, (m.progress / m.target) * 100)}%"></i></div>
        </div>`,
      )
      .join("");
  }

  // ------------------------------------------------------------------ eventos
  private lastEventKey = "";
  private renderEventBanner(s: GameState): void {
    const slot = document.getElementById("event-slot")!;
    const ev = s.event;
    const key = ev ? `${ev.kind}:${ev.stage}${ev.kind === "kraken" ? ":" + ev.tapsLeft : ""}` : "";
    if (key !== this.lastEventKey) {
      this.lastEventKey = key;
      if (!ev) {
        slot.innerHTML = "";
      } else if (ev.kind === "kraken" && ev.stage === "warning") {
        slot.innerHTML = `<div class="event-banner storm">
          <h3>Algo ENORME se mueve bajo la flota…</h3>
          <p>Prepara los dedos.</p>
          <div class="timer"><i></i></div>
        </div>`;
      } else if (ev.kind === "kraken") {
        slot.innerHTML = `<div class="event-banner storm kraken">
          <h3>¡EL KRAKEN!</h3>
          <p>¡Tócalo <b>${ev.tapsLeft}</b> veces más o se llevará la carga!</p>
          <div class="timer"><i></i></div>
        </div>`;
      } else if (ev.kind === "storm" && ev.stage === "warning") {
        slot.innerHTML = `<div class="event-banner storm">
          <h3>Tormenta a la vista</h3>
          <p>¿Refugias la flota (segura, en pausa) o sigues faenando (×${C.STORM_RISK_MULT} pero puedes perder carga)?</p>
          <div class="row">
            <button class="btn" data-action="storm-shelter">Refugiar</button>
            <button class="btn primary" data-action="storm-risk">Arriesgar</button>
          </div>
          <div class="timer"><i></i></div>
        </div>`;
      } else if (ev.kind === "storm") {
        slot.innerHTML = `<div class="event-banner storm">
          <h3>${ev.choice === "risk" ? "Faenando bajo la tormenta" : "Flota refugiada"}</h3>
          <div class="timer"><i></i></div>
        </div>`;
      } else {
        slot.innerHTML = `<div class="event-banner">
          <h3>¡Banco de peces!</h3>
          <p>Toca el banco en el agua: cada tap es pesca extra. Ingresos ×${C.FRENZY_MULT}.</p>
          <div class="timer"><i></i></div>
        </div>`;
      }
    }
    if (ev) {
      const bar = slot.querySelector<HTMLElement>(".timer i");
      if (bar) {
        const total =
          ev.kind === "frenzy"
            ? C.FRENZY_DURATION_S
            : ev.kind === "kraken"
              ? ev.stage === "warning" ? C.KRAKEN_WARNING_S : C.KRAKEN_DURATION_S
              : ev.stage === "warning" ? C.STORM_WARNING_S : C.STORM_DURATION_S;
        bar.style.width = `${Math.max(0, (ev.remaining / total) * 100)}%`;
      }
    }
  }

  // ------------------------------------------------------------------ pedidos
  private lastOrderKey = "";
  private renderOrderBanner(s: GameState): void {
    const slot = document.getElementById("order-slot")!;
    const o = s.order;
    const key = o ? `${o.stage}:${Math.round(o.goal)}` : "";
    if (key !== this.lastOrderKey) {
      this.lastOrderKey = key;
      if (!o) {
        slot.innerHTML = "";
      } else if (o.stage === "offer") {
        slot.innerHTML = `<div class="event-banner order">
          <h3>Pedido de la lonja</h3>
          <p>Un cliente quiere <b>${formatMoney(o.goal)}</b> de pesca en ${Math.round(C.ORDER_TIME_S)}s.
          Paga un bono de <b>+${formatMoney(o.reward)}</b>.</p>
          <div class="row">
            <button class="btn" data-action="order-decline">Ahora no</button>
            <button class="btn primary" data-action="order-accept">Aceptar</button>
          </div>
          <div class="timer"><i></i></div>
        </div>`;
      } else {
        slot.innerHTML = `<div class="event-banner order">
          <h3>Pedido en marcha</h3>
          <p><span data-order-progress>0</span> / ${formatMoney(o.goal)} · bono +${formatMoney(o.reward)}</p>
          <div class="bar-order"><i></i></div>
          <div class="timer"><i></i></div>
        </div>`;
      }
    }
    if (o) {
      const timer = slot.querySelector<HTMLElement>(".timer i");
      if (timer) {
        const total = o.stage === "offer" ? C.ORDER_OFFER_S : C.ORDER_TIME_S;
        timer.style.width = `${Math.max(0, (o.remaining / total) * 100)}%`;
      }
      const prog = slot.querySelector<HTMLElement>("[data-order-progress]");
      if (prog) prog.textContent = formatMoney(o.progress);
      const bar = slot.querySelector<HTMLElement>(".bar-order i");
      if (bar) bar.style.width = `${Math.min(100, (o.progress / o.goal) * 100)}%`;
    }
  }

  // ------------------------------------------------------------------ modales
  private closeModal(): void {
    document.getElementById("modal-slot")!.innerHTML = "";
  }

  showOfflineModal(r: OfflineResult, onClaim: () => void): void {
    const slot = document.getElementById("modal-slot")!;
    slot.innerHTML = `<div class="modal-backdrop"><div class="modal">
      <h2>Mientras no estabas…</h2>
      <div class="chest"><div class="coins-glow"></div><div class="lid"></div><div class="lock"></div><div class="box"></div></div>
      <p>Tu flota siguió faenando ${formatDuration(r.seconds)}${r.capped ? " (cofre lleno)" : ""}.</p>
      <div class="big-earn">+${formatMoney(r.earned)}</div>
      <div class="row"><button class="btn primary" id="claim-btn">Recoger</button></div>
    </div></div>`;
    document.getElementById("claim-btn")!.addEventListener("click", () => {
      this.closeModal();
      onClaim();
    }, { once: true });
  }

  private confirmPrestige(): void {
    const s = this.getState();
    if (!canPrestige(s)) return;
    const offers = prestigeOffers(s);
    const slot = document.getElementById("modal-slot")!;
    const cards = offers
      .map((b) => {
        const gain = buyerGain(s, b.id);
        const newMult = 1 + Math.pow(s.repEarned + gain, C.PRESTIGE_MULT_CURVE) * C.PRESTIGE_MULT_PER_REP;
        return `<button class="buyer-card ${b.id === "naviera" ? "" : "special"}" data-buyer="${b.id}">
          <span class="bname">${b.name}</span>
          <span class="bdesc">${b.desc}</span>
          <span class="bgain">+${gain} rep → ×${newMult.toFixed(2)}</span>
        </button>`;
      })
      .join("");
    slot.innerHTML = `<div class="modal-backdrop"><div class="modal buyers-modal">
      <h2>¿A quién le vendes el puerto?</h2>
      <p>Pierdes: barcos, patrones, mejoras, muelle, lonja, vigía, gestor y zonas.<br>
      Conservas: pescadoteca, reliquias, logros y legado. El próximo puerto pedirá ${formatMoney(C.PRESTIGE_MIN_LIFETIME * Math.pow(C.PRESTIGE_THRESHOLD_GROWTH, s.prestiges + 1))}.</p>
      ${cards}
      <div class="row"><button class="btn" data-action="close-modal">Todavía no</button></div>
    </div></div>`;
    slot.querySelectorAll<HTMLButtonElement>(".buyer-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.closeModal();
        this.act.prestige(btn.dataset.buyer!);
      }, { once: true });
    });
  }

  private showRenameModal(): void {
    const s = this.getState();
    const slot = document.getElementById("modal-slot")!;
    slot.innerHTML = `<div class="modal-backdrop"><div class="modal">
      <h2>Nombre del puerto</h2>
      <p>Puerto de…</p>
      <input type="text" id="port-name-input" maxlength="${C.PORT_NAME_MAX}" value="${s.portName.replace(/"/g, "&quot;")}"
        placeholder="Tiny Harbor" autocomplete="off">
      <div class="row">
        <button class="btn" data-action="close-modal">Cancelar</button>
        <button class="btn primary" id="rename-yes">Guardar</button>
      </div>
    </div></div>`;
    const input = document.getElementById("port-name-input") as HTMLInputElement;
    input.focus();
    document.getElementById("rename-yes")!.addEventListener("click", () => {
      this.act.renamePort(input.value);
      this.closeModal();
      this.renderTab();
    }, { once: true });
  }

  /** El paquete del pescador: modal de regalo diario con racha. */
  showGiftModal(day: number, amount: number, onClaim: () => void): void {
    const slot = document.getElementById("modal-slot")!;
    slot.innerHTML = `<div class="modal-backdrop"><div class="modal">
      <h2>El paquete del pescador</h2>
      <div class="chest"><div class="coins-glow"></div><div class="lid"></div><div class="lock"></div><div class="box"></div></div>
      <p>Día <b>${day}</b> seguido en el puerto${day >= 7 ? " — sal en las venas" : ""}.</p>
      <div class="big-earn">+${formatMoney(amount)}</div>
      ${day > 1 ? `<p style="font-size:12.5px;opacity:.8">La racha crece el regalo. Mañana: día ${day + 1}.</p>` : `<p style="font-size:12.5px;opacity:.8">Vuelve mañana: la racha hace crecer el regalo.</p>`}
      <div class="row"><button class="btn primary" id="gift-btn">Recoger</button></div>
    </div></div>`;
    document.getElementById("gift-btn")!.addEventListener("click", () => {
      this.closeModal();
      onClaim();
    }, { once: true });
  }

  private confirmReset(): void {
    const slot = document.getElementById("modal-slot")!;
    slot.innerHTML = `<div class="modal-backdrop"><div class="modal">
      <h2>¿Borrar la partida?</h2>
      <p>Se pierde TODO, incluida la reputación. No hay vuelta atrás.</p>
      <div class="row">
        <button class="btn" data-action="close-modal">Cancelar</button>
        <button class="btn primary" id="reset-yes">Borrar</button>
      </div>
    </div></div>`;
    document.getElementById("reset-yes")!.addEventListener("click", () => {
      this.closeModal();
      this.act.resetGame();
    }, { once: true });
  }

  // ------------------------------------------------------------------ toasts
  toast(text: string): void {
    const box = document.getElementById("toasts")!;
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = text;
    box.appendChild(el);
    setTimeout(() => el.remove(), 3200);
    while (box.children.length > 3) box.firstElementChild!.remove();
  }

  /** Posición del contador de dinero (destino de las monedas). */
  coinTarget(): { x: number; y: number } {
    const r = document.getElementById("money-card")!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
}
