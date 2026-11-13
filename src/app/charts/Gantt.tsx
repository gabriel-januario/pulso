import type { ReactElement } from 'react';
import type { GanttRow } from '../../analytics/resources';
import type { Engine, StopRecord } from '../../engine';
import { hours1 } from '../format';
import { SERIES, textWidth, truncate } from '../theme';
import { useTipProps } from '../tooltip';
import { useWidth } from '../useWidth';

const COLOR = { prod: SERIES.produced, stop: SERIES.stop, maint: SERIES.maint };

/**
 * Gráfico de Gantt: faixa clara = turno, blocos = apontamentos, hachura = máquina parada.
 * O eixo começa às 06:00 (início do dia produtivo). `span` em minutos.
 */
export function Gantt({ rows, engine, span, labelWidth = 200, rowHeight = 18, rowLabel, onPickRow }: {
  rows: GanttRow[]; engine: Engine; span: number; labelWidth?: number; rowHeight?: number;
  rowLabel?(r: GanttRow): string; onPickRow?(r: GanttRow): void;
}) {
  const [ref, W0] = useWidth<HTMLDivElement>(900);
  const tipProps = useTipProps();
  const { hhmm, fmtDT, title } = engine.util;
  const W = Math.max(W0, span > 1440 ? 1100 : 720);
  const pl = Math.min(labelWidth, W * 0.3), iw = W - pl - 4, rh = rowHeight, gap = 5, top = 22;
  const H = top + rows.length * (rh + gap) + 4;
  const X = (m: number) => pl + (Math.max(0, Math.min(span, m)) / span) * iw;
  const hourStep = span <= 1440 ? 2 : span <= 3 * 1440 ? 6 : 12;
  const ticks = Array.from({ length: Math.floor(span / 60 / hourStep) + 1 }, (_, i) => i * hourStep * 60);
  const label = (r: GanttRow) => truncate(rowLabel ? rowLabel(r) : r.label, pl - 10, 11);

  return (
    <div ref={ref} className="chart scroll-x">
      <svg width={W} height={H} role="img" aria-label="Linha do tempo">
        {ticks.map((t) => {
          const h = (6 + t / 60) % 24, day = Math.floor((6 * 60 + t) / 1440);
          return (
            <g key={t}>
              <line x1={X(t)} x2={X(t)} y1={top - 6} y2={H} className={h === 6 ? 'bl' : 'gl'} />
              <text x={X(t)} y={11} textAnchor={t >= span ? 'end' : 'middle'} className={h === 6 ? 'ax dk' : 'ax'}>{span > 1440 && h === 0 ? `+${day}d` : `${String(h).padStart(2, '0')}h`}</text>
            </g>
          );
        })}
        {rows.map((r, i) => {
          const y = top + i * (rh + gap);
          const placed: { x0: number; x1: number; lab: string }[] = [];
          return (
            <g key={r.key}>
              <text x={0} y={y + rh / 2 + 4} className={onPickRow ? 'nm clk' : 'nm'} onClick={onPickRow ? () => onPickRow(r) : undefined}>{label(r)}</text>
              <rect x={pl} y={y} width={iw} height={rh} fill="#f5f7fa" rx={2} />
              {r.bands.map(([a, b], k) => <rect key={k} x={X(a)} y={y} width={Math.max(0, X(b) - X(a))} height={rh} fill="#e3edfb" rx={2} />)}
              {r.downs.map((d, k) => (
                <rect key={'d' + k} x={X(d.s)} y={y - 1} width={Math.max(1, X(d.e) - X(d.s))} height={rh + 2} fill="url(#hatch)"
                  {...tipProps({ title: 'Máquina parada', subtitle: `${fmtDT(d.ev.e.t0)} → ${d.ev.e.open ? 'sem retorno' : fmtDT(d.ev.e.end)}`, rows: [{ label: 'Parada real', value: `${hours1(d.ev.real)} h`, color: SERIES.maint }, { label: 'Apontado', value: `${hours1(d.ev.ap)} h` }] })} />
              ))}
              {r.blocks.map((b, k) => {
                const x0 = X(b.s), w = Math.max(1.5, X(b.e) - x0 - 1), rec = b.rec;
                if (b.label && w > textWidth(b.label, 10) + 8) placed.push({ x0, x1: x0 + w, lab: b.label });
                const isStop = b.kind !== 'prod';
                return (
                  <rect key={k} x={x0} y={y + 2} width={w} height={rh - 4} rx={2} fill={COLOR[b.kind]} opacity={b.inferred ? 0.6 : 1}
                    {...tipProps(isStop ? {
                      title: `${b.kind === 'maint' ? 'Manutenção' : 'Improdutivo'} · ${engine.motName(rec.oper)}`,
                      subtitle: `${fmtDT(rec.t0)}–${hhmm(rec.t0 + rec.min)} · ${hours1(rec.min)} h`,
                      note: `${title(rec.op)}${(rec as StopRecord).inf ? ' · máquina inferida pelo operador' : ''}`,
                    } : {
                      title: `OP ${rec.opn} · PV ${rec.ped}/${rec.item}`,
                      subtitle: `${fmtDT(rec.t0)}–${hhmm(rec.t0 + rec.min)} · ${hours1(rec.min)} h`,
                      rows: [{ label: 'Operação', value: String(rec.oper) }, { label: 'Origem', value: rec.org }],
                      note: title(rec.op),
                    })} />
                );
              })}
              {placed.sort((p, q) => p.x0 - q.x0).reduce<{ out: ReactElement[]; end: number }>((acc, L) => {
                const tw = textWidth(L.lab, 10) + 8;
                const covered = r.blocks.some((b) => { const bx = X(b.s); return bx > L.x0 + 1 && bx < L.x0 + tw; });
                if (L.x0 >= acc.end && !covered) { acc.out.push(<text key={L.x0} x={L.x0 + 4} y={y + rh / 2 + 3.5} className="glab">{L.lab}</text>); acc.end = L.x0 + tw; }
                return acc;
              }, { out: [], end: -1e9 }).out}
            </g>
          );
        })}
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="rgba(98,80,214,.12)" /><line x1="0" y1="0" x2="0" y2="6" stroke="#6250d6" strokeWidth="2" />
          </pattern>
        </defs>
      </svg>
      <div className="legend">
        <span><i style={{ background: SERIES.produced }} />Produção (nº da OP)</span>
        <span><i style={{ background: SERIES.stop }} />Improdutivo</span>
        <span><i style={{ background: SERIES.maint }} />Manutenção</span>
        <span><i className="hatch" />Máquina parada</span>
        <span><i style={{ background: '#e3edfb' }} />Turno</span>
      </div>
    </div>
  );
}
