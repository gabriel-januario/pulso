import type { ParetoItem } from '../../analytics/dashboard';
import { axisNum, hours, hours1, int, pct } from '../format';
import { niceAxis, textWidth, truncate } from '../theme';
import { useTipProps } from '../tooltip';
import { useWidth } from '../useWidth';

/** Pareto dos improdutivos: barras por motivo e curva acumulada; em destaque os motivos que somam 80%. */
export function Pareto({ items }: { items: ParetoItem[] }) {
  const [ref, W] = useWidth<HTMLDivElement>(520);
  const tipProps = useTipProps();
  const H = 330;
  if (!items.length) return <div ref={ref}><p className="empty">Nenhum improdutivo apontado no período.</p></div>;
  const pl = 42, pr = 40, pt = 30, pb = 50, n = items.length, slot = (W - pl - pr) / n, bw = Math.min(46, slot * 0.64);
  const ax = niceAxis((items[0].minutes / 60) * 1.12);
  const Y = (min: number) => H - pb - (min / 60 / ax.max) * (H - pb - pt), Yc = (c: number) => H - pb - c * (H - pb - pt), X = (i: number) => pl + (i + 0.5) * slot;
  const nVital = items.filter((r) => r.vital).length;
  /** quebra o nome em até 3 linhas que caibam na coluna; a última é abreviada se sobrar texto */
  const lines = (name: string): string[] => {
    const max = slot - 4, words = name.split(' '), out: string[] = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (textWidth(next, 9.5) <= max || !cur) cur = next; else { out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
    if (out.length > 3) out.splice(2, out.length, out.slice(2).join(' '));
    return out.map((l) => truncate(l, max, 9.5));
  };
  return (
    <div ref={ref} className="chart">
      <svg width={W} height={H} role="img" aria-label="Pareto dos motivos de improdutivo">
        {nVital < n && <rect x={pl} y={pt - 10} width={nVital * slot} height={H - pb - pt + 10} fill="#fff4ee" />}
        {Array.from({ length: ax.n + 1 }, (_, k) => (
          <g key={k}><line x1={pl} x2={W - pr} y1={Y(ax.step * k * 60)} y2={Y(ax.step * k * 60)} className={k ? 'gl' : 'bl'} />
            <text x={pl - 6} y={Y(ax.step * k * 60) + 3.3} textAnchor="end" className="ax">{axisNum(ax.step * k)}{k === ax.n ? ' h' : ''}</text></g>
        ))}
        {[0, 0.5, 1].map((c) => <text key={c} x={W - pr + 6} y={Yc(c) + 3.3} className="ax">{pct(c)}</text>)}
        <line x1={pl} x2={W - pr} y1={Yc(0.8)} y2={Yc(0.8)} stroke="#0e1d2c" strokeWidth={1.1} strokeDasharray="4 3" />
        <text x={W - pr + 6} y={Yc(0.8) + 3.3} className="ax dk" style={{ fontWeight: 700 }}>80%</text>
        {items.map((r, i) => {
          const c = r.code == null ? '#c6cfd8' : r.vital ? '#eb6834' : '#f6c1a6', ls = lines(r.name), v = hours(r.minutes);
          return (
            <g key={r.name} {...tipProps({ title: r.name, rows: [{ label: 'Horas', value: `${hours1(r.minutes)} h`, color: c }, { label: 'Participação', value: pct(r.share) }, { label: 'Acumulado', value: pct(r.cumulative) }, { label: 'Ocorrências', value: int(r.count) }] })}>
              <rect x={X(i) - bw / 2} y={Y(r.minutes)} width={bw} height={Math.max(1, H - pb - Y(r.minutes))} rx={2} fill={c} />
              {textWidth(v, 10.5) <= slot && <text x={X(i)} y={Y(r.minutes) - 5} textAnchor="middle" className="lbl" style={{ fontSize: 10.5 }} fill={r.vital ? '#9a3a12' : '#7c8b9a'}>{v}</text>}
              {ls.map((l, k) => <text key={k} x={X(i)} y={H - pb + 13 + k * 11} textAnchor="middle" className={r.vital ? 'ax dk' : 'ax'} style={{ fontSize: 9.5 }}>{l}</text>)}
            </g>
          );
        })}
        <path d={items.map((r, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Yc(r.cumulative).toFixed(1)}`).join('')} fill="none" stroke="#0e1d2c" strokeWidth={1.8} strokeLinejoin="round" pointerEvents="none" />
        {items.map((r, i) => <circle key={r.name} cx={X(i)} cy={Yc(r.cumulative)} r={3.2} fill="#fff" stroke="#0e1d2c" strokeWidth={1.6} pointerEvents="none" />)}
        <rect x={pl} y={4} width={10} height={10} rx={2} fill="#eb6834" />
        <text x={pl + 15} y={13} className="ax dk" style={{ fontWeight: 600, fontSize: 10 }}>{nVital} {nVital === 1 ? 'motivo' : 'motivos'} · {pct(items[nVital - 1].cumulative)} das horas</text>
      </svg>
    </div>
  );
}
