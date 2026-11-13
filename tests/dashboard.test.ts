import { beforeAll, describe, expect, it } from 'vitest';
import { restrictToMachines } from '../src/analytics/crossfilter';
import { capacityWaterfall, hourByWeekday, monthlySeries, overtimeByGroup, stopPareto, topOperators, utilizationVsLosses } from '../src/analytics/dashboard';
import { previousPeriod } from '../src/analytics/period';
import type { AggResult, Engine } from '../src/engine';
import ref from './golden-crossfilter.json';
import { loadTestEngine } from './helpers';

let engine: Engine;
let A: AggResult;
beforeAll(async () => {
  engine = (await loadTestEngine()).engine;
  A = engine.agg({ from: '2026-10-01', to: '2026-10-31' });
});

describe('filtro cruzado por máquina (igual à v2.2)', () => {
  it('soma totais, grupos e dias só das máquinas escolhidas', () => {
    const S = restrictToMachines(A, ref.rcs);
    for (const k of ['cap', 'fixedProd', 'union', 'stop', 'gap', 'heAp'] as const) expect(S.T[k], k).toBeCloseTo(ref.T[k], 4);
    expect(S.T.util).toBeCloseTo(ref.T.util, 9);
    expect(S.T.disp).toBeCloseTo(ref.T.disp, 9);
    expect(S.T.ords.size).toBe(ref.T.ords);
    expect(S.T.active).toBe(ref.T.active);
    expect(S.G.map((g) => g.g)).toEqual(ref.G.map((g) => g.g));
    S.G.forEach((g, i) => expect(g.cap).toBeCloseTo(ref.G[i].cap, 4));
    S.dayT.forEach((d, i) => { expect(d.d).toBe(ref.dayT[i].d); expect(d.fixedProd).toBeCloseTo(ref.dayT[i].fixedProd, 4); });
    expect(S.stops.length).toBe(ref.stops);
  });

  it('sem filtro devolve a própria agregação', () => {
    expect(restrictToMachines(A, null)).toBe(A);
  });
});

describe('período de comparação (igual à v2.2)', () => {
  it.each(ref.prev)('$from a $to', ({ from, to, r }) => {
    const p = previousPeriod({ from, to }, '2026-01-02');
    if (!r) expect(p).toBeNull();
    else expect(p).toEqual({ from: r.from, to: r.to, label: r.lbl });
  });
});

describe('visuais do Painel BI', () => {
  it('a cascata fecha: capacidade − perdas = produzido; produzido + extra = produção total', () => {
    const W = capacityWaterfall(A);
    const get = (l: string) => W.find((s) => s.label === l)?.value ?? 0;
    const losses = W.filter((s) => s.kind === 'loss').reduce((q, s) => q + s.value, 0);
    const smallLosses = A.T.cap - get('Produzido') - losses;
    expect(smallLosses).toBeGreaterThanOrEqual(-1e-6);
    expect(smallLosses).toBeLessThan(60 * 5);
    expect(get('Produção total')).toBeCloseTo(A.T.union, 6);
  });

  it('pareto: participações somam 100% e os motivos vitais cobrem 80%', () => {
    const P = stopPareto(A, engine);
    expect(P.length).toBeGreaterThan(3);
    expect(P.length).toBeLessThanOrEqual(10);
    expect(P.at(-1)!.cumulative).toBeCloseTo(1, 9);
    expect(P.reduce((q, r) => q + r.share, 0)).toBeCloseTo(1, 9);
    const vital = P.filter((r) => r.vital);
    expect(vital.at(-1)!.cumulative).toBeGreaterThanOrEqual(0.8 - 1e-9);
    if (vital.length > 1) expect(vital.at(-2)!.cumulative).toBeLessThan(0.8);
    const machineStops = A.stops.filter((s) => s.mach).reduce((q, s) => q + s.mp, 0);
    expect(P.reduce((q, r) => q + r.minutes, 0)).toBeCloseTo(machineStops, 6);
  });

  it('top operadores em ordem decrescente e limitados a 10', () => {
    const L = topOperators(A, engine);
    expect(L.length).toBe(10);
    for (let i = 1; i < L.length; i++) expect(L[i - 1].minutes).toBeGreaterThanOrEqual(L[i].minutes);
  });

  it('hora × dia da semana distribui todas as horas apontadas no período', () => {
    const H = hourByWeekday(A);
    const total = H.reduce((q, r) => q + r.hours.reduce((s, h) => s + h, 0) * r.days * 60, 0);
    const end = Math.min(A.T_, A.cut);
    const expected = A.list.reduce((q, a) => q + a.recs.reduce((s, x) => s + Math.max(0, Math.min(end, x.t0 + x.min) - Math.max(A.F, x.t0)), 0), 0);
    expect(total).toBeCloseTo(expected, 3);
    expect(H.map((r) => r.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it('série mensal soma a capacidade de todo o histórico', () => {
    const full = engine.agg({ from: '2026-01-02', to: '2026-10-31' });
    const S = monthlySeries(full, null);
    expect(S.map((m) => m.ym)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(S.reduce((q, m) => q + m.cap, 0)).toBeCloseTo(full.T.cap, 3);
    expect(S.at(-1)!.util).toBeCloseTo(A.T.util!, 9);
  });

  it('horas extras por grupo e dispersão usam as mesmas máquinas da agregação', () => {
    expect(overtimeByGroup(A).reduce((q, g) => q + g.minutes, 0)).toBeCloseTo(A.T.heAp, 6);
    const pts = utilizationVsLosses(A, 0.85);
    expect(pts.every((p) => A.M[p.rc] && p.cap >= 60)).toBe(true);
  });
});
