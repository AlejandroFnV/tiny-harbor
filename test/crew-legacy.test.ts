/**
 * v1.2 — tripulación (taberna/patrones), árbol de legado y logros.
 */
import { describe, expect, it } from "vitest";
import * as C from "../src/sim/config";
import {
  cargoValue,
  cycleTime,
  legacyCost,
  offlineCapSeconds,
  prestigeMult,
} from "../src/sim/economy";
import { deserialize } from "../src/sim/save";
import { buyLegacy, doPrestige, hireSkipper, resolveStorm, tick } from "../src/sim/sim";
import { newBoat, newGame } from "../src/sim/state";
import type { GameState, SimEvent } from "../src/sim/types";

/** Estado con N barcos y la taberna abierta. */
function withBoats(n: number, seed = 7): GameState {
  const s = newGame(0, seed);
  while (s.boats.length < n) s.boats.push(newBoat(s, 0));
  return s;
}

function fillTavern(s: GameState): void {
  let guard = 100;
  while (s.tavern.candidates.length < C.TAVERN_SLOTS && guard-- > 0) {
    tick(s, C.TAVERN_REFRESH_S + 0.1);
  }
  expect(s.tavern.candidates.length).toBe(C.TAVERN_SLOTS);
}

describe("taberna", () => {
  it("con 1 barco no llega nadie; con 2+ van llegando candidatos hasta llenar asientos", () => {
    const s = newGame(0, 7);
    tick(s, C.TAVERN_REFRESH_S * 3);
    expect(s.tavern.candidates.length).toBe(0);
    s.boats.push(newBoat(s, 0));
    fillTavern(s);
    for (const c of s.tavern.candidates) {
      expect(C.SKIPPER_NAMES).toContain(c.name);
      expect(C.TRAITS.some((t) => t.id === c.trait)).toBe(true);
      expect(c.cost).toBeGreaterThanOrEqual(C.TAVERN_COST_MIN);
    }
  });

  it("fichar cobra el coste, asigna al mejor barco libre y saca al candidato", () => {
    const s = withBoats(2);
    s.boats[1].tier = 1; // el más valioso
    fillTavern(s);
    const cand = s.tavern.candidates[0];
    s.money = cand.cost;
    const events: SimEvent[] = [];
    expect(hireSkipper(s, 0, events).ok).toBe(true);
    expect(s.money).toBe(0);
    expect(s.boats[1].skipper?.name).toBe(cand.name);
    expect(s.tavern.candidates.length).toBe(C.TAVERN_SLOTS - 1);
    expect(s.stats.skippersHired).toBe(1);
    expect(events.some((e) => e.kind === "skipper_hired")).toBe(true);
  });

  it("sin dinero o sin barco libre, no se ficha", () => {
    const s = withBoats(2);
    fillTavern(s);
    s.money = 0;
    expect(hireSkipper(s, 0).ok).toBe(false);
    s.money = 1e12;
    for (const b of s.boats) b.skipper = { name: "Tano", trait: "redes" };
    expect(hireSkipper(s, 0).ok).toBe(false);
    expect(s.money).toBe(1e12);
  });

  it("rasgos: rápido acorta el ciclo, redes sube la carga", () => {
    const s = withBoats(2);
    const [a, b] = s.boats;
    const cycle0 = cycleTime(s, a);
    const cargo0 = cargoValue(s, a);
    a.skipper = { name: "Peio", trait: "rapido" };
    b.skipper = { name: "Lola", trait: "redes" };
    expect(cycleTime(s, a)).toBeCloseTo(cycle0 / (1 + C.TRAIT_SPEED_BONUS), 6);
    expect(cargoValue(s, b)).toBeCloseTo(cargo0 * (1 + C.TRAIT_CARGO_BONUS), 6);
  });

  it("lobo de mar: su barco JAMÁS pierde carga en tormenta arriesgada", () => {
    const s = withBoats(3, 12345);
    s.boats.forEach((b) => (b.skipper = { name: "Curro", trait: "lobo" }));
    s.playTime = C.EVENT_WARMUP_S + 1;
    // Provoca tormentas y faena bajo ellas muchas veces: 0 pérdidas.
    const events: SimEvent[] = [];
    let storms = 0;
    let guard = 20000;
    while (storms < 6 && guard-- > 0) {
      tick(s, 1, events);
      if (s.event?.kind === "storm" && s.event.stage === "warning") {
        resolveStorm(s, "risk");
        storms++;
      }
    }
    expect(storms).toBe(6);
    expect(events.some((e) => e.kind === "cargo_lost")).toBe(false);
  });

  it("el prestigio limpia patrones y taberna", () => {
    const s = withBoats(2);
    fillTavern(s);
    s.boats[0].skipper = { name: "Sole", trait: "ojo" };
    s.lifetime = C.PRESTIGE_MIN_LIFETIME;
    expect(doPrestige(s, 0).ok).toBe(true);
    expect(s.tavern.candidates.length).toBe(0);
    expect(s.boats.every((b) => !b.skipper)).toBe(true);
  });
});

describe("árbol de legado", () => {
  it("comprar gasta reputación pero NO baja el multiplicador (repEarned manda)", () => {
    const s = newGame(0, 7);
    s.reputation = 10;
    s.repEarned = 10;
    const mult0 = prestigeMult(s);
    expect(buyLegacy(s, "astillero").ok).toBe(true);
    expect(s.reputation).toBe(10 - C.LEGACY_COSTS[0]);
    expect(s.legacy.astillero).toBe(1);
    expect(prestigeMult(s)).toBe(mult0);
  });

  it("sin reputación no se compra; al nivel máximo tampoco", () => {
    const s = newGame(0, 7);
    s.reputation = 0;
    expect(buyLegacy(s, "escuela").ok).toBe(false);
    s.reputation = 999;
    s.repEarned = 999;
    for (let i = 0; i < C.LEGACY_MAX_LVL; i++) expect(buyLegacy(s, "escuela").ok).toBe(true);
    expect(legacyCost(s, "escuela")).toBeNull();
    expect(buyLegacy(s, "escuela").ok).toBe(false);
  });

  it("astillero sube carga, escuela acorta ciclo, faro amplía el cofre offline", () => {
    const s = newGame(0, 7);
    const boat = s.boats[0];
    const cargo0 = cargoValue(s, boat);
    const cycle0 = cycleTime(s, boat);
    const cap0 = offlineCapSeconds(s);
    s.legacy = { astillero: 2, escuela: 3, faro: 1 };
    expect(cargoValue(s, boat)).toBeCloseTo(cargo0 * (1 + C.LEGACY_ASTILLERO_CARGO * 2), 6);
    expect(cycleTime(s, boat)).toBeCloseTo(cycle0 / (1 + C.LEGACY_ESCUELA_SPEED * 3), 6);
    expect(offlineCapSeconds(s)).toBe(cap0 + C.LEGACY_FARO_OFFLINE_S);
  });

  it("el legado y repEarned sobreviven al prestigio", () => {
    const s = newGame(0, 7);
    s.reputation = 5;
    s.repEarned = 5;
    buyLegacy(s, "faro");
    s.lifetime = C.PRESTIGE_MIN_LIFETIME;
    const r = doPrestige(s, 0);
    expect(r.ok).toBe(true);
    expect(s.legacy.faro).toBe(1);
    expect(s.repEarned).toBe(5 + r.gained!);
    expect(s.reputation).toBe(5 - C.LEGACY_COSTS[0] + r.gained!);
  });
});

describe("logros", () => {
  it("se desbloquean al cumplir la condición y multiplican ingresos", () => {
    const s = withBoats(5);
    const cargoBefore = cargoValue(s, s.boats[0]);
    const events: SimEvent[] = [];
    tick(s, 0.1, events);
    expect(s.achievements).toContain("flota5");
    expect(events.some((e) => e.kind === "achievement" && e.id === "flota5")).toBe(true);
    expect(cargoValue(s, s.boats[0])).toBeGreaterThan(cargoBefore);
    // No se re-otorga.
    const events2: SimEvent[] = [];
    tick(s, 0.1, events2);
    expect(events2.some((e) => e.kind === "achievement" && e.id === "flota5")).toBe(false);
  });

  it("sobreviven al prestigio", () => {
    const s = withBoats(5);
    tick(s, 0.1);
    s.lifetime = C.PRESTIGE_MIN_LIFETIME;
    doPrestige(s, 0);
    expect(s.achievements).toContain("flota5");
  });
});

describe("migración v3 → v4", () => {
  it("un save v3 gana repEarned/legacy/tavern/achievements/skipper sin perder nada", () => {
    const v3 = JSON.parse(JSON.stringify(newGame(0, 7))) as Record<string, unknown>;
    v3.version = 3;
    delete v3.repEarned;
    delete v3.legacy;
    delete v3.tavern;
    delete v3.achievements;
    (v3.stats as Record<string, unknown>).ordersDone = undefined;
    for (const b of v3.boats as Record<string, unknown>[]) delete b.skipper;
    (v3 as { reputation: number }).reputation = 7;
    (v3 as { discovered: string[] }).discovered = ["sardina", "pulpo"];

    const s = deserialize(JSON.stringify(v3));
    expect(s).not.toBeNull();
    expect(s!.version).toBe(C.SAVE_VERSION);
    expect(s!.repEarned).toBe(7);
    expect(s!.reputation).toBe(7);
    expect(s!.legacy).toEqual({ astillero: 0, escuela: 0, faro: 0 });
    expect(s!.achievements).toEqual([]);
    expect(s!.tavern.candidates).toEqual([]);
    expect(s!.boats.every((b) => b.skipper === null)).toBe(true);
    expect(s!.stats.ordersDone).toBe(0);
    expect(s!.discovered).toEqual(["sardina", "pulpo"]);
  });

  it("contenido nuevo: 8 tiers, 8 zonas y 30 especies coherentes", () => {
    expect(C.BOAT_TIERS.length).toBe(8);
    expect(C.ZONES.length).toBe(8);
    expect(C.SPECIES.length).toBe(30);
    // Toda especie apunta a una zona existente; toda zona tiene especies.
    for (const sp of C.SPECIES) expect(sp.zone).toBeLessThan(C.ZONES.length);
    for (let z = 0; z < C.ZONES.length; z++) {
      expect(C.SPECIES.some((sp) => sp.zone === z)).toBe(true);
    }
    // La curva de coste/valor de tiers y zonas es estrictamente creciente.
    for (let i = 1; i < C.BOAT_TIERS.length; i++) {
      expect(C.BOAT_TIERS[i].baseCost).toBeGreaterThan(C.BOAT_TIERS[i - 1].baseCost);
      expect(C.BOAT_TIERS[i].baseCargo).toBeGreaterThan(C.BOAT_TIERS[i - 1].baseCargo);
    }
    for (let i = 1; i < C.ZONES.length; i++) {
      expect(C.ZONES[i].unlockCost).toBeGreaterThan(C.ZONES[i - 1].unlockCost);
      expect(C.ZONES[i].valueMult).toBeGreaterThan(C.ZONES[i - 1].valueMult);
    }
  });
});
