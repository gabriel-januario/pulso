import { useEffect, useMemo, useState } from 'react';
import { monthOptions } from '../analytics/period';
import { SECTIONS, Sidebar } from './components/Sidebar';
import { carteiraDemo } from '../db/queries';
import { useConfig } from './config';
import { useFilters } from './filters';
import { dmy, int } from './format';
import { TooltipProvider } from './tooltip';
import { usePulso, type Pulso } from './usePulso';
import { Dashboard } from './views/Dashboard';
import { Groups } from './views/Groups';
import { Machines } from './views/Machines';
import { Monthly } from './views/Monthly';
import { Maintenance } from './views/Maintenance';
import { Overview } from './views/Overview';
import type { ViewProps } from './views/types';
import { Unproductive } from './views/Unproductive';
import { Timeline } from './views/Timeline';
import { Operators } from './views/Operators';
import { Portfolio } from './views/Portfolio';
import { Quality } from './views/Quality';
import { Simulator } from './views/Simulator';
import { Calendar } from './views/Calendar';
import { Overtime } from './views/Overtime';
import { Settings } from './views/Settings';

export function App() {
  const state = usePulso();
  if (state.status === 'loading') return <div className="boot" role="status">Carregando a base de dados…</div>;
  if (state.status === 'error') return <div className="boot err" role="alert">Não foi possível iniciar o PULSO. {state.message}</div>;
  return <TooltipProvider><Shell pulso={state.pulso} /></TooltipProvider>;
}

const VIEWS: Record<string, { title: string; render: (p: ViewProps) => React.ReactNode; ownFilters?: boolean }> = {
  geral: { title: 'Visão geral', render: Overview },
  painel: { title: 'Painel BI', render: Dashboard },
  mensal: { title: 'Análise mensal', render: Monthly, ownFilters: true },
  maquinas: { title: 'Máquinas', render: Machines },
  grupos: { title: 'Grupos de máquinas', render: Groups },
  linha: { title: 'Linha do tempo', render: Timeline },
  manutencao: { title: 'Manutenção', render: Maintenance },
  improdutivas: { title: 'Improdutivas', render: Unproductive },
  carteira: { title: 'Carteira e prazos', render: Portfolio, ownFilters: true },
  simulador: { title: 'Simulador', render: Simulator },
  operadores: { title: 'Operadores', render: Operators },
  qualidade: { title: 'Qualidade dos dados', render: Quality },
  'horas-extras': { title: 'Horas extras', render: Overtime, ownFilters: true },
  calendario: { title: 'Calendário fabril', render: Calendar, ownFilters: true },
  configuracoes: { title: 'Configurações', render: Settings, ownFilters: true },
};
const routeOf = () => { const id = location.hash.replace(/^#\/?/, '').split('?')[0]; return VIEWS[id] ? id : 'geral'; };

function Shell({ pulso }: { pulso: Pulso }) {
  const { engine } = pulso;
  const months = useMemo(() => monthOptions(engine), [engine]);
  const all = useMemo(() => ({ from: engine.util.s2iso(engine.dataset.minPd), to: engine.util.s2iso(engine.dataset.maxPd) }), [engine]);
  const [view, setView] = useState(routeOf);
  const filters = useFilters(months, all, view);
  const defaults = useMemo(() => ({ cart: carteiraDemo(pulso.db) }), [pulso.db]);
  const config = useConfig(engine, defaults);
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
            <div className="crumb">PULSO · {section}{V.ownFilters ? '' : ` · ${dmy(range.from)} a ${dmy(range.to)}`}</div>
            <h1>{V.title}</h1>
          </div>
          {!V.ownFilters && <div className="filters">
            <select aria-label="Período" value={period} onChange={(e) => filters.setPeriod(e.target.value)}>
              {period === 'day' && <option value="day">Dia {dmy(range.from)}</option>}
              <option value="all">Todo o período</option>
              {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <select aria-label="Grupo de máquinas" value={grp} onChange={(e) => filters.set({ grp: e.target.value, machines: null })}>
              <option value="all">Todos os grupos</option>
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>}
        </header>
        <div className="view">
          <V.render key={view} pulso={pulso} filters={filters} config={config} />
        </div>
      </main>
    </div>
  );
}
