import type { ParadaMotivo } from '../../db/queries';

/** Pareto de paradas — vem direto de uma consulta SQL ao banco (src/db/queries.ts). */
export function StopsPareto({ rows }: { rows: ParadaMotivo[] }) {
  if (!rows.length) return <p className="empty">Nenhuma parada apontada no período.</p>;
  const total = rows.reduce((q, r) => q + r.horas, 0), max = rows[0].horas, top = rows.slice(0, 8);
  let acc = 0;
  return (
    <div className="hb">
      {top.map((r) => {
        acc += r.horas;
        return (
          <div key={r.motivo} className="hbrow">
            <span className="nm">{r.motivo}<small>{r.categoria}</small></span>
            <span className="br"><b style={{ width: `${(r.horas / max) * 100}%`, background: r.categoria === 'Manutenção' ? '#6250d6' : '#eb6834' }} /></span>
            <span className="vl"><strong>{r.horas.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} h</strong> · {Math.round((acc / total) * 100)}% acum.</span>
          </div>
        );
      })}
    </div>
  );
}
