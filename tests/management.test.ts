import { beforeAll, describe, expect, it } from 'vitest';
import { dataQuality, operators, portfolio, simulate, weeklyLoad, type Scenario } from '../src/analytics/management';
import type { CartEntry, Engine, EngineConfig } from '../src/engine';
import ref from './golden-management.json';
import { loadTestEngine } from './helpers';

/* Telas de gestão: mesmos números da v2.2 (golden-management.json). */
let engine: Engine;
beforeAll(async () => { engine = (await loadTestEngine()).engine; });

describe('carteira e prazos', () => {
  const full = (e: Engine) => e.agg({ from: e.util.s2iso(e.dataset.minPd), to: e.util.s2iso(e.dataset.maxPd) });

  it('consolida intervalos por PV e recurso, preserva máquinas paralelas e recorta os últimos 14 dias', () => {
    const first = engine.dataset.prod[0];
    const other = Object.keys(engine.dataset.machines).find((rc) => rc !== first.rc)!;
    const cutoff = engine.dataset.lastT - 14 * 1440;
    const prod = [
      { ...first, ped: 100, t0: cutoff - 30, min: 60 },
      { ...first, ped: 100, t0: cutoff, min: 60 },
      { ...first, ped: 100, t0: cutoff, min: 60, rc: other },
      { ...first, ped: 101, t0: cutoff, min: 60 },
    ];
    const fixture = { ...engine, dataset: { ...engine.dataset, prod } };
    const rows = portfolio(fixture, { '100': { h: 2 }, '101': { h: 2, done: true } });
    expect(rows.find((r) => r.ped === '100')).toMatchObject({ machined: 150, recent: 120, status: 'review', done: false, remaining: 0, finish: null });
    expect(rows.find((r) => r.ped === '101')).toMatchObject({ machined: 60, status: 'ok', done: true });
  });

  it('usa a escala futura sem o corte histórico e respeita folga, inatividade e sábado convocado', async () => {
    const { engine: e } = await loadTestEngine();
    const rc = Object.keys(e.dataset.machines)[0];
    const weekday = '2026-11-03', saturday = '2026-11-07', ym = '2026-11';
    const group = e.grpOf(rc);
    const modes = (mode: 'fixo' | 'inativo'): EngineConfig['escala'] => ({
      [ym]: Object.fromEntries(Object.keys(e.dataset.machines).map((k): [string, EngineConfig['escala'][string][string]] => [
        k, { modo: k === rc ? mode : 'inativo', obs: '', turnos: k === rc ? { T1: '' } : {} },
      ])),
    });
    e.setConfig({ ...e.config, escala: modes('fixo'), cal: {
      '2026-11-02': { t: 'fer', sh: [] }, [weekday]: { t: 'folga', sh: [] },
      [saturday]: { t: 'util', sh: ['T1'] },
    } });
    expect(e.capParts(rc, saturday).n).toBe(0);
    expect(e.capParts(rc, saturday, true).op).toBe(480);
    const rows = portfolio(e, { '888888': { h: 4, due: saturday, g: group } });
    const week = weeklyLoad(e, full(e), rows).find((w) => w.from === '2026-11-02')!;
    expect(week.cap[group]).toBe(4 * 480);
    expect(week.load[group]).toBe(240);
    e.setConfig({ ...e.config, escala: modes('inativo') });
    expect(weeklyLoad(e, full(e), rows).find((w) => w.from === week.from)?.cap[group]).toBe(0);
  });

  it('usa média histórica para escala pendente e ignora data de entrega inválida', () => {
    const A = full(engine);
    const rows = portfolio(engine, ref.pv.cart as Record<string, CartEntry>);
    const groups = weeklyLoad(engine, A, rows);
    expect(groups).toHaveLength(8);
    expect(groups.some((w) => Object.values(w.cap).some((c) => c > 0))).toBe(true);
    const invalid = portfolio(engine, { '888888': { h: 10, due: '2026-11-31' } }).find((r) => r.ped === '888888')!;
    expect(invalid.due).toBeNull();
    expect(weeklyLoad(engine, A, [invalid]).every((w) => !w.orders.length)).toBe(true);
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
