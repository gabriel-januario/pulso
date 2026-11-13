import type { ViewProps } from './types';
import { useMemo } from 'react';
import { machineDays, stopsByReason } from '../../analytics/resources';
import { Gantt } from '../charts/Gantt';
import { HBars } from '../charts/HBars';
import { TrendChart } from '../charts/TrendChart';
import { CapacityBar } from '../components/CapacityBar';
import { EventsTable } from '../components/EventsTable';
import { KpiRow } from '../components/KpiRow';
import { OrdersTable } from '../components/OrdersTable';
import { dm, dmy, hours, hours1, WEEKDAY } from '../format';

/** Máquina a máquina: indicadores, evolução, linha do tempo dia a dia, OPs e paradas. */
export function Machines({ pulso, filters }: ViewProps) {
  const { engine } = pulso;
  const { range, grp, machine } = filters.state;
  const A = useMemo(() => engine.agg({ ...range, grp }), [engine, range, grp]);
  const sorted = useMemo(() => [...A.list].sort((x, y) => (y.util ?? -1) - (x.util ?? -1)), [A]);
  const a = (machine && A.M[machine]) || [...A.list].sort((x, y) => y.union - x.union)[0];
  const days = A.days.length > 31 ? A.days.slice(-31) : A.days;
  const gantt = useMemo(() => (a ? machineDays(engine, a, days) : []), [engine, a, days]);
  if (!a) return <section className="panel"><p className="empty pad">Nenhuma máquina neste filtro.</p></section>;

  const m = a.m, st = engine.status(a.util), i = sorted.findIndex((x) => x.m.rc === m.rc);
  const go = (rc: string) => filters.set({ machine: rc });
  const reasons = stopsByReason(a.stops, engine);
  const disp = a.cap > 0 && (a.evs.length || a.accountMaint > 0) ? Math.max(0, 1 - a.accountMaint / a.cap) : null;

  return (
    <>
      <section className="panel plate">
        <div className="id">
          <span className="badge">{m.rc}</span>
          <div>
            <h2>{m.name}</h2>
            <div className="sub"><span>{a.grp}</span><span>Centro de recurso {m.cr}</span><span className={`pill s-${st.k}`}><i />{st.t}</span>{a.down && <span className="down">PARADA AGORA</span>}</div>
          </div>
        </div>
        <div className="toolbar">
          <button type="button" className="btn" disabled={i <= 0} onClick={() => go(sorted[i - 1].m.rc)} aria-label="Máquina anterior no ranking">‹</button>
          <select className="ctl" value={m.rc} onChange={(e) => go(e.target.value)} aria-label="Máquina">
            {A.G.map((g) => (
              <optgroup key={g.g} label={g.g}>
                {[...g.list].sort((x, y) => x.m.name.localeCompare(y.m.name, 'pt-BR')).map((x) => <option key={x.m.rc} value={x.m.rc}>{x.m.name} · {x.m.rc}</option>)}
              </optgroup>
            ))}
          </select>
          <button type="button" className="btn" disabled={i < 0 || i >= sorted.length - 1} onClick={() => go(sorted[i + 1].m.rc)} aria-label="Próxima máquina no ranking">›</button>
        </div>
      </section>

      <KpiRow T={{ ...a, disp }} engine={engine} workDays={a.nDays} activity={`${a.n} apontamentos · ${a.ops.size} operadores`} />

      <section className="panel">
        <div className="ph"><h2>Evolução diária</h2><span className="meta">clique em um dia para vê-lo na linha do tempo da fábrica</span></div>
        <div className="pb">
          <TrendChart engine={engine} onPick={(p) => { location.hash = `#/linha?d=${p.date}`; }}
            points={A.days.map((d) => { const b = a.byDay[d]; return { key: d, label: d.slice(8), date: d, title: `${WEEKDAY[new Date(d + 'T12:00:00Z').getUTCDay()]} ${dmy(d)}`, cap: b.cap, fixedProd: b.fixedProd, union: b.union, heAp: b.heAp, stop: b.stop }; })} />
        </div>
      </section>

      <section className="panel">
        <div className="ph"><h2>Linha do tempo{A.days.length > 31 ? ' · últimos 31 dias do período' : ''}</h2><span className="meta">cada linha é um dia produtivo, das 06:00 às 06:00</span></div>
        <div className="pb">
          <Gantt rows={gantt} engine={engine} span={1440} labelWidth={84} rowLabel={(r) => `${WEEKDAY[new Date(r.date + 'T12:00:00Z').getUTCDay()]} ${dm(r.date!)}`} />
        </div>
      </section>

      <section className="panel">
        <div className="ph"><h2>Destino da capacidade fixa</h2><span className="meta">{hours(a.cap)} h</span></div>
        <div className="pb"><CapacityBar totals={a} /></div>
      </section>

      <section className="panel">
        <div className="ph"><h2>OPs e PVs apontados</h2></div>
        <div className="pb"><OrdersTable recs={a.recs} engine={engine} filename={`pulso_${m.rc}_${range.from}_${range.to}_ops.csv`} /></div>
      </section>

      <div className="grid-r">
        <section className="panel">
          <div className="ph"><h2>Improdutivos por motivo</h2><span className="meta">{hours1(a.stop)} h</span></div>
          <div className="pb">
            {reasons.length ? (
              <HBars max={reasons[0].minutes} valueWidth={110} items={reasons.map((r) => ({
                key: String(r.code), label: r.name, sub: r.category, segs: [{ v: r.minutes, color: r.maintenance ? '#6250d6' : '#eb6834' }],
                value: <><strong>{hours1(r.minutes)}</strong> h · {r.count}×</>, tip: { title: r.name, subtitle: r.category, rows: [{ label: 'Horas', value: `${hours1(r.minutes)} h` }, { label: 'Apontamentos', value: String(r.count) }] },
              }))} />
            ) : <p className="empty">Sem improdutivos no período.</p>}
          </div>
        </section>
        <section className="panel">
          <div className="ph"><h2>Paradas de manutenção</h2><span className="meta">{a.evs.length} eventos · {hours1(a.manR)} h</span></div>
          <div className="pb"><EventsTable events={a.evs} engine={engine} /></div>
        </section>
      </div>
    </>
  );
}
