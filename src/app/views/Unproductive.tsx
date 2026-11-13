import { useMemo } from 'react';
import { lossSeries, unproductiveSummary } from '../../analytics/losses';
import { HBars } from '../charts/HBars';
import { StackedColumns } from '../charts/StackedColumns';
import { KpiCard } from '../components/KpiCard';
import { dec1, hours, hours1, int, pct, WEEKDAY } from '../format';
import { SERIES } from '../theme';
import type { ViewProps } from './types';

/** Improdutivas: pareto de motivos, categorias, máquinas mais afetadas, evolução e operadores. */
export function Unproductive({ pulso, filters }: ViewProps) {
  const { engine } = pulso;
  const { range, grp } = filters.state;
  const A = useMemo(() => engine.agg({ ...range, grp }), [engine, range, grp]);
  const I = useMemo(() => unproductiveSummary(A), [A]);
  const S = useMemo(() => lossSeries(A), [A]);
  const cats = Object.fromEntries(engine.constants.CATS);
  const label = (c: string) => (c === '__oc' ? 'Manutenção não apontada' : engine.motName(c));
  const isMan = (c: string) => c === '__oc' || engine.motCat(c) === 'man';
  const first = I.reasons[0];
  const openMachine = (rc: string) => { filters.set({ machine: rc }); location.hash = `#/maquinas?${location.hash.split('?')[1] ?? ''}`; };
  let acc = 0;

  return (
    <>
      <section className="kpis" aria-label="Indicadores de improdutivos">
        <KpiCard hero label="Improdutivo apontado" value={hours(I.total)} unit="h" sub={`${pct(A.T.cap ? I.total / A.T.cap : null)} da capacidade${I.withoutMachine > 0 ? ` · ${hours(I.withoutMachine)} h sem máquina` : ''}`} />
        <KpiCard label="Média por dia útil" value={dec1(I.total / I.workDays / 60)} unit="h" color={SERIES.stop} sub={`${I.workDays} dias com turno`} />
        <KpiCard label="Manutenção apontada" value={hours(I.categories.man ?? 0)} unit="h" color={SERIES.maint} sub={`${pct(I.total ? (I.categories.man ?? 0) / I.total : null)} dos improdutivos`} />
        <KpiCard label="Não classificado" value={hours(I.categories.nc ?? 0)} unit="h" color="#94a3b8" sub="motivo sem categoria" />
        <KpiCard label="Sem apontamento" value={hours(A.T.gap)} unit="h" color="#b9c6d6" sub="capacidade sem registro" />
        <KpiCard label="Principal motivo" value={first ? engine.motName(first.code) : '—'} text sub={first ? `${hours1(first.minutes)} h · ${pct(first.minutes / I.total)}` : undefined} />
      </section>

      {!I.stops.length ? <section className="panel"><p className="empty pad">Nenhum improdutivo no período.</p></section> : (
        <>
          <div className="grid-r">
            <section className="panel">
              <div className="ph"><h2>Pareto de motivos</h2><span className="meta">em negrito, os motivos que somam 80% das horas</span></div>
              <div className="pb tw" style={{ maxHeight: 460 }}>
                <table className="t">
                  <thead><tr><th>Motivo</th><th>Categoria</th><th className="barc" /><th className="n">Horas</th><th className="n">%</th><th className="n">% acum.</th><th className="n">Ocorr.</th><th className="n">Máq.</th></tr></thead>
                  <tbody>
                    {I.reasons.map((o) => {
                      const before = acc / I.total; acc += o.minutes; const c = engine.motCat(o.code);
                      return (
                        <tr key={o.code}>
                          <td><b>{engine.motName(o.code)}</b> <span className="code">{o.code}</span></td>
                          <td><span className={c === 'man' ? 'tag man' : 'tag'}>{cats[c] ?? c}</span></td>
                          <td className="barc"><span className="mb" style={{ width: `${(o.minutes / first.minutes) * 100}%`, background: c === 'man' ? SERIES.maint : SERIES.stop }} /></td>
                          <td className="n">{hours1(o.minutes)}</td><td className="n">{pct(o.minutes / I.total)}</td>
                          <td className="n" style={before < 0.8 ? { fontWeight: 700 } : { color: 'var(--ink-3)' }}>{pct(acc / I.total)}</td>
                          <td className="n">{int(o.count)}</td><td className="n">{o.machines}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="panel">
              <div className="ph"><h2>Por categoria</h2></div>
              <div className="pb">
                <HBars max={Math.max(1, ...Object.values(I.categories))} valueWidth={120} items={Object.entries(I.categories).sort((a, b) => b[1] - a[1]).map(([c, v]) => ({
                  key: c, label: cats[c] ?? c, segs: [{ v, color: c === 'man' ? SERIES.maint : c === 'nc' ? '#94a3b8' : SERIES.stop }],
                  value: <><strong>{hours1(v)}</strong> h · {pct(v / I.total)}</>,
                }))} />
              </div>
            </section>
          </div>

          <section className="panel">
            <div className="ph"><h2>Máquinas mais afetadas por paradas</h2><span className="meta">improdutivo + manutenção (apontada e não apontada)</span></div>
            <div className="pb tw" style={{ maxHeight: 560 }}>
              <table className="t lowt">
                <thead><tr><th className="n">#</th><th>Máquina</th><th className="barc" /><th className="n">Horas paradas</th><th className="n">% da capac.</th><th className="n">Ocorr.</th><th>Principais paradas</th><th className="n">Utilização</th></tr></thead>
                <tbody>
                  {I.ranking.map((r, i) => {
                    const max = I.ranking[0].minutes;
                    return (
                      <tr key={r.a.m.rc} className="clk" onClick={() => openMachine(r.a.m.rc)}>
                        <td className="n code">{i + 1}</td>
                        <td className="mn"><b>{r.a.m.name}</b><small>{r.a.m.rc} · {r.a.grp}</small></td>
                        <td className="barc nw"><span className="mb" style={{ width: `${(r.unproductive / max) * 100}%`, background: SERIES.stop, marginRight: 0 }} /><span className="mb" style={{ width: `${((r.maintenance + r.hidden) / max) * 100}%`, background: SERIES.maint }} /></td>
                        <td className="n"><b>{hours1(r.minutes)}</b></td><td className="n">{pct(r.a.cap ? r.minutes / r.a.cap : null)}</td><td className="n">{r.count}</td>
                        <td><div className="mots">{r.reasons.slice(0, 3).map(([c, v]) => <span key={c} className={isMan(c) ? 'm' : undefined} title={`${label(c)} · ${hours1(v)} h`}><em>{label(c)}</em> {hours1(v)} h</span>)}</div></td>
                        <td className="n">{pct(r.a.util)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid2">
            <section className="panel">
              <div className="ph"><h2>Evolução {S.weekly ? 'semanal' : 'diária'}</h2></div>
              <div className="pb">
                <StackedColumns series={[{ key: 'imp', label: 'Improdutivo', color: SERIES.stop }, { key: 'man', label: 'Manutenção apontada', color: SERIES.maint }]}
                  points={S.buckets.map((b) => ({ key: b.key, label: S.weekly ? b.label : b.label.slice(0, 2), sub: b.sub,
                    title: S.weekly ? `Semana de ${b.label}` : `${WEEKDAY[new Date(b.from + 'T12:00:00Z').getUTCDay()]} ${b.label}`, values: [Math.max(0, b.stop - b.manA), b.manA] }))} />
              </div>
            </section>
            <section className="panel">
              <div className="ph"><h2>Por operador</h2><span className="meta">20 maiores</span></div>
              <div className="pb tw" style={{ maxHeight: 440 }}>
                <table className="t">
                  <thead><tr><th>Operador</th><th className="n">Horas</th><th className="n">Ocorr.</th><th>Principal motivo</th><th>Máquina</th></tr></thead>
                  <tbody>
                    {I.operators.map((o) => (
                      <tr key={o.name}><td>{engine.util.title(o.name)}</td><td className="n"><b>{hours1(o.minutes)}</b></td><td className="n">{o.count}</td><td>{engine.motName(o.reason)}</td><td>{o.machine ? engine.dataset.machines[o.machine]?.name ?? o.machine : '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}
