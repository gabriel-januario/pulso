import type { ReactNode } from 'react';
import { capacityWaterfall, stopPareto } from '../../analytics/dashboard';
import { maintenanceSummary, unproductiveSummary } from '../../analytics/losses';
import { ORDER_STATUS, portfolio, weeklyLoad, type PortfolioRow } from '../../analytics/management';
import { monthLong } from '../../analytics/period';
import { overtimeDone, overtimeInMonth, overtimeTotal } from '../../analytics/planning';
import { lowPerformers } from '../../analytics/resources';
import type { AggResult, Engine } from '../../engine';
import { Waterfall } from '../charts/Waterfall';
import { dm, dmy, hours, hours1, int, pct, pct1, pp } from '../format';
import { groupColor, STATUS_BAR } from '../theme';

export type ReportKind = 'performance' | 'perdas' | 'he' | 'carteira';
export const REPORTS: { kind: ReportKind; title: string; text: string; excel?: boolean; scope: 'period' | 'month' | 'none' }[] = [
  { kind: 'performance', title: 'Performance da produção', text: 'Utilização contra a meta, destino da capacidade, grupos, cada recurso, principais paradas e recursos abaixo da meta.', excel: true, scope: 'period' },
  { kind: 'perdas', title: 'Perdas: manutenção e improdutivos', text: 'Tempo real de máquina parada, MTTR e MTBF, manutenção não apontada, pareto de motivos e máquinas mais afetadas.', scope: 'period' },
  { kind: 'he', title: 'Horas extras', text: 'HE realizada por recurso e grupo no mês do fim do período, e a programação lançada.', scope: 'month' },
  { kind: 'carteira', title: 'Carteira e prazos', text: 'Pedidos atrasados, em risco e sem ritmo, término previsto e carga das próximas semanas.', scope: 'none' },
];

/* ---------- moldura comum ---------- */
export function ReportFrame({ title, scope, issued, children }: { title: string; scope: string[]; issued: string; children: ReactNode }) {
  return (
    <article className="report">
      <header className="rh">
        <div className="rh-l">
          <span className="rlogo" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 12h4l2-5 4 10 2-5h6" /></svg></span>
          <div><small>PULSO™ · Relatório gerencial</small><h1>{title}</h1></div>
        </div>
        <div className="rh-r">{scope.map((s) => <div key={s}>{s}</div>)}<div>Emitido em {issued}</div></div>
      </header>
      {children}
      <footer className="rf">PULSO™ · Desenvolvido por Gabriel Januário · base de demonstração com dados fictícios</footer>
    </article>
  );
}
const Sec = ({ n, title, note, children }: { n: number; title: string; note?: string; children: ReactNode }) => (
  <section className="rs"><h2><b>{String(n).padStart(2, '0')}</b>{title}{note && <small>{note}</small>}</h2>{children}</section>
);
const Kpis = ({ items }: { items: [string, string, string?, string?][] }) => (
  <div className="rk">{items.map(([l, v, s, c]) => <div key={l}><span>{c && <i style={{ background: c }} />}{l}</span><b>{v}</b>{s && <small>{s}</small>}</div>)}</div>
);
const reasonName = (engine: Engine, c: string) => (c === '__oc' ? 'Manutenção não apontada' : engine.motName(c));
const Dot = ({ k }: { k: keyof typeof STATUS_BAR }) => <i className="rdot" style={{ background: STATUS_BAR[k] }} />;
const Bar = ({ v, max, color }: { v: number; max: number; color: string }) => <span className="rbar"><b style={{ width: `${Math.max(0, Math.min(100, (v / (max || 1)) * 100))}%`, background: color }} /></span>;

/* ---------- performance ---------- */
export function PerformanceDoc({ engine, A }: { engine: Engine; A: AggResult }) {
  const T = A.T, meta = engine.config.meta / 100, st = engine.status(T.util);
  const W = capacityWaterfall(A), P = stopPareto(A, engine, 10), L = lowPerformers(A, meta);
  const verdict = T.util == null ? 'Sem capacidade validada no período.'
    : `Utilização de ${pct1(T.util)}, ${pp((T.util - meta) * 100)} em relação à meta de ${engine.config.meta}%. ${L.low.length} de ${L.active} recursos ficaram abaixo da meta.`;
  return (
    <>
      <p className="rv"><Dot k={st.k} />{verdict}</p>
      <Kpis items={[
        ['Utilização', pct1(T.util), `meta ${engine.config.meta}%`, STATUS_BAR[st.k]], ['Capacidade fixa', `${hours(T.cap)} h`, `${A.workDays} dias com turno`],
        ['Produção real', `${hours(T.union)} h`, `${hours(T.fixedProd)} h na escala`, '#2a78d6'], ['Hora extra', `${hours(T.heAp)} h`, T.union ? `${pct(T.heAp / T.union)} do produzido` : undefined, '#0f9d8a'],
        ['Improdutivo', `${hours(T.stop)} h`, T.cap ? `${pct(T.stop / T.cap)} da capacidade` : undefined, '#eb6834'], ['Manutenção real', `${hours(T.manR)} h`, `${hours(T.manA)} h apontadas`, '#6250d6'],
      ]} />
      <Sec n={1} title="Destino da capacidade" note="da capacidade fixa à produção total, em horas">
        <div className="rchart"><Waterfall steps={W} capacity={T.cap} /></div>
      </Sec>
      <Sec n={2} title="Utilização por grupo">
        <table className="rt">
          <thead><tr><th>Grupo</th><th className="n">Recursos</th><th className="n">Capacidade (h)</th><th className="n">Na escala (h)</th><th className="bc" /><th className="n">Utilização</th><th className="n">Improd. (h)</th><th className="n">Manut. (h)</th></tr></thead>
          <tbody>{A.G.map((g) => (
            <tr key={g.g}><td><i className="rdot" style={{ background: groupColor(g.g) }} />{g.g}</td><td className="n">{g.list.length}</td><td className="n">{hours1(g.cap)}</td><td className="n">{hours1(g.fixedProd)}</td>
              <td className="bc"><Bar v={g.util ?? 0} max={1} color={STATUS_BAR[engine.status(g.util).k]} /></td><td className="n"><b>{pct1(g.util)}</b></td><td className="n">{hours1(g.stop)}</td><td className="n">{hours1(g.manR)}</td></tr>
          ))}</tbody>
        </table>
      </Sec>
      <Sec n={3} title="Recursos" note="ordenados pela utilização dentro do grupo">
        <table className="rt sm">
          <thead><tr><th>Recurso</th><th className="n">Capac. (h)</th><th className="n">Na escala (h)</th><th className="n">Total (h)</th><th className="n">Utilização</th><th className="n">Improd. (h)</th><th className="n">Manut. (h)</th><th className="n">Sem apont. (h)</th><th className="n">OPs</th></tr></thead>
          {A.G.map((g) => (
            <tbody key={g.g}>
              <tr className="gr"><td colSpan={9}>{g.g}</td></tr>
              {[...g.list].sort((x, y) => (y.util ?? -1) - (x.util ?? -1)).map((a) => (
                <tr key={a.m.rc}><td>{a.m.name} <span className="code">{a.m.rc}</span></td><td className="n">{hours1(a.cap)}</td><td className="n">{hours1(a.fixedProd)}</td><td className="n">{hours1(a.union)}</td>
                  <td className="n"><Dot k={engine.status(a.util).k} /><b>{pct(a.util)}</b></td><td className="n">{hours1(a.stop)}</td><td className="n">{hours1(a.manR)}</td><td className="n">{hours1(a.gap)}</td><td className="n">{a.ords.size}</td></tr>
              ))}
            </tbody>
          ))}
        </table>
      </Sec>
      <Sec n={4} title="Principais motivos de parada" note="em negrito, os que somam 80% das horas">
        {P.length ? (
          <table className="rt">
            <thead><tr><th>Motivo</th><th className="bc" /><th className="n">Horas</th><th className="n">%</th><th className="n">% acum.</th><th className="n">Ocorr.</th></tr></thead>
            <tbody>{P.map((o) => (
              <tr key={o.name}><td>{o.vital ? <b>{o.name}</b> : o.name}</td><td className="bc"><Bar v={o.minutes} max={P[0].minutes} color="#eb6834" /></td><td className="n">{hours1(o.minutes)}</td><td className="n">{pct(o.share)}</td><td className="n">{pct(o.cumulative)}</td><td className="n">{int(o.count)}</td></tr>
            ))}</tbody>
          </table>
        ) : <p className="rempty">Nenhuma parada no período.</p>}
      </Sec>
      {L.low.length > 0 && (
        <Sec n={5} title="Recursos abaixo da meta" note="horas que faltam para a meta e a principal perda">
          <table className="rt">
            <thead><tr><th>Recurso</th><th className="n">Utilização</th><th className="n">Falta p/ meta (h)</th><th>Principal perda</th><th>Maiores motivos</th></tr></thead>
            <tbody>{L.low.slice(0, 15).map((o) => (
              <tr key={o.a.m.rc}><td>{o.a.m.name}<small className="g">{o.a.grp}</small></td><td className="n"><Dot k={engine.status(o.a.util).k} /><b>{pct(o.a.util)}</b></td><td className="n">{hours1(o.missing)}</td><td className="nw">{o.mainLoss}</td>
                <td className="mot">{o.reasons.slice(0, 3).map(([c, v]) => `${reasonName(engine, c)} (${hours1(v)} h)`).join(' · ') || '—'}</td></tr>
            ))}</tbody>
          </table>
        </Sec>
      )}
    </>
  );
}

/* ---------- perdas ---------- */
const SRC: Record<string, string> = { apont: 'Apontamento', conf: 'Confirmada', manual: 'Quadro', cal: 'Calendário' };
export function LossesDoc({ engine, A }: { engine: Engine; A: AggResult }) {
  const M = maintenanceSummary(engine, A), I = unproductiveSummary(A);
  const cats = Object.fromEntries(engine.constants.CATS);
  const name = (rc: string) => engine.dataset.machines[rc]?.name ?? rc;
  let acc = 0;
  return (
    <>
      <Kpis items={[
        ['Manutenção real', `${hours(M.real)} h`, `${M.n} eventos`, '#6250d6'], ['Não apontada', `${hours(M.hidden)} h`, M.real ? `${pct(M.hidden / M.real)} da manutenção` : undefined, '#a78bfa'],
        ['MTTR', M.mttr != null ? `${hours1(M.mttr)} h` : '—', 'tempo médio de reparo'], ['MTBF', M.mtbf != null ? `${hours1(M.mtbf)} h` : '—', 'produção entre falhas'],
        ['Improdutivo', `${hours(I.total)} h`, A.T.cap ? `${pct(I.total / A.T.cap)} da capacidade` : undefined, '#eb6834'], ['Sem apontamento', `${hours(A.T.gap)} h`, 'capacidade sem registro', '#b9c6d6'],
      ]} />
      <Sec n={1} title="Manutenção por máquina" note="tempo real parado contra o apontado">
        {M.byMachine.length ? (
          <table className="rt">
            <thead><tr><th>Máquina</th><th className="n">Eventos</th><th className="n">Real (h)</th><th className="n">Apontado (h)</th><th className="n">Não apontado (h)</th><th className="n">Parada provável (h)</th></tr></thead>
            <tbody>{M.byMachine.map((o) => (
              <tr key={o.rc}><td>{name(o.rc)} <span className="code">{o.rc}</span></td><td className="n">{o.n}</td><td className="n"><b>{hours1(o.real)}</b></td><td className="n">{hours1(o.ap)}</td><td className="n">{hours1(Math.max(0, o.real - o.ap))}</td><td className="n">{o.suspect ? hours1(o.suspect) : '—'}</td></tr>
            ))}</tbody>
          </table>
        ) : <p className="rempty">Nenhum evento de manutenção no período.</p>}
      </Sec>
      <Sec n={2} title="Eventos de manutenção" note="os 25 mais recentes">
        {M.events.length ? (
          <table className="rt sm">
            <thead><tr><th>Máquina</th><th>Início</th><th>Retorno</th><th className="n">Real (h)</th><th className="n">Apontado (h)</th><th>Origem</th></tr></thead>
            <tbody>{M.events.slice(0, 25).map((o, i) => (
              <tr key={i}><td>{name(o.e.rc)}</td><td>{engine.util.fmtDT(o.e.t0)}</td><td>{o.e.open ? 'em aberto' : engine.util.fmtDT(o.e.end)}</td><td className="n">{hours1(o.real)}</td><td className="n">{hours1(o.ap)}</td><td>{SRC[o.e.src] ?? o.e.src}</td></tr>
            ))}</tbody>
          </table>
        ) : <p className="rempty">Nenhum evento de manutenção no período.</p>}
      </Sec>
      <Sec n={3} title="Pareto de motivos" note="em negrito, os que somam 80% das horas">
        {I.reasons.length ? (
          <table className="rt">
            <thead><tr><th>Motivo</th><th>Categoria</th><th className="bc" /><th className="n">Horas</th><th className="n">%</th><th className="n">% acum.</th><th className="n">Ocorr.</th></tr></thead>
            <tbody>{I.reasons.slice(0, 15).map((o) => {
              const before = acc / I.total; acc += o.minutes; const c = engine.motCat(o.code);
              return (
                <tr key={o.code}><td>{before < 0.8 ? <b>{engine.motName(o.code)}</b> : engine.motName(o.code)}</td><td>{cats[c]}</td><td className="bc"><Bar v={o.minutes} max={I.reasons[0].minutes} color={c === 'man' ? '#6250d6' : '#eb6834'} /></td>
                  <td className="n">{hours1(o.minutes)}</td><td className="n">{pct(o.minutes / I.total)}</td><td className="n">{pct(acc / I.total)}</td><td className="n">{int(o.count)}</td></tr>
              );
            })}</tbody>
          </table>
        ) : <p className="rempty">Nenhum improdutivo no período.</p>}
      </Sec>
      <Sec n={4} title="Máquinas mais afetadas por paradas">
        {I.ranking.length ? (
          <table className="rt">
            <thead><tr><th>Máquina</th><th className="n">Horas paradas</th><th className="n">% da capac.</th><th>Principais paradas</th></tr></thead>
            <tbody>{I.ranking.slice(0, 12).map((r) => (
              <tr key={r.a.m.rc}><td>{r.a.m.name}<small className="g">{r.a.grp}</small></td><td className="n"><b>{hours1(r.minutes)}</b></td><td className="n">{pct(r.a.cap ? r.minutes / r.a.cap : null)}</td><td className="mot">{r.reasons.slice(0, 3).map(([c, v]) => `${reasonName(engine, c)} (${hours1(v)} h)`).join(' · ')}</td></tr>
            ))}</tbody>
          </table>
        ) : <p className="rempty">Nenhuma parada no período.</p>}
      </Sec>
    </>
  );
}

/* ---------- horas extras ---------- */
export function OvertimeDoc({ engine, ym }: { engine: Engine; ym: string }) {
  const D = overtimeDone(engine, ym), plan = overtimeInMonth(engine, ym).map((h) => ({ h, ...overtimeTotal(engine, h.id) }));
  const alvo = (a: string) => (a === 'all' ? 'Todas as máquinas' : a.startsWith('g:') ? `Grupo ${a.slice(2)}` : engine.dataset.machines[a.slice(2)]?.name ?? a.slice(2));
  return (
    <>
      <Kpis items={[
        ['HE realizada', `${hours(D.total)} h`, monthLong(ym), '#0f9d8a'], ['% da capacidade fixa', pct(D.capacity ? D.total / D.capacity : null)],
        ['Recursos com HE', int(D.rows.length)], ['HE programada', `${hours(plan.reduce((q, p) => q + p.total, 0))} h`, `${plan.length} lançamentos`, '#2a78d6'],
      ]} />
      <Sec n={1} title="HE realizada por grupo">
        {D.groups.length ? (
          <table className="rt"><thead><tr><th>Grupo</th><th className="bc" /><th className="n">Horas</th><th className="n">%</th></tr></thead>
            <tbody>{D.groups.map((g) => <tr key={g.label}><td><i className="rdot" style={{ background: groupColor(g.label) }} />{g.label}</td><td className="bc"><Bar v={g.minutes} max={D.groups[0].minutes} color={groupColor(g.label)} /></td><td className="n"><b>{hours1(g.minutes)}</b></td><td className="n">{pct(g.minutes / D.total)}</td></tr>)}</tbody>
          </table>
        ) : <p className="rempty">Sem HE realizada no mês.</p>}
      </Sec>
      <Sec n={2} title="HE realizada por recurso">
        {D.rows.length ? (
          <table className="rt sm"><thead><tr><th>Recurso</th><th>Grupo</th><th className="n">HE realizada (h)</th></tr></thead>
            <tbody>{D.rows.map((r) => <tr key={r.m.rc}><td>{r.m.name} <span className="code">{r.m.rc}</span></td><td>{r.grp}</td><td className="n"><b>{hours1(r.minutes)}</b></td></tr>)}</tbody>
            <tfoot><tr><td colSpan={2}>Total</td><td className="n">{hours1(D.total)}</td></tr></tfoot>
          </table>
        ) : <p className="rempty">Sem HE realizada no mês.</p>}
      </Sec>
      <Sec n={3} title="Programação do mês">
        {plan.length ? (
          <table className="rt"><thead><tr><th>Período</th><th>Aplica a</th><th className="n">Seg–sex</th><th className="n">Sáb</th><th className="n">Dom</th><th className="n">Máq.</th><th className="n">Total (h)</th><th>Observação</th></tr></thead>
            <tbody>{plan.map(({ h, total, machines }) => <tr key={h.id}><td>{dm(h.ini)} a {dm(h.fim)}</td><td>{alvo(h.alvo)}</td><td className="n">{h.sem}</td><td className="n">{h.sab}</td><td className="n">{h.dom}</td><td className="n">{machines}</td><td className="n"><b>{hours1(total)}</b></td><td>{h.obs}</td></tr>)}</tbody>
          </table>
        ) : <p className="rempty">Nenhuma HE programada no mês.</p>}
      </Sec>
    </>
  );
}

/* ---------- carteira ---------- */
function OrderTable({ rows }: { rows: PortfolioRow[] }) {
  return (
    <table className="rt sm">
      <thead><tr><th>PV</th><th>Situação</th><th>Grupo principal</th><th className="n">Usinado (h)</th><th className="n">Previsto (h)</th><th className="n">Restante (h)</th><th className="n">Ritmo (h/dia)</th><th>Entrega</th><th>Término prev.</th></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.ped}><td><b>{r.ped}</b></td><td>{ORDER_STATUS[r.status].label}</td><td>{r.groups[0]?.[0]}</td><td className="n">{hours1(r.machined)}</td><td className="n">{r.planned ? hours1(r.planned) : '—'}</td><td className="n">{r.remaining != null ? hours1(r.remaining) : '—'}</td><td className="n">{r.pace ? hours1(r.pace) : '—'}</td><td>{r.due ? dmy(r.due) : '—'}</td><td>{r.finish ? dmy(r.finish) : '—'}</td></tr>
      ))}</tbody>
    </table>
  );
}
export function PortfolioDoc({ engine }: { engine: Engine }) {
  const rows = portfolio(engine, engine.config.cart ?? {});
  const full = engine.agg({ from: engine.util.s2iso(engine.dataset.minPd), to: engine.util.s2iso(engine.dataset.maxPd) });
  const W = weeklyLoad(engine, full, rows), groups = engine.constants.GRP_ORDER.filter((g) => W.some((w) => (w.cap[g] ?? 0) > 0 || (w.load[g] ?? 0) > 0));
  const n = (s: string) => rows.filter((r) => r.status === s).length;
  const attention = rows.filter((r) => ['late', 'risk', 'stop'].includes(r.status)), onTime = rows.filter((r) => r.status === 'on');
  return (
    <>
      <Kpis items={[['PVs na carteira', int(rows.length)], ['Atrasados', int(n('late')), undefined, '#d64b45'], ['Em risco', int(n('risk')), undefined, '#e3a33b'], ['Sem ritmo', int(n('stop')), undefined, '#e3a33b'], ['No prazo', int(n('on')), undefined, '#1f8a4c'], ['Horas a usinar', `${hours(rows.filter((r) => !r.done).reduce((q, r) => q + (r.remaining ?? 0), 0))} h`]]} />
      <Sec n={1} title="Pedidos que pedem ação" note="atrasados, em risco ou sem usinagem nos últimos 14 dias">
        {attention.length ? <OrderTable rows={attention} /> : <p className="rempty">Nenhum pedido atrasado, em risco ou sem ritmo.</p>}
      </Sec>
      <Sec n={2} title="Carga × capacidade nas próximas semanas" note="% da capacidade de cada grupo ocupada pela carteira">
        <table className="rt sm ld">
          <thead><tr><th>Grupo</th>{W.map((w) => <th key={w.from} className="n">{dm(w.from)}</th>)}</tr></thead>
          <tbody>{groups.map((g) => (
            <tr key={g}><td>{g}</td>{W.map((w) => { const l = w.load[g] ?? 0, c = w.cap[g] ?? 0, r = c ? l / c : l ? Infinity : 0; return <td key={w.from} className={`n ${r > 1 ? 'over' : r > 0.85 ? 'hi' : ''}`}>{l ? (isFinite(r) ? pct(r) : 's/ cap.') : '—'}</td>; })}</tr>
          ))}</tbody>
        </table>
      </Sec>
      <Sec n={3} title="Pedidos no prazo">
        {onTime.length ? <OrderTable rows={onTime} /> : <p className="rempty">Nenhum pedido com previsão no prazo.</p>}
      </Sec>
    </>
  );
}
