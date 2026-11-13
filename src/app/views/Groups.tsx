import { useMemo, useState } from 'react';
import { HBars } from '../charts/HBars';
import { TrendChart } from '../charts/TrendChart';
import { KpiRow } from '../components/KpiRow';
import { LowPerformers } from '../components/LowPerformers';
import type { Filters } from '../filters';
import { dmy, hours, hours1, int, pct, WEEKDAY } from '../format';
import { groupColor, SERIES, STATUS_BAR, STATUS_INK } from '../theme';
import type { Pulso } from '../usePulso';

const DEST = [['used', 'Produção', SERIES.produced], ['accountStop', 'Improdutivo', SERIES.stop], ['accountMaint', 'Manutenção', SERIES.maint],
  ['uncovered', 'Sem cobertura', '#b45309'], ['noLoad', 'Sem programação', '#475569'], ['gap', 'Sem apontamento', '#b9c6d6']] as const;

/** Grupos de máquinas: compara famílias, abre uma delas e mostra quem puxa o resultado para baixo. */
export function Groups({ pulso, filters }: { pulso: Pulso; filters: Filters }) {
  const { engine } = pulso;
  const { range } = filters.state;
  const A = useMemo(() => engine.agg({ ...range, grp: 'all' }), [engine, range]);
  const [sel, setSel] = useState<string | null>(filters.state.grp !== 'all' ? filters.state.grp : null);
  const g = A.G.find((x) => x.g === sel) ?? A.G[0];
  if (!g) return <section className="panel"><p className="empty pad">Sem máquinas no período.</p></section>;

  const meta = engine.config.meta / 100;
  const L = [...g.list].sort((x, y) => (y.util ?? -1) - (x.util ?? -1));
  const disp = g.cap > 0 && g.accountMaint > 0 ? Math.max(0, 1 - g.accountMaint / g.cap) : null;
  const active = g.list.filter((a) => a.n).length;
  const openMachine = (rc: string) => { filters.set({ machine: rc }); location.hash = `#/maquinas?${location.hash.split('?')[1] ?? ''}`; };
  const max = Math.max(1, ...L.map((a) => Math.max(a.cap, a.union)));

  return (
    <>
      <section className="gcards" aria-label="Grupos" style={{ '--n': A.G.length } as React.CSSProperties}>
        {A.G.map((x) => {
          const st = engine.status(x.util).k;
          return (
            <button type="button" key={x.g} className="gcard" aria-pressed={x.g === g.g} onClick={() => setSel(x.g)}>
              <span className="gn"><i style={{ background: groupColor(x.g) }} />{x.g}</span>
              <span className="gu" style={{ color: STATUS_INK[st] }}>{pct(x.util)}</span>
              <span className="gs"><span>{hours(x.fixedProd)} / {hours(x.cap)} h</span><span>{x.list.length} máq.</span></span>
              <span className="gm"><b style={{ width: `${Math.min(100, (x.util ?? 0) * 100)}%`, background: STATUS_BAR[st] }} /><i style={{ left: `${meta * 100}%` }} /></span>
            </button>
          );
        })}
      </section>

      <KpiRow T={{ ...g, disp }} engine={engine} activity={`${active} de ${g.list.length} ${g.list.length === 1 ? 'máquina ativa' : 'máquinas ativas'}`} />

      <div className="grid2">
        <section className="panel">
          <div className="ph"><h2>Capacidade × produzido</h2><span className="meta">trilho = capacidade · traço = meta</span></div>
          <div className="pb">
            <HBars max={max} valueWidth={130} items={L.map((a) => ({
              key: a.m.rc, label: a.m.name, sub: a.m.rc, track: a.cap, target: a.cap * meta, onClick: () => openMachine(a.m.rc),
              segs: [{ v: a.union - a.heAp, color: SERIES.produced }, { v: a.heAp, color: SERIES.overtime }],
              value: a.cap > 0 ? <><strong>{pct(a.util)}</strong> · {hours(a.fixedProd)}/{hours(a.cap)} h</> : <>sem turno · {hours(a.union)} h</>,
              tip: { title: a.m.name, rows: [{ label: 'Capacidade', value: `${hours1(a.cap)} h`, color: '#e8eef5' }, { label: 'Produzido', value: `${hours1(a.union)} h`, color: SERIES.produced }, { label: 'Hora extra', value: `${hours1(a.heAp)} h`, color: SERIES.overtime }], note: 'Clique para abrir a máquina' },
            }))} />
          </div>
        </section>
        <section className="panel">
          <div className="ph"><h2>Uso da capacidade fixa por máquina</h2><span className="meta">rateio das horas líquidas de turno</span></div>
          <div className="pb">
            <HBars max={Math.max(1, ...L.map((a) => a.cap))} valueWidth={64} items={L.filter((a) => a.cap > 0).map((a) => ({
              key: a.m.rc, label: a.m.name, sub: a.m.rc, onClick: () => openMachine(a.m.rc),
              segs: DEST.map(([k, , c]) => ({ v: a[k], color: c })), value: `${hours(a.cap)} h`,
              tip: { title: a.m.name, rows: DEST.map(([k, l, c]) => ({ label: l, value: `${hours1(a[k])} h`, color: c })) },
            }))} />
            <div className="legend">{DEST.map(([k, l, c]) => <span key={k}><i style={{ background: c }} />{l}</span>)}</div>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="ph"><h2>Evolução diária · {g.g}</h2></div>
        <div className="pb">
          <TrendChart engine={engine} points={A.days.map((d) => {
            const s = { cap: 0, fixedProd: 0, union: 0, heAp: 0, stop: 0 };
            for (const a of g.list) { const b = a.byDay[d]; s.cap += b.cap; s.fixedProd += b.fixedProd; s.union += b.union; s.heAp += b.heAp; s.stop += b.stop; }
            return { key: d, label: d.slice(8), date: d, title: `${WEEKDAY[new Date(d + 'T12:00:00Z').getUTCDay()]} ${dmy(d)}`, ...s };
          })} />
        </div>
      </section>

      <section className="panel">
        <div className="ph"><h2>Comparativo entre grupos</h2></div>
        <div className="pb tw">
          <table className="t">
            <thead><tr><th>Grupo</th><th className="n">Máquinas</th><th className="n">Capacidade h</th><th className="n">Produzido h</th><th className="n">Improd. h</th><th className="n">Manut. real h</th><th className="n">Sem apont. h</th><th className="n">Utilização</th><th className="n">OPs</th></tr></thead>
            <tbody>
              {A.G.map((x) => (
                <tr key={x.g} className={x.g === g.g ? 'clk sel' : 'clk'} onClick={() => setSel(x.g)}>
                  <td><b>{x.g}</b></td><td className="n">{x.list.length}</td><td className="n">{hours1(x.cap)}</td><td className="n">{hours1(x.union)}</td><td className="n">{hours1(x.stop)}</td>
                  <td className="n">{hours1(x.manR)}</td><td className="n">{hours1(x.gap)}</td>
                  <td className="n"><span className={`pill s-${engine.status(x.util).k}`}><i />{pct(x.util)}</span></td><td className="n">{int(x.ords.size)}</td>
                </tr>
              ))}
              <tr className="tot"><td>Total</td><td className="n">{A.list.length}</td><td className="n">{hours1(A.T.cap)}</td><td className="n">{hours1(A.T.union)}</td><td className="n">{hours1(A.T.stop)}</td>
                <td className="n">{hours1(A.T.manR)}</td><td className="n">{hours1(A.T.gap)}</td><td className="n">{pct(A.T.util)}</td><td className="n">{int(A.T.ords.size)}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <LowPerformers A={A} engine={engine} onPickMachine={openMachine} onPickGroup={setSel} />
    </>
  );
}
