import { beforeAll, describe, expect, it } from 'vitest';
import { monthlyAnalysis } from '../src/analytics/monthly';
import { lowPerformers, machineDays, ordersOf, resourceTimeline, salesOrders } from '../src/analytics/resources';
import type { AggResult, Engine } from '../src/engine';
import ref from './golden-views.json';
import { loadTestEngine } from './helpers';

/* Telas Máquinas, Grupos, Linha do tempo e Análise mensal: mesmos números da v2.2 (golden-views.json). */
let engine: Engine;
let A: AggResult;
beforeAll(async () => {
  engine = (await loadTestEngine()).engine;
  A = engine.agg({ from: '2026-10-01', to: '2026-10-31' });
});

describe('recursos com baixo desempenho', () => {
  it('mesmo diagnóstico por grupo e mesma lista da v2.2', () => {
    const D = lowPerformers(A, engine.config.meta / 100);
    expect(D.active).toBe(ref.low.nAct);
    D.groups.forEach((g, i) => {
      const r = ref.low.groups[i];
      expect(g.group).toBe(r.g); expect(g.active).toBe(r.act); expect(g.top).toEqual(r.top); expect(g.low).toEqual(r.low); expect(g.masked).toBe(r.masked);
      if (r.uEx == null) expect(g.utilWithoutTop).toBeNull(); else expect(g.utilWithoutTop).toBeCloseTo(r.uEx, 9);
    });
    expect(D.low.map((x) => x.a.m.rc)).toEqual(ref.low.low.map((x) => x.rc));
    D.low.forEach((x, i) => {
      const r = ref.low.low[i];
      expect(x.missing).toBeCloseTo(r.falta, 6); expect(x.mainLoss).toBe(r.perda);
      x.reasons.forEach(([c, v], j) => { expect(c).toBe(r.mots[j][0]); expect(v).toBeCloseTo(r.mots[j][1] as number, 6); });
    });
  });
});

describe('pedidos (PV) e OPs', () => {
  it('ranking de PV igual à v2.2', () => {
    const P = salesOrders(A);
    expect(P.rows.length).toBe(ref.pv.n); expect(P.total).toBe(ref.pv.tot); expect(P.orders).toBe(ref.pv.nOps);
    P.rows.slice(0, 15).forEach((o, i) => {
      const r = ref.pv.top[i];
      expect([o.ped, o.minutes, o.count, o.orders, o.items]).toEqual([r.ped, r.min, r.n, r.ops, r.items]);
      expect(o.machines.slice(0, 3)).toEqual(r.top);
    });
  });

  it('tabela de OPs de uma máquina igual à v2.2', () => {
    const O = ordersOf(A.M.MHMC.recs);
    expect(O.rows.length).toBe(ref.opt.n); expect(O.total).toBe(ref.opt.tot);
    O.rows.slice(0, 10).forEach((o, i) => {
      const r = ref.opt.top[i];
      expect([o.opn, o.minutes, o.count, o.operators.length, o.t0, o.t1]).toEqual([r.opn, r.min, r.n, r.ops, r.t0, r.t1]);
      expect(o.operations).toEqual(r.oper);
    });
  });
});

describe('linha do tempo', () => {
  it('cada dia da máquina tem os apontamentos que caem nele, recortados em 0–1440 min', () => {
    const a = A.M.MHMC, rows = machineDays(engine, a, A.days);
    expect(rows.length).toBe(31);
    for (const r of rows) for (const b of r.blocks) { expect(b.s).toBeGreaterThanOrEqual(0); expect(b.e).toBeLessThanOrEqual(1440); expect(b.e).toBeGreaterThan(b.s); }
    const inside = rows.reduce((q, r) => q + r.blocks.filter((b) => b.kind === 'prod').reduce((s, b) => s + b.e - b.s, 0), 0);
    const clipped = a.recs.reduce((q, x) => q + Math.max(0, Math.min(A.T_, x.t0 + x.min) - Math.max(A.F, x.t0)), 0);
    expect(inside).toBeCloseTo(clipped, 6);
  });

  it('a visão de recursos traz uma linha por máquina, ordenada por grupo', () => {
    const p0 = engine.util.iso2s('2026-10-06'), sub = engine.agg({ from: '2026-10-06', to: '2026-10-06' });
    const rows = resourceTimeline(engine, sub, p0, 1);
    expect(rows.length).toBe(sub.list.length);
    expect(new Set(rows.map((r) => r.rc)).size).toBe(rows.length);
  });
});

describe('análise mensal (igual à v2.2)', () => {
  const pick = (t: Record<string, unknown>) => ({ cap: t.cap, union: t.union, fixedProd: t.fixedProd, heAp: t.heAp, imp: t.imp, gap: t.gap });

  it('toda a usinagem, jul a out', () => {
    const M = monthlyAnalysis(engine, ['2026-07', '2026-08', '2026-09', '2026-10'], 'all');
    M.months.forEach((m, i) => { expect(m.ym).toBe(ref.bi.months[i].ym); expect(m.ok).toBe(ref.bi.months[i].ok); });
    for (const [k, v] of Object.entries(pick(ref.bi.T))) expect(M.T[k as 'cap'], k).toBeCloseTo(v as number, 4);
    expect(M.T.man).toBeCloseTo(ref.bi.T.man, 4); expect(M.T.util).toBeCloseTo(ref.bi.T.util, 9); expect(M.T.ords.size).toBe(ref.bi.T.ords);
    M.groups.forEach((g, i) => {
      const r = ref.bi.groups[i];
      expect(g.group).toBe(r.g); expect(g.machines).toBe(r.nM); expect(g.union).toBeCloseTo(r.union, 4); expect(g.cap).toBeCloseTo(r.cap, 4);
      expect(g.detail.map((x) => x.rc)).toEqual(r.mach.map((x) => x.rc));
    });
  });

  it('um grupo, mês a mês', () => {
    const M = monthlyAnalysis(engine, ['2026-07', '2026-08', '2026-09', '2026-10'], 'Tornos verticais');
    for (const [k, v] of Object.entries(pick(ref.big.T))) expect(M.T[k as 'cap'], k).toBeCloseTo(v as number, 4);
    M.months.forEach((m, i) => expect(m.t.fixedProd).toBeCloseTo(ref.big.months[i].fixedProd, 4));
  });
});
