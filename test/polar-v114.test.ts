import { describe, expect, it } from "vitest";
import * as C from "../src/sim/config";
import { cargoValue, polarCost, polarMult } from "../src/sim/economy";
import { buyPolar, doPrestige } from "../src/sim/sim";
import { newGame } from "../src/sim/state";
import { deserialize } from "../src/sim/save";

describe("La Estrella Polar (sumidero de reputación infinito)", () => {
  it("coste geométrico sin techo", () => {
    const s = newGame(0);
    expect(polarCost(s)).toBe(C.POLAR_BASE_COST);
    s.polarLvl = 5;
    expect(polarCost(s)).toBe(Math.ceil(C.POLAR_BASE_COST * C.POLAR_COST_GROWTH ** 5));
    // Nunca devuelve null ni se topa: a nivel 200 sigue dando un número finito > 0.
    s.polarLvl = 200;
    expect(polarCost(s)).toBeGreaterThan(0);
    expect(Number.isFinite(polarCost(s))).toBe(true);
  });

  it("multiplicador aditivo por nivel", () => {
    const s = newGame(0);
    expect(polarMult(s)).toBe(1);
    s.polarLvl = 10;
    expect(polarMult(s)).toBeCloseTo(1 + 10 * C.POLAR_INCOME_BONUS);
  });

  it("comprar gasta reputación e incrementa el nivel; falla sin rep", () => {
    const s = newGame(0);
    s.reputation = C.POLAR_BASE_COST + 1;
    const r = buyPolar(s);
    expect(r.ok).toBe(true);
    expect(s.polarLvl).toBe(1);
    expect(s.reputation).toBe(1);
    // Sin rep suficiente para el siguiente nivel: no compra.
    expect(buyPolar(s).ok).toBe(false);
    expect(s.polarLvl).toBe(1);
  });

  it("sube los ingresos (entra en cargoValue)", () => {
    const s = newGame(0);
    const before = cargoValue(s, s.boats[0]);
    s.polarLvl = 5;
    const after = cargoValue(s, s.boats[0]);
    expect(after).toBeCloseTo(before * (1 + 5 * C.POLAR_INCOME_BONUS));
  });

  it("PERSISTE al vender el puerto (como el legado)", () => {
    const s = newGame(0);
    s.polarLvl = 7;
    s.lifetime = C.PRESTIGE_MIN_LIFETIME;
    doPrestige(s, 0);
    expect(s.polarLvl).toBe(7);
  });

  it("migración v12→v13: un save viejo sin polarLvl arranca en 0", () => {
    const v12 = { version: 12, money: 100, lifetime: 0, boats: [], reputation: 3, repEarned: 3, polarLvl: undefined };
    const s = deserialize(JSON.stringify(v12));
    expect(s).not.toBeNull();
    expect(s!.polarLvl).toBe(0);
    expect(s!.version).toBe(C.SAVE_VERSION);
  });
});
