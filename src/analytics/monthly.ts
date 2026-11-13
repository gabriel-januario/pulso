import type { AggResult, Engine } from '../engine';
import { lastDayOfMonth } from './period';

/* Análise mensal: agrega mês a mês, para toda a usinagem ou um grupo. Testada contra a v2.2 em tests/views.test.ts. */

const FIELDS = ['cap', 'union', 'fixedProd', 'heHist', 'heAp', 'capHE', 'stop', 'manR', 'manA', 'ocult', 'gap', 'used', 'accountStop', 'accountMaint', 'uncovered', 'noLoad', 'outside'] as const;
type Field = (typeof FIELDS)[number];

export type MonthTotals = Record<Field, number> & {
  ords: Set<number>;
  /** improdutivo sem a parte apontada como manutenção */
  imp: number;
  /** manutenção: o maior entre o tempo real parado e o apontado */
  man: number;
  util: number | null;
  machines: number; active: number;
};
const zero = (): MonthTotals => ({ ...Object.fromEntries(FIELDS.map((k) => [k, 0])), ords: new Set<number>(), imp: 0, man: 0, util: null, machines: 0, active: 0 }) as MonthTotals;
const add = (T: MonthTotals, t: Record<string, unknown> & { ords: Set<number> }) => { for (const k of FIELDS) T[k] += (t[k] as number) || 0; t.ords.forEach((o) => T.ords.add(o)); };
const close = (T: MonthTotals) => { T.imp = Math.max(0, T.stop - T.manA); T.man = Math.max(T.manR, T.manA); T.util = T.cap > 0 ? T.fixedProd / T.cap : null; return T; };

export interface MonthData { ym: string; A: AggResult; ok: boolean; t: MonthTotals }
export interface MachineMonths { rc: string; name: string; cap: number; fixedProd: number; union: number; he: number; util: number | null }
export interface GroupMonths { group: string; machines: number; cap: number; fixedProd: number; union: number; heAp: number; imp: number; man: number; util: number | null; detail: MachineMonths[] }

export function totalsFor(A: AggResult, grp: string): MonthTotals {
  const L = grp === 'all' ? A.list : A.list.filter((a) => a.grp === grp);
  const T = zero();
  T.machines = L.length;
  for (const a of L) { add(T, a as unknown as Record<string, unknown> & { ords: Set<number> }); if (a.n) T.active++; }
  return close(T);
}

/** Meses disponíveis (AAAA-MM) na base, em ordem. */
export function availableMonths(engine: Engine): string[] {
  const { s2iso } = engine.util, out: string[] = [];
  const hi = s2iso(engine.dataset.maxPd).slice(0, 7);
  let ym = s2iso(engine.dataset.minPd).slice(0, 7);
  while (ym <= hi) { out.push(ym); const [y, m] = ym.split('-').map(Number); ym = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; }
  return out;
}

/**
 * Agrega os meses escolhidos. Um mês só entra na capacidade dos grupos se tiver escala validada (`ok`).
 * `aggMonth` permite reaproveitar agregações já calculadas (cache).
 */
export function monthlyAnalysis(engine: Engine, months: string[], grp: string, aggMonth?: (ym: string) => AggResult) {
  const lo = engine.util.s2iso(engine.dataset.minPd), hi = engine.util.s2iso(engine.dataset.maxPd);
  const get = aggMonth ?? ((ym: string) => {
    const f = `${ym}-01` < lo ? lo : `${ym}-01`, t = lastDayOfMonth(ym) > hi ? hi : lastDayOfMonth(ym);
    return engine.agg({ from: f, to: t, grp: 'all' });
  });
  const rosterModes = engine.rosterModes;
  const data: MonthData[] = months.map((ym) => { const A = get(ym), ok = rosterModes(ym).valid > 0; return { ym, A, ok, t: totalsFor(A, grp) }; });
  const T = zero();
  for (const m of data) add(T, m.t);
  close(T);

  const present = new Set(data.flatMap((m) => m.A.G.map((g) => g.g)));
  const order = engine.constants.GRP_ORDER.concat([...present].filter((g) => !engine.constants.GRP_ORDER.includes(g))).filter((g) => present.has(g));
  const groups: GroupMonths[] = order.map((g) => {
    const o: GroupMonths = { group: g, machines: 0, cap: 0, fixedProd: 0, union: 0, heAp: 0, imp: 0, man: 0, util: null, detail: [] };
    const mm = new Map<string, MachineMonths>();
    for (const m of data) {
      const p = totalsFor(m.A, g);
      o.union += p.union; o.heAp += p.heAp; o.imp += p.imp; o.man += p.man; o.machines = Math.max(o.machines, p.machines);
      if (m.ok) { o.cap += p.cap; o.fixedProd += p.fixedProd; }
      for (const a of m.A.list) {
        if (a.grp !== g) continue;
        const x = mm.get(a.m.rc) ?? { rc: a.m.rc, name: a.m.name, cap: 0, fixedProd: 0, union: 0, he: 0, util: null };
        x.union += a.union; x.he += a.heAp;
        if (m.ok) { x.cap += a.cap; x.fixedProd += a.fixedProd; }
        mm.set(a.m.rc, x);
      }
    }
    o.util = o.cap > 0 ? o.fixedProd / o.cap : null;
    o.detail = [...mm.values()].map((x) => ({ ...x, util: x.cap > 0 ? x.fixedProd / x.cap : null })).sort((a, b) => (b.util ?? -1) - (a.util ?? -1));
    return o;
  });
  return { months: data, T, groups };
}
