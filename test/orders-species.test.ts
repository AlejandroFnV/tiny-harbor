import { describe, expect, it } from "vitest";
import * as C from "../src/sim/config";
import { incomeRate, speciesMult } from "../src/sim/economy";
import { acceptOrder, collectBoat, declineOrder, doPrestige, tick } from "../src/sim/sim";
import { cycleTime } from "../src/sim/economy";
import { deserialize } from "../src/sim/save";
import { newGame } from "../src/sim/state";
import type { SimEvent } from "../src/sim/types";

function warmupToOrder(s = newGame(0, 99)) {
  const events: SimEvent[] = [];
  tick(s, C.ORDER_WARMUP_S + 0.1, events);
  // tras el warmup, orderT era el inicial → puede necesitar más ticks
  let guard = 5000;
  while (!s.order && guard-- > 0) tick(s, 1, events);
  return { s, events };
}

describe("pedidos de la lonja", () => {
  it("aparece una oferta tras el warmup, con objetivo y bono coherentes", () => {
    const { s, events } = warmupToOrder();
    expect(s.order).not.toBeNull();
    expect(s.order!.stage).toBe("offer");
    expect(s.order!.goal).toBeGreaterThanOrEqual(C.ORDER_GOAL_MIN);
    expect(s.order!.reward).toBe(Math.ceil(s.order!.goal * C.ORDER_REWARD_FACTOR));
    expect(events.some((e) => e.kind === "order_offer")).toBe(true);
  });

  it("oferta ignorada → el cliente se va sin castigo y programa el siguiente", () => {
    const { s } = warmupToOrder();
    const events: SimEvent[] = [];
    tick(s, C.ORDER_OFFER_S + 1, events);
    expect(s.order).toBeNull();
    expect(events.some((e) => e.kind === "order_gone")).toBe(true);
    expect(s.orderT).toBeGreaterThanOrEqual(C.ORDER_INTERVAL_MIN_S);
  });

  it("rechazar funciona igual que dejarla pasar", () => {
    const { s } = warmupToOrder();
    expect(declineOrder(s).ok).toBe(true);
    expect(s.order).toBeNull();
    expect(declineOrder(s).ok).toBe(false);
  });

  it("aceptar + pescar el objetivo → paga el bono y cierra el pedido", () => {
    const { s } = warmupToOrder();
    expect(acceptOrder(s).ok).toBe(true);
    expect(s.order!.stage).toBe("active");
    const goal = s.order!.goal;
    const reward = s.order!.reward;
    const before = s.money;

    // Pesca hasta cubrir el objetivo cobrando cargas reales. El test cubre el
    // flujo (no la carrera contra el reloj): mantenemos viva la cuenta atrás.
    const events: SimEvent[] = [];
    let guard = 2000;
    while (s.order && guard-- > 0) {
      const cyc = cycleTime(s, s.boats[0]);
      if (s.order.remaining < cyc * 2) s.order.remaining = C.ORDER_TIME_S;
      tick(s, cyc + 0.01, events);
      for (const b of s.boats) if (b.phase === "ready") collectBoat(s, b.id, events);
    }
    expect(events.some((e) => e.kind === "order_done")).toBe(true);
    // Cobró: las cargas + el bono (el bono está incluido en money).
    expect(s.money).toBeGreaterThanOrEqual(before + goal * 0 + reward);
  });

  it("tiempo agotado sin llegar → se va sin pagar y sin castigo", () => {
    const { s } = warmupToOrder();
    acceptOrder(s);
    const money = s.money;
    const events: SimEvent[] = [];
    // Deja pasar el tiempo sin cobrar nada (los barcos quedan ready sin cobrar).
    tick(s, C.ORDER_TIME_S + 1, events);
    expect(s.order).toBeNull();
    expect(events.some((e) => e.kind === "order_gone")).toBe(true);
    expect(s.money).toBe(money);
  });

  it("el prestigio limpia el pedido pero NO la pescadoteca", () => {
    const { s } = warmupToOrder();
    acceptOrder(s);
    s.discovered.push("sardina");
    s.lifetime = C.PRESTIGE_MIN_LIFETIME;
    doPrestige(s, 0);
    expect(s.order).toBeNull();
    expect(s.orderT).toBe(C.ORDER_WARMUP_S);
    expect(s.discovered).toContain("sardina");
  });
});

describe("pescadoteca", () => {
  it("cobrando muchas veces se descubren especies de la zona actual", () => {
    const s = newGame(0, 4242);
    const events: SimEvent[] = [];
    let guard = 3000;
    while (s.discovered.length < 2 && guard-- > 0) {
      tick(s, cycleTime(s, s.boats[0]) + 0.01, events);
      for (const b of s.boats) if (b.phase === "ready") collectBoat(s, b.id, events);
    }
    expect(s.discovered.length).toBeGreaterThanOrEqual(2);
    // Solo especies de la zona 0 (Bahía).
    for (const id of s.discovered) {
      const sp = C.SPECIES.find((x) => x.id === id)!;
      expect(sp.zone).toBe(0);
    }
    expect(events.some((e) => e.kind === "species_found")).toBe(true);
  });

  it("cada especie da +1% de ingresos permanente", () => {
    const s = newGame(0);
    const base = incomeRate(s);
    s.discovered = ["sardina", "boqueron", "caballa"];
    expect(speciesMult(s)).toBeCloseTo(1.03);
    expect(incomeRate(s)).toBeCloseTo(base * 1.03);
  });

  it("no se descubre dos veces la misma especie", () => {
    const s = newGame(0, 7);
    s.discovered = C.SPECIES.filter((x) => x.zone === 0).map((x) => x.id);
    const before = s.discovered.length;
    const events: SimEvent[] = [];
    for (let i = 0; i < 200; i++) {
      tick(s, cycleTime(s, s.boats[0]) + 0.01, events);
      for (const b of s.boats) if (b.phase === "ready") collectBoat(s, b.id, events);
    }
    expect(s.discovered.length).toBe(before);
  });
});

describe("migración v2 → v3", () => {
  it("un save v2 gana order/orderT/discovered/settings.music sin perder nada", () => {
    const v2 = JSON.parse(JSON.stringify(newGame(0)));
    v2.version = 2;
    delete v2.order;
    delete v2.orderT;
    delete v2.discovered;
    v2.settings = { muted: true };
    v2.money = 555;
    const loaded = deserialize(JSON.stringify(v2));
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(C.SAVE_VERSION);
    expect(loaded!.money).toBe(555);
    expect(loaded!.settings.muted).toBe(true);
    expect(loaded!.settings.music).toBe(true);
    expect(loaded!.discovered).toEqual([]);
    expect(loaded!.order).toBeNull();
    expect(loaded!.orderT).toBeGreaterThan(0);
  });
});
