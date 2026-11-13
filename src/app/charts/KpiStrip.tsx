import type { AggResult, Engine } from '../../engine';
import { dec1, hours, int, pct, pct1 } from '../format';
import { STATUS_BAR } from '../theme';
import { Sparkline } from './Sparkline';

interface Kpi { label: string; value: number | null; prev?: number | null; fmt(v: number): string; unit?: string; delta: 'pp' | 'pct'; good: 1 | 0 | -1; spark?: (number | null)[]; color?: string; ref?: number; max?: number; sub?: string; status?: string }

/** Indicadores do Painel BI com variação contra o período anterior e minitendência diária. */
export function KpiStrip({ A, prev, prevLabel, engine }: { A: AggResult; prev: AggResult | null; prevLabel: string | null; engine: Engine }) {
  const T = A.T, P = prev?.T, d = A.dayT, meta = engine.config.meta / 100;
  const K: Kpi[] = [
    { label: 'Utilização', value: T.util, prev: P?.util, fmt: pct1, delta: 'pp', good: 1, spark: d.map((o) => (o.cap > 0 ? o.fixedProd / o.cap : null)), ref: meta, max: 1, status: T.util != null ? STATUS_BAR[engine.status(T.util).k] : undefined },
    { label: 'Disponibilidade', value: T.disp, prev: P?.disp, fmt: pct1, delta: 'pp', good: 1, spark: T.disp == null ? undefined : d.map((o) => (o.cap > 0 ? Math.max(0, 1 - (o.accountMaint || 0) / o.cap) : null)), max: 1 },
    { label: 'Horas produzidas', value: T.union, prev: P?.union, fmt: hours, unit: 'h', delta: 'pct', good: 1, spark: d.map((o) => o.union) },
    { label: 'Capacidade', value: T.cap, prev: P?.cap, fmt: hours, unit: 'h', delta: 'pct', good: 0, spark: d.map((o) => o.cap), color: '#64748b' },
    { label: 'Horas extras', value: T.heAp, prev: P?.heAp, fmt: hours, unit: 'h', delta: 'pct', good: 0, spark: d.map((o) => o.heAp), color: '#0f9d8a' },
    { label: 'Improdutivo apontado', value: T.stop, prev: P?.stop, fmt: hours, unit: 'h', delta: 'pct', good: -1, spark: d.map((o) => o.stop), color: '#eb6834', sub: T.cap ? `${pct(T.stop / T.cap)} da capacidade` : '' },
    { label: 'Sem apontamento', value: T.gap, prev: P?.gap, fmt: hours, unit: 'h', delta: 'pct', good: -1, spark: d.map((o) => o.gap), color: '#94a3b8', sub: T.cap ? `${pct(T.gap / T.cap)} da capacidade` : '' },
    { label: 'OPs atendidas', value: T.ords.size, prev: P?.ords.size, fmt: int, delta: 'pct', good: 1, sub: `${T.active} máquinas ativas` },
  ];
  return (
    <section className="dkpis" aria-label="Indicadores do período">
      {K.map((k) => {
        const has = k.value != null && isFinite(k.value);
        let delta: { cls: string; text: string } | null = null;
        if (has && k.prev != null && isFinite(k.prev) && prevLabel) {
          const dv = k.delta === 'pp' ? (k.value! - k.prev) * 100 : k.prev ? (k.value! / k.prev - 1) * 100 : null;
          if (dv != null && isFinite(dv)) {
            const cls = Math.abs(dv) < 0.05 || !k.good ? 'nt' : dv > 0 === k.good > 0 ? 'up' : 'dn';
            delta = { cls, text: `${dv > 0 ? '▲' : dv < 0 ? '▼' : '■'} ${k.delta === 'pp' ? `${dec1(Math.abs(dv))} p.p.` : `${int(Math.abs(dv))}%`}` };
          }
        }
        return (
          <div key={k.label} className="dkc">
            <div className="dkl">{k.status && <i className="dst" style={{ background: k.status }} />}{k.label}</div>
            <div className="dkv">{has ? k.fmt(k.value!) : '—'}{has && k.unit && <small> {k.unit}</small>}</div>
            <div className="dkd">{delta ? <><span className={`dd ${delta.cls}`}>{delta.text}</span><span className="dvs">vs {prevLabel}</span></> : <span className="dvs">{k.sub ?? ''}</span>}</div>
            {k.spark && <div className="dksp"><Sparkline values={k.spark} color={k.color} reference={k.ref} max={k.max} /></div>}
          </div>
        );
      })}
    </section>
  );
}
