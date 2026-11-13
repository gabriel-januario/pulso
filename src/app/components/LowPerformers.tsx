import { lowPerformers } from '../../analytics/resources';
import type { AggResult, Engine } from '../../engine';
import { hours, hours1, pct } from '../format';
import { STATUS_INK } from '../theme';

/**
 * Recursos abaixo da meta. O cartão de cada grupo mostra também a utilização sem as máquinas de destaque:
 * quando a diferença é grande, a média do grupo esconde máquinas com problema.
 */
export function LowPerformers({ A, engine, onPickMachine, onPickGroup }: { A: AggResult; engine: Engine; onPickMachine(rc: string): void; onPickGroup(g: string): void }) {
  const D = lowPerformers(A, engine.config.meta / 100);
  const reason = (c: string) => (c === '__oc' ? 'Manutenção não apontada' : engine.motName(c));
  return (
    <section className="panel">
      <div className="ph"><h2>Recursos com baixo desempenho</h2><span className="meta">abaixo da meta de {engine.config.meta}% · {D.low.length} de {D.active} recursos</span></div>
      <div className="pb">
        <div className="lowsum">
          {D.groups.filter((g) => g.active).map((g) => {
            const top = g.top.slice(0, 2).map((rc) => A.M[rc]);
            return (
              <button type="button" key={g.group} className={g.masked ? 'lowc mask' : 'lowc'} onClick={() => onPickGroup(g.group)}>
                <span className="r1"><b>{g.group}</b>{g.masked && <span className="pill s-warn"><i />Puxado por destaque</span>}</span>
                <span className="r2">
                  <span><em>Grupo</em><strong style={{ color: STATUS_INK[engine.status(g.util).k] }}>{pct(g.util)}</strong></span>
                  {g.top.length > 0 && g.low.length > 0 && <span><em>Sem destaque</em><strong style={{ color: STATUS_INK[engine.status(g.utilWithoutTop).k] }}>{pct(g.utilWithoutTop)}</strong></span>}
                  <span><em>Abaixo da meta</em><strong>{g.low.length}<small>/{g.active}</small></strong></span>
                </span>
                {g.top.length > 0 && g.low.length > 0 && <span className="r3">Destaque: {top.map((a, i) => <span key={a.m.rc}>{i ? '; ' : ''}<b>{a.m.name}</b> {pct(a.util)}</span>)}</span>}
              </button>
            );
          })}
        </div>
        {D.low.length ? (
          <div className="tw">
            <table className="t lowt">
              <thead><tr><th>Máquina</th><th className="n">Utilização</th><th className="n">Capacidade h</th><th className="n">Produzido h</th><th className="n">Falta p/ meta h</th><th className="n">Improd. h</th><th className="n">Sem apont. h</th><th>Principal perda</th><th>Principais paradas</th></tr></thead>
              <tbody>
                {D.low.map(({ a, missing, mainLoss, reasons }) => (
                  <tr key={a.m.rc} className="clk" onClick={() => onPickMachine(a.m.rc)}>
                    <td className="mn"><b>{a.m.name}</b><small>{a.m.rc} · {a.grp}</small></td>
                    <td className="n"><span className={`pill s-${engine.status(a.util).k}`}><i />{pct(a.util)}</span></td>
                    <td className="n">{hours(a.cap)}</td><td className="n">{hours(a.union)}</td><td className="n"><b>{hours1(missing)}</b></td>
                    <td className="n">{hours1(a.stop)}</td><td className="n">{hours1(a.gap)}</td><td>{mainLoss}</td>
                    <td><div className="mots">{reasons.map(([c, v]) => <span key={c} className={c === '__oc' || engine.motCat(c) === 'man' ? 'm' : undefined} title={`${reason(c)} · ${hours1(v)} h`}><em>{reason(c)}</em> {hours1(v)} h</span>)}{!reasons.length && '—'}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">{D.active ? 'Todos os recursos com escala estão na meta.' : 'Valide a escala para avaliar a meta.'}</p>}
      </div>
    </section>
  );
}
