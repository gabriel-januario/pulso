import type { AggResult, Engine } from '../../engine';
import { hours1, pct, pct1, WEEKDAY, dmy } from '../format';
import { groupColor, STATUS_INK, truncate } from '../theme';
import { useTipProps } from '../tooltip';
import { useWidth } from '../useWidth';

const BINS: [number, string, string][] = [[0.25, '#d64b45', '< 25%'], [0.5, '#ef8f6f', '25–50%'], [0.65, '#f7c58f', '50–65%'], [0.85, '#fbe6b8', '65–85%'], [0.95, '#a9c4ec', '85–95%'], [9, '#2563c9', '≥ 95%']];
const colorOf = (u: number) => BINS.find((b) => u < b[0])![1];

/** Utilização de cada máquina em cada dia, agrupada por família. Clique no dia detalha; na máquina, filtra. */
export function Heatmap({ A, engine, selected, onPickMachine, onPickDay, onPickGroup }: {
  A: AggResult; engine: Engine; selected: string[] | null;
  onPickMachine(rc: string): void; onPickDay(d: string): void; onPickGroup(g: string): void;
}) {
  const [ref, W0] = useWidth<HTMLDivElement>(900);
  const tipProps = useTipProps();
  const n = A.days.length, W = Math.max(W0, Math.min(1400, 260 + n * 16));
  const rows: ({ group: string; util: number | null } | { rc: string })[] = [];
  for (const g of A.G) {
    const L = g.list.filter((a) => a.cap > 0 || a.union > 0).sort((p, q) => (q.util ?? -1) - (p.util ?? -1));
    if (!L.length) continue;
    rows.push({ group: g.g, util: g.util });
    L.forEach((a) => rows.push({ rc: a.m.rc }));
  }
  if (!rows.length) return <div ref={ref}><p className="empty">Sem dados no período.</p></div>;
  const lw = Math.min(230, W * 0.26), rw = 46, cw = (W - lw - rw) / n, X = (i: number) => lw + i * cw;
  const H = 32 + rows.reduce((q, r) => q + ('rc' in r ? 15 : 19), 0) + 30;
  const step = Math.max(1, Math.ceil(16 / cw));
  let y = 30;
  return (
    <div ref={ref} className="chart scroll-x">
      <svg width={W} height={H} role="img" aria-label="Mapa de calor da utilização por máquina e dia">
        {A.days.map((d, i) => {
          const w = new Date(d + 'T12:00:00Z').getUTCDay(), off = w === 0 || w === 6;
          return (
            <g key={d}>
              {i % step === 0 && <text x={X(i) + cw / 2} y={12} textAnchor="middle" className={off ? 'ax off' : 'ax dk'}>{d.slice(8)}</text>}
              {i % step === 0 && cw >= 14 && <text x={X(i) + cw / 2} y={23} textAnchor="middle" className="ax off" style={{ fontSize: 8 }}>{WEEKDAY[w][0]}</text>}
            </g>
          );
        })}
        <text x={W - 2} y={12} textAnchor="end" className="ax" style={{ fontWeight: 700, fontSize: 8.5 }}>PERÍODO</text>
        {rows.map((r) => {
          const y0 = y;
          if (!('rc' in r)) {
            y += 19;
            return (
              <g key={'g' + r.group} className="clk" onClick={() => onPickGroup(r.group)}>
                <rect x={0} y={y0 + 2} width={3} height={13} fill={groupColor(r.group)} />
                <text x={8} y={y0 + 12.5} className="grp">{r.group.toUpperCase()}</text>
                {r.util != null && <text x={W - 2} y={y0 + 12.5} textAnchor="end" className="val" fill={STATUS_INK[engine.status(r.util).k]}>{pct(r.util)}</text>}
              </g>
            );
          }
          y += 15;
          const a = A.M[r.rc], sel = selected?.includes(r.rc);
          return (
            <g key={r.rc}>
              {sel && <rect x={0} y={y0} width={W} height={14} fill="#eaf2fd" />}
              <text x={8} y={y0 + 10.5} className="nm clk" style={{ fontSize: 10, fontWeight: sel ? 700 : 400 }} onClick={() => onPickMachine(r.rc)}>{truncate(a.m.name, lw - 14, 10)}</text>
              {A.days.map((d, i) => {
                const b = a.byDay[d];
                let fill = '#f4f6f9', tip = null;
                if (b.cap > 0) {
                  const u = b.fixedProd / b.cap; fill = colorOf(u);
                  tip = { title: a.m.name, subtitle: `${WEEKDAY[new Date(d + 'T12:00:00Z').getUTCDay()]} ${dmy(d)} · utilização ${pct1(u)}`, rows: [
                    { label: 'Capacidade', value: `${hours1(b.cap)} h`, color: '#e8eef5' }, { label: 'Produzido na escala', value: `${hours1(b.fixedProd)} h`, color: fill },
                    ...(b.heAp > 0 ? [{ label: 'Hora extra', value: `${hours1(b.heAp)} h`, color: '#0f9d8a' }] : []),
                    ...(b.stop > 0 ? [{ label: 'Improdutivo', value: `${hours1(b.stop)} h`, color: '#eb6834' }] : []) ], note: 'Clique para detalhar o dia' };
                } else if (b.union > 0) {
                  fill = '#bfe5dd';
                  tip = { title: a.m.name, subtitle: `${dmy(d)} · sem turno na escala`, rows: [{ label: 'Produzido', value: `${hours1(b.union)} h`, color: fill }] };
                }
                return <rect key={d} x={X(i) + 0.5} y={y0} width={Math.max(0.5, cw - 1)} height={14} rx={1.5} fill={fill} className={tip ? 'clk' : undefined}
                  onClick={tip ? () => onPickDay(d) : undefined} {...(tip ? tipProps(tip) : {})} />;
              })}
              <text x={W - 2} y={y0 + 10.5} textAnchor="end" className="val" style={{ fontSize: 10 }} fill={a.cap > 0 ? STATUS_INK[engine.status(a.util).k] : '#8b97a3'}>{a.cap > 0 ? pct(a.util) : '—'}</text>
            </g>
          );
        })}
      </svg>
      <div className="legend">
        {BINS.map(([, c, l]) => <span key={l}><i style={{ background: c }} />{l}</span>)}
        <span><i style={{ background: '#bfe5dd' }} />Fora da escala</span>
        <span><i style={{ background: '#f4f6f9', boxShadow: 'inset 0 0 0 1px #e2e7ee' }} />Sem turno</span>
      </div>
    </div>
  );
}
