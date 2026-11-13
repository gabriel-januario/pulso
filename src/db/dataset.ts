import type { Database } from 'sql.js';
import type { RawDataset, RawRow } from '../engine/types';
import { query } from './client';

const EPOCH = Date.UTC(1899, 11, 30);
const toSerial = (iso: string) => Math.round((Date.parse(iso + 'T00:00:00Z') - EPOCH) / 864e5);
const toMinutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/** Lê o banco e monta a base compacta que o motor de indicadores consome. */
export function loadRawDataset(db: Database): RawDataset {
  const [empresa] = query<{ nome: string; fonte: string }>(db, 'SELECT nome, fonte FROM empresa LIMIT 1');
  const operadores = query<{ nome: string; minutos_total: number }>(db, 'SELECT nome, minutos_total FROM operador ORDER BY id');
  const recursos = query<{ codigo: string; nome: string; cr: string }>(db, 'SELECT codigo, nome, cr FROM recurso ORDER BY rowid');
  const usuarios = query<{ login: string }>(db, 'SELECT login FROM usuario ORDER BY id');
  const idx = new Map(recursos.map((r, i) => [r.codigo, i]));

  const rows: RawRow[] = [];
  const stmt = db.prepare(
    `SELECT data, inicio, duracao_min, operador_id, chapa, origem, op_numero, pv_numero, item, operacao, recurso, centro_custo, usuario_id
       FROM apontamento ORDER BY id`,
  );
  try {
    while (stmt.step()) {
      const r = stmt.get() as [string, string, number, number, number, string, number, number, number, number, string, number, number];
      rows.push([toSerial(r[0]), toMinutes(r[1]), r[2], r[3], r[4] ?? 0, r[5], r[6], r[7], r[8], r[9], idx.get(r[10])!, r[11] ?? 0, r[12] ?? 0]);
    }
  } finally {
    stmt.free();
  }

  return {
    meta: { empresa: empresa?.nome ?? '', fonte: empresa?.fonte ?? '' },
    ops: operadores.map((o) => o.nome),
    opTot: operadores.map((o) => o.minutos_total),
    res: recursos.map((r) => [r.codigo, r.nome, r.cr]),
    users: usuarios.map((u) => u.login),
    rows,
  };
}
