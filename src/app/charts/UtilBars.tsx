import type { Engine } from '../../engine';
import { hours1, pct, pct1, pp } from '../format';
import { STATUS_BAR, STATUS_INK, truncate } from '../theme';
import { useTipProps } from '../tooltip';
import { useWidth } from '../useWidth';

export interface UtilItem { key: string; label: string; util: number | null; cap: number; fixedProd: number; color: string; selected?: boolean; count?: number }

/** Utilização por grupo ou por máquina, ordenada, com a linha da meta. Clique filtra. */
export function UtilBars({ items, engine, onPick }: { items: UtilItem[]; engine: Engine; onPick(key: string): void }) {
  const [ref, W] = useWidth<HTMLDivElement>(360);
  const tipProps = useTipProps();
  const meta = engine.config.meta / 100;
  if (!items.length) return <div ref={ref}><p className="empty">Sem capacidade validada no período.</p></div>;
  const sorted = [...items].sort((a, b) => (b.util ?? -1) - (a.util ?? -1));
  const rh = 26, H = 22 + sorted.length * rh + 6;
  const lw = Math.min(210, Math.max(W * 0.42, 140)), vw = 50, x0 = lw + 8, x1 = W - vw;
  const mx = Math.max(1, ...sorted.map((i) => i.util ?? 0)), X = (v: number) => x0 + (Math.min(v, mx) / mx) * (x1 - x0);
  const ticks = x1 - x0 < 190 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1];
  return (
    <div ref={ref} className="chart">
      <svg width={W} height={H} role="img" aria-label="Utilização ordenada">
        {ticks.filter((t) => t <= mx).map((t) => (
          <g key={t}>
            <line x1={X(t)} x2={X(t)} y1={14} y2={18 + sorted.length * rh} className="gl" />
            <text x={X(t)} y={10} textAnchor="middle" className="ax">{pct(t)}</text>
          </g>
        ))}
        {sorted.map((it, i) => {
          const y = 18 + i * rh, st = engine.status(it.util).k, bh = 15;
          return (
            <g key={it.key} className="row clk" onClick={() => onPick(it.key)}
              {...tipProps({
                title: it.label,
                subtitle: `Utilização ${pct1(it.util)}${it.util != null ? ` · ${pp((it.util - meta) * 100)} vs meta` : ''}`,
                rows: [{ label: 'Capacidade', value: `${hours1(it.cap)} h`, color: '#e8eef5' }, { label: 'Produzido na escala', value: `${hours1(it.fixedProd)} h`, color: STATUS_BAR[st] }],
                note: it.count ? `${it.count} máquinas · clique para filtrar` : 'Clique para filtrar',
              })}>
              <rect x={0} y={y - 3} width={W} height={rh} fill={it.selected ? '#eaf2fd' : 'transparent'} />
              <circle cx={5} cy={y + rh / 2 - 3} r={3.5} fill={it.color} />
              <text x={14} y={y + rh / 2 + 0.5} className="nm" style={{ fontWeight: it.selected ? 700 : 500 }}>{truncate(it.label, lw - 16)}</text>
              <rect x={x0} y={y + (rh - bh) / 2 - 3} width={x1 - x0} height={bh} rx={2} fill="#f1f4f8" />
              <rect x={x0} y={y + (rh - bh) / 2 - 3} width={Math.max(1, X(it.util ?? 0) - x0)} height={bh} rx={2} fill={STATUS_BAR[st]} />
              <text x={W - 2} y={y + rh / 2 + 0.5} textAnchor="end" className="val" fill={STATUS_INK[st]}>{pct1(it.util)}</text>
            </g>
          );
        })}
        <line x1={X(meta)} x2={X(meta)} y1={14} y2={18 + sorted.length * rh} stroke="#0e1d2c" strokeWidth={1.4} strokeDasharray="4 3" pointerEvents="none" />
      </svg>
    </div>
  );
}
