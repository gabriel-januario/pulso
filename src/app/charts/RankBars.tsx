import { truncate } from '../theme';
import { useTipProps, type Tip } from '../tooltip';
import { useWidth } from '../useWidth';

export interface RankItem { key: string; label: string; value: number; display: string; tip: Tip }

/** Ranking horizontal simples (ex.: top operadores). */
export function RankBars({ items, color = '#2563c9' }: { items: RankItem[]; color?: string }) {
  const [ref, W] = useWidth<HTMLDivElement>(420);
  const tipProps = useTipProps();
  if (!items.length) return <div ref={ref}><p className="empty">Sem apontamentos no período.</p></div>;
  const rh = 25, H = 8 + items.length * rh, lw = Math.min(210, W * 0.48), vw = 52, x0 = lw + 6, x1 = W - vw, max = items[0].value || 1;
  return (
    <div ref={ref} className="chart">
      <svg width={W} height={H} role="img" aria-label="Ranking">
        {items.map((it, i) => {
          const y = 4 + i * rh;
          return (
            <g key={it.key} {...tipProps(it.tip)}>
              <rect x={0} y={y} width={W} height={rh} fill="transparent" />
              <text x={0} y={y + rh / 2 + 3.5} className="nm">{truncate(it.label, lw - 6)}</text>
              <rect x={x0} y={y + 5} width={Math.max(1, (it.value / max) * (x1 - x0))} height={rh - 10} rx={2} fill={color} fillOpacity={1 - i * 0.055} />
              <text x={W - 2} y={y + rh / 2 + 3.5} textAnchor="end" className="val">{it.display}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
