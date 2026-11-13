import { useMemo, useState } from 'react';
import { lossSeries, maintenanceSummary } from '../../analytics/losses';
import type { ManualStop } from '../../engine';
import { HBars } from '../charts/HBars';
import { StackedColumns } from '../charts/StackedColumns';
import { EventsTable } from '../components/EventsTable';
import { KpiCard } from '../components/KpiCard';
import type { ViewProps } from './types';
import { dec1, hours, hours1, int, pct, pct1, WEEKDAY } from '../format';
import { SERIES } from '../theme';

const TYPES = ['Mecânica', 'Elétrica', 'Hidráulica', 'Preventiva', 'Aguardando peça', 'Outros'];

/** Manutenção: disponibilidade, quadro de máquinas paradas, paradas a confirmar e eventos. */
export function Maintenance({ pulso, filters, config }: ViewProps) {
  const { engine } = pulso;
  const { range, grp } = filters.state;
  const { fmtDT, s2iso, iso2s } = engine.util;
  // config.version entra nas dependências: registrar ou confirmar uma parada muda o cálculo
  const A = useMemo(() => engine.agg({ ...range, grp }), [engine, range, grp, config.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const M = useMemo(() => maintenanceSummary(engine, A), [engine, A]);
  const S = useMemo(() => lossSeries(A), [A]);
  const hi = s2iso(engine.dataset.maxPd);
  const machines = useMemo(() => Object.values(engine.dataset.machines).filter((m) => !m.inat).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [engine]);
  const [form, setForm] = useState({ rc: machines[0]?.rc ?? '', ini: `${hi}T08:00`, fim: '', tipo: TYPES[0], obs: '' });
  const [msg, setMsg] = useState<string | null>(null);

  const stops = engine.config.paradas;
  const openManual = stops.filter((p) => !p.fim && engine.dataset.machines[p.rc]);
  const toMin = (v: string) => { const [d, t] = v.split('T'); const [h, m] = (t ?? '00:00').split(':').map(Number); return iso2s(d) * 1440 + h * 60 + m; };
  const toLocal = (m: number) => `${s2iso(Math.floor(m / 1440))}T${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
  const nowMin = () => toMin(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  const save = (paradas: ManualStop[], text: string) => { config.update({ paradas }); setMsg(text); };
  const register = () => {
    if (!form.rc || !form.ini) return setMsg('Informe a máquina e o início da parada.');
    if (form.fim && form.fim <= form.ini) return setMsg('A liberação precisa ser depois do início.');
    save([...stops, { id: Date.now().toString(36), rc: form.rc, ini: form.ini, fim: form.fim || null, tipo: form.tipo, obs: form.obs.trim() }], 'Parada registrada no quadro.');
    setForm((f) => ({ ...f, fim: '', obs: '' }));
  };
  const disp = A.T.disp;

  return (
    <>
      <section className="kpis" aria-label="Indicadores de manutenção">
        <KpiCard hero label="Disponibilidade" value={pct1(disp)} meter={disp == null ? undefined : { value: disp, target: 0.95 }} sub={`${hours(A.T.cap)} h de capacidade fixa`} />
        <KpiCard label="Parada real" value={hours(M.real)} unit="h" color={SERIES.maint} sub={`${M.n} eventos de parada`} />
        <KpiCard label="Manutenção apontada" value={hours(M.ap)} unit="h" color={SERIES.maint} sub={`${pct(M.real ? M.ap / M.real : null)} da parada real`} />
        <KpiCard label="Não apontado" value={hours(M.hidden)} unit="h" color={SERIES.maint} sub={`${pct(M.real ? M.hidden / M.real : null)} da parada real`} />
        <KpiCard label="A confirmar" value={hours(M.suspectMinutes)} unit="h" color={SERIES.stop} sub={`${M.suspects.length} prováveis paradas`} />
        <KpiCard label="Parada média por evento" value={M.mttr == null ? '—' : dec1(M.mttr / 60)} unit={M.mttr == null ? undefined : 'h'} sub={`Produção por evento ${M.mtbf == null ? '—' : `${int(M.mtbf / 60)} h`}`} />
      </section>

      <section className="panel">
        <div className="ph"><h2>Quadro de máquinas paradas</h2><span className="meta">{openManual.length} em aberto no quadro · {M.openDetected.length} sem retorno após manutenção</span></div>
        <div className="pb">
          <form className="form" onSubmit={(e) => { e.preventDefault(); register(); }}>
            <label>Máquina<select className="ctl" value={form.rc} onChange={(e) => setForm({ ...form, rc: e.target.value })}>{machines.map((m) => <option key={m.rc} value={m.rc}>{m.name} · {m.rc}</option>)}</select></label>
            <label>Início da parada<input className="ctl" type="datetime-local" value={form.ini} onChange={(e) => setForm({ ...form, ini: e.target.value })} required /></label>
            <label>Liberação (opcional)<input className="ctl" type="datetime-local" value={form.fim} onChange={(e) => setForm({ ...form, fim: e.target.value })} /></label>
            <label>Tipo<select className="ctl" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
            <label>Observação<input className="ctl" value={form.obs} placeholder="Ex.: vazamento no cabeçote" onChange={(e) => setForm({ ...form, obs: e.target.value })} /></label>
            <button type="submit" className="btn pri">Registrar parada</button>
          </form>
          {msg && <p className="msg" role="status">{msg}</p>}
          <div className="alive">
            {openManual.map((p) => {
              const t0 = toMin(p.ini);
              return (
                <div key={p.id} className="dcard">
                  <div className="r1"><b>{engine.dataset.machines[p.rc].name}</b><span className="tag man">{p.tipo}</span></div>
                  <div className="meta">{p.rc} · desde {fmtDT(t0)}{p.obs ? ` · ${p.obs}` : ''}</div>
                  <div className="r1">
                    <span className="dur">{hours1(engine.capSeg(p.rc, t0, nowMin()))} h<small> de turno</small></span>
                    <span className="toolbar">
                      <button type="button" className="btn ok" onClick={() => save(stops.map((x) => (x.id === p.id ? { ...x, fim: toLocal(nowMin()) } : x)), 'Máquina liberada.')}>Liberar máquina</button>
                      <button type="button" className="btn no" aria-label="Excluir registro" onClick={() => save(stops.filter((x) => x.id !== p.id), 'Registro excluído.')}>✕</button>
                    </span>
                  </div>
                </div>
              );
            })}
            {M.openDetected.map((e) => (
              <div key={`${e.rc}|${e.t0}`} className="dcard det">
                <div className="r1"><b>{engine.dataset.machines[e.rc].name}</b><span className="tag imp">Sem retorno</span></div>
                <div className="meta">{e.rc} · manutenção apontada em {fmtDT(e.t0)} · nenhum apontamento produtivo depois</div>
                <div className="r1">
                  <span className="dur imp">{hours1(e.realAll)} h</span>
                  <button type="button" className="btn" onClick={() => save([...stops, { id: Date.now().toString(36), rc: e.rc, ini: toLocal(e.t0), fim: null, tipo: 'Mecânica', obs: 'Manutenção apontada sem retorno' }], 'Levada ao quadro de paradas.')}>Levar ao quadro</button>
                </div>
              </div>
            ))}
            {!openManual.length && !M.openDetected.length && <p className="empty">Nenhuma máquina parada.</p>}
          </div>
        </div>
      </section>

      <div className="grid2">
        <section className="panel">
          <div className="ph"><h2>Parada por máquina</h2><span className="meta">20 maiores</span></div>
          <div className="pb">
            {M.byMachine.length ? (
              <>
                <HBars max={Math.max(1, ...M.byMachine.map((x) => x.real + x.suspect))} valueWidth={80} items={M.byMachine.map((x) => ({
                  key: x.rc, label: engine.dataset.machines[x.rc].name, sub: `${x.rc}${x.n ? ` · ${x.n} ${x.n > 1 ? 'paradas' : 'parada'}` : ''}`,
                  segs: [{ v: x.ap, color: SERIES.maint }, { v: Math.max(0, x.real - x.ap), color: SERIES.maint, hatch: true }, { v: x.suspect, color: 'rgba(235,104,52,.45)' }],
                  value: <><strong>{hours1(x.real + x.suspect)}</strong> h</>,
                  tip: { title: engine.dataset.machines[x.rc].name, rows: [{ label: 'Parada real', value: `${hours1(x.real)} h` }, { label: 'Apontado', value: `${hours1(x.ap)} h`, color: SERIES.maint }, { label: 'Não apontado', value: `${hours1(Math.max(0, x.real - x.ap))} h` }, { label: 'A confirmar', value: `${hours1(x.suspect)} h`, color: 'rgba(235,104,52,.45)' }] },
                }))} />
                <div className="legend"><span><i style={{ background: SERIES.maint }} />Apontado</span><span><i className="hatch" />Não apontado</span><span><i style={{ background: 'rgba(235,104,52,.45)' }} />A confirmar</span></div>
              </>
            ) : <p className="empty">Nenhuma parada no período.</p>}
          </div>
        </section>
        <section className="panel">
          <div className="ph"><h2>Parada de manutenção {S.weekly ? 'semanal' : 'diária'}</h2></div>
          <div className="pb">
            <StackedColumns series={[{ key: 'ap', label: 'Apontado', color: SERIES.maint }, { key: 'oc', label: 'Não apontado', color: SERIES.maint, hatch: true }]}
              points={S.buckets.map((b) => ({ key: b.key, label: S.weekly ? b.label : b.label.slice(0, 2), sub: b.sub,
                title: S.weekly ? `Semana de ${b.label}` : `${WEEKDAY[new Date(b.from + 'T12:00:00Z').getUTCDay()]} ${b.label}`, values: [Math.min(b.manA, b.manR), b.ocult] }))} />
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="ph"><h2>Paradas a confirmar</h2><span className="meta">improdutivo seguido de turno sem produção enquanto o operador estava em outra máquina · {M.suspects.length} ocorrências</span></div>
        <div className="pb">
          {M.suspects.length ? (
            <div className="tw" style={{ maxHeight: 420 }}>
              <table className="t">
                <thead><tr><th>Máquina</th><th>Apontamento</th><th>Motivo</th><th>Operador</th><th>Deslocado para</th><th className="n">Turno sem produção</th><th /></tr></thead>
                <tbody>
                  {M.suspects.slice(0, 150).map((s) => (
                    <tr key={s.key}>
                      <td className="mn"><b>{engine.dataset.machines[s.rc].name}</b><small>{s.rc}</small></td>
                      <td className="nw">{fmtDT(s.t0)} · {hours1(s.s.min)} h</td>
                      <td>{engine.motName(s.s.oper)}</td>
                      <td>{engine.util.title(s.s.op)}</td>
                      <td>{engine.dataset.machines[s.mv.rc]?.name ?? s.mv.rc} <span className="code">{fmtDT(s.mv.t0)}</span></td>
                      <td className="n"><b>{hours1(s.idleInPeriod)} h</b>{s.open && <span className="tag"> sem retorno</span>}</td>
                      <td className="nw">
                        <button type="button" className="btn ok" onClick={() => { config.update({ evt: { ...engine.config.evt, [s.key]: 'm' } }); setMsg('Parada confirmada como manutenção.'); }}>Manutenção</button>{' '}
                        <button type="button" className="btn no" onClick={() => { config.update({ evt: { ...engine.config.evt, [s.key]: 'x' } }); setMsg('Ocorrência descartada.'); }}>Descartar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="empty">Nenhuma ocorrência pendente.</p>}
        </div>
      </section>

      <section className="panel">
        <div className="ph"><h2>Eventos de parada</h2><span className="meta">{M.n} no período</span></div>
        <div className="pb"><EventsTable events={M.events} engine={engine} showMachine onPickMachine={(rc) => { filters.set({ machine: rc }); location.hash = `#/maquinas?${location.hash.split('?')[1] ?? ''}`; }} /></div>
      </section>
    </>
  );
}
