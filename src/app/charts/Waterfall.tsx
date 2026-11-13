import type { WaterfallStep } from '../../analytics/dashboard';
import { axisNum, hours, hours1, pct } from '../format';
import { niceAxis, textWidth } from '../theme';
import { useTipProps } from '../tooltip';
import { useWidth } from '../useWidth';

const SHORT: Record<string, string> = {
  Capacidade: 'Capac.', Improdutivo: 'Improd.', Manutenção: 'Manut.', 'Sem cobertura': 'Sem cobert.', 'Sem programação': 'Sem progr.',
  'Sem apontamento': 'Sem apont.', Produzido: 'Produz.', 'Fora da escala e HE': 'Fora esc. e HE', 'Produção total': 'Prod. total',
};
const twoLines = (t: string): [string, string] => {
  const w = t.split(' ');
  if (w.length > 2) { const h = Math.ceil(w.length / 2); return [w.slice(0, h).join(' '), w.slice(h).join(' ')]; }
  return [w[0], w.slice(1).join(' ')];
};

/** Da capacidade fixa à produção total: cada perda desce a escada, a produção fora da escala sobe. */
export function Waterfall({ steps, capacity }: { steps: WaterfallStep[]; capacity: number }) {
  const [ref, W] = useWidth<HTMLDivElement>(480);
  const tipProps = useTipProps();
  const H = 300;
  if (!(capacity > 0)) return <div ref={ref}><p className="empty">Sem capacidade validada no período.</p></div>;
  const pl = 44, pt = 22, pb = 40, n = steps.length, slot = (W - pl - 6) / n, bw = Math.min(54, slot * 0.66);
  const top = Math.max(...steps.filter((s) => s.kind !== 'loss').map((s) => s.value));
  const ax = niceAxis((top / 60) * 1.08), Y = (v: number) => H - pb - (v / 60 / ax.max) * (H - pb - pt);
  let run = 0, prevTop: number | null = null;
  return (
    <div ref={ref} className="chart">
      <svg width={W} height={H} role="img" aria-label="Cascata da capacidade até a produção">
        {Array.from({ length: ax.n + 1 }, (_, k) => (
          <g key={k}>
            <line x1={pl} x2={W - 4} y1={Y(ax.step * k * 60)} y2={Y(ax.step * k * 60)} className={k ? 'gl' : 'bl'} />
            <text x={pl - 6} y={Y(ax.step * k * 60) + 3.3} textAnchor="end" className="ax">{axisNum(ax.step * k)}{k === ax.n ? ' h' : ''}</text>
          </g>
        ))}
        {steps.map((s, i) => {
          const cx = pl + (i + 0.5) * slot;
          let a: number, b: number;
          if (s.kind === 'total' || s.kind === 'subtotal') { a = 0; b = s.value; run = s.value; }
          else if (s.kind === 'loss') { a = run - s.value; b = run; run = a; }
          else { a = run; b = run + s.value; run = b; }
          const connector = prevTop;
          prevTop = s.kind === 'loss' ? Y(a) : Y(b);
          let [l1, l2] = twoLines(s.label);
          if (Math.max(textWidth(l1, 9.5), textWidth(l2, 9.5)) > slot - 6) [l1, l2] = twoLines(SHORT[s.label] ?? s.label);
          const fs = Math.max(7.5, Math.min(9.5, (slot - 6) / (Math.max(l1.length, l2.length, 1) * 0.6)));
          const bold = s.kind === 'total' || s.kind === 'subtotal';
          const val = `${s.kind === 'loss' ? '−' : s.kind === 'gain' ? '+' : ''}${hours(s.value)}`;
          return (
            <g key={s.label} {...tipProps({ title: s.label, rows: [{ label: 'Horas', value: `${hours1(s.value)} h`, color: s.color }], note: `${pct(s.value / capacity)} da capacidade fixa` })}>
              {connector != null && <line x1={cx - slot + bw / 2} x2={cx - bw / 2} y1={connector} y2={connector} stroke="#9aa8b6" strokeDasharray="2 2" />}
              <rect x={cx - bw / 2} y={Y(b)} width={bw} height={Math.max(1, Y(a) - Y(b))} rx={2} fill={s.color} />
              {textWidth(val, 10.5) <= slot && <text x={cx} y={Y(b) - 5} textAnchor="middle" className="lbl" style={{ fontSize: 10.5 }} fill={s.kind === 'loss' ? (s.color === '#a3b1c0' ? '#64748b' : s.color) : '#26384a'}>{val}</text>}
              <text x={cx} y={H - pb + 14} textAnchor="middle" className="ax dk" style={{ fontSize: fs, fontWeight: bold ? 700 : 500 }}>{l1}</text>
              {l2 && <text x={cx} y={H - pb + 26} textAnchor="middle" className="ax dk" style={{ fontSize: fs, fontWeight: bold ? 700 : 500 }}>{l2}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
