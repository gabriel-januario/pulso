import { useEffect, useMemo, useState } from 'react';
import { monthOptions } from '../analytics/period';
import { SECTIONS, Sidebar } from './components/Sidebar';
import { useFilters } from './filters';
import { dmy, int } from './format';
import { TooltipProvider } from './tooltip';
import { usePulso, type Pulso } from './usePulso';
import { Dashboard } from './views/Dashboard';
import { Overview } from './views/Overview';

export function App() {
  const state = usePulso();
  if (state.status === 'loading') return <div className="boot" role="status">Carregando a base de dados…</div>;
  if (state.status === 'error') return <div className="boot err" role="alert">Não foi possível iniciar o PULSO. {state.message}</div>;
  return <TooltipProvider><Shell pulso={state.pulso} /></TooltipProvider>;
}

const VIEWS: Record<string, { title: string; render: typeof Overview }> = {
  geral: { title: 'Visão geral', render: Overview },
  painel: { title: 'Painel BI', render: Dashboard },
};
const routeOf = () => { const id = location.hash.replace(/^#\/?/, '').split('?')[0]; return VIEWS[id] ? id : 'geral'; };

function Shell({ pulso }: { pulso: Pulso }) {
  const { engine } = pulso;
  const months = useMemo(() => monthOptions(engine), [engine]);
  const all = useMemo(() => ({ from: engine.util.s2iso(engine.dataset.minPd), to: engine.util.s2iso(engine.dataset.maxPd) }), [engine]);
  const filters = useFilters(months, all);
  const [view, setView] = useState(routeOf);
  useEffect(() => {
    const on = () => setView(routeOf());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  const navigate = (id: string) => { location.hash = `#/${id}?${location.hash.split('?')[1] ?? ''}`; window.scrollTo(0, 0); };

  const groups = useMemo(() => engine.agg({ ...all, grp: 'all' }).G.map((g) => g.g), [engine, all]);
  const { range, grp, period } = filters.state;
  const V = VIEWS[view];
  const section = SECTIONS.find((s) => s.items.some((i) => i.id === view))?.label ?? '';

  return (
    <div className="app">
      <Sidebar source={`${engine.dataset.meta.fonte} · ${int(engine.dataset.nAll)} apontamentos`} current={view} onNavigate={navigate} />
      <main>
        <header className="top">
          <div className="ttl">
            <div className="crumb">PULSO · {section} · {dmy(range.from)} a {dmy(range.to)}</div>
            <h1>{V.title}</h1>
          </div>
          <div className="filters">
            <select aria-label="Período" value={period} onChange={(e) => filters.setPeriod(e.target.value)}>
              {period === 'day' && <option value="day">Dia {dmy(range.from)}</option>}
              <option value="all">Todo o período</option>
              {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <select aria-label="Grupo de máquinas" value={grp} onChange={(e) => filters.set({ grp: e.target.value, machines: null })}>
              <option value="all">Todos os grupos</option>
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </header>
        <div className="view">
          <V.render pulso={pulso} filters={filters} />
        </div>
      </main>
    </div>
  );
}
