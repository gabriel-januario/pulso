import type { CapacityWindow } from '../types';

/* Aritmética de intervalos [início, fim) em minutos absolutos. */
export type Interval = [number, number];

/** ordena e une intervalos que se tocam; descarta intervalos vazios */
export function mergedIntervals(L: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const [a, b] of L.slice().sort((x, y) => x[0] - y[0])) {
    if (b <= a) continue;
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** partes de [a, b) fora dos intervalos L (L ordenado e sem sobreposição) */
export function outsideIntervals(a: number, b: number, L: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const [s, e] of L) {
    if (e <= a) continue;
    if (s >= b) break;
    if (s > a) out.push([a, s]);
    a = Math.max(a, e);
  }
  if (a < b) out.push([a, b]);
  return out;
}

/** minutos de L dentro das janelas W */
export function intervalMinutes(L: Interval[], W: { a: number; b: number }[]): number {
  const windows = mergedIntervals(W.map((w) => [w.a, w.b]));
  let min = 0;
  for (const [a, b] of L) for (const [s, e] of windows) min += Math.max(0, Math.min(b, e) - Math.max(a, s));
  return min;
}

/** capacidade líquida das janelas dentro de [start, end), proporcional ao trecho de cada janela */
export function windowMinutes(W: CapacityWindow[], end = Infinity, start = -Infinity): number {
  return W.reduce((q, w) => q + (Math.max(0, Math.min(w.b, end) - Math.max(w.a, start)) * w.c) / (w.b - w.a), 0);
}

export const spanOf = (L: Interval[]) => L.reduce((q, [s, e]) => q + e - s, 0);
