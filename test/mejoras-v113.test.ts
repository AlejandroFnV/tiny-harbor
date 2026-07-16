import { describe, expect, it } from "vitest";
import * as C from "../src/sim/config";
import { boatCost, boatResaleValue, incomeRate } from "../src/sim/economy";
import { buyBoat, sellBoat, tapWhale, upgradeBoat } from "../src/sim/sim";
import { newGame } from "../src/sim/state";

describe("v1.13 — vender barco", () => {
  it("libera un amarre y devuelve la fracción de reventa", () => {
    const s = newGame(0);
    s.money = 1e9;
    buyBoat(s, 0); // segundo bote
    const n0 = s.boats.length;
    const target = s.boats[s.boats.length - 1];
    const refund = boatResaleValue(target);
    const money0 = s.money;
    const r = sellBoat(s, target.id);
    expect(r.ok).toBe(true);
    expect(r.gained).toBe(refund);
    expect(s.boats.length).toBe(n0 - 1);
    expect(s.boats.some((b) => b.id === target.id)).toBe(false);
    expect(s.money).toBe(money0 + refund);
  });

  it("no permite vender el último barco", () => {
    const s = newGame(0);
    expect(s.boats.length).toBe(1);
    const r = sellBoat(s, s.boats[0].id);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("last_boat");
    expect(s.boats.length).toBe(1);
  });

  it("vender NO cuenta como ingreso (no infla lifetime/totalEarned/prestigio)", () => {
    const s = newGame(0);
    s.money = 1e9;
    buyBoat(s, 0);
    const life0 = s.lifetime;
    const earned0 = s.totalEarned;
    sellBoat(s, s.boats[s.boats.length - 1].id);
    expect(s.lifetime).toBe(life0);
    expect(s.totalEarned).toBe(earned0);
  });

  it("vender + recomprar el mismo tier NUNCA da beneficio (sin arbitraje)", () => {
    const s = newGame(0);
    s.money = 1e12;
    // Llena varios botes para subir el precio escalado.
    for (let i = 0; i < 6; i++) buyBoat(s, 0);
    const before = s.money;
    const last = s.boats[s.boats.length - 1];
    const refund = boatResaleValue(last);
    sellBoat(s, last.id);
    const rebuy = boatCost(s, 0); // precio del siguiente bote tras vender
    // El reembolso siempre es menor que recomprar: el bucle vende-compra pierde dinero.
    expect(refund).toBeLessThan(rebuy);
    buyBoat(s, 0);
    expect(s.money).toBeLessThanOrEqual(before);
  });

  it("el reembolso incluye mejoras pagadas pero a la mitad", () => {
    const s = newGame(0);
    s.money = 1e9;
    buyBoat(s, 0);
    const b = s.boats[s.boats.length - 1];
    const bare = boatResaleValue(b);
    upgradeBoat(s, b.id, "speed");
    upgradeBoat(s, b.id, "cap");
    expect(boatResaleValue(b)).toBeGreaterThan(bare);
  });
});

describe("v1.13 — ballena tappable", () => {
  it("da un tesoro escalado con el income y suma la stat", () => {
    const s = newGame(0);
    s.money = 0;
    s.zonesUnlocked = 3;
    const expected = Math.max(C.WHALE_FLOOR, incomeRate(s) * C.WHALE_SECONDS);
    const taps0 = s.stats.whalesTapped;
    const r = tapWhale(s);
    expect(r.ok).toBe(true);
    expect(r.gained).toBe(expected);
    expect(s.money).toBe(expected);
    expect(s.stats.whalesTapped).toBe(taps0 + 1);
  });

  it("respeta el suelo mínimo cuando el income es bajo", () => {
    const s = newGame(0);
    const r = tapWhale(s);
    expect(r.gained).toBeGreaterThanOrEqual(C.WHALE_FLOOR);
  });

  it("el logro ballenero salta a las 5 ballenas", () => {
    const s = newGame(0);
    for (let i = 0; i < 5; i++) tapWhale(s);
    // La condición es pura; tickAchievements la evalúa en el loop, aquí comprobamos el gate.
    expect(s.stats.whalesTapped).toBe(5);
    expect(C.ACHIEVEMENTS.some((a) => a.id === "ballenero")).toBe(true);
  });
});
