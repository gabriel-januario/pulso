import { axisNum, hours1 } from '../format';
import { niceAxis, textWidth } from '../theme';
import { useTipProps } from '../tooltip';
import { useWidth } from '../useWidth';

export interface StackSeries { key: string; label: string; color: string; hatch?: boolean }
export interface StackPoint { key: string; label: string; sub?: string; title: string; values: number[] }

/** Colunas empilhadas em horas (valores em minutos), com total no topo quando couber. */
export function StackedColumns({ series, points, height = 260 }: { series: StackSeries[]; points: StackPoint[]; height?: number }) {
  const [ref, W] = useWidth<HTMLDivElement>(520);
  const tipProps = useTipProps();
  const H = height, n = points.length;
  if (!n) return <div ref={ref}><p className="empty">Sem dados no período.</p></div>;
  const totals = points.map((p) => p.values.reduce((q, v) => q + v, 0));
  const ax = niceAxis((Math.max(1, ...totals) / 60) * 1.12);
  const hasSub = points.some((p) => p.sub);
  const pl = 40, pr = 4, pt = 14, pb = hasSub ? 30 : 18, slot = (W - pl - pr) / n, bw = Math.max(3, Math.min(30, slot * 0.62));
  const Y = (min: number) => H - pb - (min / 60 / ax.max) * (H - pb - pt), x = (i: number) => pl + (i + 0.5) * slot;
  const every = Math.max(1, Math.ceil((hasSub ? 17 : 34) / slot));
  return (
    <div ref={ref} className="chart">
      <svg width={W} height={H} role="img" aria-label={series.map((s) => s.label).join(' e ')}>
        <defs>
          <pattern id="hatch-col" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="rgba(98,80,214,.15)" /><line x1="0" y1="0" x2="0" y2="6" stroke="#6250d6" strokeWidth="2" />
          </pattern>
        </defs>
        {Array.from({ length: ax.n + 1 }, (_, k) => (
          <g key={k}><line x1={pl} x2={W - pr} y1={Y(ax.step * k * 60)} y2={Y(ax.step * k * 60)} className={k ? 'gl' : 'bl'} />
            <text x={pl - 6} y={Y(ax.step * k * 60) + 3.3} textAnchor="end" className="ax">{axisNum(ax.step * k)}{k === ax.n ? ' h' : ''}</text></g>
        ))}
        {points.map((p, i) => {
          let run = 0;
          const t = hours1(totals[i]);
          return (
            <g key={p.key} {...tipProps({ title: p.title, rows: series.map((s, j) => ({ label: s.label, value: `${hours1(p.values[j])} h`, color: s.color })) })}>
              <rect x={pl + i * slot} y={pt} width={slot} height={H - pb - pt} fill="transparent" />
              {series.map((s, j) => {
                const v = p.values[j]; if (v <= 0) return null;
                const top = Y(run + v), h = Y(run) - top; run += v;
                return <rect key={s.key} x={x(i) - bw / 2} y={top} width={bw} height={Math.max(0.5, h)} fill={s.hatch ? 'url(#hatch-col)' : s.color} />;
              })}
              {totals[i] > 0 && slot >= 18 && textWidth(t, 9.5) <= slot && <text x={x(i)} y={Y(totals[i]) - 4} textAnchor="middle" className="lbl" style={{ fontSize: 9.5 }} fill="#33475b">{t}</text>}
              {i % every === 0 && <text x={x(i)} y={H - pb + 13} textAnchor="middle" className="ax dk">{p.label}</text>}
              {hasSub && i % every === 0 && <text x={x(i)} y={H - pb + 25} textAnchor="middle" className="ax off" style={{ fontSize: 8.5 }}>{p.sub}</text>}
            </g>
          );
        })}
      </svg>
      <div className="legend">{series.map((s) => <span key={s.key}><i className={s.hatch ? 'hatch' : undefined} style={s.hatch ? undefined : { background: s.color }} />{s.label}</span>)}</div>
    </div>
  );
}
