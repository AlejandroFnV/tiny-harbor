import { describe, expect, it } from "vitest";
import * as C from "../src/sim/config";
import { canPrestige, prestigeGain, prestigeMult } from "../src/sim/economy";
import { doPrestige } from "../src/sim/sim";
import { newGame } from "../src/sim/state";

describe("prestigio", () => {
  it("no disponible por debajo del umbral", () => {
    const s = newGame(0);
    s.lifetime = C.PRESTIGE_MIN_LIFETIME - 1;
    expect(canPrestige(s)).toBe(false);
    expect(doPrestige(s, 1000).ok).toBe(false);
    expect(s.reputation).toBe(0);
  });

  it("reputación = floor(cbrt(lifetime/divisor)), determinista", () => {
    const s = newGame(0);
    s.lifetime = C.PRESTIGE_MIN_LIFETIME;
    const expected = Math.floor(Math.cbrt(C.PRESTIGE_MIN_LIFETIME / C.PRESTIGE_REP_DIVISOR));
    expect(prestigeGain(s)).toBe(expected);
    expect(expected).toBeGreaterThanOrEqual(1);
  });

  it("una vuelta profunda ya no rompe el juego: 50B de lifetime ≈ 100 rep, no 1000", () => {
    const s = newGame(0);
    s.lifetime = 50_000_000_000;
    const gain = prestigeGain(s);
    expect(gain).toBeGreaterThan(50);
    expect(gain).toBeLessThan(150); // con sqrt salían 1000 → mult ×121
  });

  it("el umbral de venta escala ×3 por puerto vendido", () => {
    const s = newGame(0);
    expect(canPrestige({ ...s, lifetime: C.PRESTIGE_MIN_LIFETIME })).toBe(true);
    s.lifetime = C.PRESTIGE_MIN_LIFETIME;
    doPrestige(s, 0);
    // Tras vender: el mismo lifetime ya no basta.
    s.lifetime = C.PRESTIGE_MIN_LIFETIME;
    expect(canPrestige(s)).toBe(false);
    s.lifetime = C.PRESTIGE_MIN_LIFETIME * C.PRESTIGE_THRESHOLD_GROWTH;
    expect(canPrestige(s)).toBe(true);
  });

  it("prestigiar resetea la vuelta y conserva lo permanente", () => {
    const s = newGame(0);
    s.lifetime = C.PRESTIGE_MIN_LIFETIME * 4;
    s.money = 999_999;
    s.dockLevel = 3;
    s.managerLvl = 2;
    s.zonesUnlocked = 2;
    s.settings.muted = true;
    const gain = prestigeGain(s);

    const r = doPrestige(s, 5_000);
    expect(r.ok).toBe(true);
    expect(r.gained).toBe(gain);

    // Permanente: reputación, contador de prestigios, ajustes.
    expect(s.reputation).toBe(gain);
    expect(s.prestiges).toBe(1);
    expect(s.settings.muted).toBe(true);

    // Vuelta reseteada.
    expect(s.money).toBe(0);
    expect(s.lifetime).toBe(0);
    expect(s.boats.length).toBe(1);
    expect(s.boats[0].tier).toBe(0);
    expect(s.dockLevel).toBe(0);
    expect(s.managerLvl).toBe(0);
    expect(s.zonesUnlocked).toBe(0);
    expect(s.lastSeen).toBe(5_000);
    expect(s.missions.filter((m) => !m.done).length).toBeGreaterThan(0);
  });

  it("el multiplicador se acumula entre vueltas", () => {
    const s = newGame(0);
    s.lifetime = C.PRESTIGE_MIN_LIFETIME;
    doPrestige(s, 0);
    const rep1 = s.reputation;
    s.lifetime = C.PRESTIGE_MIN_LIFETIME * 10;
    doPrestige(s, 0);
    expect(s.reputation).toBeGreaterThan(rep1);
    expect(prestigeMult(s)).toBeCloseTo(1 + Math.pow(s.repEarned, C.PRESTIGE_MULT_CURVE) * C.PRESTIGE_MULT_PER_REP);
  });

  it("prestigiar resetea lonja y racha", () => {
    const s = newGame(0);
    s.lonjaLvl = 4;
    s.combo = { n: 8, t: 2 };
    s.lifetime = C.PRESTIGE_MIN_LIFETIME;
    doPrestige(s, 0);
    expect(s.lonjaLvl).toBe(0);
    expect(s.combo.n).toBe(0);
  });
});
