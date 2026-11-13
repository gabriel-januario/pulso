import type { AggResult, Engine } from '../engine';
import { weekday } from './period';

/* Cálculos do Painel BI. Funções puras sobre o resultado do motor — testadas em tests/dashboard.test.ts. */

export interface WaterfallStep { label: string; value: number; kind: 'total' | 'loss' | 'subtotal' | 'gain'; color: string }

/** Cascata da capacidade fixa até a produção total (minutos). Perdas menores que 1 h são omitidas. */
export function capacityWaterfall(A: AggResult): WaterfallStep[] {
  const T = A.T;
  const steps: WaterfallStep[] = [
    { label: 'Capacidade', value: T.cap, kind: 'total', color: '#1e3a5f' },
    { label: 'Improdutivo', value: T.accountStop, kind: 'loss', color: '#eb6834' },
    { label: 'Manutenção', value: T.accountMaint, kind: 'loss', color: '#6250d6' },
    { label: 'Sem cobertura', value: T.uncovered, kind: 'loss', color: '#b45309' },
    { label: 'Sem programação', value: T.noLoad, kind: 'loss', color: '#475569' },
    { label: 'Sem apontamento', value: T.gap, kind: 'loss', color: '#a3b1c0' },
    { label: 'Produzido', value: T.used, kind: 'subtotal', color: '#2563c9' },
    { label: 'Fora da escala e HE', value: Math.max(0, T.union - T.used), kind: 'gain', color: '#0f9d8a' },
    { label: 'Produção total', value: T.union, kind: 'total', color: '#0e1d2c' },
  ];
  return steps.filter((s) => (s.kind !== 'loss' && s.kind !== 'gain') || s.value >= 60);
}

export interface ParetoItem { code: number | null; name: string; minutes: number; count: number; machines: number; share: number; cumulative: number; vital: boolean }

/** Pareto dos improdutivos por motivo (só paradas ligadas a uma máquina). Acima de 10 motivos, o resto vira "Outros". */
export function stopPareto(A: AggResult, engine: Engine, max = 10): ParetoItem[] {
  const by = new Map<number, { min: number; n: number; mach: Set<string> }>();
  for (const s of A.stops) {
    if (!s.mach) continue;
    const o = by.get(s.oper) ?? { min: 0, n: 0, mach: new Set<string>() };
    o.min += s.mp; o.n++; o.mach.add(s.mach);
    by.set(s.oper, o);
  }
  let rows = [...by.entries()].map(([code, o]) => ({ code: code as number | null, minutes: o.min, count: o.n, machines: o.mach.size })).sort((a, b) => b.minutes - a.minutes);
  const total = rows.reduce((q, r) => q + r.minutes, 0);
  if (!total) return [];
  if (rows.length > max) {
    const rest = rows.slice(max - 1);
    rows = rows.slice(0, max - 1).concat({ code: null, minutes: rest.reduce((q, r) => q + r.minutes, 0), count: rest.reduce((q, r) => q + r.count, 0), machines: 0 });
  }
  let acc = 0;
  const out = rows.map((r) => { acc += r.minutes; return { ...r, name: r.code == null ? 'Outros' : engine.motName(r.code), share: r.minutes / total, cumulative: acc / total, vital: false }; });
  const nVital = Math.max(1, out.findIndex((r) => r.cumulative >= 0.8 - 1e-9) + 1);
  out.forEach((r, i) => { r.vital = i < nVital; });
  return out;
}

export interface OperatorHours { name: string; minutes: number; orders: number; machines: number }

/** Operadores com mais horas produzidas no período (minutos cortados nos limites do período). */
export function topOperators(A: AggResult, engine: Engine, n = 10): OperatorHours[] {
  const by = new Map<string, { min: number; ords: Set<number>; mq: Set<string> }>();
  for (const a of A.list) for (const x of a.recs) {
    const v = Math.max(0, Math.min(A.T_, x.t0 + x.min) - Math.max(A.F, x.t0));
    if (!v) continue;
    const o = by.get(x.op) ?? { min: 0, ords: new Set<number>(), mq: new Set<string>() };
    o.min += v; o.ords.add(x.opn); o.mq.add(a.m.rc);
    by.set(x.op, o);
  }
  return [...by.entries()].map(([op, o]) => ({ name: engine.util.title(op), minutes: o.min, orders: o.ords.size, machines: o.mq.size }))
    .sort((a, b) => b.minutes - a.minutes).slice(0, n);
}

/** Média de máquinas produzindo em cada hora (linhas: seg→dom; colunas: 0h→23h). */
export function hourByWeekday(A: AggResult) {
  const M = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const count = new Array<number>(7).fill(0);
  for (const d of A.days) count[weekday(d)]++;
  const end = Math.min(A.T_, A.cut), wdOf = new Map<number, number>();
  for (const a of A.list) for (const x of a.recs) {
    let s = Math.max(x.t0, A.F);
    const e = Math.min(x.t0 + x.min, end);
    while (s < e) {
      const day = Math.floor(s / 1440), hEnd = Math.min(e, (Math.floor(s / 60) + 1) * 60);
      let w = wdOf.get(day);
      if (w == null) { w = new Date(Date.UTC(1899, 11, 30) + day * 864e5).getUTCDay(); wdOf.set(day, w); }
      M[w][Math.floor((s % 1440) / 60)] += hEnd - s;
      s = hEnd;
    }
  }
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.map((w) => ({ weekday: w, days: count[w], hours: M[w].map((min) => (count[w] ? min / 60 / count[w] : 0)) }));
}

/** Horas extras realizadas por grupo, da maior para a menor. */
export function overtimeByGroup(A: AggResult) {
  return A.G.map((g) => ({ group: g.g, minutes: g.heAp || 0 })).filter((o) => o.minutes > 0).sort((a, b) => b.minutes - a.minutes);
}

export interface MonthPoint { ym: string; cap: number; fixedProd: number; union: number; heAp: number; stop: number; util: number | null }

/** Série mensal a partir de uma agregação de todo o histórico, opcionalmente restrita a algumas máquinas. */
export function monthlySeries(full: AggResult, rcs: string[] | null): MonthPoint[] {
  const list = rcs ? full.list.filter((a) => rcs.includes(a.m.rc)) : full.list;
  const by = new Map<string, MonthPoint>();
  for (const d of full.days) {
    const ym = d.slice(0, 7);
    const o = by.get(ym) ?? { ym, cap: 0, fixedProd: 0, union: 0, heAp: 0, stop: 0, util: null };
    for (const a of list) {
      const b = a.byDay[d];
      if (!b) continue;
      o.cap += b.cap; o.fixedProd += b.fixedProd || 0; o.union += b.union; o.heAp += b.heAp || 0; o.stop += b.stop;
    }
    by.set(ym, o);
  }
  return [...by.values()].map((o) => ({ ...o, util: o.cap > 0 ? o.fixedProd / o.cap : null }));
}

export interface ScatterPoint { rc: string; name: string; group: string; util: number; losses: number; cap: number; gapToTarget: number }

/** Máquinas com ao menos 1 h de capacidade: utilização × perdas apontadas (improdutivo + manutenção oculta) sobre a capacidade. */
export function utilizationVsLosses(A: AggResult, meta: number): ScatterPoint[] {
  return A.list.filter((a) => a.cap >= 60).map((a) => ({
    rc: a.m.rc, name: a.m.name, group: a.grp,
    util: a.util ?? 0, losses: (a.stop + a.ocult) / a.cap, cap: a.cap, gapToTarget: a.cap * meta - a.fixedProd,
  }));
}
