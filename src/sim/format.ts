/** Formato de números grandes: 1.2K, 3.4M… Nunca NaN/Infinity al usuario. */

const SUFFIXES = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

export function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return "0"; // jamás NaN/Infinity en pantalla
  if (n < 0) n = 0;
  if (n < 1000) return Math.floor(n).toString();

  let tier = Math.floor(Math.log10(n) / 3);
  if (tier >= SUFFIXES.length) {
    // Más allá de los sufijos: notación científica segura.
    return n.toExponential(2).replace("+", "");
  }
  const scaled = n / Math.pow(10, tier * 3);
  // 3 cifras significativas: 1.23K, 12.3K, 123K
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  let s = scaled.toFixed(digits);
  // 999.95 → "1000.0K" feo; renormaliza.
  if (parseFloat(s) >= 1000 && tier + 1 < SUFFIXES.length) {
    tier += 1;
    s = (scaled / 1000).toFixed(2);
  }
  return s + SUFFIXES[tier];
}

/** Duración corta: 45s, 3m 20s, 2h 5m. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
