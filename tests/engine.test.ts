import { beforeAll, describe, expect, it } from 'vitest';
import type { Engine, Measures } from '../src/engine';
import golden from './golden.json';
import { loadTestEngine } from './helpers';

/* Valores de referência capturados do PULSO v2.2 (arquivo único) com a configuração padrão.
   O motor extraído precisa reproduzir exatamente os mesmos números. */
const KEYS: (keyof Measures)[] = ['cap', 'capHE', 'prod', 'union', 'fixedProd', 'heAp', 'stop', 'manR', 'manA', 'used', 'accountStop', 'accountMaint', 'uncovered', 'noLoad', 'gap'];

let engine: Engine;
beforeAll(async () => { engine = (await loadTestEngine()).engine; });

describe('base de dados → motor', () => {
  it('carrega todos os apontamentos e as máquinas de usinagem', () => {
    expect(engine.dataset.nAll).toBe(30331);
    expect(Object.keys(engine.dataset.machines).length).toBe(46);
    expect(engine.util.s2iso(engine.dataset.minPd)).toBe('2026-01-02');
  });
});

describe.each(golden.casos)('indicadores · $from a $to · $grp', (c) => {
  const run = () => engine.agg({ from: c.from, to: c.to, grp: c.grp });

  it('totais iguais ao v2.2', () => {
    const A = run();
    for (const k of KEYS) expect(A.T[k], k).toBeCloseTo(c.T[k], 2);
    expect(A.T.util).toBeCloseTo(c.T.util, 9);
    if (c.T.disp == null) expect(A.T.disp).toBeNull(); else expect(A.T.disp).toBeCloseTo(c.T.disp, 9);
    expect(A.T.ords.size).toBe(c.T.ords);
    expect(A.T.active).toBe(c.T.active);
    expect(A.workDays).toBe(c.workDays);
    expect(engine.status(A.T.util).k).toBe(c.status);
  });

  it('cada máquina igual ao v2.2', () => {
    const A = run();
    expect(A.list.map((a) => a.m.rc).sort()).toEqual(Object.keys(c.M).sort());
    for (const a of A.list) {
      const ref = c.M[a.m.rc as keyof typeof c.M] as Record<string, number | string | null>;
      for (const k of KEYS) expect(a[k], `${a.m.rc}.${k}`).toBeCloseTo(ref[k] as number, 2);
      if (ref.util == null) expect(a.util).toBeNull(); else expect(a.util).toBeCloseTo(ref.util as number, 9);
      expect(a.grp).toBe(ref.grp);
    }
  });

  it('grupos e evolução diária iguais ao v2.2', () => {
    const A = run();
    expect(A.G.map((g) => g.g)).toEqual(c.G.map((g) => g.g));
    A.G.forEach((g, i) => { expect(g.cap).toBeCloseTo(c.G[i].cap, 2); expect(g.fixedProd).toBeCloseTo(c.G[i].fixedProd, 2); });
    expect(A.dayT.length).toBe(c.dayT.length);
    A.dayT.forEach((d, i) => {
      expect(d.d).toBe(c.dayT[i].d);
      expect(d.cap).toBeCloseTo(c.dayT[i].cap, 2);
      expect(d.fixedProd).toBeCloseTo(c.dayT[i].fixedProd, 2);
      expect(d.heAp).toBeCloseTo(c.dayT[i].heAp, 2);
    });
  });
});

describe('regras de negócio', () => {
  it('a capacidade fixa se divide exatamente entre os destinos', () => {
    const A = engine.agg({ from: '2026-10-01', to: '2026-10-31' });
    const destinos = A.T.used + A.T.accountStop + A.T.accountMaint + A.T.uncovered + A.T.noLoad + A.T.gap;
    expect(destinos).toBeCloseTo(A.T.cap, 3);
  });

  it('utilização = produção dentro da capacidade fixa ÷ capacidade fixa', () => {
    const A = engine.agg({ from: '2026-10-01', to: '2026-10-31' });
    expect(A.T.util).toBeCloseTo(A.T.fixedProd / A.T.cap, 12);
    for (const a of A.list) if (a.cap > 0) expect(a.util).toBeCloseTo(a.fixedProd / a.cap, 12);
  });

  it('classifica a utilização pela meta (85%) e pelo alerta (65%)', () => {
    expect(engine.status(0.9).k).toBe('good');
    expect(engine.status(0.7).k).toBe('warn');
    expect(engine.status(0.5).k).toBe('crit');
    expect(engine.status(null).k).toBe('none');
  });

  it('instâncias são independentes (sem estado global)', async () => {
    const other = (await loadTestEngine()).engine;
    other.setConfig({ meta: 50 });
    expect(other.status(0.6).k).toBe('good');
    expect(engine.status(0.6).k).toBe('crit');
  });
});
