/** v1.9 — contenido nuevo: delfín, Medusa Aurora (leyenda de niebla), astrolabio, logros de leyendas. */
import { describe, it, expect } from "vitest";
import { newGame } from "../src/sim/state";
import { collectBoat, tapShoal, tick } from "../src/sim/sim";
import * as C from "../src/sim/config";
import type { Boat, GameState } from "../src/sim/types";

function boat(tier = 2): Boat {
  return { id: 1, tier, paint: 0, speedLvl: 0, capLvl: 0, phase: "ready", phaseT: 0, cargo: 100, skipper: null };
}

function fleet(): GameState {
  const s = newGame(0);
  s.boats = [boat(2), boat(3)];
  s.zonesUnlocked = 4;
  return s;
}

describe("v1.9 contenido", () => {
  it("hay 36 especies (delfín + Medusa Aurora) y 13 reliquias (astrolabio)", () => {
    expect(C.SPECIES.length).toBe(36);
    expect(C.SPECIES.some((x) => x.id === "delfin")).toBe(true);
    expect(C.SPECIES.some((x) => x.id === "aurora" && x.rarity === "leyenda")).toBe(true);
    expect(C.RELICS.length).toBe(13);
    expect(C.RELICS.some((r) => r.id === "astrolabio")).toBe(true);
  });

  it("el delfín es una especie rara descubrible en Costa (zona 1)", () => {
    const d = C.SPECIES.find((x) => x.id === "delfin")!;
    expect(d.zone).toBe(1);
    expect(d.rarity).toBe("rara");
  });

  it("el astrolabio da +50% al toque del banco de peces", () => {
    const base = fleet();
    base.event = { kind: "frenzy", stage: "active", remaining: 15, tapsLeft: 12 };
    const r1 = tapShoal(base);

    const withRelic = fleet();
    withRelic.relics = ["astrolabio"];
    withRelic.event = { kind: "frenzy", stage: "active", remaining: 15, tapsLeft: 12 };
    const r2 = tapShoal(withRelic);

    expect(r1.ok && r2.ok).toBe(true);
    expect(r2.gained!).toBeCloseTo(r1.gained! * (1 + C.RELIC_FRENZY_BONUS), 5);
  });

  it("la Medusa Aurora SOLO se descubre con niebla (weather=1)", () => {
    // Sin niebla: nunca aparece por muchas tiradas.
    const clear = fleet();
    clear.weather = 0; // despejado
    for (let i = 0; i < 4000; i++) {
      clear.boats[0].phase = "ready";
      clear.boats[0].cargo = 100;
      collectBoat(clear, clear.boats[0].id);
    }
    expect(clear.discovered.includes("aurora")).toBe(false);

    // Con niebla: acaba apareciendo.
    const foggy = fleet();
    foggy.weather = 1; // niebla
    foggy.legacy.faro = 5; // sube la prob. de especie para no eternizar el test
    let found = false;
    for (let i = 0; i < 20000 && !found; i++) {
      foggy.boats[0].phase = "ready";
      foggy.boats[0].cargo = 100;
      collectBoat(foggy, foggy.boats[0].id);
      found = foggy.discovered.includes("aurora");
    }
    expect(found).toBe(true);
  });

  it("leyendas4 salta a las 4 leyendas; leyendas5 exige las 5", () => {
    const s = newGame(0);
    s.discovered = ["reysol", "sierpe", "farolreal", "fantasma"];
    tick(s, 0.1);
    expect(s.achievements).toContain("leyendas4");
    expect(s.achievements).not.toContain("leyendas5");
    s.discovered.push("aurora");
    tick(s, 0.1);
    expect(s.achievements).toContain("leyendas5");
  });
});
