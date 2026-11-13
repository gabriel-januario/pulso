import { useMemo, useState } from 'react';
import { ORDER_STATUS, portfolio, weeklyLoad, type OrderStatus, type PortfolioRow } from '../../analytics/management';
import { isIsoDay } from '../../analytics/period';
import type { CartEntry } from '../../engine';
import { KpiCard } from '../components/KpiCard';
import { dec1, dm, dmy, hours, hours1, int, pct } from '../format';
import { GROUP_ORDER, groupColor } from '../theme';
import type { ViewProps } from './types';

const TONE: Record<string, string> = { crit: 'st crit', warn: 'st warn', good: 'st good', done: 'st done', none: 'st none' };

/** Carteira e prazos: previsão de término de cada PV pelo ritmo recente e carga das próximas semanas. */
export function Portfolio({ pulso, config }: ViewProps) {
  const { engine } = pulso;
  const cart = engine.config.cart ?? {};
  const rows = useMemo(() => portfolio(engine, cart), [engine, config.version]);
  const full = useMemo(() => engine.agg({ from: engine.util.s2iso(engine.dataset.minPd), to: engine.util.s2iso(engine.dataset.maxPd) }), [engine, config.version]);
  const W = useMemo(() => weeklyLoad(engine, full, rows), [engine, full, rows]);
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  const [form, setForm] = useState({ ped: '', g: GROUP_ORDER[0], h: '', due: '' });
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState('');
  const today = engine.util.s2iso(engine.dataset.maxPd);

  const save = (next: Record<string, CartEntry>, m = '') => { config.update({ cart: next }); setMsg(m); };
  const patch = (ped: string, p: Partial<CartEntry>) => {
    const e = { ...(cart[ped] ?? {}), ...p };
    (Object.keys(e) as (keyof CartEntry)[]).forEach((k) => { if (e[k] === undefined || e[k] === '' || e[k] === false) delete e[k]; });
    const next = { ...cart };
    if (Object.keys(e).length) next[ped] = e; else delete next[ped];
    save(next);
  };
  const add = () => {
    const ped = form.ped.trim();
    if (!/^\d+$/.test(ped)) return setMsg('Informe o número do PV.');
    if (form.h && (!Number.isFinite(+form.h * 60) || +form.h <= 0)) return setMsg('Informe um número positivo de horas.');
    if (form.due && !isIsoDay(form.due)) return setMsg('Informe uma data de entrega válida.');
    if (rows.some((r) => r.ped === ped)) return setMsg(`O PV ${ped} já está na carteira.`);
    save({ ...cart, [ped]: { g: form.g, ...(+form.h > 0 ? { h: +form.h } : {}), ...(form.due ? { due: form.due } : {}) } }, `PV ${ped} incluído.`);
    setForm({ ...form, ped: '', h: '', due: '' });
  };
  const importPaste = () => {
    const next = { ...cart };
    let n = 0, invalid = 0;
    for (const line of paste.split(/\r?\n/)) {
      const c = line.split(/[\t;]/).map((x) => x.trim());
      if (!/^\d+$/.test(c[0] ?? '')) continue;
      const h = Number((c[1] ?? '').replace(',', '.'));
      const d = (c[2] ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/), due = d ? `${d[3]}-${d[2]}-${d[1]}` : c[2];
      if ((due && !isIsoDay(due)) || (c[1] && (!Number.isFinite(h * 60) || h <= 0)) || (!h && !due)) { invalid++; continue; }
      next[c[0]] = { ...(next[c[0]] ?? {}), ...(h > 0 ? { h } : {}), ...(due ? { due } : {}) };
      n++;
    }
    if (!n) return setMsg('Nenhuma linha reconhecida. Use: PV; horas; entrega (DD/MM/AAAA).');
    save(next, `${n} PV${n > 1 ? 's' : ''} atualizado${n > 1 ? 's' : ''}.${invalid ? ` ${invalid} linha(s) com horas ou data inválidas.` : ''}`);
    setPaste('');
  };

  const count = (s: OrderStatus) => rows.filter((r) => r.status === s).length;
  const open = rows.filter((r) => !r.done);
  const remaining = open.reduce((q, r) => q + (r.remaining ?? 0), 0);
  const shown = filter === 'all' ? rows : rows.filter((r) => r.status === filter);
  const hidden = Object.entries(cart).filter(([, c]) => c.hide).map(([k]) => k);
  const groups = [...new Set([...GROUP_ORDER, ...W.flatMap((w) => [...Object.keys(w.cap), ...Object.keys(w.load)])])].filter((g) => W.some((w) => (w.cap[g] ?? 0) > 0 || (w.load[g] ?? 0) > 0));

  return (
    <>
      <section className="kpis" aria-label="Indicadores da carteira">
        <KpiCard hero label="PVs na carteira" value={int(rows.length)} sub={`${count('ok')} concluídos · base até ${dmy(today)}`} />
        <KpiCard label="Atrasados" value={int(count('late'))} color="#d64b45" sub="entrega já passou" />
        <KpiCard label="Em risco" value={int(count('risk'))} color="#e3a33b" sub="término previsto após a entrega" />
        <KpiCard label="Sem ritmo" value={int(count('stop'))} color="#e3a33b" sub="sem projeção de término" />
        <KpiCard label="Horas a usinar" value={hours(remaining)} unit="h" sub="PVs com previsão em aberto" />
        <KpiCard label="Validar saldo" value={int(count('review'))} color="#e3a33b" sub="horas previstas atingidas · confirme a conclusão" />
        <KpiCard label="Sem previsão" value={int(count('np'))} color="#94a3b8" sub="informe horas e entrega" />
      </section>

      <section className="panel">
        <div className="ph"><h2>Carga da carteira × capacidade</h2><span className="meta">próximas 8 semanas · carga distribuída pelo calendário fabril · média histórica para escala pendente</span></div>
        <div className="pb tw">
          <table className="t ldt">
            <thead><tr><th>Grupo</th>{W.map((w) => <th key={w.from} className="n">{dm(w.from)}<small>a {dm(w.to)}</small></th>)}</tr></thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g}>
                  <td><i className="dot" style={{ background: groupColor(g) }} />{g}</td>
                  {W.map((w) => {
                    const l = w.load[g] ?? 0, c = w.cap[g] ?? 0, r = c > 0 ? l / c : l > 0 ? Infinity : 0;
                    return <td key={w.from} className={`n ld ${r > 1 ? 'over' : r > 0.85 ? 'hi' : l > 0 ? 'ok' : ''}`} title={`${hours1(l)} h de carga · ${hours1(c)} h de capacidade`}>
                      {l > 0 ? <><b>{isFinite(r) ? pct(r) : 'sem cap.'}</b><small>{hours(l)} / {hours(c)} h</small></> : <small>{hours(c)} h livres</small>}
                    </td>;
                  })}
                </tr>
              ))}
              <tr className="tot">
                <td>Total</td>
                {W.map((w) => { const l = Object.values(w.load).reduce((q, v) => q + v, 0), c = Object.values(w.cap).reduce((q, v) => q + v, 0); return <td key={w.from} className="n"><b>{pct(c ? l / c : null)}</b><small>{w.orders.length} PVs</small></td>; })}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="ph">
          <h2>Pedidos de venda</h2>
          <div className="seg" role="group" aria-label="Filtrar por situação">
            <button type="button" className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>Todos <b>{rows.length}</b></button>
            {(Object.keys(ORDER_STATUS) as OrderStatus[]).filter((s) => count(s)).map((s) => (
              <button key={s} type="button" className={filter === s ? 'on' : ''} onClick={() => setFilter(s)}>{ORDER_STATUS[s].label} <b>{count(s)}</b></button>
            ))}
          </div>
        </div>
        <div className="pb tw" style={{ maxHeight: 620 }}>
          <table className="t pvt">
            <thead><tr><th>PV</th><th>Situação</th><th>Grupos</th><th className="n">Usinado</th><th className="n">Últ. 14 dias</th><th className="n">Previsto (h)</th><th className="n">Restante</th><th>Entrega</th><th>Término prev.</th><th /></tr></thead>
            <tbody>{shown.map((r) => <Row key={r.ped} r={r} today={today} patch={patch} />)}</tbody>
          </table>
          {!shown.length && <p className="empty pad">Nenhum PV nesta situação.</p>}
        </div>
        <div className="pf meta">
          {hidden.length > 0 && <>Ocultos: {hidden.map((k) => <button key={k} type="button" className="chip clr" onClick={() => patch(k, { hide: false })}>PV {k} <b>↺</b></button>)}</>}
          <button type="button" className="lnk rst" onClick={() => { config.restore('cart'); setMsg('Previsão da carteira restaurada a partir da base.'); }}>Restaurar a previsão da base</button>
        </div>
      </section>

      <div className="grid2">
        <section className="panel">
          <div className="ph"><h2>Incluir PV sem apontamento</h2><span className="meta">pedido que ainda não começou a ser usinado</span></div>
          <div className="pb form f4">
            <label>PV<input className="ctl" inputMode="numeric" value={form.ped} onChange={(e) => setForm({ ...form, ped: e.target.value })} /></label>
            <label>Grupo<select className="ctl" value={form.g} onChange={(e) => setForm({ ...form, g: e.target.value })}>{GROUP_ORDER.map((g) => <option key={g}>{g}</option>)}</select></label>
            <label>Horas previstas<input className="ctl" type="number" min={0} value={form.h} onChange={(e) => setForm({ ...form, h: e.target.value })} /></label>
            <label>Entrega<input className="ctl" type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} /></label>
            <button type="button" className="btn pri" onClick={add}>Incluir</button>
          </div>
        </section>
        <section className="panel">
          <div className="ph"><h2>Colar da planilha</h2><span className="meta">uma linha por PV: PV, horas e entrega</span></div>
          <div className="pb paste">
            <textarea className="ctl" rows={3} placeholder={'5205\t320\t04/12/2026\n5771;150;18/12/2026'} value={paste} onChange={(e) => setPaste(e.target.value)} aria-label="Linhas copiadas da planilha" />
            <button type="button" className="btn pri" onClick={importPaste} disabled={!paste.trim()}>Atualizar carteira</button>
          </div>
        </section>
      </div>
      {msg && <p className="note" role="status">{msg}</p>}
    </>
  );
}

function Row({ r, today, patch }: { r: PortfolioRow; today: string; patch(ped: string, p: Partial<CartEntry>): void }) {
  const st = ORDER_STATUS[r.status];
  const prog = r.planned ? Math.min(1, r.machined / r.planned) : null;
  return (
    <tr className={r.done ? 'dim' : undefined}>
      <td><b>{r.ped}</b>{r.manual && <small className="sub">sem apontamento</small>}{r.orders > 0 && <small className="sub">{r.orders} OP{r.orders > 1 ? 's' : ''}</small>}</td>
      <td><span className={TONE[st.tone]}>{st.label}</span></td>
      <td className="gs">{r.groups.slice(0, 2).map(([g, f]) => <span key={g}><i className="dot" style={{ background: groupColor(g) }} />{g}{r.groups.length > 1 && <small> {pct(f)}</small>}</span>)}</td>
      <td className="n">{hours1(r.machined)} h{prog != null && <span className="prog"><b style={{ width: `${prog * 100}%` }} /></span>}</td>
      <td className="n">{r.recent ? `${hours1(r.recent)} h` : '—'}{r.pace > 0 && <small className="sub">{dec1(r.pace / 60)} h/dia</small>}</td>
      <td className="n"><input className="ctl num" type="number" min={0} aria-label={`Horas previstas do PV ${r.ped}`} defaultValue={r.entry.h ?? ''} onBlur={(e) => { const v = +e.target.value; if ((v || undefined) !== r.entry.h) patch(r.ped, { h: v > 0 ? v : undefined }); }} /></td>
      <td className="n">{r.remaining != null ? `${hours1(r.remaining)} h` : '—'}</td>
      <td><input className={`ctl dt${r.due && r.due < today && !r.done ? ' late' : ''}`} type="date" aria-label={`Entrega do PV ${r.ped}`} defaultValue={r.entry.due ?? ''} onBlur={(e) => { if ((e.target.value || undefined) !== r.entry.due) patch(r.ped, { due: e.target.value || undefined }); }} /></td>
      <td>{r.finish ? dmy(r.finish) : r.done ? '—' : r.remaining ? <span className="meta">sem projeção</span> : '—'}</td>
      <td className="acts">
        <label className="ck"><input type="checkbox" checked={!!r.entry.done} onChange={(e) => patch(r.ped, { done: e.target.checked })} /> concluído</label>
        <button type="button" className="lnk" onClick={() => patch(r.ped, { hide: true })} aria-label={`Ocultar PV ${r.ped}`}>ocultar</button>
      </td>
    </tr>
  );
}
