import { describe, expect, it } from "vitest";
import { BOAT_TIERS, SAVE_VERSION } from "../src/sim/config";

const BOAT_TIERS_MAX = BOAT_TIERS.length - 1;
import { deserialize, serialize } from "../src/sim/save";
import { newGame, sanitize } from "../src/sim/state";
import { tick } from "../src/sim/sim";

describe("save/load", () => {
  it("roundtrip: serializar y cargar devuelve un estado equivalente", () => {
    const s = newGame(123456, 42);
    s.money = 5_000;
    tick(s, 100);
    const loaded = deserialize(serialize(s));
    expect(loaded).not.toBeNull();
    expect(loaded!.money).toBeCloseTo(s.money);
    expect(loaded!.boats.length).toBe(s.boats.length);
    expect(loaded!.rngSeed).toBe(s.rngSeed);
    expect(loaded!.version).toBe(SAVE_VERSION);
  });

  it("migra un save v1 (sin stats.taps, sin settings, misiones sin param)", () => {
    const v1 = {
      version: 1,
      money: 777,
      lifetime: 1000,
      totalEarned: 1000,
      reputation: 2,
      prestiges: 1,
      boats: [{ id: 1, tier: 0, speedLvl: 2, capLvl: 1, phase: "fishing", phaseT: 3, cargo: 0 }],
      nextBoatId: 2,
      dockLevel: 1,
      managerLvl: 0,
      managerT: 0,
      zonesUnlocked: 1,
      missions: [
        { id: 1, kind: "collect", target: 5, progress: 2, reward: 50, done: false, text: "Cobra 5 cargas" },
      ],
      nextMissionId: 2,
      missionsDone: 0,
      event: null,
      eventT: 100,
      lastSeen: 0,
      playTime: 500,
      tutorialStep: 99,
      stats: { collects: 10, boatsBought: 2, upgrades: 3 },
      rngSeed: 7,
    };
    const loaded = deserialize(JSON.stringify(v1));
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(SAVE_VERSION);
    expect(loaded!.money).toBe(777);
    expect(loaded!.stats.taps).toBe(0); // añadido por la migración
    expect(loaded!.settings.muted).toBe(false); // añadido por la migración
    expect(loaded!.missions[0].param).toBe(0); // añadido por la migración
    expect(loaded!.boats[0].speedLvl).toBe(2);
  });

  it("JSON corrupto → null (el llamador arranca partida nueva)", () => {
    expect(deserialize("{ not json")).toBeNull();
    expect(deserialize("null")).toBeNull();
    expect(deserialize('"hola"')).toBeNull();
  });

  it("save de versión futura → null, no explota", () => {
    expect(deserialize(JSON.stringify({ version: SAVE_VERSION + 1 }))).toBeNull();
  });

  it("sanitize mata NaN, negativos y referencias fuera de rango", () => {
    const s = newGame(0);
    s.money = NaN;
    s.lifetime = -500;
    s.boats[0].tier = 99;
    s.boats[0].cargo = Infinity;
    s.zonesUnlocked = -3;
    // @ts-expect-error corrupción deliberada
    s.boats[0].phase = "volando";
    sanitize(s);
    expect(s.money).toBe(0);
    expect(s.lifetime).toBe(0);
    expect(s.boats[0].tier).toBeLessThanOrEqual(BOAT_TIERS_MAX);
    expect(Number.isFinite(s.boats[0].cargo)).toBe(true);
    expect(s.zonesUnlocked).toBe(0);
    expect(s.boats[0].phase).toBe("out");
  });

  it("sanitize es idempotente", () => {
    const s = newGame(0);
    tick(s, 50);
    const once = JSON.stringify(sanitize(s));
    const twice = JSON.stringify(sanitize(JSON.parse(once)));
    expect(twice).toBe(once);
  });
});
