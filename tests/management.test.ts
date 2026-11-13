import { beforeAll, describe, expect, it } from 'vitest';
import { dataQuality, operators, portfolio, simulate, weeklyLoad, type Scenario } from '../src/analytics/management';
import type { CartEntry, Engine } from '../src/engine';
import ref from './golden-management.json';
import { loadTestEngine } from './helpers';

/* Telas de gestão: mesmos números da v2.2 (golden-management.json). */
let engine: Engine;
beforeAll(async () => { engine = (await loadTestEngine()).engine; });

describe('carteira e prazos', () => {
  it('status, término previsto e grupos de cada PV iguais à v2.2', () => {
    const rows = portfolio(engine, ref.pv.cart as Record<string, CartEntry>);
    expect(rows.map((r) => r.ped)).toEqual(ref.pv.rows.map((r) => r.ped));
    rows.forEach((r, i) => {
      const x = ref.pv.rows[i];
      expect([r.machined, r.recent, r.planned, r.done, r.remaining, r.finish, r.status, r.due, r.manual, r.orders]).toEqual([x.min, x.r14, x.plan, x.done, x.rem, x.fin, x.st, x.due, x.manual, x.ops]);
      expect(r.pace).toBeCloseTo(x.pace, 9);
      r.groups.forEach(([g, f], j) => { expect(g).toBe(x.gs[j][0]); expect(f).toBeCloseTo(x.gs[j][1] as number, 9); });
    });
  });

  it('carga das próximas 8 semanas igual à v2.2', () => {
    const full = engine.agg({ from: engine.util.s2iso(engine.dataset.minPd), to: engine.util.s2iso(engine.dataset.maxPd) });
    const W = weeklyLoad(engine, full, portfolio(engine, ref.pv.cart as Record<string, CartEntry>));
    expect(W.map((w) => w.from)).toEqual(ref.pv.W.map((w) => w.d0));
    W.forEach((w, i) => {
      const x = ref.pv.W[i];
      expect(w.orders).toEqual(x.pvs);
      for (const [g, v] of Object.entries(x.load)) expect(w.load[g], `load ${g}`).toBeCloseTo(v as number, 4);
      for (const [g, v] of Object.entries(x.cap)) expect(w.cap[g], `cap ${g}`).toBeCloseTo(v as number, 4);
    });
  });
});

describe('simulador', () => {
  it('cenário com redução de perdas e turno extra igual à v2.2', () => {
    const A = engine.agg({ from: '2026-10-01', to: '2026-10-31' });
    const s = ref.sim.scenario;
    const S: Scenario = { cat: s.cat, man: s.man, gap: s.gap, shift: s.shift, machines: s.mach, days: s.dias as 5 | 6 };
    const R = simulate(engine, A, S);
    expect(R.days).toBe(ref.sim.nd);
    for (const k of ['cap', 'imp', 'man', 'gap', 'addCap', 'addProd', 'u1', 'cap2', 'u2', 'gain', 'perDay'] as const) expect(R.T[k], k).toBeCloseTo(ref.sim.T[k], 6);
    expect(R.rows.map((r) => r.a.m.rc)).toEqual(ref.sim.R.map((r) => r.rc));
    R.rows.forEach((r, i) => expect(r.gain).toBeCloseTo(ref.sim.R[i].gain, 6));
  });

  it('cenário vazio não muda nada', () => {
    const A = engine.agg({ from: '2026-10-01', to: '2026-10-31' });
    const R = simulate(engine, A, { cat: {}, man: 0, gap: 0, shift: 'T3', machines: [], days: 5 });
    expect(R.T.gain).toBe(0);
    expect(R.T.u2).toBeCloseTo(R.T.u1!, 12);
  });
});

describe('operadores e qualidade do apontamento', () => {
  it('horas, ocorrências e índice por operador iguais à v2.2', () => {
    const O = operators(engine, engine.agg({ from: '2026-10-01', to: '2026-10-31' }));
    expect(O.map((o) => o.name)).toEqual(ref.opr.map((o) => o.op));
    O.forEach((o, i) => {
      const x = ref.opr[i];
      expect([o.prod, o.imp, o.unclassified, o.n, o.stops, o.manual, o.long, o.longMin, o.overlap, o.orders.size, o.machines.size, o.score, o.issues.length])
        .toEqual([x.prod, x.imp, x.nc, x.n, x.ns, x.man, x.lng, x.lngMin, x.ovl, x.ords, x.mq, x.score, x.iss]);
      expect(o.overlapMin).toBeCloseTo(x.ovlMin, 6);
    });
  });

  it('índice de qualidade geral, por máquina e semanal igual à v2.2', () => {
    const Q = dataQuality(engine, engine.agg({ from: '2026-10-01', to: '2026-10-31' }));
    expect(Q.score).toBe(ref.qual.score);
    for (const [k, v] of Object.entries(ref.qual.P0)) expect(Q.pillars[k as keyof typeof Q.pillars], k).toBeCloseTo(v, 9);
    expect(Q.weeks.map((w) => [w.week, w.score])).toEqual(ref.qual.WK.map((w) => [w.k, w.s]));
    Q.machines.forEach((m, i) => { const x = ref.qual.M[i]; expect([m.a.m.rc, m.score, m.manual, m.n, m.longMin]).toEqual([x.rc, x.score, x.man, x.n, x.lngMin]); expect(m.gap).toBeCloseTo(x.gap, 6); });
  });
});
