import type { Engine } from '../../engine';
import { axisNum, dec1, hours1, int, pct1, pp, WEEKDAY } from '../format';
import { niceAxis, SERIES, STATUS_BAR, STATUS_INK, textWidth } from '../theme';
import { useTipProps } from '../tooltip';
import { useWidth } from '../useWidth';

export interface TrendPoint {
  key: string;
  label: string;
  /** data AAAA-MM-DD quando o ponto é um dia (mostra o dia da semana e permite clique) */
  date?: string;
  title: string;
  cap: number; fixedProd: number; union: number; heAp: number; stop: number;
  highlight?: boolean;
}

/**
 * Dois painéis alinhados: utilização (barras por status + meta) e horas produzidas
 * (dentro da escala / fora da escala / hora extra) com o traço da capacidade.
 */
export function TrendChart({ points, engine, height = 330, onPick }: { points: TrendPoint[]; engine: Engine; height?: number; onPick?(p: TrendPoint): void }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const tipProps = useTipProps();
  const n = points.length, H = height, meta = engine.config.meta / 100;
  if (!n) return <div ref={ref} className="chart"><p className="empty">Sem dados no período.</p></div>;

  const hasCap = points.some((p) => p.cap > 0);
  const daily = points.every((p) => p.date);
  const ax = niceAxis((Math.max(1, ...points.map((p) => Math.max(p.cap, p.union))) / 60) * 1.16);
  const pl = Math.max(40, textWidth(`${axisNum(ax.max)} h`, 9.5) + 12), pr = 4;
  const slot = (W - pl - pr) / n, bw = Math.max(3, Math.min(30, slot * 0.62)), x = (i: number) => pl + (i + 0.5) * slot;
  const labH = daily ? 30 : 18;

  // painel de utilização (topo) e de horas (base)
  const uTop = 26, uBot = hasCap ? uTop + Math.round((H - labH - 60) * 0.5) : uTop;
  const hTop = hasCap ? uBot + 34 : uTop, hBot = H - labH;
  const yU = (u: number) => uBot - Math.max(0, Math.min(1.05, u)) * (uBot - uTop);
  const yH = (min: number) => hBot - (Math.max(0, min) / 60 / ax.max) * (hBot - hTop);
  const fsU = Math.min(10.5, Math.max(7.6, slot * 0.42)), fsH = Math.min(10, Math.max(7.6, slot * 0.38));
  const labelEvery = Math.max(1, Math.ceil((daily ? 17 : 30) / slot));

  const statusOf = (p: TrendPoint) => (p.cap > 0 ? engine.status(p.fixedProd / p.cap).k : 'none');
  const present = new Set(points.filter((p) => p.cap > 0).map(statusOf));

  return (
    <div ref={ref} className="chart">
      <svg width={W} height={H} role="img" aria-label="Utilização e horas produzidas por período">
        {hasCap && (
          <g>
            <text x={0} y={12} className="ptl">UTILIZAÇÃO</text>
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <g key={t}>
                <line x1={pl} x2={W - pr} y1={yU(t)} y2={yU(t)} className={t ? 'gl' : 'bl'} />
                <text x={pl - 7} y={yU(t) + 3.3} textAnchor="end" className="ax">{t * 100}%</text>
              </g>
            ))}
          </g>
        )}
        <text x={0} y={hasCap ? hTop - 14 : 12} className="ptl">HORAS PRODUZIDAS</text>
        {Array.from({ length: ax.n + 1 }, (_, k) => (
          <g key={k}>
            <line x1={pl} x2={W - pr} y1={yH(ax.step * k * 60)} y2={yH(ax.step * k * 60)} className={k ? 'gl' : 'bl'} />
            {(k === 0 || k === ax.n || !hasCap) && <text x={pl - 7} y={yH(ax.step * k * 60) + 3.3} textAnchor="end" className="ax">{axisNum(ax.step * k)}{k === ax.n ? ' h' : ''}</text>}
          </g>
        ))}
        {points.map((p, i) => {
          const u = p.cap > 0 ? p.fixedProd / p.cap : null, st = statusOf(p);
          const he = Math.min(p.union, p.heAp), fixed = Math.min(p.fixedProd, p.union - he), outside = Math.max(0, p.union - fixed - he);
          let run = 0;
          const parts = [[fixed, SERIES.produced], [outside, SERIES.outside], [he, SERIES.overtime]] as const;
          const uLabel = u == null ? '' : String(Math.round(u * 100));
          const hLabel = p.union > 0 ? (p.union / 60 >= 9.95 ? int(p.union / 60) : dec1(p.union / 60)) : '';
          const off = daily && (p.cap <= 0 || [0, 6].includes(new Date(p.date + 'T12:00:00Z').getUTCDay()));
          return (
            <g key={p.key}>
              {p.highlight && <rect x={pl + i * slot} y={uTop - 6} width={slot} height={H - uTop + 6} fill="#e8f0fb" />}
              {u != null && <rect x={x(i) - bw / 2} y={yU(u)} width={bw} height={Math.max(1, uBot - yU(u))} rx={2} fill={STATUS_BAR[st]} />}
              {u != null && slot >= 16 && textWidth(uLabel, fsU) <= slot - 2 && (
                <text x={x(i)} y={yU(u) - 4} textAnchor="middle" className="lbl" style={{ fontSize: fsU }} fill={STATUS_INK[st]}>{uLabel}</text>
              )}
              {parts.map(([v, c], j) => {
                if (v <= 1e-6) return null;
                const top = yH(run + v), h = yH(run) - top; run += v;
                return <rect key={j} x={x(i) - bw / 2} y={top} width={bw} height={h} fill={c} />;
              })}
              {p.cap > 0 && <line x1={x(i) - bw / 2 - 3} x2={x(i) + bw / 2 + 3} y1={yH(p.cap)} y2={yH(p.cap)} stroke={SERIES.capacity} strokeWidth={1.8} />}
              {hLabel && slot >= 17 && textWidth(hLabel, fsH) <= slot && (
                <text x={x(i)} y={Math.min(yH(p.union), p.cap > 0 ? yH(p.cap) : Infinity) - 5} textAnchor="middle" className="lbl" style={{ fontSize: fsH }} fill="#33475b">{hLabel}</text>
              )}
              {i % labelEvery === 0 && (
                <>
                  <text x={x(i)} y={H - labH + 13} textAnchor="middle" className={off ? 'ax off' : 'ax dk'}>{p.label}</text>
                  {daily && <text x={x(i)} y={H - labH + 25} textAnchor="middle" className="ax off" style={{ fontSize: 8.5 }}>{WEEKDAY[new Date(p.date + 'T12:00:00Z').getUTCDay()][0]}</text>}
                </>
              )}
              <rect
                x={pl + i * slot} y={uTop - 6} width={slot} height={H - uTop + 6} fill="transparent"
                className={onPick ? 'hit clk' : 'hit'} onClick={onPick ? () => onPick(p) : undefined}
                {...tipProps({
                  title: p.title,
                  subtitle: u == null ? 'Sem capacidade validada' : `Utilização ${pct1(u)} · ${pp((u - meta) * 100)} vs meta`,
                  rows: [
                    ...(p.cap > 0 ? [{ label: 'Capacidade', value: `${hours1(p.cap)} h`, color: '#e8eef5' }] : []),
                    { label: 'Dentro da escala', value: `${hours1(fixed)} h`, color: SERIES.produced },
                    ...(outside > 0 ? [{ label: 'Fora da escala', value: `${hours1(outside)} h`, color: SERIES.outside }] : []),
                    ...(he > 0 ? [{ label: 'Hora extra', value: `${hours1(he)} h`, color: SERIES.overtime }] : []),
                    ...(p.stop > 0 ? [{ label: 'Improdutivo', value: `${hours1(p.stop)} h`, color: SERIES.stop }] : []),
                  ],
                  note: onPick ? 'Clique para detalhar' : undefined,
                })}
              />
            </g>
          );
        })}
        {hasCap && <line x1={pl} x2={W - pr} y1={yU(meta)} y2={yU(meta)} stroke="#0e1d2c" strokeWidth={1.3} strokeDasharray="5 3.5" pointerEvents="none" />}
      </svg>
      <div className="legend">
        {present.has('good') && <span><i style={{ background: STATUS_BAR.good }} />No alvo</span>}
        {present.has('warn') && <span><i style={{ background: STATUS_BAR.warn }} />Abaixo da meta</span>}
        {present.has('crit') && <span><i style={{ background: STATUS_BAR.crit }} />Crítico (&lt; {engine.config.alerta}%)</span>}
        {hasCap && <span><i className="dash" />Meta {engine.config.meta}%</span>}
        <span><i style={{ background: SERIES.produced }} />Dentro da escala</span>
        <span><i style={{ background: SERIES.outside }} />Fora da escala</span>
        <span><i style={{ background: SERIES.overtime }} />Hora extra</span>
        <span><i className="tick" />Capacidade</span>
      </div>
    </div>
  );
}
