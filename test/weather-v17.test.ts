/**
 * v1.7: clima del día, desafío diario, pintura de barcos y migración v9→v10.
 */
import { describe, expect, it } from "vitest";
import * as C from "../src/sim/config";
import { cargoValue, cycleTime, speciesChanceMult } from "../src/sim/economy";
import { deserialize } from "../src/sim/save";
import { checkDaily, collectBoat, dailyProgress, paintBoat, tick } from "../src/sim/sim";
import { newGame } from "../src/sim/state";
import type { SimEvent } from "../src/sim/types";

describe("clima del día", () => {
  it("se sortea con cada amanecer, determinista, y varía", () => {
    const a = newGame(0, 77);
    const b = newGame(0, 77);
    const seen = new Set<number>();
    for (let d = 0; d < 40; d++) {
      tick(a, C.DAY_CYCLE_S);
      tick(b, C.DAY_CYCLE_S);
      expect(a.weather).toBe(b.weather);
      seen.add(a.weather);
    }
    expect(seen.size).toBeGreaterThan(1); // hay días distintos
  });

  it("la marejada sube la carga y baja la velocidad; la niebla acerca especies", () => {
    const s = newGame(0);
    const boat = s.boats[0];
    s.weather = 0;
    const cargo0 = cargoValue(s, boat);
    const cycle0 = cycleTime(s, boat);
    const chance0 = speciesChanceMult(s, boat);
    s.weather = 3; // marejada
    expect(cargoValue(s, boat)).toBeCloseTo(cargo0 * C.WEATHERS[3].cargoMult);
    expect(cycleTime(s, boat)).toBeCloseTo(cycle0 / C.WEATHERS[3].speedMult);
    s.weather = 1; // niebla
    expect(speciesChanceMult(s, boat)).toBeCloseTo(chance0 * C.WEATHERS[1].speciesMult);
  });

  it("cobrar bajo un clima marca el bitmask del meteorólogo", () => {
    const s = newGame(0);
    s.weather = 2;
    s.boats[0].phase = "ready";
    s.boats[0].cargo = 10;
    collectBoat(s, s.boats[0].id);
    expect(s.stats.weathersFished & (1 << 2)).toBeTruthy();
  });
});

describe("desafío del día", () => {
  const DAY = 86_400_000;

  it("se asigna por fecha (el mismo para todos) y no se re-asigna el mismo día", () => {
    const a = newGame(0, 1);
    const b = newGame(0, 999); // semilla de partida distinta
    expect(checkDaily(a, 20_000 * DAY)).toBe(true);
    expect(checkDaily(b, 20_000 * DAY)).toBe(true);
    expect(a.daily!.def).toBe(b.daily!.def); // mismo reto para todo el mundo
    expect(checkDaily(a, 20_000 * DAY + 3_600_000)).toBe(false); // mismo día
    expect(checkDaily(a, 20_001 * DAY)).toBe(true); // día nuevo
  });

  it("se completa por delta del stat y paga una vez", () => {
    const s = newGame(0, 1);
    s.stats.collects = 100; // historial previo: no debe contar
    checkDaily(s, 20_000 * DAY);
    // Fuerza el reto de cargas para el test.
    s.daily = { day: 20_000, def: 0, baseline: 100, done: false };
    const def = C.DAILIES[0];
    expect(dailyProgress(s)).toBe(0);
    s.stats.collects = 100 + def.target;
    const events: SimEvent[] = [];
    const money0 = s.money;
    tick(s, 0.1, events);
    expect(s.daily!.done).toBe(true);
    expect(s.money).toBeGreaterThan(money0);
    expect(s.stats.dailiesDone).toBe(1);
    expect(events.some((e) => e.kind === "daily_done")).toBe(true);
    // No re-paga.
    const money1 = s.money;
    tick(s, 0.1);
    expect(s.money).toBeCloseTo(money1 + 0, -1);
  });
});

describe("pintura de barcos", () => {
  it("cicla colores y sobrevive al save", () => {
    const s = newGame(0);
    expect(s.boats[0].paint).toBe(0);
    paintBoat(s, s.boats[0].id);
    expect(s.boats[0].paint).toBe(1);
    for (let i = 0; i < C.PAINTS.length - 1; i++) paintBoat(s, s.boats[0].id);
    expect(s.boats[0].paint).toBe(0); // vuelta completa
    paintBoat(s, s.boats[0].id);
    const re = deserialize(JSON.stringify(s))!;
    expect(re.boats[0].paint).toBe(1);
  });
});

describe("migración v9 → v10", () => {
  it("un save v9 gana clima/desafío/pintura sin perder nada", () => {
    const old = JSON.parse(JSON.stringify(newGame(0, 7))) as Record<string, unknown>;
    old.version = 9;
    delete old.weather;
    delete old.daily;
    for (const b of old.boats as Record<string, unknown>[]) delete b.paint;
    const stats = old.stats as Record<string, unknown>;
    delete stats.weathersFished;
    delete stats.dailiesDone;
    old.portName = "La Caleta";

    const s = deserialize(JSON.stringify(old))!;
    expect(s.version).toBe(C.SAVE_VERSION);
    expect(s.weather).toBe(0);
    expect(s.daily).toBeNull();
    expect(s.boats[0].paint).toBe(0);
    expect(s.stats.dailiesDone).toBe(0);
    expect(s.portName).toBe("La Caleta");
  });
});
