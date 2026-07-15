/**
 * v1.5: el Kraken, peces leyenda, regalo diario, récords y migración v6→v7.
 */
import { describe, expect, it } from "vitest";
import * as C from "../src/sim/config";
import { isMidday, isNight, speciesMult } from "../src/sim/economy";
import { deserialize } from "../src/sim/save";
import { buyBoat, claimGift, collectBoat, doPrestige, renamePort, tapKraken, tick } from "../src/sim/sim";
import { newGame } from "../src/sim/state";
import type { GameState, SimEvent } from "../src/sim/types";

function deepFleet(seed = 7): GameState {
  const s = newGame(0, seed);
  s.money = 1e12;
  s.dockLevel = C.DOCK_MAX_LEVEL;
  buyBoat(s, 2);
  buyBoat(s, 2);
  s.zonesUnlocked = C.KRAKEN_MIN_ZONE;
  s.money = 0;
  return s;
}

/** Fuerza el evento kraken activo. */
function summonKraken(s: GameState): void {
  s.event = { kind: "kraken", stage: "active", remaining: C.KRAKEN_DURATION_S, tapsLeft: C.KRAKEN_TAPS };
}

describe("el kraken", () => {
  it("solo asoma en zonas profundas con flota", () => {
    const shallow = newGame(0, 3);
    shallow.playTime = C.EVENT_WARMUP_S + 1;
    for (let i = 0; i < 4000; i++) {
      tick(shallow, 1);
      expect(shallow.event?.kind === "kraken").toBe(false);
      if (shallow.event) shallow.event.remaining = 0; // acelera el ciclo de eventos
    }
  });

  it("con condiciones, acaba apareciendo (warning → active)", () => {
    const s = deepFleet();
    s.playTime = C.EVENT_WARMUP_S + 1;
    let seen = false;
    let guard = 30000;
    while (!seen && guard-- > 0) {
      tick(s, 1);
      if (s.event?.kind === "kraken") seen = true;
      else if (s.event) s.event.remaining = 0;
    }
    expect(seen).toBe(true);
    expect(s.event!.stage).toBe("warning");
    tick(s, C.KRAKEN_WARNING_S + 0.1);
    expect(s.event!.stage).toBe("active");
    expect(s.event!.tapsLeft).toBe(C.KRAKEN_TAPS);
  });

  it("ahuyentarlo a taps paga botín y cuenta el récord", () => {
    const s = deepFleet();
    summonKraken(s);
    const events: SimEvent[] = [];
    for (let i = 0; i < C.KRAKEN_TAPS - 1; i++) expect(tapKraken(s, events).ok).toBe(true);
    expect(s.event).not.toBeNull();
    const last = tapKraken(s, events);
    expect(last.ok).toBe(true);
    expect(last.gained).toBeGreaterThan(0);
    expect(s.event).toBeNull();
    expect(s.stats.krakensRepelled).toBe(1);
    expect(events.some((e) => e.kind === "kraken_repelled")).toBe(true);
    expect(s.achievements).not.toContain("kraken1"); // se otorga en el próximo tick
    tick(s, 0.1);
    expect(s.achievements).toContain("kraken1");
  });

  it("si escapa, arranca carga a los barcos cargados", () => {
    const s = deepFleet();
    summonKraken(s);
    s.boats[0].cargo = 1000;
    s.boats[0].phase = "ready";
    const events: SimEvent[] = [];
    tick(s, C.KRAKEN_DURATION_S + 0.1, events);
    expect(s.event).toBeNull();
    expect(s.boats[0].cargo).toBeCloseTo(1000 * (1 - C.KRAKEN_CARGO_LOSS));
    const esc = events.find((e) => e.kind === "kraken_escaped") as { lost: number } | undefined;
    expect(esc).toBeDefined();
    expect(esc!.lost).toBeGreaterThan(0);
  });

  it("sin evento activo, el tap no hace nada", () => {
    const s = deepFleet();
    expect(tapKraken(s).ok).toBe(false);
  });
});

describe("peces leyenda", () => {
  it("el Rey Sol solo pica a mediodía", () => {
    const s = newGame(0, 21);
    s.zonesUnlocked = 2;
    s.playTime = C.DAY_CYCLE_S * 0.7; // de noche
    expect(isMidday(s)).toBe(false);
    // De noche, jamás (la condición, no la suerte): pocos intentos pero determinista.
    for (let i = 0; i < 500; i++) {
      s.playTime = C.DAY_CYCLE_S * 0.7;
      s.boats[0].phase = "ready";
      s.boats[0].cargo = 10;
      collectBoat(s, s.boats[0].id);
    }
    expect(s.discovered.includes("reysol")).toBe(false);
    // A mediodía, acaba cayendo.
    s.playTime = C.DAY_CYCLE_S * 0.25;
    expect(isMidday(s)).toBe(true);
    let found = false;
    for (let i = 0; i < 3000 && !found; i++) {
      s.playTime = C.DAY_CYCLE_S * 0.25;
      s.boats[0].phase = "ready";
      s.boats[0].cargo = 10;
      collectBoat(s, s.boats[0].id);
      found = s.discovered.includes("reysol");
    }
    expect(found).toBe(true);
  });

  it("el Farol Real solo de noche, y el Fantasma exige racha ≥10", () => {
    const s = newGame(0, 22);
    s.zonesUnlocked = 7;
    s.playTime = C.DAY_CYCLE_S * 0.7; // noche
    expect(isNight(s)).toBe(true);
    let farol = false;
    for (let i = 0; i < 3000 && !farol; i++) {
      s.playTime = C.DAY_CYCLE_S * 0.7;
      s.boats[0].phase = "ready";
      s.boats[0].cargo = 10;
      collectBoat(s, s.boats[0].id);
      farol = s.discovered.includes("farolreal");
    }
    expect(farol).toBe(true);

    // Fantasma: con racha baja no sale; con racha 10+ sí.
    const s2 = newGame(0, 23);
    s2.zonesUnlocked = 7;
    s2.playTime = C.DAY_CYCLE_S * 0.05; // día (aísla del farol)
    for (let i = 0; i < 400; i++) {
      s2.playTime = C.DAY_CYCLE_S * 0.05;
      s2.combo = { n: 1, t: C.COMBO_WINDOW_S };
      s2.boats[0].phase = "ready";
      s2.boats[0].cargo = 10;
      collectBoat(s2, s2.boats[0].id);
    }
    expect(s2.discovered.includes("fantasma")).toBe(false);
    let fantasma = false;
    for (let i = 0; i < 3000 && !fantasma; i++) {
      s2.playTime = C.DAY_CYCLE_S * 0.05;
      s2.combo = { n: 12, t: C.COMBO_WINDOW_S };
      s2.boats[0].phase = "ready";
      s2.boats[0].cargo = 10;
      collectBoat(s2, s2.boats[0].id);
      fantasma = s2.discovered.includes("fantasma");
    }
    expect(fantasma).toBe(true);
  });

  it("una leyenda vale +5% (vs +1% de una común)", () => {
    const s = newGame(0);
    const base = speciesMult(s);
    s.discovered = ["sardina"];
    expect(speciesMult(s)).toBeCloseTo(base + C.SPECIES_INCOME_BONUS);
    s.discovered = ["reysol"];
    expect(speciesMult(s)).toBeCloseTo(base + C.LEGEND_INCOME_BONUS);
  });
});

describe("el paquete del pescador", () => {
  const H = 3_600_000;

  it("primer regalo, racha que crece, y racha rota si tardas >48h", () => {
    const s = newGame(0, 5);
    const r1 = claimGift(s, 100 * H);
    expect(r1).not.toBeNull();
    expect(r1!.day).toBe(1);
    expect(r1!.amount).toBeGreaterThanOrEqual(C.GIFT_FLOOR);
    // Demasiado pronto: nada.
    expect(claimGift(s, 105 * H)).toBeNull();
    // Al día siguiente: día 2 y regalo mayor (mismo income).
    const r2 = claimGift(s, 124 * H);
    expect(r2!.day).toBe(2);
    expect(r2!.amount).toBeGreaterThan(r1!.amount);
    // Tres días sin venir: la racha vuelve a 1.
    const r3 = claimGift(s, 124 * H + 80 * H);
    expect(r3!.day).toBe(1);
    expect(s.stats.bestGiftStreak).toBe(2);
  });

  it("racha de 7 días desbloquea el logro", () => {
    const s = newGame(0, 5);
    let t = 100 * H;
    const events: SimEvent[] = [];
    for (let d = 0; d < 7; d++) {
      claimGift(s, t, events);
      t += 24 * H;
    }
    expect(s.gift.streak).toBe(7);
    expect(s.achievements).toContain("fiel7");
  });
});

describe("récords y nombre del puerto", () => {
  it("bestLifetime y bestRepGain se registran y sobreviven al prestigio", () => {
    const s = newGame(0, 5);
    s.lifetime = C.PRESTIGE_MIN_LIFETIME * 4;
    s.stats.bestLifetime = s.lifetime;
    const r = doPrestige(s, 0);
    expect(r.ok).toBe(true);
    expect(s.stats.bestRepGain).toBe(r.gained);
    expect(s.stats.bestLifetime).toBe(C.PRESTIGE_MIN_LIFETIME * 4);
    expect(s.lifetime).toBe(0);
  });

  it("renombrar recorta, limpia espacios y sobrevive al save", () => {
    const s = newGame(0, 5);
    renamePort(s, "  La   Caleta  de Alejandro Fernández XXL  ");
    expect(s.portName.length).toBeLessThanOrEqual(C.PORT_NAME_MAX);
    expect(s.portName.startsWith("La Caleta")).toBe(true);
    const re = deserialize(JSON.stringify(s))!;
    expect(re.portName).toBe(s.portName);
  });
});

describe("migración v6 → v7", () => {
  it("un save v6 gana kraken/leyendas/regalo/récords sin perder nada", () => {
    const old = JSON.parse(JSON.stringify(newGame(0, 7))) as Record<string, unknown>;
    old.version = 6;
    delete old.portName;
    delete old.gift;
    old.lifetime = 12345;
    const stats = old.stats as Record<string, unknown>;
    delete stats.krakensRepelled;
    delete stats.bestLifetime;
    delete stats.bestRepGain;
    delete stats.bestGiftStreak;
    old.relics = ["brujula"];

    const s = deserialize(JSON.stringify(old))!;
    expect(s).not.toBeNull();
    expect(s.version).toBe(C.SAVE_VERSION);
    expect(s.portName).toBe("");
    expect(s.gift).toEqual({ lastAt: 0, streak: 0 });
    expect(s.stats.krakensRepelled).toBe(0);
    expect(s.stats.bestLifetime).toBe(12345); // arranca en el lifetime actual
    expect(s.relics).toEqual(["brujula"]);
  });
});
