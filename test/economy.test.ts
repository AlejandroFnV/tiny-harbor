import { describe, expect, it } from "vitest";
import * as C from "../src/sim/config";
import {
  boatCost,
  capUpgradeCost,
  cargoValue,
  cycleTime,
  incomeRate,
  prestigeMult,
  speedUpgradeCost,
} from "../src/sim/economy";
import { buyBoat, collectBoat, tick, upgradeBoat } from "../src/sim/sim";
import { newGame } from "../src/sim/state";
import { formatMoney } from "../src/sim/format";

describe("fórmulas de coste", () => {
  it("el coste de barco crece ×1.15 por unidad", () => {
    const s = newGame(0);
    const c0 = boatCost(s, 0); // ya hay 1 bote inicial
    expect(c0).toBe(Math.ceil(C.BOAT_TIERS[0].baseCost * C.COST_GROWTH));
    s.money = 1e12;
    buyBoat(s, 0);
    const c1 = boatCost(s, 0);
    expect(c1).toBe(Math.ceil(C.BOAT_TIERS[0].baseCost * C.COST_GROWTH ** 2));
    expect(c1).toBeGreaterThan(c0);
  });

  it("mejoras crecen ×1.15 por nivel", () => {
    const s = newGame(0);
    const b = s.boats[0];
    const s0 = speedUpgradeCost(b);
    const k0 = capUpgradeCost(b);
    s.money = 1e12;
    upgradeBoat(s, b.id, "speed");
    upgradeBoat(s, b.id, "cap");
    expect(speedUpgradeCost(b)).toBeGreaterThan(s0);
    expect(capUpgradeCost(b)).toBeGreaterThan(k0);
  });

  it("comprar con dinero EXACTO funciona y deja 0, nunca negativo", () => {
    const s = newGame(0);
    s.money = boatCost(s, 0);
    const r = buyBoat(s, 0);
    expect(r.ok).toBe(true);
    expect(s.money).toBe(0);
  });

  it("comprar sin dinero falla sin tocar el estado", () => {
    const s = newGame(0);
    s.money = boatCost(s, 0) - 1;
    const before = s.boats.length;
    const r = buyBoat(s, 0);
    expect(r.ok).toBe(false);
    expect(s.boats.length).toBe(before);
    expect(s.money).toBe(boatCost(s, 0) - 1);
  });

  it("velocidad reduce ciclo, capacidad sube carga", () => {
    const s = newGame(0);
    const b = s.boats[0];
    const t0 = cycleTime(s, b);
    const v0 = cargoValue(s, b);
    b.speedLvl = 5;
    b.capLvl = 5;
    expect(cycleTime(s, b)).toBeLessThan(t0);
    expect(cargoValue(s, b)).toBeGreaterThan(v0);
  });

  it("la reputación multiplica ingresos", () => {
    const s = newGame(0);
    const base = incomeRate(s);
    s.reputation = 10;
    expect(prestigeMult(s)).toBeCloseTo(1 + 10 * C.PRESTIGE_MULT_PER_REP);
    expect(incomeRate(s)).toBeCloseTo(base * prestigeMult(s));
  });
});

describe("cobro", () => {
  it("ciclo completo: el bote vuelve cargado y se cobra una sola vez", () => {
    const s = newGame(0);
    const b = s.boats[0];
    tick(s, cycleTime(s, b)); // ciclo exacto
    expect(b.phase).toBe("ready");
    expect(b.cargo).toBeGreaterThan(0);

    const r1 = collectBoat(s, b.id);
    expect(r1.ok).toBe(true);
    expect(s.money).toBeCloseTo(r1.gained!);

    // Tap frenético: el segundo cobro del mismo barco no puede duplicar dinero.
    const r2 = collectBoat(s, b.id);
    expect(r2.ok).toBe(false);
    expect(s.money).toBeCloseTo(r1.gained!);
  });

  it("tap frenético ×50 sobre el mismo barco = un solo cobro", () => {
    const s = newGame(0);
    const b = s.boats[0];
    tick(s, cycleTime(s, b));
    let total = 0;
    let oks = 0;
    for (let i = 0; i < 50; i++) {
      const r = collectBoat(s, b.id);
      if (r.ok) {
        oks++;
        total += r.gained!;
      }
    }
    expect(oks).toBe(1);
    expect(s.stats.collects).toBe(1);
    expect(s.money).toBeCloseTo(total);
  });
});

describe("formato de números", () => {
  it("formatea K/M/B y nunca enseña NaN", () => {
    expect(formatMoney(0)).toBe("0");
    expect(formatMoney(999)).toBe("999");
    expect(formatMoney(1200)).toBe("1.20K");
    expect(formatMoney(3_400_000)).toBe("3.40M");
    expect(formatMoney(5_600_000_000)).toBe("5.60B");
    expect(formatMoney(NaN)).toBe("0");
    expect(formatMoney(Infinity)).toBe("0");
    expect(formatMoney(-50)).toBe("0");
    expect(formatMoney(1e40)).toMatch(/e/); // científica, no crash
  });
});
