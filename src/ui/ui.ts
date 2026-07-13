/**
 * ui.ts — overlay DOM: contador, misiones, hoja inferior con pestañas,
 * banners de evento, modales y toasts. Lee el estado; las acciones las
 * ejecuta main.ts vía callbacks (la sim no se toca desde aquí).
 */

import * as C from "../sim/config";
import {
  berths,
  boatCost,
  canPrestige,
  capUpgradeCost,
  dockCost,
  incomeRate,
  managerCost,
  nextZone,
  offlineCapSeconds,
  prestigeGain,
  speedUpgradeCost,
  zoneCost,
} from "../sim/economy";
import { formatDuration, formatMoney } from "../sim/format";
import type { OfflineResult } from "../sim/offline";
import type { GameState } from "../sim/types";

export interface UIActions {
  buyBoat(tier: number): void;
  upgradeBoat(boatId: number, what: "speed" | "cap"): void;
  upgradeDock(): void;
  hireManager(): void;
  unlockZone(): void;
  prestige(): void;
  resolveStorm(choice: "shelter" | "risk"): void;
  collectAll(): void;
  toggleMute(): boolean;
  resetGame(): void;
  uiSound(): void;
}

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
  const t = C.BOAT_TIERS[tier];
  const w = 22 + t.size * 8;
  return `<svg class="thumb" viewBox="0 0 60 44" fill="none">
    <path d="M${30 - w / 2} 26h${w}l-6 9H${30 - w / 2 + 6}l-6-9z" fill="${t.hull}" stroke="#233047" stroke-width="2.4" stroke-linejoin="round"/>
    ${tier >= 1 ? `<rect x="${26 - w * 0.14}" y="15" width="${w * 0.34}" height="11" rx="2" fill="#f2e8d5" stroke="#233047" stroke-width="2"/>` : ""}
    <path d="M${30 + w * 0.18} ${tier >= 2 ? 4 : 9}v22" stroke="#233047" stroke-width="2"/>
    <path d="M${30 + w * 0.18} ${tier >= 2 ? 5 : 10}l10 3-10 3z" fill="#e0684b" stroke="#233047" stroke-width="1.6" stroke-linejoin="round"/>
  </svg>`;
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
        </div>
        <div class="top-actions">
          <div class="rep-stamp" id="rep-stamp" hidden><span id="rep-val">×1.0</span><small>REPUTACIÓN</small></div>
          <button class="btn icon" id="mute-btn" data-action="toggle-mute" aria-label="Sonido">${svg.sound}</button>
        </div>
      </div>

      <button class="btn missions-btn" id="missions-btn" data-action="toggle-missions">${svg.scroll} Misiones <span class="badge" id="missions-badge">3</span></button>
      <div class="missions-panel" id="missions-panel" hidden></div>

      <div id="event-slot"></div>

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

    // Delegación de eventos para todo lo accionable.
    this.root.addEventListener("click", (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-action],[data-tab]");
      if (!el) return;
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
      case "hire-manager": this.act.hireManager(); break;
      case "unlock-zone": this.act.unlockZone(); break;
      case "prestige": this.confirmPrestige(); break;
      case "reset": this.confirmReset(); break;
      case "collect-all": this.act.collectAll(); break;
      case "storm-shelter": this.act.resolveStorm("shelter"); break;
      case "storm-risk": this.act.resolveStorm("risk"); break;
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

    html += `<div class="section-title">TU FLOTA (${s.boats.length}/${berths(s)} amarres)</div>`;
    for (const b of s.boats) {
      const t = C.BOAT_TIERS[b.tier];
      html += `<div class="boat-row" data-boat="${b.id}">
        <div class="head">
          <span class="name">${t.name} <small>nº${b.id}</small></span>
          <span class="status" data-status></span>
        </div>
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
    let html = `<div class="section-title">CARTA DE PESCA</div><div class="zone-map">`;
    C.ZONES.forEach((z, i) => {
      const unlocked = i <= s.zonesUnlocked;
      const current = i === s.zonesUnlocked;
      const isNext = next === i;
      const cls = current ? "current" : unlocked ? "unlocked" : "";
      html += `<div class="zone-item ${cls}">
        <div class="buoy">${current ? `<svg viewBox="0 0 24 24" width="20" fill="none"><path d="M4 14h16l-3 5H7l-3-5z" fill="#f2e8d5" stroke="#233047" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 3v11" stroke="#233047" stroke-width="1.8"/><path d="M12 4c4 1 5 4 5 7h-5V4z" fill="#f2e8d5" stroke="#233047" stroke-width="1.8" stroke-linejoin="round"/></svg>` : unlocked ? "✓" : "·"}</div>
        <div class="info">
          <div class="name">${z.name}</div>
          <div class="desc">pesca ×${z.valueMult}${current ? " · la flota faena aquí" : ""}</div>
        </div>
        ${isNext ? `<button class="btn primary" data-action="unlock-zone" data-cost="${z.unlockCost}">Desbloquear<span class="sub" data-cost-label></span></button>` : ""}
      </div>`;
    });
    html += `</div><p style="font-size:12px;color:var(--ink-soft);padding:0 4px">La flota entera faena en el caladero más lejano: más lejos, mejor pesca.</p>`;
    return html;
  }

  private renderPrestigio(): string {
    const s = this.getState();
    const pct = Math.min(100, (s.lifetime / C.PRESTIGE_MIN_LIFETIME) * 100);
    const gain = prestigeGain(s);
    const can = canPrestige(s);
    let html = `<div class="prestige-box">
      <h3>Vender el puerto</h3>
      <p>Empiezas de cero con reputación permanente: <b>+${C.PRESTIGE_MULT_PER_REP * 100}% de ingresos</b> por punto, para siempre.</p>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <p data-live="prestige-progress">${formatMoney(s.lifetime)} / ${formatMoney(C.PRESTIGE_MIN_LIFETIME)} ganados esta vuelta</p>
      <button class="btn gold" data-action="prestige" ${can ? "" : "disabled"} style="margin-top:10px">
        ${can ? `Vender el puerto (+${gain} reputación)` : "Aún no: sigue pescando"}
      </button>
    </div>`;
    html += `<div class="section-title">TU HISTORIA</div>
    <div class="stat-grid">
      <div class="stat"><b>${formatMoney(s.totalEarned)}</b><span>ganado en total</span></div>
      <div class="stat"><b>${s.prestiges}</b><span>puertos vendidos</span></div>
      <div class="stat"><b>×${(1 + s.reputation * C.PRESTIGE_MULT_PER_REP).toFixed(2)}</b><span>multiplicador actual</span></div>
      <div class="stat"><b>${formatDuration(s.playTime)}</b><span>al timón esta vuelta</span></div>
    </div>
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
      status.textContent = PHASE_TEXT[boat.phase];
      status.classList.toggle("ready", boat.phase === "ready");
      const [spd, cap] = row.querySelectorAll<HTMLButtonElement>(".ups .btn");
      const sc = speedUpgradeCost(boat);
      const cc = capUpgradeCost(boat);
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
    const mgrBtn = document.querySelector<HTMLButtonElement>("[data-action='hire-manager']");
    if (mgrBtn) {
      const cost = managerCost(s);
      mgrBtn.querySelector("[data-cost-label]")!.textContent = formatMoney(cost);
      mgrBtn.disabled = s.money < cost;
    }
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
        if (prog) prog.textContent = `${formatMoney(s.lifetime)} / ${formatMoney(C.PRESTIGE_MIN_LIFETIME)} ganados esta vuelta`;
        const bar = document.querySelector<HTMLElement>(".prestige-box .bar i");
        if (bar) bar.style.width = `${Math.min(100, (s.lifetime / C.PRESTIGE_MIN_LIFETIME) * 100)}%`;
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

    // Sello de reputación.
    const stamp = document.getElementById("rep-stamp")!;
    const show = s.reputation > 0;
    if (stamp.hidden === show) {
      stamp.hidden = !show;
    }
    if (show) {
      document.getElementById("rep-val")!.textContent = `×${(1 + s.reputation * C.PRESTIGE_MULT_PER_REP).toFixed(2)}`;
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
    this.renderMissions(false);

    // ¿La estructura cambió por debajo? (compra desde otra vía, prestigio…)
    const sig = `${s.boats.length}:${s.boats.map((b) => `${b.id}.${b.speedLvl}.${b.capLvl}`).join(",")}:${s.zonesUnlocked}:${s.dockLevel}:${s.managerLvl}:${s.prestiges}`;
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
    const key = ev ? `${ev.kind}:${ev.stage}` : "";
    if (key !== this.lastEventKey) {
      this.lastEventKey = key;
      if (!ev) {
        slot.innerHTML = "";
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
          ev.kind === "frenzy" ? C.FRENZY_DURATION_S : ev.stage === "warning" ? C.STORM_WARNING_S : C.STORM_DURATION_S;
        bar.style.width = `${Math.max(0, (ev.remaining / total) * 100)}%`;
      }
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
    const gain = prestigeGain(s);
    const slot = document.getElementById("modal-slot")!;
    slot.innerHTML = `<div class="modal-backdrop"><div class="modal">
      <h2>¿Vender el puerto?</h2>
      <p>Ganas <b>+${gain} de reputación</b> (ingresos ×${(1 + (s.reputation + gain) * C.PRESTIGE_MULT_PER_REP).toFixed(2)} para siempre).<br>
      Pierdes: barcos, mejoras, muelle, gestor y zonas de esta vuelta.</p>
      <div class="row">
        <button class="btn" data-action="close-modal">Todavía no</button>
        <button class="btn gold" id="prestige-yes">Vender</button>
      </div>
    </div></div>`;
    document.getElementById("prestige-yes")!.addEventListener("click", () => {
      this.closeModal();
      this.act.prestige();
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
