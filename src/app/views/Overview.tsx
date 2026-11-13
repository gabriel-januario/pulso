import type { ViewProps } from './types';
import { useMemo } from 'react';
import { unproductiveSummary } from '../../analytics/losses';
import { CapacityBar } from '../components/CapacityBar';
import { DailyChart } from '../components/DailyChart';
import { GroupBars } from '../components/GroupBars';
import { KpiCard } from '../components/KpiCard';
import { MachineTable } from '../components/MachineTable';
import { StopsPareto } from '../components/StopsPareto';
import { hours, int, pct, pct1 } from '../format';

/** Visão geral: os números do período em uma página. */
export function Overview({ pulso, filters, config }: ViewProps) {
  const { engine } = pulso;
  const { range, grp } = filters.state;
  const all = useMemo(() => engine.agg({ ...range, grp: 'all' }), [engine, range, config.version]);
  const A = useMemo(() => (grp === 'all' ? all : engine.agg({ ...range, grp })), [engine, range, grp, all]);
  const stops = useMemo(() => {
    const byReason = new Map<string, { id: string; motivo: string; categoria: string; horas: number }>();
    const categories = new Map(engine.constants.CATS);
    for (const s of unproductiveSummary(A).stops) {
      const key = `${s.oper}|${s.cat}`;
      const row = byReason.get(key) ?? { id: key, motivo: engine.motName(s.oper), categoria: categories.get(s.cat) ?? s.cat, horas: 0 };
      row.horas += s.mp / 60;
      byReason.set(key, row);
    }
    return [...byReason.values()].filter((row) => row.horas > 0).sort((a, b) => b.horas - a.horas);
  }, [engine, A]);
  const T = A.T, st = engine.status(T.util), meta = engine.config.meta / 100;
  const gapPP = T.util == null ? null : (T.util - meta) * 100;

  return (
    <>
      <section className="kpis" aria-label="Indicadores do período">
        <KpiCard hero label="Utilização da capacidade" value={pct1(T.util)} meter={T.util == null ? undefined : { value: T.util, target: meta }}
          sub={gapPP == null ? 'Sem capacidade validada' : `${st.t} · ${gapPP >= 0 ? '+' : '−'}${Math.abs(gapPP).toFixed(1).replace('.', ',')} p.p. vs meta ${engine.config.meta}%`} />
        <KpiCard label="Capacidade fixa" value={hours(T.cap)} unit="h" color="#8b97a3" sub={`${A.workDays} dias com turno`} />
        <KpiCard label="Produção real" value={hours(T.union)} unit="h" color="#2a78d6" sub={`${hours(T.fixedProd)} h apontadas em turnos regulares`} />
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
          <div className="ph"><h2>Utilização por grupo</h2>{grp !== 'all' && <button type="button" className="link" onClick={() => filters.set({ grp: 'all' })}>Ver todos os grupos</button>}</div>
          <div className="pb"><GroupBars groups={all.G.filter((g) => g.cap > 0)} engine={engine} onSelect={(g) => filters.set({ grp: g, machines: null })} /></div>
        </section>
        <section className="panel">
          <div className="ph"><h2>Destino da capacidade fixa</h2><span className="meta">{hours(T.cap)} h</span></div>
          <div className="pb">
            <CapacityBar totals={T} />
            <p className="meta">A produção alocada considera horas líquidas e a prioridade de manutenção e falta de cobertura.</p>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="ph"><h2>Paradas por motivo</h2><span className="meta">{grp === 'all' ? 'Usinagem · inclui paradas sem máquina atribuída' : grp} · 8 maiores</span></div>
        <div className="pb"><StopsPareto rows={stops} /></div>
      </section>

      <section className="panel">
        <div className="ph"><h2>Máquinas</h2><span className="meta">{A.list.length} recursos · ordenado por utilização</span></div>
        <div className="pb"><MachineTable list={A.list} engine={engine} /></div>
      </section>
    </>
  );
}
