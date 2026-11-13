import { useMemo } from 'react';
import { restrictToMachines } from '../../analytics/crossfilter';
import { capacityWaterfall, hourByWeekday, monthlySeries, overtimeByGroup, stopPareto, topOperators, utilizationVsLosses } from '../../analytics/dashboard';
import { monthLong, monthShort, previousPeriod } from '../../analytics/period';
import { Donut } from '../charts/Donut';
import { Heatmap } from '../charts/Heatmap';
import { HourHeatmap } from '../charts/HourHeatmap';
import { KpiStrip } from '../charts/KpiStrip';
import { Matrix } from '../charts/Matrix';
import { Pareto } from '../charts/Pareto';
import { RankBars } from '../charts/RankBars';
import { Scatter } from '../charts/Scatter';
import { TrendChart, type TrendPoint } from '../charts/TrendChart';
import { UtilBars } from '../charts/UtilBars';
import { Waterfall as WaterfallChart } from '../charts/Waterfall';
import type { Filters } from '../filters';
import { dm, dmy, hours, hours1, int, WEEKDAY } from '../format';
import { groupColor, GROUP_ORDER } from '../theme';
import type { Pulso } from '../usePulso';

function Panel({ title, span, action, children, className }: { title: string; span: number; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`dv ${className ?? ''}`} style={{ '--sp': span } as React.CSSProperties}>
      <header className="dvh"><h3>{title}</h3>{action}</header>
      <div className="dvc">{children}</div>
    </section>
  );
}

/** Painel BI: visão analítica com filtros cruzados (grupo, máquina e dia). */
export function Dashboard({ pulso, filters }: { pulso: Pulso; filters: Filters }) {
  const { engine } = pulso;
  const { range, grp, machines, drillDay } = filters.state;
  const first = engine.util.s2iso(engine.dataset.minPd), last = engine.util.s2iso(engine.dataset.maxPd);

  const A0 = useMemo(() => engine.agg({ ...range, grp }), [engine, range, grp]);
  const rcs = machines && machines.every((rc) => A0.M[rc]) ? machines : null;
  const A = useMemo(() => restrictToMachines(A0, rcs), [A0, rcs]);
  const prevP = useMemo(() => previousPeriod(range, first), [range, first]);
  const prev = useMemo(() => (prevP ? restrictToMachines(engine.agg({ from: prevP.from, to: prevP.to, grp }), rcs) : null), [engine, prevP, grp, rcs]);
  const full = useMemo(() => engine.agg({ from: first, to: last, grp }), [engine, first, last, grp]);

  const byGroup = grp === 'all' && !rcs;
  const pickMachine = (rc: string) => filters.set({ machines: rcs?.length === 1 && rcs[0] === rc ? null : [rc] });
  const pickGroup = (g: string) => filters.set({ grp: grp === g ? 'all' : g, machines: null });
  const pickDay = (d: string) => filters.drill(d);

  const daily: TrendPoint[] = A.dayT.map((d) => ({
    key: d.d, label: d.d.slice(8), date: d.d, title: `${WEEKDAY[new Date(d.d + 'T12:00:00Z').getUTCDay()]} ${dmy(d.d)}`,
    cap: d.cap, fixedProd: d.fixedProd, union: d.union, heAp: d.heAp, stop: d.stop,
  }));
  const months: TrendPoint[] = monthlySeries(full, rcs).map((m) => ({
    key: m.ym, label: monthShort(m.ym), title: monthLong(m.ym), cap: m.cap, fixedProd: m.fixedProd, union: m.union, heAp: m.heAp, stop: m.stop,
    highlight: m.ym >= range.from.slice(0, 7) && m.ym <= range.to.slice(0, 7),
  }));
  const utilItems = byGroup
    ? A.G.filter((g) => g.cap > 0).map((g) => ({ key: g.g, label: g.g, util: g.util, cap: g.cap, fixedProd: g.fixedProd, color: groupColor(g.g), count: g.list.length }))
    : A0.list.filter((a) => a.cap > 0).map((a) => ({ key: a.m.rc, label: a.m.name, util: a.util, cap: a.cap, fixedProd: a.fixedProd, color: groupColor(a.grp), selected: rcs?.includes(a.m.rc) }));
  const groups = GROUP_ORDER.filter((g) => Object.keys(engine.dataset.machines).some((rc) => engine.grpOf(rc) === g));
  const ops = topOperators(A, engine);

  return (
    <>
      <div className="slicer">
        <div className="seg" role="group" aria-label="Grupo de máquinas">
          <button type="button" className={grp === 'all' ? 'on' : ''} onClick={() => filters.set({ grp: 'all', machines: null })}>Todos</button>
          {groups.map((g) => (
            <button type="button" key={g} className={grp === g ? 'on' : ''} onClick={() => filters.set({ grp: g, machines: null })}><i style={{ background: groupColor(g) }} />{g}</button>
          ))}
        </div>
        <div className="chips">
          {drillDay && <button type="button" className="chip" onClick={() => filters.drill(null)}>Dia {dmy(range.from)} <b>×</b></button>}
          {rcs && <button type="button" className="chip" onClick={() => filters.set({ machines: null })}>{rcs.length === 1 ? A0.M[rcs[0]].m.name : `${rcs.length} máquinas`} <b>×</b></button>}
          {(drillDay || rcs || grp !== 'all') && <button type="button" className="chip clr" onClick={filters.reset}>Limpar filtros</button>}
        </div>
      </div>

      <KpiStrip A={A} prev={prev} prevLabel={prevP?.label ?? null} engine={engine} />

      <div className="dgrid">
        <Panel title="Evolução diária" span={8}><TrendChart points={daily} engine={engine} onPick={drillDay ? undefined : (p) => pickDay(p.date!)} /></Panel>
        <Panel title={byGroup ? 'Utilização por grupo' : `Utilização por máquina${grp !== 'all' ? ` · ${grp}` : ''}`} span={4}
          action={grp !== 'all' ? <button type="button" className="link" onClick={() => filters.set({ grp: 'all', machines: null })}>◂ Todos os grupos</button> : undefined}>
          <UtilBars items={utilItems} engine={engine} onPick={byGroup ? pickGroup : pickMachine} />
        </Panel>
        <Panel title="Para onde vai a capacidade" span={5}><Waterfall A={A} /></Panel>
        <Panel title="Utilização × perdas apontadas" span={7}>
          <Scatter points={utilizationVsLosses(A0, engine.config.meta / 100)} engine={engine} selected={rcs} onPick={pickMachine} />
          <div className="legend">{A0.G.filter((g) => g.cap > 0).map((g) => <span key={g.g}><i style={{ background: groupColor(g.g) }} />{g.g}</span>)}</div>
        </Panel>
        <Panel title="Mapa de calor · utilização por máquina e dia" span={12}>
          <Heatmap A={A0} engine={engine} selected={rcs} onPickMachine={pickMachine} onPickDay={pickDay} onPickGroup={pickGroup} />
        </Panel>
        <Panel title="Pareto dos improdutivos" span={6}><Pareto items={stopPareto(A, engine)} /></Panel>
        <Panel title="Tendência mensal" span={6}><TrendChart points={months} engine={engine} height={290} /></Panel>
        <Panel title="Top 10 operadores" span={6}>
          <RankBars items={ops.map((o) => ({ key: o.name, label: o.name, value: o.minutes, display: `${hours(o.minutes)} h`,
            tip: { title: o.name, rows: [{ label: 'Horas produzidas', value: `${hours1(o.minutes)} h`, color: '#2563c9' }, { label: 'OPs', value: int(o.orders) }, { label: 'Máquinas', value: int(o.machines) }] } }))} />
        </Panel>
        <Panel title="Horas extras por grupo" span={6}><Donut items={overtimeByGroup(A)} onPick={pickGroup} /></Panel>
        <Panel title="Máquinas produzindo · hora do dia × dia da semana" span={12}><HourHeatmap rows={hourByWeekday(A)} engine={engine} /></Panel>
        <Panel title="Matriz de desempenho" span={12} className="tbl"
          action={prevP ? <span className="meta">Δ em p.p. vs {prevP.label} · {dm(prevP.from)} a {dm(prevP.to)}</span> : undefined}>
          <Matrix A={A} prev={prev} engine={engine} selected={rcs} onPickMachine={pickMachine} onPickGroup={pickGroup} />
        </Panel>
      </div>
    </>
  );
}

function Waterfall({ A }: { A: ReturnType<typeof restrictToMachines> }) {
  return <WaterfallChart steps={capacityWaterfall(A)} capacity={A.T.cap} />;
}
