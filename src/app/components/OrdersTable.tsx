import { useMemo, useState } from 'react';
import { ordersOf } from '../../analytics/resources';
import type { Engine, ProdRecord } from '../../engine';
import { downloadCsv } from '../csv';
import { dm, hours1, int, pct } from '../format';

/** OPs apontadas, com busca por OP, PV ou operador e exportação para CSV. */
export function OrdersTable({ recs, engine, filename, maxHeight = 460 }: { recs: ProdRecord[]; engine: Engine; filename: string; maxHeight?: number }) {
  const [q, setQ] = useState('');
  const { rows, total } = useMemo(() => ordersOf(recs), [recs]);
  const { s2iso } = engine.util, day = (t: number) => dm(s2iso(Math.floor(t / 1440)));
  const term = q.trim().toLowerCase();
  const shown = term ? rows.filter((o) => `${o.opn} ${o.ped} ${o.operators.join(' ')}`.toLowerCase().includes(term)) : rows;
  const max = rows[0]?.minutes || 1;
  const csv = () => downloadCsv(filename, ['OP', 'PV', 'Item', 'Origem', 'Operações', 'Operadores', 'Início', 'Fim', 'Apontamentos', 'Horas'],
    rows.map((o) => [o.opn, o.ped, o.item, o.org, o.operations.join(' '), o.operators.map(engine.util.title).join(', '), engine.util.fmtDT(o.t0), engine.util.fmtDT(o.t1), o.count, o.minutes / 60]));
  return (
    <>
      <div className="toolbar">
        <span className="meta">{int(rows.length)} OPs · {hours1(total)} h</span>
        <input className="search" type="search" placeholder="Buscar OP, PV ou operador" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar OP, PV ou operador" />
        <button type="button" className="btn" onClick={csv}>Exportar CSV</button>
      </div>
      <div className="tw" style={{ maxHeight }}>
        <table className="t">
          <thead><tr><th>OP</th><th>PV / item</th><th>Origem</th><th>Operações</th><th>Operadores</th><th>Período</th><th className="n">Apont.</th><th className="n">Horas</th><th className="n">%</th></tr></thead>
          <tbody>
            {shown.map((o) => (
              <tr key={o.opn}>
                <td><b>{o.opn}</b></td><td>{o.ped}/{o.item}</td><td><span className="tag">{o.org}</span></td><td>{o.operations.join(', ')}</td>
                <td className="ops" title={o.operators.map(engine.util.title).join(', ')}>{o.operators.map(engine.util.shortNm).join(', ')}</td>
                <td className="nw">{day(o.t0)} – {day(o.t1)}</td><td className="n">{o.count}</td>
                <td className="n"><span className="mb" style={{ width: Math.round((o.minutes / max) * 46) }} /><b>{hours1(o.minutes)}</b></td>
                <td className="n">{pct(o.minutes / (total || 1))}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={9} className="empty">{rows.length ? 'Nenhuma OP encontrada.' : 'Sem apontamentos no período.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
