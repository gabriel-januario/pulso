import { beforeAll, describe, expect, it } from 'vitest';
import { lossSeries, maintenanceSummary, unproductiveSummary } from '../src/analytics/losses';
import type { Engine } from '../src/engine';
import ref from './golden-losses.json';
import { loadTestEngine } from './helpers';

/* Telas Manutenção e Improdutivas: mesmos números da v2.2 (golden-losses.json) em dois períodos. */
let engine: Engine;
beforeAll(async () => { engine = (await loadTestEngine()).engine; });

const PERIODS = { '2026-10-01': '2026-10-31', '2026-01-02': '2026-06-30' } as const;

describe.each(Object.entries(PERIODS))('perdas · %s a %s', (from, to) => {
  const r = ref[from as keyof typeof ref];
  const A = () => engine.agg({ from, to });

  it('manutenção: eventos, MTTR, MTBF e paradas a confirmar', () => {
    const M = maintenanceSummary(engine, A());
    expect(M.n).toBe(r.man.n);
    expect(M.real).toBeCloseTo(r.man.real, 4); expect(M.ap).toBeCloseTo(r.man.ap, 4); expect(M.hidden).toBeCloseTo(r.man.oc, 4);
    expect(M.mttr).toBeCloseTo(r.man.mttr!, 4); expect(M.mtbf).toBeCloseTo(r.man.mtbf!, 4);
    expect(M.openDetected.map((e) => [e.rc, e.t0])).toEqual(r.man.openDet);
    expect(M.suspects.map((s) => s.key)).toEqual(r.man.sus.map((s) => s.key));
    M.suspects.forEach((s, i) => { expect(s.idleInPeriod).toBeCloseTo(r.man.sus[i].idleP, 4); expect(s.mv.rc).toBe(r.man.sus[i].mv); });
    expect(M.suspectMinutes).toBeCloseTo(r.man.susH, 4);
    M.byMachine.forEach((x, i) => { const [rc, real, ap, n, su] = r.man.ml[i]; expect([x.rc, x.n]).toEqual([rc, n]); expect(x.real).toBeCloseTo(real as number, 4); expect(x.ap).toBeCloseTo(ap as number, 4); expect(x.suspect).toBeCloseTo(su as number, 4); });
    M.events.slice(0, 10).forEach((o, i) => { const [rc, t0, end, real, , src, mv] = r.man.evs[i]; expect([o.e.rc, o.e.t0, o.e.end, o.e.src, o.e.mv?.rc ?? null]).toEqual([rc, t0, end, src, mv]); expect(o.real).toBeCloseTo(real as number, 4); });
  });

  it('improdutivos: pareto, categorias, ranking de máquinas e operadores', () => {
    const I = unproductiveSummary(A());
    expect(I.total).toBe(r.imp.tot); expect(I.withoutMachine).toBe(r.imp.noM); expect(I.workDays).toBe(r.imp.nd);
    expect(I.categories).toEqual(r.imp.bc);
    expect(I.reasons.map((o) => [o.code, o.minutes, o.count, o.machines])).toEqual(r.imp.mots);
    expect(I.ranking.length).toBe(r.imp.rank.length);
    I.ranking.forEach((x, i) => {
      const [rc, h, n, imp, man, oc, mots] = r.imp.rank[i] as [string, number, number, number, number, number, [string, number][]];
      expect([x.a.m.rc, x.count]).toEqual([rc, n]);
      expect(x.minutes).toBeCloseTo(h, 4); expect(x.unproductive).toBeCloseTo(imp, 4); expect(x.maintenance).toBeCloseTo(man, 4); expect(x.hidden).toBeCloseTo(oc, 4);
      x.reasons.slice(0, 3).forEach(([c, v], j) => { expect(c).toBe(mots[j][0]); expect(v).toBeCloseTo(mots[j][1], 4); });
    });
    expect(I.operators.map((o) => [o.name, o.minutes, o.count, String(o.reason), o.machine])).toEqual(r.imp.ol.map(([op, min, n, reason, mc]) => [op, min, n, String(reason), mc]));
  });

  it('série de perdas diária ou semanal', () => {
    const S = lossSeries(A());
    expect(S.weekly).toBe(r.series.long);
    expect(S.buckets.map((b) => b.key)).toEqual(r.series.B.map((b) => b[0]));
    S.buckets.forEach((b, i) => { expect(b.stop).toBeCloseTo(r.series.B[i][1] as number, 4); expect(b.manA).toBeCloseTo(r.series.B[i][2] as number, 4); expect(b.ocult).toBeCloseTo(r.series.B[i][4] as number, 4); });
  });
});

describe('quadro de paradas', () => {
  it('uma parada registrada no quadro vira evento de manutenção e reduz a disponibilidade', async () => {
    const e2 = (await loadTestEngine()).engine;
    const before = e2.agg({ from: '2026-10-01', to: '2026-10-31' }).M.TVG1;
    e2.setConfig({ ...e2.config, paradas: [{ id: 't', rc: 'TVG1', ini: '2026-10-13T08:00', fim: '2026-10-14T08:00', tipo: 'Mecânica', obs: '' }] });
    const after = e2.agg({ from: '2026-10-01', to: '2026-10-31' }).M.TVG1;
    expect(after.evs.length).toBeGreaterThan(0);
    expect(after.manR).toBeGreaterThan(before.manR);
    expect(after.accountMaint).toBeGreaterThan(before.accountMaint);
  });

  it('confirmar uma parada provável como manutenção a tira da lista a confirmar', async () => {
    const e2 = (await loadTestEngine()).engine;
    const A = e2.agg({ from: '2026-10-01', to: '2026-10-31' });
    const first = maintenanceSummary(e2, A).suspects[0];
    e2.setConfig({ ...e2.config, evt: { [first.key]: 'm' } });
    const M = maintenanceSummary(e2, e2.agg({ from: '2026-10-01', to: '2026-10-31' }));
    expect(M.suspects.some((s) => s.key === first.key)).toBe(false);
    expect(M.n).toBeGreaterThanOrEqual(maintenanceSummary(engine, engine.agg({ from: '2026-10-01', to: '2026-10-31' })).n);
  });
});
