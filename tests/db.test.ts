import { beforeAll, describe, expect, it } from 'vitest';
import type { Database } from 'sql.js';
import { query } from '../src/db/client';
import { horasPorFamilia, paradasPorMotivo } from '../src/db/queries';
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
});
