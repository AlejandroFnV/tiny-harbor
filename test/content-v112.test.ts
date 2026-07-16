/** v1.12 — contenido: reliquia Cuerda de la suerte (+taps), logro prestigio10. */
import { describe, it, expect } from "vitest";
import { newGame } from "../src/sim/state";
import { tick } from "../src/sim/sim";
import * as C from "../src/sim/config";
import type { Boat, GameState } from "../src/sim/types";

function fleet(): GameState {
  const s = newGame(0);
  const mk = (tier: number): Boat => ({ id: s.nextBoatId++, tier, paint: 0, speedLvl: 0, capLvl: 0, phase: "fishing", phaseT: 0, cargo: 0, skipper: null });
  s.boats = [mk(1), mk(2)];
  s.playTime = C.EVENT_WARMUP_S + 5;
  return s;
}

// Arranca eventos hasta pillar un banco de peces y devuelve sus taps iniciales.
function frenzyTaps(withRelic: boolean): number {
  const s = fleet();
  if (withRelic) s.relics = ["cuerda"];
  let guard = 200000;
  while (guard-- > 0) {
    tick(s, 1);
    if (s.event?.kind === "frenzy") return s.event.tapsLeft;
    if (s.event) s.event = null; // descarta tormentas/kraken y sigue
  }
  throw new Error("no salió banco de peces");
}

describe("v1.12 contenido", () => {
  it("existe la reliquia Cuerda de la suerte y el logro prestigio10", () => {
    expect(C.RELICS.some((r) => r.id === "cuerda")).toBe(true);
    expect(C.ACHIEVEMENTS.some((a) => a.id === "prestigio10")).toBe(true);
  });

  it("la Cuerda de la suerte añade 3 toques al banco de peces", () => {
    expect(frenzyTaps(false)).toBe(C.FRENZY_MAX_TAPS);
    expect(frenzyTaps(true)).toBe(C.FRENZY_MAX_TAPS + C.RELIC_FRENZY_TAPS);
  });

  it("prestigio10 salta al vender 10 puertos", () => {
    const s = newGame(0);
    s.prestiges = 10;
    tick(s, 0.1);
    expect(s.achievements).toContain("prestigio10");
  });
});
