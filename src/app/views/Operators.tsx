import { useMemo, useState } from 'react';
import { GRADE_COLOR, grade, operators, type OperatorRow } from '../../analytics/management';
import { HBars } from '../charts/HBars';
import { KpiCard } from '../components/KpiCard';
import { dec1, dmy, hours, hours1, int, pct } from '../format';
import { SERIES } from '../theme';
import type { ViewProps } from './types';

type Key = 'name' | 'prod' | 'imp' | 'n' | 'long' | 'overlap' | 'manual' | 'score';
const COLS: { k: Key; label: string; n?: boolean; v(o: OperatorRow): number | string }[] = [
  { k: 'name', label: 'Operador', v: (o) => o.name }, { k: 'prod', label: 'Produtivo (h)', n: true, v: (o) => o.prod },
  { k: 'imp', label: 'Improd. (h)', n: true, v: (o) => o.imp }, { k: 'n', label: 'Apont.', n: true, v: (o) => o.n },
  { k: 'long', label: '> 10 h', n: true, v: (o) => o.long }, { k: 'overlap', label: 'Sobrepos.', n: true, v: (o) => o.overlap },
  { k: 'manual', label: 'Manuais', n: true, v: (o) => o.manual }, { k: 'score', label: 'Índice', n: true, v: (o) => o.score },
];

/** Operadores: horas, improdutivos e qualidade do apontamento de cada pessoa. */
export function Operators({ pulso, filters }: ViewProps) {
  const { engine } = pulso;
  const { range, grp } = filters.state;
  const A = useMemo(() => engine.agg({ ...range, grp }), [engine, range, grp]);
  const O = useMemo(() => operators(engine, A), [engine, A]);
  const [sort, setSort] = useState<{ k: Key; asc: boolean }>({ k: 'prod', asc: false });
  const [sel, setSel] = useState<string | null>(null);
  const cur = O.find((o) => o.name === sel) ?? null;
  const sorted = useMemo(() => {
    const c = COLS.find((x) => x.k === sort.k)!;
    return [...O].sort((a, b) => { const p = c.v(a), q = c.v(b); const r = typeof p === 'string' ? p.localeCompare(q as string) : p - (q as number); return sort.asc ? r : -r; });
  }, [O, sort]);

  const prod = O.reduce((q, o) => q + o.prod, 0), imp = O.reduce((q, o) => q + o.imp, 0);
  const w = prod || 1, score = O.length ? Math.round(O.reduce((q, o) => q + o.score * (o.prod || 0), 0) / w) : 0;
  const long = O.reduce((q, o) => q + o.long, 0), ovl = O.reduce((q, o) => q + o.overlap, 0);
  const top = O.slice(0, 15), max = Math.max(1, ...top.map((o) => o.prod + o.imp));
  const pick = (name: string) => { setSel(name); requestAnimationFrame(() => document.getElementById('op-det')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); };

  if (!O.length) return <section className="panel"><p className="empty pad">Nenhum apontamento de operador no período.</p></section>;
  return (
    <>
      <section className="kpis" aria-label="Indicadores de operadores">
        <KpiCard hero label="Operadores ativos" value={int(O.length)} sub={`${dec1(prod / 60 / O.length)} h produtivas por operador`} />
        <KpiCard label="Horas produtivas" value={hours(prod)} unit="h" color={SERIES.produced} sub="dentro do período" />
        <KpiCard label="Improdutivo apontado" value={hours(imp)} unit="h" color={SERIES.stop} sub={`${pct(prod + imp ? imp / (prod + imp) : null)} do tempo apontado`} />
        <KpiCard label="Índice de apontamento" value={String(score)} unit={grade(score)} color={GRADE_COLOR[grade(score)]} sub="média ponderada pelas horas" />
        <KpiCard label="Apontamentos > 10 h" value={int(long)} color="#e3a33b" sub="provável esquecimento de encerrar" />
        <KpiCard label="Sobreposições" value={int(ovl)} color="#d64b45" sub="dois registros ao mesmo tempo" />
      </section>

      <div className="split">
        <section className="panel">
          <div className="ph"><h2>Horas por operador</h2><span className="meta">15 com mais horas · clique para detalhar</span></div>
          <div className="pb">
            <HBars max={max} valueWidth={118} items={top.map((o) => ({
              key: o.name, label: o.name, segs: [{ v: o.prod, color: SERIES.produced }, { v: o.imp, color: SERIES.stop }],
              value: <><strong>{hours1(o.prod)}</strong> + {hours1(o.imp)} h</>, onClick: () => pick(o.name),
              tip: { title: o.name, rows: [{ label: 'Produtivo', value: `${hours1(o.prod)} h`, color: SERIES.produced }, { label: 'Improdutivo', value: `${hours1(o.imp)} h`, color: SERIES.stop }], note: `índice ${o.score} (${grade(o.score)})` },
            }))} />
          </div>
        </section>
        <section className="panel">
          <div className="ph"><h2>Como o índice é calculado</h2></div>
          <div className="pb expl">
            <p>Quatro pilares de 25%, de 0 a 100:</p>
            <ul>
              <li><b>Motivos classificados</b> — improdutivo com categoria.</li>
              <li><b>Sem excesso</b> — horas fora de apontamentos com mais de 10 h.</li>
              <li><b>Sem sobreposição</b> — minutos sobrepostos pesam três vezes.</li>
              <li><b>Via coletor</b> — apontamentos que não foram lançados à mão.</li>
            </ul>
            <div className="grades">{['A', 'B', 'C', 'D', 'E'].map((g, i) => <span key={g} style={{ background: GRADE_COLOR[g] }}>{g} <small>{['≥ 90', '80–89', '70–79', '60–69', '< 60'][i]}</small></span>)}</div>
            <p className="meta">O índice mede o registro, não o desempenho: serve para orientar treinamento, não para comparar produtividade.</p>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="ph"><h2>Todos os operadores</h2><span className="meta">clique no cabeçalho para ordenar</span></div>
        <div className="pb tw" style={{ maxHeight: 560 }}>
          <table className="t opt">
            <thead><tr>{COLS.map((c) => (
              <th key={c.k} className={c.n ? 'n' : undefined} aria-sort={sort.k === c.k ? (sort.asc ? 'ascending' : 'descending') : undefined}>
                <button type="button" className="srt" onClick={() => setSort({ k: c.k, asc: sort.k === c.k ? !sort.asc : c.k === 'name' })}>{c.label}{sort.k === c.k ? (sort.asc ? ' ▲' : ' ▼') : ''}</button>
              </th>
            ))}<th className="n">Máq.</th></tr></thead>
            <tbody>{sorted.map((o) => (
              <tr key={o.name} className={sel === o.name ? 'sel clk' : 'clk'} onClick={() => pick(o.name)}>
                <td><b>{o.name}</b></td><td className="n">{hours1(o.prod)}</td>
                <td className="n">{hours1(o.imp)}{o.unclassified > 0 && <small className="sub">{pct(o.unclassified / o.imp)} s/ motivo</small>}</td>
                <td className="n">{int(o.n)}</td><td className={o.long ? 'n wn' : 'n'}>{o.long || '—'}</td><td className={o.overlap ? 'n cr' : 'n'}>{o.overlap || '—'}</td>
                <td className="n">{o.manual || '—'}</td>
                <td className="n"><span className="gr" style={{ background: GRADE_COLOR[grade(o.score)] }}>{o.score} {grade(o.score)}</span></td>
                <td className="n">{o.machines.size}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      {cur && <Detail o={cur} engine={engine} onClose={() => setSel(null)} />}
    </>
  );
}

function Detail({ o, engine, onClose }: { o: OperatorRow; engine: ViewProps['pulso']['engine']; onClose(): void }) {
  const ms = [...o.machines.entries()].sort((a, b) => b[1] - a[1]);
  const days = [...o.byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const dmax = Math.max(1, ...days.map((d) => d[1]));
  const P = o.pillars;
  return (
    <section className="panel" id="op-det">
      <div className="ph"><h2>{o.name}</h2><span className="meta">{o.orders.size} ordens · {o.machines.size} máquinas · {days.length} dias com produção</span><button type="button" className="btn" onClick={onClose}>Fechar</button></div>
      <div className="pb det3">
        <div>
          <h3>Pilares do índice <span className="gr" style={{ background: GRADE_COLOR[grade(o.score)] }}>{o.score} {grade(o.score)}</span></h3>
          <HBars max={1} valueWidth={52} items={[['Motivos classificados', P.cls], ['Sem excesso', P.lg], ['Sem sobreposição', P.ov], ['Via coletor', P.col]].map(([l, v]) => ({ key: l as string, label: l as string, segs: [{ v: v as number, color: GRADE_COLOR[grade((v as number) * 100)] }], value: <strong>{pct(v as number)}</strong> }))} />
          <h3>Máquinas</h3>
          <HBars max={ms[0]?.[1] || 1} valueWidth={64} items={ms.slice(0, 8).map(([rc, v]) => ({ key: rc, label: engine.dataset.machines[rc]?.name ?? rc, sub: rc, segs: [{ v, color: SERIES.produced }], value: <strong>{hours1(v)} h</strong> }))} />
        </div>
        <div>
          <h3>Horas por dia</h3>
          <div className="dbars" role="img" aria-label="Horas produtivas por dia">
            {days.map(([d, v]) => <span key={d} title={`${dmy(d)}: ${hours1(v)} h`}><b style={{ height: `${(v / dmax) * 100}%` }} /></span>)}
          </div>
          <div className="dbl"><span>{days[0] ? dmy(days[0][0]) : ''}</span><span>máx. {hours1(dmax)} h</span><span>{days.length ? dmy(days[days.length - 1][0]) : ''}</span></div>
          <h3>Ocorrências no registro</h3>
          {o.issues.length ? (
            <div className="tw" style={{ maxHeight: 260 }}>
              <table className="t">
                <thead><tr><th>Tipo</th><th>Início</th><th className="n">Duração</th><th>Máquina</th><th>OP</th></tr></thead>
                <tbody>{o.issues.slice(0, 40).map((x, i) => (
                  <tr key={i}><td><span className={x.kind === 'long' ? 'st warn' : 'st crit'}>{x.kind === 'long' ? '> 10 h' : 'Sobreposição'}</span></td><td>{engine.util.fmtDT(x.rec.t0)}</td><td className="n">{hours1(x.rec.min)} h</td><td>{x.rc}</td><td>{x.rec.opn}</td></tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="empty">Nenhuma ocorrência no período.</p>}
        </div>
      </div>
    </section>
  );
}
