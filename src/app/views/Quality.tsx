import { useMemo } from 'react';
import { dataQuality, GRADE_COLOR, grade, operators, QUALITY_PILLARS } from '../../analytics/management';
import { HBars } from '../charts/HBars';
import { KpiCard } from '../components/KpiCard';
import { dm, hours1, int, pct } from '../format';
import { useWidth } from '../useWidth';
import type { ViewProps } from './types';

/** Qualidade dos dados: o quanto dá para confiar nos números das outras telas. */
export function Quality({ pulso, filters }: ViewProps) {
  const { engine } = pulso;
  const { range, grp } = filters.state;
  const A = useMemo(() => engine.agg({ ...range, grp }), [engine, range, grp]);
  const Q = useMemo(() => dataQuality(engine, A), [engine, A]);
  const O = useMemo(() => operators(engine, A), [engine, A]);
  const g = grade(Q.score);
  const worstM = [...Q.machines].sort((a, b) => a.score - b.score).slice(0, 8);
  const worstO = [...O].filter((o) => o.prod >= 600).sort((a, b) => a.score - b.score).slice(0, 8);
  const openMachine = (rc: string) => { filters.set({ machine: rc }); location.hash = `#/maquinas?${location.hash.split('?')[1] ?? ''}`; };
  const gapH = Q.machines.reduce((q, m) => q + m.gap, 0), ncH = Q.machines.reduce((q, m) => q + m.unclassified, 0);

  if (!Q.machines.length) return <section className="panel"><p className="empty pad">Sem capacidade nem apontamentos no período.</p></section>;
  return (
    <>
      <div className="split rev">
        <section className="panel">
          <div className="ph"><h2>Índice de qualidade do apontamento</h2></div>
          <div className="pb gauge-wrap">
            <Gauge score={Q.score} />
            <p className="meta">{g === 'A' || g === 'B' ? 'Os números do período são confiáveis para decisão.' : g === 'C' ? 'Use os números com cautela: há lacunas relevantes no registro.' : 'O registro tem lacunas grandes: corrija antes de tirar conclusões.'}</p>
          </div>
        </section>
        <section className="panel">
          <div className="ph"><h2>Pilares</h2><span className="meta">ponderados pela capacidade de cada máquina</span></div>
          <div className="pb">
            <HBars max={1} valueWidth={110} items={QUALITY_PILLARS.map((p) => ({
              key: p.key, label: p.label, sub: `peso ${p.weight}% · ${p.hint}`,
              segs: [{ v: Q.pillars[p.key], color: GRADE_COLOR[grade(Q.pillars[p.key] * 100)] }],
              value: <><strong>{pct(Q.pillars[p.key])}</strong> · {Math.round(Q.pillars[p.key] * p.weight)}/{p.weight}</>,
            }))} />
          </div>
        </section>
      </div>

      <section className="kpis" aria-label="Lacunas do registro">
        <KpiCard label="Capacidade sem apontamento" value={hours1(gapH)} unit="h" color="#b9c6d6" sub={`${pct(A.T.cap ? gapH / A.T.cap : null)} da capacidade`} />
        <KpiCard label="Improdutivo sem motivo" value={hours1(ncH)} unit="h" color="#94a3b8" sub="categoria não classificada" />
        <KpiCard label="Apontamentos > 10 h" value={int(Q.machines.reduce((q, m) => q + m.a.long.length, 0))} color="#e3a33b" sub={`${hours1(Q.machines.reduce((q, m) => q + m.longMin, 0))} h nesses registros`} />
        <KpiCard label="Lançados à mão" value={int(Q.machines.reduce((q, m) => q + m.manual, 0))} sub={`de ${int(Q.machines.reduce((q, m) => q + m.n, 0))} apontamentos`} />
      </section>

      <section className="panel">
        <div className="ph"><h2>Evolução semanal</h2><span className="meta">semana iniciada na segunda-feira</span></div>
        <div className="pb"><WeekBars weeks={Q.weeks} /></div>
      </section>

      <div className="grid2">
        <section className="panel">
          <div className="ph"><h2>Máquinas com pior índice</h2><span className="meta">clique para abrir a máquina</span></div>
          <div className="pb">
            <HBars max={100} valueWidth={64} items={worstM.map((m) => ({ key: m.a.m.rc, label: m.a.m.name, sub: m.a.m.rc, segs: [{ v: m.score, color: GRADE_COLOR[grade(m.score)] }], value: <strong>{m.score} {grade(m.score)}</strong>, onClick: () => openMachine(m.a.m.rc) }))} />
          </div>
        </section>
        <section className="panel">
          <div className="ph"><h2>Operadores com pior índice</h2><span className="meta">com pelo menos 10 h no período</span></div>
          <div className="pb">
            {worstO.length ? <HBars max={100} valueWidth={64} items={worstO.map((o) => ({ key: o.name, label: o.name, sub: `${hours1(o.prod)} h · ${o.long} > 10 h · ${o.overlap} sobrep.`, segs: [{ v: o.score, color: GRADE_COLOR[grade(o.score)] }], value: <strong>{o.score} {grade(o.score)}</strong>, onClick: () => { location.hash = `#/operadores?${location.hash.split('?')[1] ?? ''}`; } }))} /> : <p className="empty">Sem operadores com horas suficientes.</p>}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="ph"><h2>Por máquina</h2></div>
        <div className="pb tw" style={{ maxHeight: 560 }}>
          <table className="t">
            <thead><tr><th>Máquina</th><th>Grupo</th><th className="n">Índice</th><th className="n">Cobertura</th><th className="n">Classif.</th><th className="n">Sem excesso</th><th className="n">Sem conflito</th><th className="n">Coletor</th><th className="n">Sem apont. (h)</th></tr></thead>
            <tbody>{[...Q.machines].sort((a, b) => a.score - b.score).map((m) => (
              <tr key={m.a.m.rc} className="clk" onClick={() => openMachine(m.a.m.rc)}>
                <td><b>{m.a.m.name}</b> <span className="code">{m.a.m.rc}</span></td><td>{m.a.grp}</td>
                <td className="n"><span className="gr" style={{ background: GRADE_COLOR[grade(m.score)] }}>{m.score} {grade(m.score)}</span></td>
                {(['cob', 'cls', 'lg', 'cf', 'col'] as const).map((k) => <td key={k} className={m.p[k] < 0.7 ? 'n cr' : m.p[k] < 0.9 ? 'n wn' : 'n'}>{pct(m.p[k])}</td>)}
                <td className="n">{hours1(m.gap)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Gauge({ score }: { score: number }) {
  const g = grade(score), r = 80, cx = 100, cy = 96, a = Math.PI * (1 - score / 100);
  const arc = (from: number, to: number) => `M ${cx + r * Math.cos(Math.PI * (1 - from))} ${cy - r * Math.sin(Math.PI * (1 - from))} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(Math.PI * (1 - to))} ${cy - r * Math.sin(Math.PI * (1 - to))}`;
  return (
    <svg viewBox="0 0 200 118" className="gauge" role="img" aria-label={`Índice ${score} de 100, nota ${g}`}>
      {[[0, 0.6, 'E'], [0.6, 0.7, 'D'], [0.7, 0.8, 'C'], [0.8, 0.9, 'B'], [0.9, 1, 'A']].map(([f, t, k]) => <path key={k as string} d={arc(f as number, t as number)} stroke={GRADE_COLOR[k as string]} strokeOpacity={0.28} strokeWidth={16} fill="none" />)}
      <path d={arc(0, score / 100)} stroke={GRADE_COLOR[g]} strokeWidth={16} fill="none" />
      <line x1={cx} y1={cy} x2={cx + (r - 22) * Math.cos(a)} y2={cy - (r - 22) * Math.sin(a)} stroke="#26384a" strokeWidth={3} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={5} fill="#26384a" />
      <text x={cx} y={cy - 26} textAnchor="middle" className="gv">{score}</text>
      <text x={cx} y={cy + 18} textAnchor="middle" className="gg" fill={GRADE_COLOR[g]}>nota {g}</text>
    </svg>
  );
}

function WeekBars({ weeks }: { weeks: { week: string; score: number }[] }) {
  const [ref, W] = useWidth<HTMLDivElement>(600);
  const H = 190, pl = 30, pb = 22, pt = 18, n = weeks.length, slot = (W - pl - 4) / Math.max(1, n), bw = Math.min(42, slot * 0.6);
  const Y = (v: number) => H - pb - (v / 100) * (H - pb - pt);
  const every = Math.max(1, Math.ceil(40 / slot));
  return (
    <div ref={ref} className="chart">
      <svg width={W} height={H} role="img" aria-label="Índice de qualidade por semana">
        {[0, 50, 80, 100].map((v) => <g key={v}><line x1={pl} x2={W - 4} y1={Y(v)} y2={Y(v)} className={v ? 'gl' : 'bl'} strokeDasharray={v === 80 ? '4 3' : undefined} /><text x={pl - 5} y={Y(v) + 3.3} textAnchor="end" className="ax">{v}</text></g>)}
        {weeks.map((w, i) => {
          const cx = pl + (i + 0.5) * slot;
          return (
            <g key={w.week}>
              <title>{`Semana de ${dm(w.week)}: ${w.score} (${grade(w.score)})`}</title>
              <rect x={cx - bw / 2} y={Y(w.score)} width={bw} height={Y(0) - Y(w.score)} rx={2} fill={GRADE_COLOR[grade(w.score)]} />
              {slot >= 22 && <text x={cx} y={Y(w.score) - 4} textAnchor="middle" className="lbl">{w.score}</text>}
              {i % every === 0 && <text x={cx} y={H - 6} textAnchor="middle" className="ax">{dm(w.week)}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
