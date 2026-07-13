import { describe, expect, it } from "vitest";
import * as C from "../src/sim/config";
import { incomeRate, offlineCapSeconds } from "../src/sim/economy";
import { applyOffline } from "../src/sim/offline";
import { newGame } from "../src/sim/state";

const H = 3600 * 1000;

describe("ganancia offline", () => {
  it("paga la tasa media por el tiempo fuera (sin gestor, eficiencia reducida)", () => {
    const s = newGame(0);
    const rate = incomeRate(s);
    const r = applyOffline(s, 1 * H);
    expect(r.seconds).toBe(3600);
    expect(r.earned).toBeCloseTo(rate * 3600 * C.OFFLINE_EFF_NO_MANAGER, 5);
    expect(s.money).toBeCloseTo(r.earned, 5);
  });

  it("con gestor paga a eficiencia completa", () => {
    const s = newGame(0);
    s.managerLvl = 1;
    const rate = incomeRate(s);
    const r = applyOffline(s, 1 * H);
    expect(r.earned).toBeCloseTo(rate * 3600 * C.OFFLINE_EFF_MANAGER, 5);
  });

  it("RELOJ HACIA ATRÁS: jamás ganancia negativa ni segundos negativos", () => {
    const s = newGame(50 * H); // lastSeen en el "futuro"
    const r = applyOffline(s, 10 * H); // now < lastSeen
    expect(r.seconds).toBe(0);
    expect(r.earned).toBe(0);
    expect(s.money).toBe(0);
    // y lastSeen queda saneado al now real, no se queda en el futuro
    expect(s.lastSeen).toBe(10 * H);
  });

  it("3 días fuera → aplica el cap, no 72h de dinero", () => {
    const s = newGame(0);
    const cap = offlineCapSeconds(s);
    const r = applyOffline(s, 72 * H);
    expect(r.seconds).toBe(cap);
    expect(r.capped).toBe(true);
    expect(r.rawSeconds).toBeCloseTo(72 * 3600);
    expect(r.earned).toBeCloseTo(incomeRate(s) * cap * C.OFFLINE_EFF_NO_MANAGER, 3);
  });

  it("el cap crece con el muelle pero respeta el techo absoluto", () => {
    const s = newGame(0);
    expect(offlineCapSeconds(s)).toBe(C.OFFLINE_CAP_BASE_S);
    s.dockLevel = 4;
    expect(offlineCapSeconds(s)).toBe(C.OFFLINE_CAP_BASE_S + 4 * C.OFFLINE_CAP_PER_DOCK_S);
    s.dockLevel = 999 as number; // forzado: nunca supera el techo
    expect(offlineCapSeconds(s)).toBe(C.OFFLINE_CAP_MAX_S);
  });

  it("ausencias de <1 min no disparan el modal ni pagan", () => {
    const s = newGame(0);
    const r = applyOffline(s, 30 * 1000);
    expect(r.seconds).toBe(0);
    expect(r.earned).toBe(0);
  });

  it("al volver, la flota está lista para cobrar (taps de bienvenida)", () => {
    const s = newGame(0);
    applyOffline(s, 2 * H);
    for (const b of s.boats) {
      expect(b.phase).toBe("ready");
      expect(b.cargo).toBeGreaterThan(0);
    }
  });
});
