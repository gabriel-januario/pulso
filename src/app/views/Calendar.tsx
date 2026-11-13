import { useMemo, useState } from 'react';
import { copyMonth, DAY_TYPES, isWork, monthCapacity, newException, nextMonth, operatorDirectory, prevMonth, shiftCandidates, shiftEvidence, type MonthRow } from '../../analytics/planning';
import type { CalendarException, DayConfig, Engine, ExceptionType, RosterEntry, RosterMode } from '../../engine';
import { dmy, hours, hours1 } from '../format';
import { groupColor } from '../theme';
import type { ConfigApi } from '../config';
import { MonthPicker } from './MonthPicker';
import type { ViewProps } from './types';

type Tab = 'dias' | 'escala' | 'ex' | 'turnos';
const TABS: [Tab, string][] = [['dias', 'Dias do mês'], ['escala', 'Escala por recurso'], ['ex', 'Exceções'], ['turnos', 'Turnos']];
const WEEK = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const monthName = (ym: string) => `${MONTHS[+ym.slice(5) - 1]} ${ym.slice(0, 4)}`;

/** Calendário fabril: tipo de cada dia, escala de cada recurso, exceções confirmadas e jornadas. */
export function Calendar({ pulso, config }: ViewProps) {
  const { engine } = pulso;
  const [ym, setYm] = useState(() => nextMonth(engine.util.s2iso(engine.dataset.maxPd).slice(0, 7)));
  const [tab, setTab] = useState<Tab>('dias');
  const [day, setDay] = useState<string | null>(null);
  const [src, setSrc] = useState(() => prevMonth(ym));
  const [msg, setMsg] = useState('');
  const M = useMemo(() => monthCapacity(engine, ym), [engine, ym, config.version]);
  const sel = day?.startsWith(ym) ? day : M.days[0];
  const changeMonth = (v: string) => { setYm(v); setSrc(prevMonth(v)); setMsg(''); };
  const sources = useMemo(() => {
    const out: string[] = [];
    let a = engine.util.s2iso(engine.dataset.minPd).slice(0, 7), b = engine.util.s2iso(engine.dataset.maxPd).slice(0, 7);
    for (let i = 0; i < 6; i++) b = nextMonth(b);
    for (; a <= b; a = nextMonth(a)) if (a !== ym) out.push(a);
    return out;
  }, [engine, ym]);
  const copy = () => {
    const C = copyMonth(engine, src, ym);
    config.update({ cal: C.cal, escala: C.escala });
    setMsg(`${monthName(src)} copiado: ${C.days} dias e a escala de ${C.resources} recursos.`);
  };
  const critical = M.rows.filter((r) => r.roster?.crit);

  return (
    <>
      <section className="panel">
        <div className="pb calhead">
          <MonthPicker ym={ym} onChange={changeMonth} />
          <div className="copy">
            <label className="inl">Copiar de
              <select className="ctl" value={src} onChange={(e) => setSrc(e.target.value)}>{sources.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}</select>
            </label>
            <button type="button" className="btn" onClick={copy}>Copiar mês</button>
          </div>
        </div>
        <div className="calk">
          <div><span>Capacidade fixa</span><b>{hours(M.fixed)} h</b></div>
          <div><span>Capacidade operacional</span><b>{hours(M.operational)} h</b></div>
          <div><span>HE programada</span><b>{hours(M.overtime)} h</b></div>
          <div><span>Escala revisada</span><b className={M.modes.pending ? 'warn' : undefined}>{M.modes.valid}/{M.modes.valid + M.modes.pending}</b></div>
          <div><span>Exceções</span><b>{M.exceptions}</b></div>
        </div>
        {M.modes.pending > 0 && <p className="note warn">Escala {M.modes.valid ? 'parcial' : 'a validar'}: {M.modes.pending} recursos sem escala neste mês. Sem escala validada, o recurso não tem capacidade fixa. Use <b>Copiar mês</b> para partir da escala de um mês já revisado.</p>}
        {critical.map((r) => (
          <p key={r.m.rc} className="note">
            <b>{r.m.name}</b> (recurso crítico) · {engine.constants.ROSTER_MODES[r.mc.modo]} · {hours1(r.operational)} h operacionais
            {r.roster?.carga != null ? ` · ${hours1(r.roster.carga * 60)} h de carga · ${hours1(Math.max(0, r.roster.carga * 60 - r.operational))} h sem cobertura` : ' · informe a carga para apurar o saldo'}
          </p>
        ))}
        <div className="pf"><div className="seg" role="tablist" aria-label="Seções do calendário">{TABS.map(([k, n]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{n}</button>)}</div></div>
      </section>
      {msg && <p className="note" role="status">{msg}</p>}

      {tab === 'dias' && <Days engine={engine} config={config} M={M} sel={sel} onSelect={setDay} onExceptions={() => setTab('ex')} />}
      {tab === 'escala' && <Roster engine={engine} config={config} ym={ym} rows={M.rows} days={M.days} />}
      {tab === 'ex' && <Exceptions engine={engine} config={config} day={sel} days={M.days} onDay={setDay} />}
      {tab === 'turnos' && <Shifts engine={engine} config={config} />}
    </>
  );
}

type M = ReturnType<typeof monthCapacity>;
interface Common { engine: Engine; config: ConfigApi }

function Days({ engine, config, M, sel, onSelect, onExceptions }: Common & { M: M; sel: string; onSelect(d: string): void; onExceptions(): void }) {
  const { HOL, FACULT, WD } = engine.constants;
  const shifts = engine.config.shifts;
  const pad = (new Date(`${M.days[0]}T12:00:00Z`).getUTCDay() + 6) % 7;
  const tiles = [...Array(pad).fill(''), ...M.days, ...Array((7 - ((pad + M.days.length) % 7)) % 7).fill('')];
  const cur = engine.dayCfg(sel), P = M.perDay[sel];
  const [form, setForm] = useState<DayConfig>({ t: cur.t === 'extra' ? 'util' : cur.t, sh: cur.sh });
  const [formDay, setFormDay] = useState(sel);
  if (formDay !== sel) { setFormDay(sel); setForm({ t: cur.t === 'extra' ? 'util' : cur.t, sh: cur.sh }); }
  const [bulk, setBulk] = useState({ ini: M.days[0], fim: M.days[M.days.length - 1], where: 'work', t: 'util' as DayConfig['t'], sh: shifts.filter((s) => s.def).map((s) => s.id) });
  const toggle = (L: string[], id: string) => (L.includes(id) ? L.filter((x) => x !== id) : shifts.map((s) => s.id).filter((x) => x === id || L.includes(x)));
  const save = () => config.update({ cal: { ...engine.config.cal, [sel]: { t: form.t, sh: form.t === 'util' ? form.sh : [] } } });
  const applyBulk = () => {
    const cal = { ...engine.config.cal };
    for (const d of M.days) {
      if (d < bulk.ini || d > bulk.fim) continue;
      const w = new Date(`${d}T12:00:00Z`).getUTCDay();
      if (bulk.where === 'work' && (w === 0 || w === 6 || HOL[d])) continue;
      if (bulk.where === 'sat' && w !== 6) continue;
      if (bulk.where === 'sun' && w !== 0) continue;
      cal[d] = { t: bulk.t, sh: bulk.t === 'util' ? bulk.sh : [] };
    }
    config.update({ cal });
  };
  const exN = (d: string) => engine.config.ex[d]?.length ?? 0;
  const w = new Date(`${sel}T12:00:00Z`).getUTCDay();

  return (
    <div className="cal-layout">
      <section className="panel">
        <div className="ph"><h2>Calendário do mês</h2><span className="meta">horas fixas de todos os recursos no dia</span></div>
        <div className="pb">
          <div className="cal-month">
            {WEEK.map((x) => <span key={x} className="cal-wd">{x}</span>)}
            {tiles.map((d, i) => {
              if (!d) return <span key={`b${i}`} className="cal-blank" aria-hidden="true" />;
              const c = engine.dayCfg(d), p = M.perDay[d], type = DAY_TYPES.find((t) => t[0] === c.t)?.[1] ?? 'Dia útil';
              return (
                <button key={d} type="button" className={`cal-date ${isWork(c) ? 'work' : c.t}${HOL[d] ? ' hol' : ''}`} aria-pressed={d === sel} onClick={() => onSelect(d)}
                  aria-label={`${dmy(d)} · ${type} · ${hours(p.fixed)} horas fixas`}>
                  <b>{d.slice(8)}</b>
                  <span className="ty">{isWork(c) ? c.sh.join(' · ') || 'Útil' : type}</span>
                  <span className="cp">{p.fixed ? `${hours(p.fixed)} h` : p.overtime ? `HE ${hours(p.overtime)} h` : '—'}{exN(d) > 0 && <i title={`${exN(d)} exceções`}>{exN(d)}</i>}</span>
                  {p.history > 0 && <span className="hi">HE hist. {hours1(p.history)} h</span>}
                </button>
              );
            })}
          </div>
          <div className="cal-leg"><span className="work">Dia útil</span><span className="folga">Folga</span><span className="fer">Feriado</span><span className="manut">Parada programada</span></div>
        </div>
      </section>
      <section className="panel cal-side">
        <div className="ph"><h2>{WD[w]} · {dmy(sel)}</h2>{(HOL[sel] || FACULT[sel]) && <span className="meta">{HOL[sel] || `${FACULT[sel]} · facultativo`}</span>}</div>
        <div className="pb cal-form">
          <label>Tipo de dia<select className="ctl" value={form.t} onChange={(e) => setForm({ ...form, t: e.target.value as DayConfig['t'] })}>{DAY_TYPES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
          <fieldset disabled={form.t !== 'util'}><legend>Turnos previstos</legend><div className="checks">{shifts.map((s) => <label key={s.id}><input type="checkbox" checked={form.sh.includes(s.id)} onChange={() => setForm({ ...form, sh: toggle(form.sh, s.id) })} /> {s.id} <small>{s.nome}</small></label>)}</div></fieldset>
          <div className="cal-read">
            <span><b>{hours1(P.fixed)} h</b>fixas</span><span><b>{hours1(P.operational)} h</b>operacionais</span>
            <span><b>{hours1(P.overtime)} h</b>HE programada</span><span><b>{hours1(P.history)} h</b>HE do histórico</span>
          </div>
          <div className="row"><button type="button" className="btn pri" onClick={save}>Salvar dia</button><button type="button" className="btn" onClick={onExceptions}>Exceções do dia{exN(sel) ? ` (${exN(sel)})` : ''}</button></div>
          <details className="bulk">
            <summary>Edição em lote</summary>
            <div className="two">
              <label>De<input className="ctl" type="date" min={M.days[0]} max={M.days[M.days.length - 1]} value={bulk.ini} onChange={(e) => setBulk({ ...bulk, ini: e.target.value })} /></label>
              <label>Até<input className="ctl" type="date" min={M.days[0]} max={M.days[M.days.length - 1]} value={bulk.fim} onChange={(e) => setBulk({ ...bulk, fim: e.target.value })} /></label>
            </div>
            <label>Aplicar em<select className="ctl" value={bulk.where} onChange={(e) => setBulk({ ...bulk, where: e.target.value })}><option value="work">Segunda a sexta, exceto feriados</option><option value="all">Todas as datas do intervalo</option><option value="sat">Sábados</option><option value="sun">Domingos</option></select></label>
            <label>Tipo de dia<select className="ctl" value={bulk.t} onChange={(e) => setBulk({ ...bulk, t: e.target.value as DayConfig['t'] })}>{DAY_TYPES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
            <fieldset disabled={bulk.t !== 'util'}><legend>Turnos</legend><div className="checks">{shifts.map((s) => <label key={s.id}><input type="checkbox" checked={bulk.sh.includes(s.id)} onChange={() => setBulk({ ...bulk, sh: toggle(bulk.sh, s.id) })} /> {s.id}</label>)}</div></fieldset>
            <button type="button" className="btn pri" onClick={applyBulk}>Aplicar ao intervalo</button>
          </details>
        </div>
      </section>
    </div>
  );
}

function Roster({ engine, config, ym, rows, days }: Common & { ym: string; rows: MonthRow[]; days: string[] }) {
  const { ROSTER_MODES } = engine.constants;
  const [group, setGroup] = useState('all');
  const [rcSel, setRc] = useState<string | null>(null);
  const list = group === 'all' ? rows : rows.filter((r) => r.grp === group);
  const row = list.find((r) => r.m.rc === rcSel) ?? list[0];
  const people = useMemo(() => operatorDirectory(engine), [engine]);
  const shifts = engine.config.shifts;
  const entry = row ? engine.rosterEntry(row.m.rc, ym) : null;
  const blank = (): RosterEntry => ({ modo: entry?.modo ?? 'pendente', turnos: { ...(entry?.turnos ?? {}) }, obs: entry?.obs ?? '', crit: !!entry?.crit, carga: entry?.carga ?? null });
  const [form, setForm] = useState<RosterEntry>(blank);
  const [formKey, setFormKey] = useState('');
  const key = `${row?.m.rc}|${ym}|${config.version}`;
  if (formKey !== key) { setFormKey(key); setForm(blank()); }
  const hints = useMemo(() => (row ? Object.fromEntries(shifts.map((s) => [s.id, shiftCandidates(engine, row.m.rc, s.id, days)])) : {}), [engine, row, days, shifts]);
  if (!row) return <section className="panel"><p className="empty pad">Nenhum recurso neste grupo.</p></section>;
  const save = () => config.update({ escala: { ...engine.config.escala, [ym]: { ...(engine.config.escala[ym] ?? {}), [row.m.rc]: form } } });
  const setShift = (id: string, on: boolean) => { const t = { ...form.turnos }; if (on) t[id] = t[id] ?? ''; else delete t[id]; setForm({ ...form, turnos: t }); };
  const groups = [...new Set(rows.map((r) => r.grp))];

  return (
    <div className="cal-layout">
      <section className="panel">
        <div className="ph"><h2>Recursos do mês</h2><label className="inl">Grupo<select className="ctl" value={group} onChange={(e) => setGroup(e.target.value)}><option value="all">Todos</option>{groups.map((g) => <option key={g}>{g}</option>)}</select></label></div>
        <div className="pb tw" style={{ maxHeight: 640 }}>
          <table className="t">
            <thead><tr><th>Recurso</th><th>Escala</th><th className="n">Fixa (h)</th><th className="n">Operacional (h)</th></tr></thead>
            <tbody>{list.map((r) => (
              <tr key={r.m.rc} className={r.m.rc === row.m.rc ? 'sel clk' : 'clk'} onClick={() => setRc(r.m.rc)}>
                <td><button type="button" className="lnk dk" onClick={() => setRc(r.m.rc)} aria-pressed={r.m.rc === row.m.rc}><i className="dot" style={{ background: groupColor(r.grp) }} /><b>{r.m.name}</b></button> <span className="code">{r.m.rc}</span></td>
                <td><span className={`st ${r.mc.modo === 'pendente' ? 'warn' : r.mc.on ? 'good' : 'none'}`}>{ROSTER_MODES[r.mc.modo]}</span>{r.mc.sh.length > 0 && <small> {r.mc.sh.join(' + ')}</small>}</td>
                <td className="n">{hours1(r.fixed)}</td><td className="n">{hours1(r.operational)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      <section className="panel cal-side">
        <div className="ph"><h2>{row.m.name}</h2><span className="meta">{row.m.rc} · {row.grp}</span></div>
        <div className="pb cal-form">
          <label>Tipo de cobertura<select className="ctl" value={form.modo} onChange={(e) => setForm({ ...form, modo: e.target.value as RosterMode })}>{Object.entries(ROSTER_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <p className="meta">Só <b>Fixo</b> e <b>Compartilhado</b> geram capacidade fixa. Eventual, sem turno e inativo ficam fora da utilização.</p>
          <datalist id="cal-people">{[...people].map(([k, v]) => <option key={k} value={k} label={v} />)}</datalist>
          {shifts.map((s) => {
            const on = Object.hasOwn(form.turnos, s.id), op = form.turnos[s.id] ?? '';
            return (
              <div key={s.id} className="slot">
                <label className="ck"><input type="checkbox" checked={on} onChange={(e) => setShift(s.id, e.target.checked)} /> <b>{s.id}</b> {s.nome}</label>
                {on && <>
                  <label>Chapa do titular (opcional)<input className="ctl" list="cal-people" inputMode="numeric" value={op} placeholder="Digite a chapa" onChange={(e) => setForm({ ...form, turnos: { ...form.turnos, [s.id]: e.target.value.replace(/\D/g, '') } })} /></label>
                  {op && people.has(op) && <small>{people.get(op)}</small>}
                  <div className="hints">{hints[s.id]?.length ? hints[s.id].map((p) => <button key={p.id} type="button" className="chip clr" title="Usar a chapa observada nos apontamentos" onClick={() => setForm({ ...form, turnos: { ...form.turnos, [s.id]: p.id } })}>{p.name} · {p.days} d</button>) : <small>Sem evidência suficiente no mês.</small>}</div>
                </>}
              </div>
            );
          })}
          <div className="two">
            <label>Carga programada no mês (h)<input className="ctl" type="number" min={0} step={0.25} value={form.carga ?? ''} placeholder="Opcional" onChange={(e) => setForm({ ...form, carga: e.target.value === '' ? null : Math.max(0, +e.target.value) })} /></label>
            <label className="ck"><input type="checkbox" checked={!!form.crit} onChange={(e) => setForm({ ...form, crit: e.target.checked })} /> Recurso crítico</label>
          </div>
          <label>Observação<input className="ctl" maxLength={160} value={form.obs} placeholder="Ex.: cobertura compartilhada, férias" onChange={(e) => setForm({ ...form, obs: e.target.value })} /></label>
          <button type="button" className="btn pri" onClick={save}>Salvar escala do mês</button>
        </div>
      </section>
    </div>
  );
}

function Exceptions({ engine, config, day, days, onDay }: Common & { day: string; days: string[]; onDay(d: string): void }) {
  const { EX_TYPES } = engine.constants;
  const machines = useMemo(() => Object.values(engine.dataset.machines).sort((a, b) => a.name.localeCompare(b.name)), [engine]);
  const shifts = engine.config.shifts;
  const list = engine.config.ex[day] ?? [];
  const [f, setF] = useState({ tipo: 'troca' as ExceptionType, rc: '', dst: '', sh: shifts[0]?.id ?? '', ini: '', fim: '', coberta: false, obs: '' });
  const [err, setErr] = useState('');
  const save = (rows: CalendarException[]) => { const ex = { ...engine.config.ex }; if (rows.length) ex[day] = rows; else delete ex[day]; config.update({ ex }); };
  const add = () => {
    if (!f.rc) return setErr('Selecione o recurso.');
    if ((f.ini && !f.fim) || (!f.ini && f.fim)) return setErr('Informe início e fim, ou deixe os dois em branco para o turno inteiro.');
    setErr('');
    save([...list, newException({ tipo: f.tipo, rc: f.rc, sh: f.sh, ...(f.dst ? { dst: f.dst } : {}), ...(f.ini ? { ini: f.ini, fim: f.fim } : {}), ...(f.tipo === 'troca' ? { coberta: f.coberta } : {}), obs: f.obs.trim() })]);
    setF({ ...f, obs: '', ini: '', fim: '' });
  };
  const ev = f.rc && f.sh ? shiftEvidence(engine, f.rc, f.sh, day) : [];
  const name = (rc: string) => engine.dataset.machines[rc]?.name ?? rc;

  return (
    <div className="cal-layout">
      <section className="panel">
        <div className="ph"><h2>Exceções · {dmy(day)}</h2><label className="inl">Data<input className="ctl" type="date" value={day} min={days[0]} max={days[days.length - 1]} onChange={(e) => e.target.value && onDay(e.target.value)} /></label></div>
        <div className="pb tw">
          {list.length ? (
            <table className="t">
              <thead><tr><th>Ocorrência</th><th>Recurso</th><th>Turno / janela</th><th>Origem coberta</th><th /></tr></thead>
              <tbody>{list.map((e) => (
                <tr key={e.id}>
                  <td><b>{EX_TYPES[e.tipo]}</b>{e.obs && <small className="sub">{e.obs}</small>}</td>
                  <td>{name(e.rc)}{e.dst && <> → {name(e.dst)}</>}</td>
                  <td>{e.sh} · {e.ini && e.fim ? `${e.ini}–${e.fim}` : 'turno inteiro'}</td>
                  <td>{e.tipo === 'troca' ? (e.coberta ? 'Sim' : 'Não') : '—'}</td>
                  <td><button type="button" className="lnk del" onClick={() => save(list.filter((x) => x.id !== e.id))}>excluir</button></td>
                </tr>
              ))}</tbody>
            </table>
          ) : <p className="empty">Nenhuma exceção registrada para esta data.</p>}
          <p className="meta" style={{ marginTop: 12 }}>
            Exceções mudam a capacidade operacional, não a fixa: remanejamento sem substituto, sem operador e quebra tiram a
            janela da origem; remanejamento e cobertura eventual somam no destino; quebra também abre parada de manutenção.
          </p>
        </div>
      </section>
      <section className="panel cal-side">
        <div className="ph"><h2>Registrar exceção confirmada</h2></div>
        <div className="pb cal-form">
          <label>Ocorrência<select className="ctl" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as ExceptionType })}>{Object.entries(EX_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>Recurso de origem ou atendido<select className="ctl" value={f.rc} onChange={(e) => setF({ ...f, rc: e.target.value })}><option value="">Selecione</option>{machines.map((m) => <option key={m.rc} value={m.rc}>{m.name} · {m.rc}</option>)}</select></label>
          {(f.tipo === 'troca' || f.tipo === 'apoio') && <label>Recurso de destino<select className="ctl" value={f.dst} onChange={(e) => setF({ ...f, dst: e.target.value })}><option value="">Sem destino</option>{machines.map((m) => <option key={m.rc} value={m.rc}>{m.name} · {m.rc}</option>)}</select></label>}
          <label>Turno<select className="ctl" value={f.sh} onChange={(e) => setF({ ...f, sh: e.target.value })}>{shifts.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.nome}</option>)}</select></label>
          <div className="two">
            <label>Início (opcional)<input className="ctl" type="time" value={f.ini} onChange={(e) => setF({ ...f, ini: e.target.value })} /></label>
            <label>Fim (opcional)<input className="ctl" type="time" value={f.fim} onChange={(e) => setF({ ...f, fim: e.target.value })} /></label>
          </div>
          {f.tipo === 'troca' && <label className="ck"><input type="checkbox" checked={f.coberta} onChange={(e) => setF({ ...f, coberta: e.target.checked })} /> Houve substituto na origem durante toda a janela</label>}
          <div className="evid" aria-live="polite">
            {f.rc ? <><b>Apontamentos na janela:</b> {ev.length ? ev.map((o) => `${o.name} · ${hours1(o.min)} h`).join(' / ') : 'nenhum apontamento produtivo no turno'}</> : 'Selecione o recurso para ver quem apontou nele no turno.'}
          </div>
          <label>Observação<input className="ctl" maxLength={160} value={f.obs} placeholder="Motivo ou confirmação da liderança" onChange={(e) => setF({ ...f, obs: e.target.value })} /></label>
          {err && <p className="note warn" role="alert">{err}</p>}
          <button type="button" className="btn pri" onClick={add}>Registrar exceção</button>
        </div>
      </section>
    </div>
  );
}

function Shifts({ engine, config }: Common) {
  const shifts = engine.config.shifts;
  const edit = (i: number, patch: Partial<(typeof shifts)[number]>) => config.update({ shifts: shifts.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  return (
    <section className="panel">
      <div className="ph"><h2>Jornadas e janelas</h2><span className="meta">a janela posiciona o turno no dia; as horas líquidas são o que entra na capacidade</span></div>
      <div className="pb tw">
        <table className="t">
          <thead><tr><th>Turno</th><th>Nome</th><th>Início</th><th>Fim</th><th className="n">Horas líquidas</th><th>Padrão em dia útil</th></tr></thead>
          <tbody>{shifts.map((s, i) => (
            <tr key={s.id}>
              <td><b>{s.id}</b></td>
              <td><input className="ctl" aria-label={`Nome de ${s.id}`} defaultValue={s.nome} onBlur={(e) => e.target.value.trim() && e.target.value !== s.nome && edit(i, { nome: e.target.value.trim() })} /></td>
              <td><input className="ctl" type="time" aria-label={`Início de ${s.id}`} defaultValue={s.ini} onBlur={(e) => e.target.value && e.target.value !== s.ini && edit(i, { ini: e.target.value })} /></td>
              <td><input className="ctl" type="time" aria-label={`Fim de ${s.id}`} defaultValue={s.fim} onBlur={(e) => e.target.value && e.target.value !== s.fim && edit(i, { fim: e.target.value })} /></td>
              <td className="n"><input className="ctl num" type="number" min={0} max={24} step={0.25} aria-label={`Horas líquidas de ${s.id}`} defaultValue={s.h ?? ''} onBlur={(e) => +e.target.value !== s.h && edit(i, { h: Math.max(0, Math.min(24, +e.target.value || 0)) })} /></td>
              <td><label className="ck"><input type="checkbox" checked={s.def} onChange={(e) => edit(i, { def: e.target.checked })} /> Padrão</label></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
