import { describe, expect, it } from "vitest";
import * as C from "../src/sim/config";
import { canPrestige, prestigeGain, prestigeMult, prestigeThreshold } from "../src/sim/economy";
import { doPrestige } from "../src/sim/sim";
import { newGame } from "../src/sim/state";

describe("prestigio", () => {
  it("no disponible por debajo del umbral", () => {
    const s = newGame(0);
    s.lifetime = C.PRESTIGE_MIN_LIFETIME - 1;
    expect(canPrestige(s)).toBe(false);
    expect(doPrestige(s, 1000).ok).toBe(false);
    expect(s.reputation).toBe(0);
  });

  it("reputación = floor(cbrt(lifetime/divisor)), determinista", () => {
    const s = newGame(0);
    s.lifetime = C.PRESTIGE_MIN_LIFETIME;
    const expected = Math.floor(Math.cbrt(C.PRESTIGE_MIN_LIFETIME / C.PRESTIGE_REP_DIVISOR));
    expect(prestigeGain(s)).toBe(expected);
    expect(expected).toBeGreaterThanOrEqual(1);
  });

  it("con overshoot razonable el rep escala como cbrt: 50B a la altura del umbral ≈ 100 rep", () => {
    const s = newGame(0);
    // prestiges=10 → umbral geométrico ≈ 2.36e10; 50B es ~×2.1 (overshoot normal).
    s.prestiges = 10;
    s.lifetime = 50_000_000_000;
    const gain = prestigeGain(s);
    expect(gain).toBeGreaterThan(50);
    expect(gain).toBeLessThan(150); // con sqrt salían 1000 → mult ×121
  });

  it("overshoot capado: un lifetime absurdo en una venta temprana NO da rep desbocado", () => {
    // El bug reportado: en late-run el dinero crece tan rápido que se vendía 100×+
    // por encima del umbral y ese overshoot inflaba el rep → runaway. El rep se capa
    // al umbral GEOMÉTRICO ×PRESTIGE_OVERSHOOT_REP_CAP: pasarse más no da más rep.
    const absurdo = newGame(0); // umbral geométrico = 400k
    absurdo.lifetime = 50_000_000_000; // overshoot ×125.000
    const enElTecho = newGame(0);
    enElTecho.lifetime = C.PRESTIGE_OVERSHOOT_REP_CAP * C.PRESTIGE_MIN_LIFETIME;
    expect(prestigeGain(absurdo)).toBe(prestigeGain(enElTecho)); // pasarse del techo no suma
    expect(prestigeGain(absurdo)).toBeLessThan(10); // nada de cientos de rep en la 1ª venta
  });

  it("overshoot: el umbral siguiente queda acotado y NO permite re-vender al instante", () => {
    const s = newGame(0);
    s.lifetime = 5_000_000; // overshoot ×12.5 sobre el umbral inicial (400k)
    doPrestige(s, 0);
    // Reset de la vuelta → no se puede re-vender de inmediato (el mult apenas subió).
    expect(canPrestige(s)).toBe(false);
    const next = prestigeThreshold(s);
    const geom = C.PRESTIGE_MIN_LIFETIME * C.PRESTIGE_THRESHOLD_GROWTH;
    // El ancla lastSale×1.4 se capa a geométrico×CAP → el overshoot no dispara el umbral.
    expect(next).toBeLessThanOrEqual(geom * C.PRESTIGE_OVERSHOOT_REP_CAP + 1);
    expect(next).toBeGreaterThan(geom); // pero algo por encima de la escalera base (ancla)
    // Y sin overshoot, manda la escalera geométrica de siempre.
    const t = newGame(0);
    t.lifetime = C.PRESTIGE_MIN_LIFETIME;
    doPrestige(t, 0);
    expect(prestigeThreshold(t)).toBe(geom);
  });

  it("el umbral de venta escala ×3 por puerto vendido", () => {
    const s = newGame(0);
    expect(canPrestige({ ...s, lifetime: C.PRESTIGE_MIN_LIFETIME })).toBe(true);
    s.lifetime = C.PRESTIGE_MIN_LIFETIME;
    doPrestige(s, 0);
    // Tras vender: el mismo lifetime ya no basta.
    s.lifetime = C.PRESTIGE_MIN_LIFETIME;
    expect(canPrestige(s)).toBe(false);
    s.lifetime = C.PRESTIGE_MIN_LIFETIME * C.PRESTIGE_THRESHOLD_GROWTH;
    expect(canPrestige(s)).toBe(true);
  });

  it("prestigiar resetea la vuelta y conserva lo permanente", () => {
    const s = newGame(0);
    s.lifetime = C.PRESTIGE_MIN_LIFETIME * 4;
    s.money = 999_999;
    s.dockLevel = 3;
    s.managerLvl = 2;
    s.zonesUnlocked = 2;
    s.settings.muted = true;
    const gain = prestigeGain(s);

    const r = doPrestige(s, 5_000);
    expect(r.ok).toBe(true);
    expect(r.gained).toBe(gain);

    // Permanente: reputación, contador de prestigios, ajustes.
    expect(s.reputation).toBe(gain);
    expect(s.prestiges).toBe(1);
    expect(s.settings.muted).toBe(true);

    // Vuelta reseteada.
    expect(s.money).toBe(0);
    expect(s.lifetime).toBe(0);
    expect(s.boats.length).toBe(1);
    expect(s.boats[0].tier).toBe(0);
    expect(s.dockLevel).toBe(0);
    expect(s.managerLvl).toBe(0);
    expect(s.zonesUnlocked).toBe(0);
    expect(s.lastSeen).toBe(5_000);
    expect(s.missions.filter((m) => !m.done).length).toBeGreaterThan(0);
  });

  it("el multiplicador se acumula entre vueltas", () => {
    const s = newGame(0);
    s.lifetime = C.PRESTIGE_MIN_LIFETIME;
    doPrestige(s, 0);
    const rep1 = s.reputation;
    s.lifetime = C.PRESTIGE_MIN_LIFETIME * 10;
    doPrestige(s, 0);
    expect(s.reputation).toBeGreaterThan(rep1);
    expect(prestigeMult(s)).toBeCloseTo(1 + Math.pow(s.repEarned, C.PRESTIGE_MULT_CURVE) * C.PRESTIGE_MULT_PER_REP);
  });

  it("REGRESIÓN runaway: vender con overshoot enorme NO acelera las vueltas siguientes", () => {
    // Bug reportado por Alejandro: al vender muy por encima del umbral, la siguiente
    // ronda ganaba una barbaridad en nada de tiempo. Simulamos 5 ventas seguidas
    // vendiendo SIEMPRE ×25 por encima del umbral y comprobamos que el mult
    // permanente queda en el mismo orden que vendiendo justo en el umbral.
    function multTras5Ventas(overshoot: number): number {
      const s = newGame(0);
      for (let p = 0; p < 5; p++) {
        s.lifetime = prestigeThreshold(s) * overshoot;
        doPrestige(s, p * 1000);
      }
      return prestigeMult(s);
    }
    const justo = multTras5Ventas(1);
    const desbocado = multTras5Ventas(25);
    // Con el bug (rep ∝ overshoot absoluto) esto era ~×20 mayor. Ahora, acotado.
    expect(desbocado).toBeLessThan(justo * 1.5);
  });

  it("prestigiar resetea lonja y racha", () => {
    const s = newGame(0);
    s.lonjaLvl = 4;
    s.combo = { n: 8, t: 2 };
    s.lifetime = C.PRESTIGE_MIN_LIFETIME;
    doPrestige(s, 0);
    expect(s.lonjaLvl).toBe(0);
    expect(s.combo.n).toBe(0);
  });
});
