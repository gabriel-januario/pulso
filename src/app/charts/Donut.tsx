import { hours, hours1, pct } from '../format';
import { groupColor, truncate } from '../theme';
import { useTipProps } from '../tooltip';
import { useWidth } from '../useWidth';

/** Horas extras por grupo. A legenda fica ao lado no desktop e abaixo em telas estreitas. */
export function Donut({ items, onPick }: { items: { group: string; minutes: number }[]; onPick(g: string): void }) {
  const [ref, W] = useWidth<HTMLDivElement>(420);
  const tipProps = useTipProps();
  const total = items.reduce((q, o) => q + o.minutes, 0);
  if (!total) return <div ref={ref}><p className="empty">Sem horas extras no período.</p></div>;
  const vertical = W < 440, R = vertical ? Math.min(66, W / 2 - 10) : 72, r0 = R * 0.62;
  const H = vertical ? 2 * R + 30 + items.length * 22 : Math.max(2 * R + 12, items.length * 22 + 20);
  const cx = vertical ? W / 2 : R + 6, cy = vertical ? R + 6 : H / 2;
  const lx = vertical ? 0 : cx + R + 22;
  let a0 = -Math.PI / 2;
  const p = (rad: number, a: number) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  return (
    <div ref={ref} className="chart">
      <svg width={W} height={H} role="img" aria-label="Horas extras por grupo">
        {items.map((o) => {
          const a1 = a0 + (o.minutes / total) * Math.PI * 2, big = a1 - a0 > Math.PI ? 1 : 0;
          const [x1, y1] = p(R, a0), [x2, y2] = p(R, a1 - 1e-4), [x3, y3] = p(r0, a1 - 1e-4), [x4, y4] = p(r0, a0);
          a0 = a1;
          return <path key={o.group} d={`M${x1} ${y1}A${R} ${R} 0 ${big} 1 ${x2} ${y2}L${x3} ${y3}A${r0} ${r0} 0 ${big} 0 ${x4} ${y4}Z`} fill={groupColor(o.group)} stroke="#fff" strokeWidth={1.5} className="clk"
            onClick={() => onPick(o.group)} {...tipProps({ title: o.group, rows: [{ label: 'Horas extras', value: `${hours1(o.minutes)} h`, color: groupColor(o.group) }, { label: 'Participação', value: pct(o.minutes / total) }] })} />;
        })}
        <text x={cx} y={cy + 3} textAnchor="middle" className="big">{hours(total)}</text>
        <text x={cx} y={cy + 18} textAnchor="middle" className="ax">h extras</text>
        {items.map((o, i) => {
          const y = vertical ? 2 * R + 30 + i * 22 : cy - (items.length * 22) / 2 + i * 22 + 14;
          return (
            <g key={o.group} className="clk" onClick={() => onPick(o.group)}>
              <rect x={lx} y={y - 9} width={10} height={10} rx={2} fill={groupColor(o.group)} />
              <text x={lx + 15} y={y} className="nm" style={{ fontSize: 10.5 }}>{truncate(o.group, W - lx - 100, 10.5)}</text>
              <text x={W - 40} y={y} textAnchor="end" className="val" style={{ fontSize: 10.5 }}>{hours(o.minutes)}</text>
              <text x={W - 2} y={y} textAnchor="end" className="ax">{pct(o.minutes / total)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
