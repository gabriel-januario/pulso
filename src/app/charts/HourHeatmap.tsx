import type { Engine } from '../../engine';
import { dec1, hours, WEEKDAY } from '../format';
import { useTipProps } from '../tooltip';
import { useWidth } from '../useWidth';

const scale = (t: number) => {
  const a = [238, 243, 251], b = [29, 79, 156], k = Math.pow(Math.max(0, Math.min(1, t)), 0.8);
  return `rgb(${a.map((c, i) => Math.round(c + (b[i] - c) * k)).join(',')})`;
};

/** Média de máquinas produzindo por hora do dia e dia da semana, com o início de cada turno. */
export function HourHeatmap({ rows, engine }: { rows: { weekday: number; days: number; hours: number[] }[]; engine: Engine }) {
  const [ref, W0] = useWidth<HTMLDivElement>(520);
  const tipProps = useTipProps();
  const W = Math.max(W0, 420), H = 250, lw = 40, rw = 54, cw = (W - lw - rw) / 24, ch = (H - 46) / 7;
  const mx = Math.max(0.01, ...rows.flatMap((r) => r.hours));
  return (
    <div ref={ref} className="chart scroll-x">
      <svg width={W} height={H} role="img" aria-label="Máquinas produzindo por hora e dia da semana">
        {Array.from({ length: 12 }, (_, k) => k * 2).map((h) => <text key={h} x={lw + h * cw + cw / 2} y={11} textAnchor="middle" className="ax">{String(h).padStart(2, '0')}h</text>)}
        <text x={W - 2} y={11} textAnchor="end" className="ax" style={{ fontSize: 8.5, fontWeight: 700 }}>H/DIA</text>
        {rows.map((r, j) => {
          const y = 18 + j * ch;
          return (
            <g key={r.weekday}>
              <text x={lw - 6} y={y + ch / 2 + 3.5} textAnchor="end" className="ax dk" style={{ fontWeight: 600, fontSize: 10 }}>{WEEKDAY[r.weekday]}</text>
              {r.hours.map((v, h) => (
                <g key={h}>
                  <rect x={lw + h * cw + 0.5} y={y + 0.5} width={cw - 1} height={ch - 1} rx={2} fill={scale(v / mx)}
                    {...tipProps({ title: `${WEEKDAY[r.weekday]} · ${String(h).padStart(2, '0')}:00–${String(h + 1).padStart(2, '0')}:00`, rows: [{ label: 'Máquinas produzindo (média)', value: dec1(v), color: scale(v / mx) }], note: `${r.days} dia(s) no período` })} />
                  {cw >= 26 && v >= 0.05 && <text x={lw + h * cw + cw / 2} y={y + ch / 2 + 3.5} textAnchor="middle" className="cellv" fill={v / mx > 0.55 ? '#fff' : '#33475b'} pointerEvents="none">{dec1(v)}</text>}
                </g>
              ))}
              <text x={W - 2} y={y + ch / 2 + 3.5} textAnchor="end" className="val" style={{ fontSize: 10 }}>{hours(r.hours.reduce((q, v) => q + v, 0) * 60)} h</text>
            </g>
          );
        })}
        {engine.config.shifts.map((s) => {
          const [hh, mm] = String(s.ini || '').split(':').map(Number);
          if (!isFinite(hh)) return null;
          const x = lw + (hh + (mm || 0) / 60) * cw;
          return (
            <g key={s.id} pointerEvents="none">
              <line x1={x} x2={x} y1={16} y2={20 + 7 * ch} stroke="#0e1d2c" strokeWidth={1.2} strokeDasharray="3 2" />
              <text x={x + 3} y={18 + 7 * ch + 14} className="ax dk" style={{ fontWeight: 600, fontSize: 9 }}>{s.nome || s.id}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
