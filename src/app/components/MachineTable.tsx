import type { Engine, MachineAgg } from '../../engine';
import { hours1, int, pct } from '../format';

export function MachineTable({ list, engine }: { list: MachineAgg[]; engine: Engine }) {
  const rows = [...list].sort((a, b) => (b.util ?? -1) - (a.util ?? -1));
  return (
    <div className="tw">
      <table className="t">
        <thead>
          <tr>
            <th>Recurso</th><th>Grupo</th><th className="n">Capacidade h</th><th className="n">Produzido h</th>
            <th className="n">Hora extra h</th><th className="n">Improdutivo h</th><th className="n">Sem apont. h</th><th className="n">OPs</th><th>Utilização</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const st = engine.status(a.util);
            return (
              <tr key={a.m.rc}>
                <td><b>{a.m.name}</b> <span className="code">{a.m.rc}</span></td>
                <td>{a.grp}</td>
                <td className="n">{hours1(a.cap)}</td>
                <td className="n">{hours1(a.union)}</td>
                <td className="n">{a.heAp > 0 ? hours1(a.heAp) : '—'}</td>
                <td className="n">{a.stop > 0 ? hours1(a.stop) : '—'}</td>
                <td className="n">{a.cap > 0 ? hours1(a.gap) : '—'}</td>
                <td className="n">{int(a.ords.size)}</td>
                <td><span className={`pill s-${st.k}`}><i />{a.util == null ? st.t : pct(a.util)}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
