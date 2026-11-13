import { beforeAll, describe, expect, it } from 'vitest';
import { copyMonth, monthCapacity, overtimeDone, overtimeTotal, repeatOverWeeks, shiftCandidates } from '../src/analytics/planning';
import type { Engine, EngineConfig } from '../src/engine';
import ref from './golden-planning.json';
import { loadTestEngine } from './helpers';

/* Calendário fabril e horas extras: mesmos números da v2.2 (golden-planning.json). */
let engine: Engine, base: EngineConfig;
beforeAll(async () => { engine = (await loadTestEngine()).engine; base = structuredClone(engine.config); });
const restore = () => engine.setConfig(structuredClone(base));

describe.each(['2026-09', '2026-10'] as const)('capacidade do mês %s', (ym) => {
  const R = ref[ym];
  it('capacidade fixa, HE e operacional de cada recurso iguais à v2.2', () => {
    const M = monthCapacity(engine, ym);
    expect(M.rows.map((r) => r.m.rc)).toEqual(R.rows.map((r) => r.rc));
    M.rows.forEach((r, i) => {
      const x = R.rows[i];
      expect([r.grp, r.mc.modo, r.mc.sh, r.workDays]).toEqual([x.g, x.modo, x.sh, x.dU]);
      expect(r.fixed).toBeCloseTo(x.n, 6); expect(r.overtime).toBeCloseTo(x.he, 6); expect(r.operational).toBeCloseTo(x.op, 6);
    });
    for (const [d, p] of Object.entries(R.P)) {
      expect(M.perDay[d].fixed, d).toBeCloseTo(p.fixed, 6); expect(M.perDay[d].operational).toBeCloseTo(p.op, 6);
      expect(M.perDay[d].overtime).toBeCloseTo(p.he, 6); expect(M.perDay[d].history).toBeCloseTo(p.hist, 6);
    }
    expect(M.modes).toEqual(R.modes);
  });

  it('HE realizada por recurso e por grupo igual à v2.2', () => {
    const H = overtimeDone(engine, ym);
    expect(H.total).toBeCloseTo(R.he.total, 6);
    expect(H.rows.map((r) => [r.m.rc, r.minutes])).toEqual(R.he.rows);
    expect(H.groups.map((g) => [g.label, g.minutes])).toEqual(R.he.groups);
  });

  it('sugestão de titular do 1º turno igual à v2.2', () => {
    const days = Object.keys(R.P);
    for (const [rc, list] of Object.entries(R.cand)) expect(shiftCandidates(engine, rc, 'T1', days).map((o) => [o.id, o.name, o.days, o.min]), rc).toEqual(list);
  });
});

describe('alterações de planejamento', () => {
  it('HE programada e dia alterado no calendário mudam capacidade e utilização como na v2.2', () => {
    const S = ref.scenario;
    engine.setConfig({ ...engine.config, he: S.he as EngineConfig['he'], cal: S.cal as EngineConfig['cal'] });
    const t1 = overtimeTotal(engine, 't1'), t2 = overtimeTotal(engine, 't2');
    expect([t1.total, t1.machines]).toEqual([S.t1.tot, S.t1.n]);
    expect([t2.total, t2.machines]).toEqual([S.t2.tot, S.t2.n]);
    const T = engine.agg({ from: '2026-10-01', to: '2026-10-31' }).T;
    expect(T.cap).toBeCloseTo(S.T.cap, 6); expect(T.heAp).toBeCloseTo(S.T.heAp, 6);
    expect(T.fixedProd).toBeCloseTo(S.T.fixedProd, 6); expect(T.util!).toBeCloseTo(S.T.util, 12);
    restore();
  });

  it('copiar outubro para dezembro gera o mesmo calendário e a mesma escala da v2.2', () => {
    const C = copyMonth(engine, '2026-10', '2026-12');
    expect([C.days, C.resources]).toEqual([ref.copy.n, ref.copy.m]);
    for (const [d, v] of Object.entries(ref.copy.cal)) expect(C.cal[d], d).toEqual(v);
    expect(C.escala['2026-12']).toEqual(ref.copy.escala);
  });

  it('repetir uma HE preenche as outras semanas do mês sem duplicar', () => {
    engine.setConfig({ ...engine.config, he: [{ id: 'x', ini: '2026-11-09', fim: '2026-11-15', alvo: 'm:MHG1', sem: 5, sab: 4, dom: 0 }] });
    const L = repeatOverWeeks(engine, 'x', '2026-11');
    expect(L.map((h) => [h.ini, h.fim])).toEqual([['2026-11-09', '2026-11-15'], ['2026-11-01', '2026-11-01'], ['2026-11-02', '2026-11-08'], ['2026-11-16', '2026-11-22'], ['2026-11-23', '2026-11-29'], ['2026-11-30', '2026-11-30']]);
    restore();
  });
});
