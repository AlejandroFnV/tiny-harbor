# Tiny Harbor

Simulador idle/tycoon de puerto pesquero. Heredas un puerto decadente y lo conviertes en un puerto próspero: los barcos zarpan y vuelven solos, tú cobras la carga, compras flota, desbloqueas caladeros y acabas vendiendo el puerto por reputación permanente.

## Correr

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # tests de sim + bot headless 8h
npm run build      # dist/ estático (Vercel-ready)
```

Modo dev: `http://localhost:5173/?dev=1` expone `window.TH` (`setTimeScale(n)`, `skipMinutes(n)`, `give(n)`, `wipe()`).

## Arquitectura (10 líneas)

1. `src/sim/` — simulación **pura**: sin DOM, sin `Date.now`, sin `Math.random` (RNG con seed en el estado). Testeable al 100%.
2. `src/sim/config.ts` — **todo el balance** en un archivo: costes, ciclos, zonas, eventos, prestigio, caps.
3. `src/sim/sim.ts` — `tick(state, dt)` avanza el mundo y devuelve `SimEvent[]`; las acciones del jugador validan y nunca dejan dinero negativo.
4. `src/sim/save.ts` — save versionado con cadena de migraciones + `sanitize()` (un save corrupto jamás rompe la partida); localStorage tolerante a fallos (incógnito).
5. `src/render/` — pixel art: sprites en mapas de caracteres (`sprites.ts`), canvas offscreen a resolución de arte escalado entero (píxel perfecto). Lee el estado, no lo muta. Partículas con pooling fijo (320, cero alloc/frame).
6. `src/ui/` — overlay DOM (contador, hoja de pestañas, misiones, modales) + tutorial jugable de 5 pasos con dedo-guía.
7. `src/audio/` — WebAudio 100% procedural (olas, gaviotas, SFX), desbloqueado en el primer gesto.
8. `src/main.ts` — game loop rAF con delta time troceado (`MAX_TICK_STEP_S`): la sim no depende del framerate; autosave 10s + `visibilitychange`.
9. Offline: `applyOffline()` paga la tasa media (cap 4h ampliable, techo 12h) y protege contra reloj hacia atrás.
10. Tests en `test/`: fórmulas, offline, prestigio, migraciones y **bot headless de 8h** que verifica sin-NaN/sin-negativos/sin-softlock + pacing (primera compra <60s, primer prestigio 20–50 min).

## Tunear balance

Solo `src/sim/config.ts`. Los tests de pacing (`test/headless.test.ts`) validan la curva; si cambias números gordos, `npm test`.
