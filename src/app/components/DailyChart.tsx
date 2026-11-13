import type { DayTotals, Engine } from '../../engine';
import { useWidth } from '../useWidth';

const COLOR = { good: '#2563c9', warn: '#e3a33b', crit: '#d64b45', none: '#cfd7e0' } as const;
const WD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/** Utilização por dia produtivo: produção dentro da capacidade fixa ÷ capacidade fixa. */
export function DailyChart({ days, engine }: { days: DayTotals[]; engine: Engine }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const H = 220, pl = 38, pr = 8, pt = 22, pb = 34;
  const iw = W - pl - pr, ih = H - pt - pb, n = days.length, slot = iw / n, bw = Math.max(3, Math.min(30, slot * 0.68));
  const meta = engine.config.meta / 100;
  const max = Math.max(1, meta, ...days.map((d) => (d.cap > 0 ? d.fixedProd / d.cap : 0)));
  const y = (v: number) => pt + ih - (v / max) * ih;
  const labelEvery = Math.ceil(n / Math.max(1, Math.floor(iw / 26)));
  const showValues = slot >= 22;

  return (
    <div ref={ref} className="chart">
      <svg width={W} height={H} role="img" aria-label="Utilização diária da capacidade">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} className="gl" />
            <text x={pl - 6} y={y(t) + 3.5} textAnchor="end" className="ax">{t * 100}%</text>
          </g>
        ))}
        {days.map((d, i) => {
          const cx = pl + (i + 0.5) * slot, wd = new Date(d.d + 'T12:00:00Z').getUTCDay();
          const u = d.cap > 0 ? d.fixedProd / d.cap : null;
          const st = engine.status(u).k;
          return (
            <g key={d.d}>
              {u != null && (
                <rect x={cx - bw / 2} y={y(u)} width={bw} height={Math.max(1, y(0) - y(u))} rx={2} fill={COLOR[st]}>
                  <title>{`${d.d.slice(8)}/${d.d.slice(5, 7)} · ${Math.round(u * 100)}%`}</title>
                </rect>
              )}
              {u != null && showValues && <text x={cx} y={y(u) - 5} textAnchor="middle" className="bv" fill={st === 'good' ? '#26384a' : st === 'warn' ? '#9a6700' : '#b42318'}>{Math.round(u * 100)}</text>}
              {i % labelEvery === 0 && (
                <>
                  <text x={cx} y={H - pb + 14} textAnchor="middle" className={u == null ? 'ax off' : 'ax dk'}>{d.d.slice(8)}</text>
                  <text x={cx} y={H - pb + 26} textAnchor="middle" className="ax off">{WD[wd]}</text>
                </>
              )}
            </g>
          );
        })}
        <line x1={pl} x2={W - pr} y1={y(meta)} y2={y(meta)} className="target" />
      </svg>
      <div className="legend">
        <span><i style={{ background: COLOR.good }} />No alvo</span>
        <span><i style={{ background: COLOR.warn }} />Abaixo da meta</span>
        <span><i style={{ background: COLOR.crit }} />Crítico (&lt; {engine.config.alerta}%)</span>
        <span><i className="dash" />Meta {engine.config.meta}%</span>
      </div>
    </div>
  );
}
