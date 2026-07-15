/**
 * v1.8 (pulido): pausa del gestor, aplacar al Kraken, tormenta a carga entera,
 * niebla que arrima cofres, fichar a barco elegido, tips y migración v10→v11.
 */
import { describe, expect, it } from "vitest";
import * as C from "../src/sim/config";
import { deserialize, serialize } from "../src/sim/save";
import {
  appeaseKraken,
  buyBoat,
  doPrestige,
  hireManager,
  hireSkipper,
  tick,
  toggleManagerPause,
} from "../src/sim/sim";
import { newGame } from "../src/sim/state";
import type { GameState, SimEvent } from "../src/sim/types";

function fleet(n = 3, seed = 11): GameState {
  const s = newGame(0, seed);
  s.money = 1e9;
  s.dockLevel = C.DOCK_MAX_LEVEL;
  for (let i = 1; i < n; i++) buyBoat(s, 0);
  return s;
}

describe("gestor pausable", () => {
  it("en pausa NO auto-cobra; al despertar sí", () => {
    const s = fleet(2);
    hireManager(s);
    expect(toggleManagerPause(s).ok).toBe(true);
    expect(s.managerPaused).toBe(true);
    // Barco listo + gestor en pausa: la carga se queda esperando al jugador.
    s.boats[0].phase = "ready";
    s.boats[0].cargo = 100;
    tick(s, 30);
    expect(s.boats[0].phase).toBe("ready");
    // Despierta: cobra en el siguiente intervalo.
    toggleManagerPause(s);
    tick(s, C.MANAGER_INTERVALS[0] + 1);
    expect(s.boats[0].phase).not.toBe("ready");
  });

  it("sin gestor no hay nada que pausar", () => {
    const s = fleet(1);
    expect(toggleManagerPause(s).ok).toBe(false);
  });

  it("el prestigio resetea la pausa", () => {
    const s = fleet(2);
    hireManager(s);
    toggleManagerPause(s);
    s.lifetime = C.PRESTIGE_MIN_LIFETIME;
    expect(doPrestige(s, 0).ok).toBe(true);
    expect(s.managerPaused).toBe(false);
  });
});

describe("aplacar al kraken", () => {
  function withKraken(cargoPerBoat = 1000): GameState {
    const s = fleet(3);
    for (const b of s.boats) {
      b.phase = "ready";
      b.cargo = cargoPerBoat;
    }
    s.event = { kind: "kraken", stage: "active", remaining: C.KRAKEN_DURATION_S, tapsLeft: C.KRAKEN_TAPS };
    return s;
  }

  it("suelta la fracción de carga configurada y el kraken se va sin botín", () => {
    const s = withKraken(1000);
    const money = s.money;
    const events: SimEvent[] = [];
    expect(appeaseKraken(s, events).ok).toBe(true);
    expect(s.event).toBeNull();
    expect(s.money).toBe(money); // sin recompensa
    for (const b of s.boats) {
      expect(b.cargo).toBeCloseTo(1000 * (1 - C.KRAKEN_APPEASE_LOSS), 6);
    }
    expect(events.some((e) => e.kind === "kraken_appeased")).toBe(true);
    // Mucho más barato que el mordisco completo si escapa.
    expect(C.KRAKEN_APPEASE_LOSS).toBeLessThan(C.KRAKEN_CARGO_LOSS);
  });

  it("sin kraken activo no hace nada", () => {
    const s = fleet(2);
    expect(appeaseKraken(s).ok).toBe(false);
  });
});

describe("tormenta v1.8: carga entera en juego", () => {
  it("el barco que llega en tormenta arriesgada pierde TODO o NADA", () => {
    // Con muchas repeticiones deben verse ambos resultados y ninguno intermedio.
    let zeros = 0;
    let fulls = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = fleet(1, seed);
      const boat = s.boats[0];
      boat.phase = "in";
      boat.phaseT = 1e9; // llega ya
      s.event = { kind: "storm", stage: "active", choice: "risk", remaining: C.STORM_DURATION_S, tapsLeft: 0 };
      const events: SimEvent[] = [];
      tick(s, 0.1, events);
      expect(boat.phase).toBe("ready");
      if (boat.cargo === 0) {
        zeros++;
        expect(events.some((e) => e.kind === "cargo_lost")).toBe(true);
      } else {
        fulls++;
        expect(events.some((e) => e.kind === "cargo_lost")).toBe(false);
      }
    }
    expect(zeros).toBeGreaterThan(0);
    expect(fulls).toBeGreaterThan(0);
  });
});

describe("niebla y cofres", () => {
  it("la niebla acorta el intervalo del próximo cofre (driftMult)", () => {
    expect(C.WEATHERS[1].id).toBe("niebla");
    expect(C.WEATHERS[1].driftMult).toBeLessThan(1);
    // Mismo RNG, distinto clima → intervalo escalado exactamente por driftMult.
    const clear = fleet(2, 21);
    const foggy = fleet(2, 21);
    clear.weather = 0;
    foggy.weather = 1;
    for (const s of [clear, foggy]) {
      s.playTime = C.DRIFT_WARMUP_S + 1;
      s.drift = { kind: 0, x: 0.5, remaining: 0.01 };
      tick(s, 0.02); // el cofre caduca → scheduleDrift con el clima activo
    }
    expect(foggy.driftT).toBeCloseTo(clear.driftT * C.WEATHERS[1].driftMult, 6);
  });
});

describe("fichar a barco elegido", () => {
  it("con boatId el patrón va a ESE barco, no al mejor", () => {
    const s = fleet(1, 31);
    buyBoat(s, 2); // trainera: mejor que el bote
    s.tavern.candidates.push({ name: "Sole", trait: "redes", cost: 10 });
    const bote = s.boats[0];
    expect(hireSkipper(s, 0, [], bote.id).ok).toBe(true);
    expect(bote.skipper?.name).toBe("Sole");
  });

  it("boatId inválido u ocupado → error sin cobrar", () => {
    const s = fleet(2, 32);
    s.tavern.candidates.push({ name: "Tano", trait: "rapido", cost: 10 });
    const money = s.money;
    expect(hireSkipper(s, 0, [], 9999).ok).toBe(false);
    expect(s.money).toBe(money);
  });
});

describe("migración v10 → v11", () => {
  it("un save v10 gana managerPaused=false y tips=[]", () => {
    const v10 = newGame(0, 5) as unknown as Record<string, unknown>;
    delete v10.managerPaused;
    delete v10.tips;
    v10.version = 10;
    const loaded = deserialize(JSON.stringify(v10));
    expect(loaded).not.toBeNull();
    expect(loaded!.managerPaused).toBe(false);
    expect(loaded!.tips).toEqual([]);
  });

  it("round-trip v11 conserva pausa y tips", () => {
    const s = newGame(0, 6);
    s.managerLvl = 1;
    s.managerPaused = true;
    s.tips.push("combo", "market");
    const loaded = deserialize(serialize(s));
    expect(loaded!.managerPaused).toBe(true);
    expect(loaded!.tips).toEqual(["combo", "market"]);
  });
});
