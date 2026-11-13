import { lazy, Suspense, useEffect, useMemo, useState, type ComponentType } from 'react';
import { monthOptions } from '../analytics/period';
import { SECTIONS, Sidebar } from './components/Sidebar';
import { carteiraDemo } from '../db/queries';
import { useConfig } from './config';
import { useFilters } from './filters';
import { dmy, int } from './format';
import { TooltipProvider } from './tooltip';
import { usePulso, type Pulso } from './usePulso';
import type { ViewProps } from './views/types';

/* cada tela é um pedaço separado do bundle, baixado na primeira visita */
const view = (load: () => Promise<Record<string, unknown>>, name: string) => lazy(async () => ({ default: (await load())[name] as ComponentType<ViewProps> }));
const Dashboard = view(() => import('./views/Dashboard'), 'Dashboard');
const Groups = view(() => import('./views/Groups'), 'Groups');
const Machines = view(() => import('./views/Machines'), 'Machines');
const Monthly = view(() => import('./views/Monthly'), 'Monthly');
const Maintenance = view(() => import('./views/Maintenance'), 'Maintenance');
const Overview = view(() => import('./views/Overview'), 'Overview');
const Unproductive = view(() => import('./views/Unproductive'), 'Unproductive');
const Timeline = view(() => import('./views/Timeline'), 'Timeline');
const Operators = view(() => import('./views/Operators'), 'Operators');
const Portfolio = view(() => import('./views/Portfolio'), 'Portfolio');
const Quality = view(() => import('./views/Quality'), 'Quality');
const Simulator = view(() => import('./views/Simulator'), 'Simulator');
const Calendar = view(() => import('./views/Calendar'), 'Calendar');
const Overtime = view(() => import('./views/Overtime'), 'Overtime');
const Settings = view(() => import('./views/Settings'), 'Settings');
const Reports = view(() => import('./views/Reports'), 'Reports');

export function App() {
  const state = usePulso();
  if (state.status === 'loading') return <div className="boot" role="status">Carregando a base de dados…</div>;
  if (state.status === 'error') return <div className="boot err" role="alert">Não foi possível iniciar o PULSO. {state.message}</div>;
  return <TooltipProvider><Shell pulso={state.pulso} /></TooltipProvider>;
}

const VIEWS: Record<string, { title: string; render: ComponentType<ViewProps>; ownFilters?: boolean }> = {
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
  relatorios: { title: 'Relatórios', render: Reports },
};
const routeOf = () => { const id = location.hash.replace(/^#\/?/, '').split('?')[0]; return Object.hasOwn(VIEWS, id) ? id : 'geral'; };

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

  const groups = useMemo(() => engine.agg({ ...all, grp: 'all' }).G.map((g) => g.g), [engine, all, config.version]);
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
          <Suspense fallback={<div className="loading" role="status">Carregando a tela…</div>}><V.render key={view} pulso={pulso} filters={filters} config={config} /></Suspense>
        </div>
      </main>
    </div>
  );
}
