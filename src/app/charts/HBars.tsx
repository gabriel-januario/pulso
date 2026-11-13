import type { ReactNode } from 'react';
import { useTipProps, type Tip } from '../tooltip';

export interface HBarItem {
  key: string; label: string; sub?: string;
  /** segmentos empilhados (minutos ou horas — a mesma unidade de `max`) */
  segs: { v: number; color: string; hatch?: boolean }[];
  /** trilho de fundo (ex.: capacidade) e marca da meta */
  track?: number; target?: number;
  value: ReactNode; tip?: Tip; onClick?(): void;
}

/** Barras horizontais em HTML: o rótulo quebra linha e nunca sai do quadro. */
export function HBars({ items, max, valueWidth = 150 }: { items: HBarItem[]; max: number; valueWidth?: number }) {
  const tipProps = useTipProps();
  const m = Math.max(1e-9, max);
  return (
    <div className="hb2" style={{ '--vw': `${valueWidth}px` } as React.CSSProperties}>
      {items.map((it) => {
        const Row = it.onClick ? 'button' : 'div';
        return (
          <Row key={it.key} type={it.onClick ? 'button' : undefined} className={it.onClick ? 'r clk' : 'r'} onClick={it.onClick} {...(it.tip ? tipProps(it.tip) : {})}>
            <span className="nm">{it.label}{it.sub && <small>{it.sub}</small>}</span>
            <span className="br">
              {it.track != null && <span className="trk" style={{ width: `${Math.min(100, (it.track / m) * 100)}%` }} />}
              <span className="sg">{it.segs.filter((s) => s.v > 0).map((s, i) => <b key={i} className={s.hatch ? 'hatch' : undefined} style={{ width: `${(s.v / m) * 100}%`, background: s.hatch ? undefined : s.color }} />)}</span>
              {it.target != null && <i style={{ left: `${Math.min(100, (it.target / m) * 100)}%` }} />}
            </span>
            <span className="vl">{it.value}</span>
          </Row>
        );
      })}
    </div>
  );
}
