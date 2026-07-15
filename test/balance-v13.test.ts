/**
 * v1.3: lonja infinita, racha de cobro manual, captura dorada y migración v4→v5
 * (rebalance del prestigio: la rep vieja en escala sqrt pasa a escala cbrt).
 */
import { describe, expect, it } from "vitest";
import * as C from "../src/sim/config";
import { comboMult, incomeRate, lonjaCost, lonjaMult } from "../src/sim/economy";
import { deserialize } from "../src/sim/save";
import { collectBoat, tick, upgradeLonja } from "../src/sim/sim";
import { newGame } from "../src/sim/state";
import { cycleTime } from "../src/sim/economy";
import type { SimEvent } from "../src/sim/types";

describe("la lonja", () => {
  it("coste crece ×3.5 por nivel y el bonus multiplica ingresos", () => {
    const s = newGame(0);
    expect(lonjaCost(s)).toBe(C.LONJA_BASE_COST);
    const base = incomeRate(s);
    s.money = lonjaCost(s);
    expect(upgradeLonja(s).ok).toBe(true);
    expect(s.money).toBe(0);
    expect(s.lonjaLvl).toBe(1);
    expect(lonjaCost(s)).toBe(Math.ceil(C.LONJA_BASE_COST * C.LONJA_COST_GROWTH));
    expect(lonjaMult(s)).toBeCloseTo(1 + C.LONJA_INCOME_BONUS);
    expect(incomeRate(s)).toBeCloseTo(base * lonjaMult(s));
  });

  it("sin dinero no se amplía", () => {
    const s = newGame(0);
    s.money = lonjaCost(s) - 1;
    expect(upgradeLonja(s).ok).toBe(false);
    expect(s.lonjaLvl).toBe(0);
  });

  it("no tiene techo: 30 niveles seguidos sin NaN", () => {
    const s = newGame(0);
    for (let i = 0; i < 30; i++) {
      s.money = lonjaCost(s);
      expect(upgradeLonja(s).ok).toBe(true);
    }
    expect(s.lonjaLvl).toBe(30);
    expect(Number.isFinite(lonjaCost(s))).toBe(true);
    expect(Number.isFinite(incomeRate(s))).toBe(true);
  });
});

describe("racha de cobro manual", () => {
  function readyBoat(s: ReturnType<typeof newGame>) {
    tick(s, cycleTime(s, s.boats[0]));
    return s.boats[0];
  }

  it("cobros encadenados suben la racha; el primero no bonifica", () => {
    const s = newGame(0);
    const b = readyBoat(s);
    expect(comboMult(s)).toBe(1);
    collectBoat(s, b.id);
    expect(s.combo.n).toBe(1);
    expect(comboMult(s)).toBe(1); // primer eslabón: sin bonus
    tick(s, 0.1); // dentro de la ventana de racha
    s.boats[0].phase = "ready";
    s.boats[0].cargo = 100;
    collectBoat(s, b.id);
    expect(s.combo.n).toBe(2);
    expect(comboMult(s)).toBeCloseTo(1 + C.COMBO_STEP);
  });

  it("la racha caduca a los COMBO_WINDOW_S segundos", () => {
    const s = newGame(0);
    const b = readyBoat(s);
    collectBoat(s, b.id);
    expect(s.combo.n).toBe(1);
    tick(s, C.COMBO_WINDOW_S + 0.1);
    expect(s.combo.n).toBe(0);
  });

  it("la racha se capa en COMBO_MAX y registra bestCombo", () => {
    const s = newGame(0);
    for (let i = 0; i < C.COMBO_MAX + 5; i++) {
      s.boats[0].phase = "ready";
      s.boats[0].cargo = 10;
      collectBoat(s, s.boats[0].id);
    }
    expect(s.combo.n).toBe(C.COMBO_MAX);
    expect(s.stats.bestCombo).toBe(C.COMBO_MAX);
  });

  it("el gestor (auto-cobro) NI construye racha NI se beneficia", () => {
    const s = newGame(0);
    s.managerLvl = 1;
    s.managerT = 0.1;
    s.combo = { n: C.COMBO_MAX, t: C.COMBO_WINDOW_S };
    s.boats[0].phase = "ready";
    const cargo = 1000;
    s.boats[0].cargo = cargo;
    const before = s.money;
    tick(s, 0.2);
    // Cobró el gestor: sin bonus de racha (y sin tirada dorada).
    expect(s.money - before).toBeCloseTo(cargo);
  });
});

describe("captura dorada", () => {
  it("con muchos cobros manuales acaba saliendo una dorada (×3, evento, stat)", () => {
    const s = newGame(0, 99);
    let golden = 0;
    for (let i = 0; i < 500; i++) {
      s.boats[0].phase = "ready";
      s.boats[0].cargo = 100;
      s.combo = { n: 0, t: 0 }; // aisla el ×3: sin bonus de racha
      const events: SimEvent[] = [];
      const r = collectBoat(s, s.boats[0].id, events);
      const ev = events.find((e) => e.kind === "golden");
      if (ev) {
        golden++;
        expect(r.gained).toBeCloseTo(100 * C.GOLDEN_MULT);
      }
    }
    expect(golden).toBeGreaterThan(0);
    expect(s.stats.goldenCatches).toBe(golden);
    // ~3% de 500 = ~15; margen amplio para el RNG sembrado.
    expect(golden).toBeLessThan(60);
  });
});

describe("migración v4 → v5 (rebalance del prestigio)", () => {
  it("convierte la rep sqrt-escala a cbrt-escala y respeta lo gastado en legado", () => {
    const old = JSON.parse(JSON.stringify(newGame(0, 7))) as Record<string, unknown>;
    old.version = 4;
    delete old.lonjaLvl;
    delete old.combo;
    // Partida rota real: 447 rep de una vuelta profunda con la fórmula vieja.
    old.repEarned = 447;
    old.reputation = 447 - (1 + 2); // gastó astillero nv.2 (1+2 rep)
    old.legacy = { astillero: 2, escuela: 0, faro: 0 };
    const stats = old.stats as Record<string, unknown>;
    delete stats.bestCombo;
    delete stats.goldenCatches;

    const s = deserialize(JSON.stringify(old))!;
    expect(s).not.toBeNull();
    const expected = Math.round(Math.pow(447, 2 / 3)); // ≈ 58
    expect(s.repEarned).toBe(expected);
    expect(s.reputation).toBe(expected - 3); // lo gastado se descuenta
    expect(s.legacy.astillero).toBe(2); // el legado comprado no se pierde
    expect(s.lonjaLvl).toBe(0);
    expect(s.combo.n).toBe(0);
    expect(s.stats.bestCombo).toBe(0);
    expect(s.version).toBe(C.SAVE_VERSION);
  });

  it("un save v4 sin reputación migra a idéntico estado jugable", () => {
    const old = JSON.parse(JSON.stringify(newGame(0, 7))) as Record<string, unknown>;
    old.version = 4;
    delete old.lonjaLvl;
    delete old.combo;
    const s = deserialize(JSON.stringify(old))!;
    expect(s.repEarned).toBe(0);
    expect(s.reputation).toBe(0);
    expect(s.boats.length).toBe(1);
    expect(s.version).toBe(C.SAVE_VERSION);
  });
});
