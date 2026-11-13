import type { ViewProps } from './types';
import { useMemo, useState } from 'react';
import { availableMonths, monthlyAnalysis } from '../../analytics/monthly';
import { monthLong, monthShort } from '../../analytics/period';
import type { AggResult } from '../../engine';
import { HBars } from '../charts/HBars';
import { TrendChart, type TrendPoint } from '../charts/TrendChart';
import { CapacityBar } from '../components/CapacityBar';
import { KpiCard } from '../components/KpiCard';
import { downloadCsv } from '../csv';
import { dmy, hours, hours1, int, pct1, WEEKDAY } from '../format';
import { SERIES } from '../theme';

const TABS = { resumo: 'Resumo executivo', perdas: 'Perdas', grupos: 'Recursos e grupos' } as const;
type Tab = keyof typeof TABS;

/** Análise mensal: compara meses (ou trimestres, ou o ano) para toda a usinagem ou um grupo. */
export function Monthly({ pulso }: ViewProps) {
  const { engine } = pulso;
  const all = useMemo(() => availableMonths(engine), [engine]);
  const [from, setFrom] = useState(all[Math.max(0, all.length - 3)]);
  const [to, setTo] = useState(all[all.length - 1]);
  const [grp, setGrp] = useState('all');
  const [tab, setTab] = useState<Tab>('resumo');
  const cache = useMemo(() => new Map<string, AggResult>(), [engine]);
  const sel = all.filter((m) => m >= from && m <= to);
  const D = useMemo(() => monthlyAnalysis(engine, sel, grp, (ym) => {
    let A = cache.get(ym);
    if (!A) {
      const lo = engine.util.s2iso(engine.dataset.minPd), hi = engine.util.s2iso(engine.dataset.maxPd);
      const [y, m] = ym.split('-').map(Number), end = `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
      A = engine.agg({ from: `${ym}-01` < lo ? lo : `${ym}-01`, to: end > hi ? hi : end, grp: 'all' });
      cache.set(ym, A);
    }
    return A;
  }), [engine, sel.join(), grp, cache]); // eslint-disable-line react-hooks/exhaustive-deps
  const T = D.T, single = D.months.length === 1;

  const presets: [string, string, string][] = [['all', 'Base completa', `${all[0]}|${all.at(-1)}`], ['last3', 'Últimos 3 meses', `${all.at(-3) ?? all[0]}|${all.at(-1)}`]];
  for (const y of [...new Set(all.map((m) => m.slice(0, 4)))]) {
    const ys = all.filter((m) => m.startsWith(y));
    presets.push([`y${y}`, `Ano ${y}`, `${ys[0]}|${ys.at(-1)}`]);
    for (let q = 0; q < 4; q++) { const qs = ys.filter((m) => Math.floor((+m.slice(5) - 1) / 3) === q); if (qs.length > 1) presets.push([`${y}q${q + 1}`, `${q + 1}º trimestre de ${y}`, `${qs[0]}|${qs.at(-1)}`]); }
  }
  const current = presets.find((p) => p[2] === `${from}|${to}`)?.[0] ?? 'custom';
  const groups = [...new Set(Object.keys(engine.dataset.machines).map(engine.grpOf))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const rangeTxt = single ? monthLong(sel[0]) : `${monthShort(sel[0])} a ${monthShort(sel.at(-1)!)} de ${sel.at(-1)!.slice(0, 4)}`;

  const points: TrendPoint[] = single
    ? (grp === 'all' ? D.months[0].A.dayT : engine.agg({ from: D.months[0].A.from, to: D.months[0].A.to, grp }).dayT)
      .filter((o) => o.cap > 0 || o.union > 0)
      .map((o) => ({ key: o.d, label: o.d.slice(8), date: o.d, title: `${WEEKDAY[new Date(o.d + 'T12:00:00Z').getUTCDay()]} ${dmy(o.d)}`, cap: o.cap, fixedProd: o.fixedProd, union: o.union, heAp: o.heAp, stop: o.stop }))
    : D.months.map((m) => ({ key: m.ym, label: monthShort(m.ym), title: monthLong(m.ym), cap: m.t.cap, fixedProd: m.t.fixedProd, union: m.t.union, heAp: m.t.heAp, stop: m.t.stop }));

  const csv = () => downloadCsv(`pulso_mensal_${sel[0]}_${sel.at(-1)}.csv`, ['Mês', 'Grupo', 'Capacidade fixa h', 'Produção h', 'Produzido na escala h', 'Hora extra h', 'Improdutivo h', 'Manutenção h', 'Sem apontamento h', 'Utilização %', 'OPs'],
    D.months.map((m) => [monthLong(m.ym), grp === 'all' ? 'Toda a usinagem' : grp, m.t.cap / 60, m.t.union / 60, m.t.fixedProd / 60, m.t.heAp / 60, m.t.imp / 60, m.t.man / 60, m.t.gap / 60, m.t.util == null ? null : m.t.util * 100, m.t.ords.size]));

  return (
    <>
      <section className="panel">
        <div className="ph"><div><h2>Painel executivo · usinagem</h2><span className="meta">{rangeTxt} · {grp === 'all' ? 'toda a usinagem' : grp}</span></div>
          <button type="button" className="btn" onClick={csv}>Exportar CSV mensal</button></div>
        <div className="pb">
          <div className="xfilters">
            <label>Período<select className="ctl" value={current} onChange={(e) => { const p = presets.find((x) => x[0] === e.target.value); if (p) { const [f, t] = p[2].split('|'); setFrom(f); setTo(t); } }}>
              {presets.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              <option value="custom" disabled>Intervalo personalizado</option>
            </select></label>
            <label>De<select className="ctl" value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }}>{all.map((m) => <option key={m} value={m}>{monthLong(m)}</option>)}</select></label>
            <label>Até<select className="ctl" value={to} onChange={(e) => { setTo(e.target.value); if (e.target.value < from) setFrom(e.target.value); }}>{all.map((m) => <option key={m} value={m}>{monthLong(m)}</option>)}</select></label>
            <label>Grupo<select className="ctl" value={grp} onChange={(e) => setGrp(e.target.value)}><option value="all">Toda a usinagem</option>{groups.map((g) => <option key={g} value={g}>{g}</option>)}</select></label>
          </div>
          <div className="tabs" role="tablist">{(Object.keys(TABS) as Tab[]).map((k) => <button type="button" role="tab" key={k} aria-selected={k === tab} onClick={() => setTab(k)}>{TABS[k]}</button>)}</div>
        </div>
      </section>

      <section className="kpis" aria-label="Indicadores da seleção">
        <KpiCard hero label="Produção real" value={hours(T.union)} unit="h" sub={`${hours(T.fixedProd)} h dentro da escala`} />
        <KpiCard label="Capacidade fixa" value={hours(T.cap)} unit="h" color="#92a8be" sub={D.months.every((m) => m.ok) ? 'escala validada em todos os meses' : 'escala parcial no período'} />
        <KpiCard label="Utilização" value={pct1(T.util)} color="#2a78d6" sub={`meta ${engine.config.meta}%`} />
        <KpiCard label="Hora extra realizada" value={hours(T.heAp)} unit="h" color="#0f9d8a" sub={`${hours(T.heHist)} h inferidas pelos apontamentos`} />
        <KpiCard label="Improdutivo" value={hours(T.imp)} unit="h" color="#eb6834" sub="sem a parte de manutenção" />
        <KpiCard label="Sem apontamento" value={hours(T.gap)} unit="h" color="#748aa0" sub="dentro da capacidade fixa" />
        <KpiCard label="OPs atendidas" value={int(T.ords.size)} sub={`${D.months.length} ${D.months.length === 1 ? 'mês' : 'meses'}`} />
      </section>

      {tab === 'resumo' && (
        <>
          <section className="panel">
            <div className="ph"><h2>Produção × capacidade · {single ? 'por dia' : 'por mês'}</h2></div>
            <div className="pb"><TrendChart points={points} engine={engine} height={320} /></div>
          </section>
          <section className="panel">
            <div className="ph"><h2>Memória {single ? 'diária' : 'mensal'}</h2></div>
            <div className="pb tw">
              <table className="t">
                <thead><tr><th>Período</th><th className="n">Capacidade fixa h</th><th className="n">Produção h</th><th className="n">Na escala h</th><th className="n">Hora extra h</th><th className="n">Improdutivo h</th><th className="n">Sem apont. h</th><th className="n">Utilização</th><th className="n">OPs</th></tr></thead>
                <tbody>
                  {(single ? [] : D.months).map((m) => (
                    <tr key={m.ym}><td><b>{monthLong(m.ym)}</b></td><td className="n">{hours1(m.t.cap)}</td><td className="n">{hours1(m.t.union)}</td><td className="n">{hours1(m.t.fixedProd)}</td><td className="n">{hours1(m.t.heAp)}</td><td className="n">{hours1(m.t.imp)}</td><td className="n">{hours1(m.t.gap)}</td><td className="n"><span className={`pill s-${engine.status(m.t.util).k}`}><i />{pct1(m.t.util)}</span></td><td className="n">{int(m.t.ords.size)}</td></tr>
                  ))}
                  {single && points.map((p) => (
                    <tr key={p.key}><td><b>{p.title}</b></td><td className="n">{hours1(p.cap)}</td><td className="n">{hours1(p.union)}</td><td className="n">{hours1(p.fixedProd)}</td><td className="n">{hours1(p.heAp)}</td><td className="n">{hours1(p.stop)}</td><td className="n">—</td><td className="n">{pct1(p.cap > 0 ? p.fixedProd / p.cap : null)}</td><td className="n">—</td></tr>
                  ))}
                  <tr className="tot"><td>Total da seleção</td><td className="n">{hours1(T.cap)}</td><td className="n">{hours1(T.union)}</td><td className="n">{hours1(T.fixedProd)}</td><td className="n">{hours1(T.heAp)}</td><td className="n">{hours1(T.imp)}</td><td className="n">{hours1(T.gap)}</td><td className="n">{pct1(T.util)}</td><td className="n">{int(T.ords.size)}</td></tr>
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {tab === 'perdas' && (
        <div className="grid2">
          <section className="panel">
            <div className="ph"><h2>Perdas por mês</h2><span className="meta">improdutivo e manutenção</span></div>
            <div className="pb">
              <HBars max={Math.max(1, ...D.months.map((m) => m.t.imp + m.t.man))} valueWidth={150} items={D.months.map((m) => ({
                key: m.ym, label: monthLong(m.ym), segs: [{ v: m.t.imp, color: SERIES.stop }, { v: m.t.man, color: SERIES.maint }],
                value: <><strong>{hours1(m.t.imp + m.t.man)} h</strong> · {pct1(m.t.cap ? (m.t.imp + m.t.man) / m.t.cap : null)}</>,
                tip: { title: monthLong(m.ym), rows: [{ label: 'Improdutivo', value: `${hours1(m.t.imp)} h`, color: SERIES.stop }, { label: 'Manutenção', value: `${hours1(m.t.man)} h`, color: SERIES.maint }] },
              }))} />
              <div className="legend"><span><i style={{ background: SERIES.stop }} />Improdutivo</span><span><i style={{ background: SERIES.maint }} />Manutenção</span></div>
            </div>
          </section>
          <section className="panel">
            <div className="ph"><h2>Destino da capacidade fixa</h2><span className="meta">{hours(T.cap)} h</span></div>
            <div className="pb"><CapacityBar totals={T} /></div>
          </section>
        </div>
      )}

      {tab === 'grupos' && (
        <>
          <section className="panel">
            <div className="ph"><h2>Produção por grupo</h2><span className="meta">horas totais · hora extra em verde</span></div>
            <div className="pb">
              <HBars max={Math.max(1, ...D.groups.map((g) => g.union))} valueWidth={170} items={D.groups.filter((g) => grp === 'all' || g.group === grp).map((g) => ({
                key: g.group, label: g.group, sub: `${g.machines} recursos · utilização ${pct1(g.util)}`,
                segs: [{ v: g.union - g.heAp, color: SERIES.produced }, { v: g.heAp, color: SERIES.overtime }],
                value: <><strong>{hours(g.union)} h</strong> · HE {hours(g.heAp)} h</>,
              }))} />
            </div>
          </section>
          <section className="panel">
            <div className="ph"><h2>Detalhe por máquina</h2></div>
            <div className="pb tw">
              <table className="t">
                <thead><tr><th>Recurso</th><th>Grupo</th><th className="n">Capacidade h</th><th className="n">Produção h</th><th className="n">Hora extra h</th><th className="n">Utilização</th></tr></thead>
                <tbody>
                  {D.groups.filter((g) => grp === 'all' || g.group === grp).flatMap((g) => g.detail.map((x) => (
                    <tr key={x.rc}><td><b>{x.name}</b> <span className="code">{x.rc}</span></td><td>{g.group}</td><td className="n">{x.cap ? hours1(x.cap) : '—'}</td><td className="n">{hours1(x.union)}</td><td className="n">{hours1(x.he)}</td>
                      <td className="n">{x.util == null ? '—' : <span className={`pill s-${engine.status(x.util).k}`}><i />{pct1(x.util)}</span>}</td></tr>
                  )))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
