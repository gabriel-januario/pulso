import type { AggResult, DayTotals, GroupAgg, MachineAgg, Measures, Totals } from '../engine';

const SUM_KEYS = ['prod', 'union', 'cap', 'capP', 'capN', 'capHE', 'heAp', 'stop', 'manR', 'manA', 'ocult', 'n', 'heHist', 'fixedProd',
  'operCap', 'operProd', 'outside', 'uncovered', 'noLoad', 'used', 'accountStop', 'accountMaint', 'conflict', 'gap'] as const;
const DAY_KEYS = ['prod', 'union', 'stop', 'cap', 'capP', 'capHE', 'heAp', 'manR', 'manA', 'fixedProd', 'gap', 'accountMaint',
  'accountStop', 'used', 'uncovered', 'noLoad', 'outside'] as const;

type Bag = Record<string, number>;
const num = (o: unknown, k: string) => ((o as Bag)[k] ?? 0) || 0;

/**
 * Recorta uma agregação para um conjunto de máquinas (filtro cruzado do Painel BI).
 * Totais, grupos e dias são somados de novo só com as máquinas escolhidas.
 */
export function restrictToMachines(A: AggResult, rcs: string[] | null): AggResult {
  if (!rcs) return A;
  const keep = new Set(rcs);
  const list = A.list.filter((a) => keep.has(a.m.rc));

  const T = { ords: new Set<number>(), peds: new Set<number>(), active: 0 } as unknown as Totals & Bag;
  for (const k of SUM_KEYS) T[k] = 0;
  for (const a of list) {
    for (const k of SUM_KEYS) T[k] += num(a, k);
    a.ords.forEach((o) => T.ords.add(o));
    if (a.n > 0) T.active++;
  }
  T.util = T.cap > 0 ? T.fixedProd / T.cap : null;
  T.disp = T.cap > 0 && list.some((a) => a.disp != null) ? Math.max(0, 1 - T.accountMaint / T.cap) : null;

  const dayT = A.days.map((d) => {
    const o = { d } as unknown as DayTotals & Bag;
    for (const k of DAY_KEYS) o[k] = list.reduce((q, a) => q + num(a.byDay[d], k), 0);
    return o;
  });

  const byGroup = new Map<string, GroupAgg & Bag>();
  for (const a of list) {
    let g = byGroup.get(a.grp);
    if (!g) {
      g = { g: a.grp, list: [] as MachineAgg[], ords: new Set<number>() } as unknown as GroupAgg & Bag;
      for (const k of SUM_KEYS) g[k] = 0;
      byGroup.set(a.grp, g);
    }
    g.list.push(a);
    a.ords.forEach((o) => g!.ords.add(o));
    for (const k of SUM_KEYS) g[k] += num(a, k);
  }
  const G = A.G.map((g) => byGroup.get(g.g)).filter((g): g is GroupAgg & Bag => !!g);
  for (const g of G) g.util = g.cap > 0 ? g.fixedProd / g.cap : null;

  return {
    ...A, list, T, dayT, G,
    M: Object.fromEntries(list.map((a) => [a.m.rc, a])),
    stops: A.stops.filter((s) => s.mach != null && keep.has(s.mach)),
  };
}

/** Soma de um indicador no período para um subconjunto (útil para totais de grupo no período anterior). */
export function sumOf(list: Measures[], key: keyof Measures) {
  return list.reduce((q, a) => q + (a[key] || 0), 0);
}
