import type { Engine, Measures } from '../../engine';
import { hours, int, pct, pct1, pp } from '../format';
import { KpiCard } from './KpiCard';

type Totals = Measures & { util: number | null; disp?: number | null; ords: Set<number>; heHist?: number };

/** Faixa de indicadores padrão (período, grupo ou máquina). */
export function KpiRow({ T, engine, workDays, activity }: { T: Totals; engine: Engine; workDays?: number; activity: string }) {
  const meta = engine.config.meta / 100, st = engine.status(T.util);
  return (
    <section className="kpis" aria-label="Indicadores">
      <KpiCard hero label="Utilização da capacidade" value={pct1(T.util)} meter={T.util == null ? undefined : { value: T.util, target: meta }}
        sub={T.util == null ? 'Sem capacidade validada' : `${st.t} · ${pp((T.util - meta) * 100)} vs meta ${engine.config.meta}%`} />
      <KpiCard label="Capacidade fixa" value={hours(T.cap)} unit="h" color="#8b97a3" sub={workDays != null ? `${workDays} dias com turno` : T.capHE ? `${hours(T.capHE)} h de HE lançada` : undefined} />
      <KpiCard label="Produção real" value={hours(T.union)} unit="h" color="#2a78d6" sub={`${hours(T.fixedProd)} h dentro da escala`} />
      <KpiCard label="Hora extra realizada" value={hours(T.heAp)} unit="h" color="#0f9d8a" sub={T.union > 0 ? `${pct(T.heAp / T.union)} do produzido` : undefined} />
      <KpiCard label="Improdutivo apontado" value={hours(T.stop)} unit="h" color="#eb6834" sub={T.cap > 0 ? `${pct(T.stop / T.cap)} da capacidade` : undefined} />
      <KpiCard label="Manutenção" value={hours(T.manR)} unit="h" color="#6250d6" sub={T.disp != null ? `disponibilidade ${pct(T.disp)}` : 'tempo real de máquina parada'} />
      <KpiCard label="OPs atendidas" value={int(T.ords.size)} sub={activity} />
    </section>
  );
}
