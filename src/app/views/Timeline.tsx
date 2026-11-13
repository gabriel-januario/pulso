import { useMemo, useState } from 'react';
import { addDays } from '../../analytics/period';
import { resourceTimeline, salesOrders } from '../../analytics/resources';
import { Gantt } from '../charts/Gantt';
import { OrdersTable } from '../components/OrdersTable';
import { downloadCsv } from '../csv';
import type { Filters } from '../filters';
import { dm, dmy, hours1, int, pct } from '../format';
import type { Pulso } from '../usePulso';

/** Linha do tempo da fábrica (1, 3 ou 7 dias), OPs por recurso e ranking de pedidos. */
export function Timeline({ pulso, filters }: { pulso: Pulso; filters: Filters }) {
  const { engine } = pulso;
  const { range, grp } = filters.state;
  const lo = engine.util.s2iso(engine.dataset.minPd), hi = engine.util.s2iso(engine.dataset.maxPd);
  const [date, setDate] = useState(() => {
    const d = new URLSearchParams(location.hash.split('?')[1] ?? '').get('d');
    return d && d >= lo && d <= hi ? d : range.to > hi ? hi : range.to;
  });
  const [span, setSpan] = useState(1);
  const p0 = engine.util.iso2s(date) - (span - 1);
  const sub = useMemo(() => engine.agg({ from: engine.util.s2iso(p0), to: date, grp }), [engine, p0, date, grp]);
  const rows = useMemo(() => resourceTimeline(engine, sub, p0, span), [engine, sub, p0, span]);

  const A = useMemo(() => engine.agg({ ...range, grp }), [engine, range, grp]);
  const withRecs = A.list.filter((a) => a.recs.length).sort((x, y) => y.union - x.union);
  const pv = useMemo(() => salesOrders(A), [A]);
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const name = (rc: string) => engine.dataset.machines[rc]?.name ?? rc;
  const pvMachines = (m: [string, number][]) => m.slice(0, 2).map(([rc, v]) => `${name(rc)} (${hours1(v)} h)`).join(', ') + (m.length > 2 ? ` +${m.length - 2}` : '');
  const pvLabel = (p: string) => (!p || p === '0' ? 'Sem PV' : p);
  const day = (t: number) => dm(engine.util.s2iso(Math.floor(t / 1440)));
  const step = (n: number) => { const d = addDays(date, n * span); setDate(d < lo ? lo : d > hi ? hi : d); };
  let acc = 0;

  return (
    <>
      <section className="panel">
        <div className="ph">
          <h2>Linha do tempo dos recursos</h2>
          <div className="toolbar">
            <button type="button" className="btn" onClick={() => step(-1)} disabled={date <= lo} aria-label="Período anterior">‹</button>
            <input className="ctl" type="date" value={date} min={lo} max={hi} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Último dia exibido" />
            <button type="button" className="btn" onClick={() => step(1)} disabled={date >= hi} aria-label="Próximo período">›</button>
            <div className="seg">{[1, 3, 7].map((n) => <button type="button" key={n} className={span === n ? 'on' : ''} onClick={() => setSpan(n)}>{n === 1 ? '1 dia' : `${n} dias`}</button>)}</div>
          </div>
        </div>
        <div className="pb">
          <p className="meta">{span === 1 ? `Dia produtivo de ${dmy(date)}, das 06:00 às 06:00 do dia seguinte.` : `${dmy(engine.util.s2iso(p0))} a ${dmy(date)}.`} Clique no nome para abrir a máquina.</p>
          {rows.length ? <Gantt rows={rows} engine={engine} span={span * 1440} labelWidth={innerWidth <= 860 ? 150 : 210}
            onPickRow={(r) => { filters.set({ machine: r.rc }); location.hash = `#/maquinas?${location.hash.split('?')[1] ?? ''}`; }} />
            : <p className="empty">Sem máquinas.</p>}
        </div>
      </section>

      <section className="panel">
        <div className="ph"><h2>OPs e PVs por recurso</h2><span className="meta">{dmy(A.from)} a {dmy(A.to)} · {int(A.T.ords.size)} OPs · {hours1(A.T.prod)} h apontadas</span></div>
        <div className="pb">
          <div className="rgh"><span /><span>Recurso</span><span className="n">OPs</span><span className="n">Horas</span><span className="n">Utilização</span></div>
          {withRecs.map((a) => (
            <details key={a.m.rc} className="rg">
              <summary><span className="car">▸</span><span className="rn">{a.m.name}<small>{a.m.rc} · {a.grp}</small></span><span className="n">{a.ords.size}</span><span className="n"><b>{hours1(a.prod)} h</b></span><span className="n">{pct(a.util)}</span></summary>
              <div className="inner"><OrdersTable recs={a.recs} engine={engine} filename={`pulso_${a.m.rc}_${A.from}_${A.to}_ops.csv`} maxHeight={380} /></div>
            </details>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="ph">
          <h2>Ranking de pedidos (PV) por horas</h2>
          <div className="toolbar">
            <span className="meta">{int(pv.rows.length)} pedidos · {hours1(pv.total)} h</span>
            <input className="search" type="search" placeholder="Buscar PV ou máquina" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar PV ou máquina" />
            <button type="button" className="btn" onClick={() => downloadCsv(`pulso_pedidos_${A.from}_${A.to}.csv`, ['PV', 'Itens', 'OPs', 'Apontamentos', 'Horas', 'Máquinas principais', 'Início', 'Fim'],
              pv.rows.map((o) => [pvLabel(o.ped), o.items, o.orders, o.count, o.minutes / 60, pvMachines(o.machines), engine.util.fmtDT(o.t0), engine.util.fmtDT(o.t1)]))}>Exportar CSV</button>
          </div>
        </div>
        <div className="pb tw" style={{ maxHeight: 520 }}>
          <table className="t">
            <thead><tr><th className="n">#</th><th>PV</th><th className="n">Itens</th><th className="n">OPs</th><th className="n">Apont.</th><th className="barc" /><th className="n">Horas</th><th className="n">%</th><th className="n">% acum.</th><th>Máquinas principais</th><th>Período</th></tr></thead>
            <tbody>
              {pv.rows.map((o, i) => {
                acc += o.minutes;
                const txt = pvMachines(o.machines);
                if (term && !`${pvLabel(o.ped)} ${o.machines.map(([rc]) => name(rc)).join(' ')}`.toLowerCase().includes(term)) return null;
                return (
                  <tr key={o.ped}>
                    <td className="n code">{i + 1}</td><td><b>{pvLabel(o.ped)}</b></td><td className="n">{o.items}</td><td className="n">{o.orders}</td><td className="n">{o.count}</td>
                    <td className="barc"><span className="mb" style={{ width: `${(o.minutes / (pv.rows[0]?.minutes || 1)) * 100}%` }} /></td>
                    <td className="n"><b>{hours1(o.minutes)}</b></td><td className="n">{pct(o.minutes / (pv.total || 1))}</td><td className="n code">{pct(acc / (pv.total || 1))}</td>
                    <td className="ops" title={txt}>{txt}</td><td className="nw">{day(o.t0)} – {day(o.t1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
