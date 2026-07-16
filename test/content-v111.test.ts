/** v1.11 — contenido: especies jurel/quimera, reliquia Ojo de vidrio, logros taps500/cofres25. */
import { describe, it, expect } from "vitest";
import { newGame } from "../src/sim/state";
import { collectBoat, tick } from "../src/sim/sim";
import * as C from "../src/sim/config";
import type { Boat, GameState } from "../src/sim/types";

function fleet(): GameState {
  const s = newGame(0);
  const mk = (tier: number): Boat => ({ id: s.nextBoatId++, tier, paint: 0, speedLvl: 0, capLvl: 0, phase: "ready", phaseT: 0, cargo: 100, skipper: null });
  s.boats = [mk(2), mk(3)];
  s.zonesUnlocked = 4;
  return s;
}

describe("v1.11 contenido", () => {
  it("nuevas especies jurel (Alta mar) y quimera abisal (Abismo)", () => {
    const jurel = C.SPECIES.find((x) => x.id === "jurel");
    const quimera = C.SPECIES.find((x) => x.id === "quimera");
    expect(jurel?.zone).toBe(3);
    expect(quimera?.zone).toBe(4);
  });

  it("existe la reliquia Ojo de vidrio y los logros taps500/cofres25", () => {
    expect(C.RELICS.some((r) => r.id === "ojovidrio")).toBe(true);
    expect(C.ACHIEVEMENTS.some((a) => a.id === "taps500")).toBe(true);
    expect(C.ACHIEVEMENTS.some((a) => a.id === "cofres25")).toBe(true);
  });

  it("el Ojo de vidrio duplica la frecuencia de capturas doradas", () => {
    // Con la reliquia, sobre muchas tiradas, salen ~2× más doradas.
    function goldens(withRelic: boolean): number {
      const s = fleet();
      if (withRelic) s.relics = ["ojovidrio"];
      for (let i = 0; i < 4000; i++) {
        s.boats[0].phase = "ready";
        s.boats[0].cargo = 100;
        collectBoat(s, s.boats[0].id);
      }
      return s.stats.goldenCatches;
    }
    const base = goldens(false);
    const boosted = goldens(true);
    expect(base).toBeGreaterThan(0);
    // No es determinista, pero con RNG con seed fijo la razón debe rondar 2×.
    expect(boosted).toBeGreaterThan(base * 1.4);
  });

  it("taps500 y cofres25 saltan al llegar al umbral", () => {
    const s = newGame(0);
    s.stats.taps = 500;
    s.stats.driftsTapped = 25;
    tick(s, 0.1);
    expect(s.achievements).toContain("taps500");
    expect(s.achievements).toContain("cofres25");
  });
});
