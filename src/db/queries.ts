import type { CartEntry } from '../engine';
import type { Database } from 'sql.js';
import { query } from './client';

export interface ParadaMotivo { motivo: string; categoria: string; horas: number; apontamentos: number }
export interface HorasFamilia { familia: string; horas: number; maquinas: number }

/** Pareto de paradas por motivo dentro de um período (datas AAAA-MM-DD, inclusive). */
export function paradasPorMotivo(db: Database, from: string, to: string): ParadaMotivo[] {
  return query<ParadaMotivo>(
    db,
    `SELECT COALESCE(m.descricao, 'Cód. ' || a.operacao) AS motivo,
            COALESCE(c.nome, 'Não classificado')        AS categoria,
            ROUND(SUM(a.duracao_min) / 60.0, 1)         AS horas,
            COUNT(*)                                    AS apontamentos
       FROM apontamento a
       LEFT JOIN motivo_parada m    ON m.codigo = a.operacao
       LEFT JOIN categoria_parada c ON c.codigo = m.categoria
      WHERE a.tipo = 'parada' AND a.data BETWEEN ? AND ?
      GROUP BY 1, 2
      ORDER BY SUM(a.duracao_min) DESC`,
    [from, to],
  );
}

/** Horas produtivas por família de máquina (somente centros de usinagem). */
export function horasPorFamilia(db: Database, from: string, to: string): HorasFamilia[] {
  return query<HorasFamilia>(
    db,
    `SELECT r.familia                           AS familia,
            ROUND(SUM(a.duracao_min) / 60.0, 1) AS horas,
            COUNT(DISTINCT a.recurso)           AS maquinas
       FROM apontamento a
       JOIN recurso r        ON r.codigo = a.recurso
       JOIN centro_recurso c ON c.cr = r.cr AND c.usinagem = 1
      WHERE a.tipo = 'producao' AND a.data BETWEEN ? AND ?
      GROUP BY r.familia
      ORDER BY SUM(a.duracao_min) DESC`,
    [from, to],
  );
}

/** Carteira de demonstração gravada na base (horas previstas e entrega por PV). As edições do usuário ficam por cima. */
export function carteiraDemo(db: Database): Record<string, CartEntry> {
  const out: Record<string, CartEntry> = {};
  for (const r of query<{ pv_numero: number; horas_previstas: number; entrega: string; grupo: string | null }>(db, 'SELECT pv_numero, horas_previstas, entrega, grupo FROM carteira_pv ORDER BY pv_numero')) {
    out[String(r.pv_numero)] = { h: r.horas_previstas, due: r.entrega, ...(r.grupo ? { g: r.grupo } : {}) };
  }
  return out;
}
