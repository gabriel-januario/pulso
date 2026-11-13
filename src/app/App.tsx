import { useMemo, useState } from 'react';
import { paradasPorMotivo } from '../db/queries';
import { lastMonthRange } from '../engine';
import { CapacityBar } from './components/CapacityBar';
import { DailyChart } from './components/DailyChart';
import { GroupBars } from './components/GroupBars';
import { KpiCard } from './components/KpiCard';
import { MachineTable } from './components/MachineTable';
import { Sidebar } from './components/Sidebar';
import { StopsPareto } from './components/StopsPareto';
import { dmy, hours, int, pct, pct1 } from './format';
import { usePulso, type Pulso } from './usePulso';

export function App() {
  const state = usePulso();
  if (state.status === 'loading') return <div className="boot" role="status">Carregando a base de dados…</div>;
  if (state.status === 'error') return <div className="boot err" role="alert">Não foi possível iniciar o PULSO. {state.message}</div>;
  return <Overview pulso={state.pulso} />;
}

function monthOptions(engine: Pulso['engine']) {
  const { s2iso } = engine.util, MES = engine.constants.MES;
  const first = s2iso(engine.dataset.minPd).slice(0, 7), last = s2iso(engine.dataset.maxPd).slice(0, 7);
  const out: { value: string; label: string; from: string; to: string }[] = [];
  let [y, m] = first.split('-').map(Number);
  for (;;) {
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    const end = new Date(Date.UTC(y, m, 0)).getUTCDate();
    out.push({ value: ym, label: `${MES[m - 1]} ${y}`, from: `${ym}-01`, to: `${ym}-${String(end).padStart(2, '0')}` });
    if (ym >= last) break;
    if (++m > 12) { m = 1; y++; }
  }
  return out.reverse();
}

function Overview({ pulso }: { pulso: Pulso }) {
  const { engine, db } = pulso;
  const months = useMemo(() => monthOptions(engine), [engine]);
  const [period, setPeriod] = useState(() => lastMonthRange(engine).from.slice(0, 7));
  const [grp, setGrp] = useState('all');

  const range = useMemo(() => {
    if (period === 'all') return { from: months.at(-1)!.from, to: months[0].to };
    const m = months.find((x) => x.value === period)!;
    return { from: m.from, to: m.to };
  }, [period, months]);

  const all = useMemo(() => engine.agg({ ...range, grp: 'all' }), [engine, range]);
  const A = useMemo(() => (grp === 'all' ? all : engine.agg({ ...range, grp })), [engine, range, grp, all]);
  const stops = useMemo(() => paradasPorMotivo(db, range.from, range.to), [db, range]);

  const T = A.T, st = engine.status(T.util), meta = engine.config.meta / 100;
  const gapPP = T.util == null ? null : (T.util - meta) * 100;
  const source = `${engine.dataset.meta.fonte} · ${int(engine.dataset.nAll)} apontamentos`;

  return (
    <div className="app">
      <Sidebar source={source} />
      <main>
        <header className="top">
          <div className="ttl">
            <div className="crumb">PULSO · Usinagem · {dmy(A.from)} a {dmy(A.to)}</div>
            <h1>Visão geral</h1>
          </div>
          <div className="filters">
            <select aria-label="Período" value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="all">Todo o período</option>
              {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <select aria-label="Grupo de máquinas" value={grp} onChange={(e) => setGrp(e.target.value)}>
              <option value="all">Todos os grupos</option>
              {all.G.map((g) => <option key={g.g} value={g.g}>{g.g}</option>)}
            </select>
          </div>
        </header>

        <div className="view">
          <section className="kpis" aria-label="Indicadores do período">
            <KpiCard hero label="Utilização da capacidade" value={pct1(T.util)} meter={T.util == null ? undefined : { value: T.util, target: meta }}
              sub={gapPP == null ? 'Sem capacidade validada' : `${st.t} · ${gapPP >= 0 ? '+' : '−'}${Math.abs(gapPP).toFixed(1).replace('.', ',')} p.p. vs meta ${engine.config.meta}%`} />
            <KpiCard label="Capacidade fixa" value={hours(T.cap)} unit="h" color="#8b97a3" sub={`${A.workDays} dias com turno`} />
            <KpiCard label="Produção real" value={hours(T.union)} unit="h" color="#2a78d6" sub={`${hours(T.fixedProd)} h dentro da escala`} />
            <KpiCard label="Hora extra realizada" value={hours(T.heAp)} unit="h" color="#0f9d8a" sub={T.union > 0 ? `${pct(T.heAp / T.union)} do produzido` : undefined} />
            <KpiCard label="Improdutivo apontado" value={hours(T.stop)} unit="h" color="#eb6834" sub={T.cap > 0 ? `${pct(T.stop / T.cap)} da capacidade` : undefined} />
            <KpiCard label="Sem apontamento" value={hours(T.gap)} unit="h" color="#b9c6d6" sub={T.cap > 0 ? `${pct(T.gap / T.cap)} da capacidade` : undefined} />
            <KpiCard label="OPs atendidas" value={int(T.ords.size)} sub={`${T.active} máquinas com apontamento`} />
          </section>

          <section className="panel">
            <div className="ph"><h2>Utilização por dia</h2><span className="meta">produção dentro da escala ÷ capacidade fixa</span></div>
            <div className="pb"><DailyChart days={A.dayT} engine={engine} /></div>
          </section>

          <div className="grid2">
            <section className="panel">
              <div className="ph"><h2>Utilização por grupo</h2>{grp !== 'all' && <button type="button" className="link" onClick={() => setGrp('all')}>Ver todos os grupos</button>}</div>
              <div className="pb"><GroupBars groups={all.G.filter((g) => g.cap > 0)} engine={engine} onSelect={setGrp} /></div>
            </section>
            <section className="panel">
              <div className="ph"><h2>Destino da capacidade fixa</h2><span className="meta">{hours(T.cap)} h</span></div>
              <div className="pb"><CapacityBar totals={T} /></div>
            </section>
          </div>

          <section className="panel">
            <div className="ph"><h2>Paradas por motivo</h2><span className="meta">consulta SQL ao banco · todas as paradas apontadas · 8 maiores</span></div>
            <div className="pb"><StopsPareto rows={stops} /></div>
          </section>

          <section className="panel">
            <div className="ph"><h2>Máquinas</h2><span className="meta">{A.list.length} recursos · ordenado por utilização</span></div>
            <div className="pb"><MachineTable list={A.list} engine={engine} /></div>
          </section>
        </div>
      </main>
    </div>
  );
}
