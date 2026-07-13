/**
 * RNG determinista (mulberry32). La sim nunca usa Math.random:
 * el seed vive en el estado → partidas reproducibles en tests.
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Avanza el seed del estado y devuelve un float [0,1). */
export function nextRand(state: { rngSeed: number }): number {
  // mulberry32 de un paso: genera y actualiza el seed.
  let a = (state.rngSeed + 0x6d2b79f5) | 0;
  state.rngSeed = a >>> 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
