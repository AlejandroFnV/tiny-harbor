/**
 * v1.6: compradores del puerto, Torre del Vigía, El Alba, % completado y migración v7→v8.
 */
import { describe, expect, it } from "vitest";
import * as C from "../src/sim/config";
import {
  albaUnlocked,
  buyerGain,
  completionPct,
  incomeRate,
  prestigeGain,
  prestigeOffers,
  speciesChanceMult,
  vigiaCost,
} from "../src/sim/economy";
import { deserialize } from "../src/sim/save";
import { buyBoat, buyVigia, doPrestige, tick } from "../src/sim/sim";
import { newBoat, newGame } from "../src/sim/state";
import type { GameState } from "../src/sim/types";

const LEGENDS = ["reysol", "sierpe", "farolreal", "fantasma"];

function sellable(seed = 7): GameState {
  const s = newGame(0, seed);
  s.lifetime = C.PRESTIGE_MIN_LIFETIME;
  s.boats.push(newBoat(s, 2));
  return s;
}

describe("compradores del puerto", () => {
  it("siempre ofrece La Naviera + 2 especiales, determinista", () => {
    const a = prestigeOffers(sellable());
    const b = prestigeOffers(sellable());
    expect(a.length).toBe(3);
    expect(a[0].id).toBe("naviera");
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    // Ofertas distintas en la siguiente venta (misma semilla, prestigios+1).
    const s2 = sellable();
    s2.prestiges = 1;
    const c = prestigeOffers(s2);
    expect(c[0].id).toBe("naviera");
  });

  it("el gremio paga +20% y el anticuario -20% pero deja reliquia", () => {
    const s = sellable();
    const base = prestigeGain(s);
    expect(buyerGain(s, "gremio")).toBe(Math.floor(base * 1.2));
    expect(buyerGain(s, "anticuario")).toBe(Math.max(1, Math.floor(base * 0.8)));
    // Vender al anticuario da una reliquia (si está sobre la mesa).
    let sold = false;
    for (let seed = 1; seed < 40 && !sold; seed++) {
      const st = sellable(seed);
      if (prestigeOffers(st).some((b) => b.id === "anticuario")) {
        const r = doPrestige(st, 0, "anticuario");
        expect(r.ok).toBe(true);
        expect(st.relics.length).toBe(1);
        expect(st.stats.specialSales).toBe(1);
        sold = true;
      }
    }
    expect(sold).toBe(true);
  });

  it("la cofradía te deja el barco más humilde; la vieja guardia, caja inicial", () => {
    for (let seed = 1; seed < 60; seed++) {
      const st = sellable(seed);
      const offers = prestigeOffers(st).map((b) => b.id);
      if (offers.includes("cofradia")) {
        expect(doPrestige(st, 0, "cofradia").ok).toBe(true);
        expect(st.boats.length).toBe(2); // bote nuevo + el humilde conservado
        expect(st.boats[1].skipper).toBeNull();
        expect(st.boats[1].cargo).toBe(0);
      }
      if (offers.includes("viejaguardia")) {
        const st2 = sellable(seed);
        const cash = incomeRate(st2) * C.BUYER_VIEJAGUARDIA_SECONDS;
        expect(doPrestige(st2, 0, "viejaguardia").ok).toBe(true);
        expect(st2.money).toBeCloseTo(cash);
        expect(st2.lifetime).toBe(0); // la caja regalada no cuenta para re-vender
      }
    }
  });

  it("no se puede vender a un comprador que no está sobre la mesa", () => {
    const s = sellable();
    const offered = new Set(prestigeOffers(s).map((b) => b.id));
    const notOffered = C.BUYERS.find((b) => !offered.has(b.id));
    if (notOffered) expect(doPrestige(s, 0, notOffered.id).ok).toBe(false);
    // La naviera vale siempre (y es el default retrocompatible).
    expect(doPrestige(s, 0).ok).toBe(true);
  });
});

describe("torre del vigía", () => {
  it("se compra una vez por vuelta y se pierde al vender", () => {
    const s = sellable();
    s.money = vigiaCost(s);
    expect(buyVigia(s).ok).toBe(true);
    expect(s.money).toBe(0);
    expect(s.vigia).toBe(true);
    expect(buyVigia(s).ok).toBe(false); // ya está construida
    doPrestige(s, 0);
    expect(s.vigia).toBe(false);
  });
});

describe("el alba", () => {
  it("bloqueada sin las 4 leyendas; única con ellas; inmune a tormenta", () => {
    const s = newGame(0, 7);
    s.money = 1e12;
    s.dockLevel = C.DOCK_MAX_LEVEL;
    expect(albaUnlocked(s)).toBe(false);
    expect(buyBoat(s, C.ALBA_TIER).ok).toBe(false);
    s.discovered.push(...LEGENDS);
    expect(albaUnlocked(s)).toBe(true);
    expect(buyBoat(s, C.ALBA_TIER).ok).toBe(true);
    expect(buyBoat(s, C.ALBA_TIER).ok).toBe(false); // única
    const alba = s.boats.find((b) => b.tier === C.ALBA_TIER)!;
    // Imán de especies.
    expect(speciesChanceMult(s, alba)).toBeGreaterThanOrEqual(C.ALBA_SPECIES_MULT);
    // Inmune a tormenta arriesgada: nunca pierde carga.
    s.event = { kind: "storm", stage: "active", remaining: 60, tapsLeft: 0, choice: "risk" };
    let lost = false;
    for (let i = 0; i < 300; i++) {
      alba.phase = "in";
      alba.phaseT = 1e9; // fuerza la llegada
      const events = tick(s, 0.01);
      if (events.some((e) => e.kind === "cargo_lost" && e.boatId === alba.id)) lost = true;
      s.event = { kind: "storm", stage: "active", remaining: 60, tapsLeft: 0, choice: "risk" };
    }
    expect(lost).toBe(false);
    // Logro.
    tick(s, 0.1);
    expect(s.achievements).toContain("alba1");
  });
});

describe("puerto completado", () => {
  it("0% al empezar, crece con lo permanente, 100% con todo", () => {
    const s = newGame(0);
    expect(completionPct(s)).toBe(0);
    s.discovered = C.SPECIES.map((x) => x.id);
    expect(completionPct(s)).toBeGreaterThanOrEqual(30);
    s.relics = C.RELICS.map((x) => x.id);
    s.achievements = C.ACHIEVEMENTS.map((x) => x.id);
    s.legacy = { astillero: 5, escuela: 5, faro: 5 };
    expect(completionPct(s)).toBe(100);
  });
});

describe("migración v7 → v8", () => {
  it("un save v7 gana vigía y specialSales sin perder nada", () => {
    const old = JSON.parse(JSON.stringify(newGame(0, 7))) as Record<string, unknown>;
    old.version = 7;
    delete old.vigia;
    const stats = old.stats as Record<string, unknown>;
    delete stats.specialSales;
    old.portName = "La Caleta";
    const s = deserialize(JSON.stringify(old))!;
    expect(s.version).toBe(C.SAVE_VERSION);
    expect(s.vigia).toBe(false);
    expect(s.stats.specialSales).toBe(0);
    expect(s.portName).toBe("La Caleta");
  });
});
