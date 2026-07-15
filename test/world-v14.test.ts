/**
 * v1.4: mercado de la lonja, cofres a la deriva, expediciones, reliquias
 * y migración v5→v6.
 */
import { describe, expect, it } from "vitest";
import * as C from "../src/sim/config";
import {
  capUpgradeCost,
  cargoValue,
  comboMax,
  cycleTime,
  expeditionBooty,
  incomeRate,
  offlineCapSeconds,
  speedUpgradeCost,
} from "../src/sim/economy";
import { applyOffline } from "../src/sim/offline";
import { deserialize } from "../src/sim/save";
import { buyBoat, completeExpedition, doPrestige, startExpedition, tapDrift, tick } from "../src/sim/sim";
import { newGame } from "../src/sim/state";
import type { SimEvent } from "../src/sim/types";

function withBoats(n: number, seed = 7) {
  const s = newGame(0, seed);
  s.money = 1e12;
  s.dockLevel = C.DOCK_MAX_LEVEL;
  for (let i = 1; i < n; i++) buyBoat(s, Math.min(i, 2));
  s.money = 0;
  return s;
}

describe("mercado de la lonja", () => {
  it("el precio se mueve, queda acotado y es determinista", () => {
    const a = newGame(0, 42);
    const b = newGame(0, 42);
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      tick(a, 10);
      tick(b, 10);
      expect(a.market.mult).toBeGreaterThanOrEqual(C.MARKET_MIN);
      expect(a.market.mult).toBeLessThanOrEqual(C.MARKET_MAX);
      seen.add(Math.round(a.market.mult * 100));
    }
    expect(a.market.mult).toBe(b.market.mult); // misma semilla → mismo precio
    expect(seen.size).toBeGreaterThan(5); // se mueve de verdad
  });

  it("el precio multiplica la carga", () => {
    const s = newGame(0);
    const b = s.boats[0];
    s.market.mult = 1;
    const base = cargoValue(s, b);
    s.market.mult = 1.5;
    expect(cargoValue(s, b)).toBeCloseTo(base * 1.5);
    s.market.mult = 0.7;
    expect(cargoValue(s, b)).toBeCloseTo(base * 0.7);
  });
});

describe("cofres a la deriva", () => {
  function spawnDrift(s: ReturnType<typeof newGame>): void {
    s.playTime = C.DRIFT_WARMUP_S + 1;
    s.driftT = 0;
    tick(s, 0.1);
  }

  it("aparece tras el warmup, caduca y reprograma el siguiente", () => {
    const s = newGame(0, 11);
    const events: SimEvent[] = [];
    s.playTime = C.DRIFT_WARMUP_S + 1;
    s.driftT = 0;
    tick(s, 0.1, events);
    expect(s.drift).not.toBeNull();
    expect(events.some((e) => e.kind === "drift_spawn")).toBe(true);
    const events2: SimEvent[] = [];
    tick(s, C.DRIFT_LIFETIME_S + 1, events2);
    expect(s.drift).toBeNull();
    expect(events2.some((e) => e.kind === "drift_gone")).toBe(true);
    expect(s.driftT).toBeGreaterThanOrEqual(C.DRIFT_INTERVAL_MIN_S * C.RELIC_DRIFT_FREQ);
  });

  it("tap = recompensa con suelo por rareza y stat", () => {
    const s = newGame(0, 11);
    spawnDrift(s);
    const kind = s.drift!.kind;
    const r = tapDrift(s);
    expect(r.ok).toBe(true);
    expect(r.gained).toBeGreaterThanOrEqual(C.DRIFT_KINDS[kind].floor);
    expect(s.stats.driftsTapped).toBe(1);
    expect(s.drift).toBeNull();
    expect(tapDrift(s).ok).toBe(false); // sin cofre no hay premio
  });

  it("el mapa pirata acorta el intervalo entre cofres", () => {
    const a = newGame(0, 5);
    const b = newGame(0, 5);
    b.relics.push("mapapirata");
    spawnDrift(a);
    spawnDrift(b);
    tapDrift(a);
    tapDrift(b);
    expect(b.driftT).toBeLessThan(a.driftT);
  });
});

describe("expediciones", () => {
  it("el botín es la pesca del barco × duración × factor", () => {
    const s = withBoats(3);
    const best = s.boats.reduce((a, b) => (cargoValue(s, b) > cargoValue(s, a) ? b : a));
    const def = C.EXPEDITIONS[1];
    expect(expeditionBooty(s, best, 1)).toBeCloseTo((cargoValue(s, best) / cycleTime(s, best)) * def.dur * def.factor);
  });

  it("zarpa el barco más valioso, no pesca mientras, y vuelve con botín", () => {
    const s = withBoats(3);
    s.market.mult = 1;
    const best = s.boats.reduce((a, b) => (cargoValue(s, b) > cargoValue(s, a) ? b : a));
    const rateBefore = incomeRate(s);
    const events: SimEvent[] = [];
    expect(startExpedition(s, 0, events).ok).toBe(true);
    expect(s.expedition!.boatId).toBe(best.id);
    expect(incomeRate(s)).toBeLessThan(rateBefore); // el barco fuera no cuenta

    const doneEvents: SimEvent[] = [];
    tick(s, C.EXPEDITIONS[0].dur + 1, doneEvents);
    expect(s.expedition).toBeNull();
    const done = doneEvents.find((e) => e.kind === "expedition_done") as { amount: number } | undefined;
    expect(done).toBeDefined();
    expect(done!.amount).toBeGreaterThan(0);
    expect(s.money).toBeGreaterThanOrEqual(done!.amount * 0.999);
    expect(s.stats.expeditionsDone).toBe(1);
    s.market.mult = 1; // neutraliza la deriva del mercado durante el tick largo
    // El barco vuelve a contar (≥: el logro "Mar adentro" añade +2% al completar).
    expect(incomeRate(s)).toBeGreaterThanOrEqual(rateBefore);
    expect(incomeRate(s)).toBeLessThan(rateBefore * 1.1);
  });

  it("no se puede con <2 barcos ni con otra en curso", () => {
    const solo = newGame(0);
    expect(startExpedition(solo, 0).ok).toBe(false);
    const s = withBoats(3);
    expect(startExpedition(s, 0).ok).toBe(true);
    expect(startExpedition(s, 1).ok).toBe(false);
  });

  it("la Odisea garantiza una reliquia nueva", () => {
    const s = withBoats(3);
    startExpedition(s, 2);
    const events: SimEvent[] = [];
    s.expedition!.remaining = 0.05;
    tick(s, 0.1, events);
    expect(s.relics.length).toBe(1);
    expect(events.some((e) => e.kind === "relic_found")).toBe(true);
  });

  it("completa también offline (botín en el cofre) y avanza si no termina", () => {
    const s = withBoats(3);
    startExpedition(s, 0);
    s.lastSeen = 0;
    // Media expedición offline: avanza pero no completa.
    let r = applyOffline(s, (C.EXPEDITIONS[0].dur / 2) * 1000);
    expect(s.expedition).not.toBeNull();
    expect(s.expedition!.remaining).toBeLessThan(C.EXPEDITIONS[0].dur / 2 + 1);
    // El resto: completa y suma botín al resultado.
    const before = s.money;
    r = applyOffline(s, C.EXPEDITIONS[0].dur * 1000 + 120_000);
    expect(s.expedition).toBeNull();
    expect(s.stats.expeditionsDone).toBe(1);
    expect(s.money).toBeGreaterThan(before);
    expect(r.earned).toBeGreaterThan(0);
  });

  it("prestigiar cancela la expedición (el barco se vende con el puerto)", () => {
    const s = withBoats(3);
    startExpedition(s, 0);
    s.lifetime = C.PRESTIGE_MIN_LIFETIME;
    doPrestige(s, 0);
    expect(s.expedition).toBeNull();
  });

  it("completeExpedition con barco desaparecido no rompe", () => {
    const s = withBoats(3);
    startExpedition(s, 0);
    s.boats = s.boats.filter((b) => b.id !== s.expedition!.boatId);
    completeExpedition(s, []);
    expect(s.expedition).toBeNull();
  });
});

describe("reliquias", () => {
  it("brujula acelera, redvieja+moneda multiplican, anclaoro abarata, farolillo amplía cofre", () => {
    const s = newGame(0);
    const b = s.boats[0];
    const t0 = cycleTime(s, b);
    const v0 = cargoValue(s, b);
    const su0 = speedUpgradeCost(b, s);
    const cu0 = capUpgradeCost(b, s);
    const off0 = offlineCapSeconds(s);
    s.relics = ["brujula", "redvieja", "moneda", "anclaoro", "farolillo"];
    expect(cycleTime(s, b)).toBeCloseTo(t0 / (1 + C.RELIC_SPEED));
    expect(cargoValue(s, b)).toBeCloseTo(v0 * (1 + C.RELIC_CARGO) * (1 + C.RELIC_INCOME));
    expect(speedUpgradeCost(b, s)).toBeLessThan(su0);
    expect(capUpgradeCost(b, s)).toBeLessThan(cu0);
    expect(offlineCapSeconds(s)).toBe(off0 + C.RELIC_OFFLINE_S);
  });

  it("mascaron sube el tope de racha y perlanegra escala con prestigios", () => {
    const s = newGame(0);
    expect(comboMax(s)).toBe(C.COMBO_MAX);
    s.relics = ["mascaron", "perlanegra"];
    expect(comboMax(s)).toBe(C.COMBO_MAX + C.RELIC_COMBO_EXTRA);
    const v0 = cargoValue(s, s.boats[0]);
    s.prestiges = 10;
    expect(cargoValue(s, s.boats[0])).toBeCloseTo(v0 * (1 + 0.1) / 1); // +1%×10
  });

  it("las reliquias sobreviven al prestigio", () => {
    const s = newGame(0);
    s.relics = ["brujula", "timon"];
    s.lifetime = C.PRESTIGE_MIN_LIFETIME;
    doPrestige(s, 0);
    expect(s.relics).toEqual(["brujula", "timon"]);
  });
});

describe("migración v5 → v6", () => {
  it("un save v5 gana mercado/deriva/expedición/reliquias sin perder nada", () => {
    const old = JSON.parse(JSON.stringify(newGame(0, 7))) as Record<string, unknown>;
    old.version = 5;
    delete old.market;
    delete old.drift;
    delete old.driftT;
    delete old.expedition;
    delete old.relics;
    const stats = old.stats as Record<string, unknown>;
    delete stats.driftsTapped;
    delete stats.expeditionsDone;
    delete stats.soldHigh;
    old.repEarned = 12;
    old.reputation = 12;

    const s = deserialize(JSON.stringify(old))!;
    expect(s).not.toBeNull();
    expect(s.version).toBe(C.SAVE_VERSION);
    expect(s.repEarned).toBe(12); // v5→v6 NO reconvierte la rep
    expect(s.market.mult).toBe(1);
    expect(s.drift).toBeNull();
    expect(s.expedition).toBeNull();
    expect(s.relics).toEqual([]);
    expect(s.stats.soldHigh).toBe(0);
  });

  it("sanitize anula una expedición cuyo barco ya no existe", () => {
    const s = newGame(0, 7);
    const raw = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    raw.expedition = { boatId: 999, def: 1, remaining: 100 };
    const re = deserialize(JSON.stringify(raw))!;
    expect(re.expedition).toBeNull();
  });
});
