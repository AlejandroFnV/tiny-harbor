/** v1.10 — contenido: reliquia Boya cantarina (cofres flotan más). */
import { describe, it, expect } from "vitest";
import { newGame } from "../src/sim/state";
import { tick } from "../src/sim/sim";
import * as C from "../src/sim/config";

// Fuerza la aparición de un cofre y devuelve su tiempo a flote inicial.
function driftLife(withBoya: boolean): number {
  const s = newGame(0);
  s.boats = [
    { id: 1, tier: 1, paint: 0, speedLvl: 0, capLvl: 0, phase: "fishing", phaseT: 0, cargo: 0, skipper: null },
    { id: 2, tier: 1, paint: 0, speedLvl: 0, capLvl: 0, phase: "fishing", phaseT: 0, cargo: 0, skipper: null },
  ];
  if (withBoya) s.relics = ["boya"];
  s.playTime = C.DRIFT_WARMUP_S + 10;
  s.driftT = 0; // toca cofre ya
  // Avanza hasta que aparezca un cofre.
  let guard = 100000;
  while (!s.drift && guard-- > 0) tick(s, 0.5);
  return s.drift!.remaining;
}

describe("v1.10 contenido", () => {
  it("existe la Boya cantarina (14 reliquias)", () => {
    expect(C.RELICS.length).toBe(14);
    expect(C.RELICS.some((r) => r.id === "boya")).toBe(true);
  });

  it("la Boya cantarina alarga la vida a flote de los cofres un 60%", () => {
    const base = driftLife(false);
    const boosted = driftLife(true);
    expect(base).toBeGreaterThan(0);
    expect(boosted).toBeCloseTo(base * (1 + C.RELIC_DRIFT_LIFETIME), 4);
  });
});
