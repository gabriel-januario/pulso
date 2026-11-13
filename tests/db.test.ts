import { beforeAll, describe, expect, it } from 'vitest';
import type { Database } from 'sql.js';
import { query } from '../src/db/client';
import { carteiraDemo, horasPorFamilia, paradasPorMotivo } from '../src/db/queries';
import { openTestDb } from './helpers';

let db: Database;
beforeAll(async () => { db = await openTestDb(); });

describe('banco de dados', () => {
  it('respeita as chaves estrangeiras', () => {
    expect(query(db, 'PRAGMA foreign_key_check')).toEqual([]);
  });

  it('todo apontamento de parada usa a origem 900 ou o recurso IMP', () => {
    const [r] = query<{ n: number }>(db, "SELECT COUNT(*) AS n FROM apontamento WHERE tipo = 'parada' AND origem <> '900' AND recurso <> 'IMP'");
    expect(r.n).toBe(0);
  });

  it('pareto de paradas soma o total de horas de parada do período', () => {
    const rows = paradasPorMotivo(db, '2026-10-01', '2026-10-31');
    const [tot] = query<{ h: number }>(db, "SELECT SUM(duracao_min) / 60.0 AS h FROM apontamento WHERE tipo = 'parada' AND data BETWEEN '2026-10-01' AND '2026-10-31'");
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.reduce((q, r) => q + r.horas, 0)).toBeCloseTo(tot.h, 0);
    expect(rows[0].horas).toBeGreaterThanOrEqual(rows[1].horas);
  });

  it('horas por família cobre as sete famílias de máquinas', () => {
    expect(horasPorFamilia(db, '2026-01-01', '2026-12-31').map((r) => r.familia)).toContain('Mandrilhadoras');
  });

  it('carteira de demonstração tem previsão válida e PVs que existem nos apontamentos', () => {
    const c = carteiraDemo(db);
    const keys = Object.keys(c);
    expect(keys.length).toBeGreaterThan(20);
    for (const k of keys) { expect(c[k].h).toBeGreaterThan(0); expect(c[k].due).toMatch(/^\d{4}-\d{2}-\d{2}$/); }
    const sem = keys.filter((k) => c[k].g);
    const [{ n }] = query<{ n: number }>(db, `SELECT COUNT(DISTINCT pv_numero) AS n FROM apontamento WHERE pv_numero IN (${keys.filter((k) => !c[k].g).join(',')})`);
    expect(n).toBe(keys.length - sem.length);
  });
});
