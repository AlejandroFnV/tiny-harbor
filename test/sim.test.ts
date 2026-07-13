import { describe, expect, it } from "vitest";
import * as C from "../src/sim/config";
import { cycleTime } from "../src/sim/economy";
import {
  buyBoat,
  collectAll,
  hireManager,
  resolveStorm,
  tapShoal,
  tick,
  unlockZone,
  upgradeDock,
} from "../src/sim/sim";
import { newGame } from "../src/sim/state";
import type { SimEvent } from "../src/sim/types";

describe("FSM del barco", () => {
  it("recorre zarpa → pesca → vuelve → listo con las proporciones del ciclo", () => {
    const s = newGame(0);
    const b = s.boats[0];
    const total = cycleTime(s, b);
    tick(s, total * 0.2);
    expect(b.phase).toBe("out");
    tick(s, total * 0.2); // 0.4 > 0.25 → pescando
    expect(b.phase).toBe("fishing");
    tick(s, total * 0.4); // 0.8 > 0.75 → volviendo
    expect(b.phase).toBe("in");
    const events: SimEvent[] = [];
    tick(s, total * 0.2 + 0.001, events); // ciclo completo → listo
    expect(b.phase).toBe("ready");
    expect(events.some((e) => e.kind === "arrive")).toBe(true);
  });

  it("un dt gigante no rompe el estado (catch-up estable)", () => {
    const s = newGame(0);
    tick(s, 100_000);
    for (const b of s.boats) {
      expect(["out", "fishing", "in", "ready"]).toContain(b.phase);
      expect(Number.isFinite(b.phaseT)).toBe(true);
    }
  });
});

describe("gestor", () => {
  it("auto-cobra barcos listos al intervalo de su nivel", () => {
    const s = newGame(0);
    const b = s.boats[0];
    tick(s, cycleTime(s, b)); // barco listo ANTES de contratar
    expect(b.phase).toBe("ready");
    s.money = C.MANAGER_BASE_COST;
    expect(hireManager(s).ok).toBe(true);
    const events: SimEvent[] = [];
    tick(s, C.MANAGER_INTERVALS[0] + 0.1, events);
    expect(events.some((e) => e.kind === "collect" && e.auto)).toBe(true);
    expect(b.phase).toBe("out"); // vuelve a faenar tras el auto-cobro
    expect(s.money).toBeGreaterThan(0);
  });
});

describe("muelle y zonas", () => {
  it("sin amarre libre no se compra; ampliar muelle desbloquea", () => {
    const s = newGame(0);
    s.money = 1e9;
    const berthsNow = C.BASE_BERTHS;
    for (let i = s.boats.length; i < berthsNow; i++) expect(buyBoat(s, 0).ok).toBe(true);
    expect(buyBoat(s, 0).ok).toBe(false); // lleno
    expect(upgradeDock(s).ok).toBe(true);
    expect(buyBoat(s, 0).ok).toBe(true);
  });

  it("desbloquear zona cobra el coste (puede sumar recompensa de misión)", () => {
    const s = newGame(0);
    const cost = C.ZONES[1].unlockCost;
    s.money = cost;
    expect(unlockZone(s).ok).toBe(true);
    expect(s.zonesUnlocked).toBe(1);
    // El coste se ha pagado; lo que quede solo puede venir de recompensas de misión.
    expect(s.money).toBeLessThan(cost);
    // Sin dinero para la siguiente (cuesta mucho más):
    expect(unlockZone(s).ok).toBe(false);
  });
});

describe("eventos", () => {
  function forceEvent(kind: "frenzy" | "storm") {
    const s = newGame(0);
    s.money = 1e9;
    if (kind === "storm") {
      buyBoat(s, 0); // mínimo 2 barcos para tormenta
      s.event = { kind: "storm", stage: "warning", remaining: C.STORM_WARNING_S, tapsLeft: 0 };
    } else {
      s.event = { kind: "frenzy", stage: "active", remaining: C.FRENZY_DURATION_S, tapsLeft: C.FRENZY_MAX_TAPS };
    }
    return s;
  }

  it("banco de peces: taps dan burst y se agotan", () => {
    const s = forceEvent("frenzy");
    const before = s.money;
    let oks = 0;
    for (let i = 0; i < C.FRENZY_MAX_TAPS + 10; i++) if (tapShoal(s).ok) oks++;
    expect(oks).toBe(C.FRENZY_MAX_TAPS);
    expect(s.money).toBeGreaterThan(before);
  });

  it("tormenta: refugiarse pausa los ciclos", () => {
    const s = forceEvent("storm");
    expect(resolveStorm(s, "shelter").ok).toBe(true);
    const phases = s.boats.map((b) => `${b.phase}:${b.phaseT.toFixed(3)}`);
    tick(s, 5);
    expect(s.boats.map((b) => `${b.phase}:${b.phaseT.toFixed(3)}`)).toEqual(phases);
  });

  it("tormenta: sin decisión a tiempo → refugio automático (opción segura)", () => {
    const s = forceEvent("storm");
    tick(s, C.STORM_WARNING_S + 0.1);
    expect(s.event?.stage).toBe("active");
    expect(s.event?.choice).toBe("shelter");
  });

  it("el evento termina y programa el siguiente", () => {
    const s = forceEvent("frenzy");
    const events: SimEvent[] = [];
    tick(s, C.FRENZY_DURATION_S + 1, events);
    expect(s.event).toBeNull();
    expect(events.some((e) => e.kind === "event_end")).toBe(true);
    expect(s.eventT).toBeGreaterThanOrEqual(C.EVENT_INTERVAL_MIN_S);
    expect(s.eventT).toBeLessThanOrEqual(C.EVENT_INTERVAL_MAX_S);
  });
});

describe("misiones", () => {
  it("siempre hay 3 misiones activas y completar paga", () => {
    const s = newGame(0);
    expect(s.missions.filter((m) => !m.done).length).toBe(C.ACTIVE_MISSIONS);
    // Fuerza completar la misión de cobros si existe; si no, la de earn.
    s.money = 1e9;
    const events: SimEvent[] = [];
    for (let i = 0; i < 60; i++) {
      tick(s, 30, events);
      collectAll(s, events);
    }
    expect(s.missionsDone).toBeGreaterThan(0);
    expect(events.some((e) => e.kind === "mission_done")).toBe(true);
    expect(s.missions.filter((m) => !m.done).length).toBe(C.ACTIVE_MISSIONS);
  });
});
