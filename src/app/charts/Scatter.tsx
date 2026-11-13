import type { ScatterPoint } from '../../analytics/dashboard';
import type { Engine } from '../../engine';
import { hours1, pct, pct1 } from '../format';
import { groupColor, niceAxis, STATUS_BAR } from '../theme';
import { useTipProps } from '../tooltip';
import { useWidth } from '../useWidth';

/** Cada bolha é uma máquina (tamanho = capacidade). Quadrante verde: acima da meta e com perdas abaixo da média. */
export function Scatter({ points, engine, selected, onPick }: { points: ScatterPoint[]; engine: Engine; selected: string[] | null; onPick(rc: string): void }) {
  const [ref, W] = useWidth<HTMLDivElement>(560);
  const tipProps = useTipProps();
  const H = 320;
  if (!points.length) return <div ref={ref}><p className="empty">Sem capacidade validada no período.</p></div>;
  const pl = 44, pr = 14, pt = 14, pb = 24;
  const xm = Math.max(1, ...points.map((p) => p.util)) * 1.04, ym = Math.max(0.05, ...points.map((p) => p.losses)) * 1.15, zm = Math.max(...points.map((p) => p.cap));
  const X = (v: number) => pl + 10 + (v / xm) * (W - pl - pr - 10), Y = (v: number) => H - pb - 10 - (v / ym) * (H - pb - pt - 10), R = (z: number) => 4 + Math.sqrt(z / zm) * 13;
  const meta = engine.config.meta / 100, yax = niceAxis(ym);
  const avg = points.reduce((q, p) => q + p.losses * p.cap, 0) / points.reduce((q, p) => q + p.cap, 0);
  const labelled = new Set([...points].sort((a, b) => b.gapToTarget - a.gapToTarget).slice(0, 5).map((p) => p.rc));
  return (
    <div ref={ref} className="chart">
      <svg width={W} height={H} role="img" aria-label="Utilização por perdas apontadas">
        <rect x={pl} y={Y(avg)} width={X(meta) - pl} height={H - pb - Y(avg)} fill="#fbeeee" opacity={0.55} />
        <rect x={X(meta)} y={pt} width={W - pr - X(meta)} height={Y(avg) - pt} fill="#fdf3e2" opacity={0.5} />
        <rect x={X(meta)} y={Y(avg)} width={W - pr - X(meta)} height={H - pb - Y(avg)} fill="#eaf4ec" opacity={0.6} />
        {[0, 0.25, 0.5, 0.75, 1].filter((t) => t <= xm).map((t) => (
          <g key={t}><line x1={X(t)} x2={X(t)} y1={pt} y2={H - pb} className="gl" /><text x={X(t)} y={H - pb + 15} textAnchor="middle" className="ax">{pct(t)}</text></g>
        ))}
        {Array.from({ length: yax.n + 1 }, (_, k) => yax.step * k).filter((v) => v <= ym).map((v, k) => (
          <g key={k}><line x1={pl} x2={W - pr} y1={Y(v)} y2={Y(v)} className={k ? 'gl' : 'bl'} /><text x={pl - 6} y={Y(v) + 3.3} textAnchor="end" className="ax">{pct(v)}</text></g>
        ))}
        <line x1={X(meta)} x2={X(meta)} y1={pt} y2={H - pb} stroke="#0e1d2c" strokeWidth={1.3} strokeDasharray="4 3" />
        <text x={X(meta) + 4} y={pt + 10} className="ax dk" style={{ fontWeight: 600 }}>meta {engine.config.meta}%</text>
        <line x1={pl} x2={W - pr} y1={Y(avg)} y2={Y(avg)} stroke="#8b97a3" strokeDasharray="2 3" />
        <text x={pl + 4} y={Y(avg) - 4} className="ax">média {pct(avg)}</text>
        {[...points].sort((a, b) => b.cap - a.cap).map((p) => {
          const sel = selected?.includes(p.rc), dim = selected && !sel, c = groupColor(p.group);
          return (
            <circle key={p.rc} cx={X(p.util)} cy={Y(p.losses)} r={R(p.cap)} fill={c} fillOpacity={dim ? 0.15 : 0.55} stroke={sel ? '#0e1d2c' : c} strokeWidth={sel ? 2 : 1} className="clk"
              onClick={() => onPick(p.rc)}
              {...tipProps({ title: p.name, subtitle: p.group, rows: [
                { label: 'Utilização', value: pct1(p.util), color: STATUS_BAR[engine.status(p.util).k] },
                { label: 'Perdas apontadas', value: `${pct1(p.losses)} da capacidade`, color: '#eb6834' },
                { label: 'Capacidade', value: `${hours1(p.cap)} h`, color: '#e8eef5' },
              ] })} />
          );
        })}
        {points.filter((p) => labelled.has(p.rc)).map((p) => (
          <text key={p.rc} x={Math.min(X(p.util) + R(p.cap) + 3, W - pr - 40)} y={Y(p.losses) + 3.5} className="plab">{p.rc}</text>
        ))}
      </svg>
    </div>
  );
}
