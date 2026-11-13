import { useMemo, useState } from 'react';
import { monthWeeks, overtimeDone, overtimeInMonth, overtimeTotal, repeatOverWeeks, sortedMachines } from '../../analytics/planning';
import type { OvertimeEntry } from '../../engine';
import { HBars } from '../charts/HBars';
import { KpiCard } from '../components/KpiCard';
import { dm, hours, hours1, int, pct } from '../format';
import { groupColor, SERIES } from '../theme';
import { MonthPicker } from './MonthPicker';
import type { ViewProps } from './types';

const HISTORY_END = '2026-10';

/** Horas extras: realizado do mês (por recurso e grupo) e programação por período. */
export function Overtime({ pulso, config }: ViewProps) {
  const { engine } = pulso;
  const [ym, setYm] = useState(() => engine.util.s2iso(engine.dataset.maxPd).slice(0, 7));
  const v = config.version;
  const D = useMemo(() => overtimeDone(engine, ym), [engine, ym, v]);
  const plan = useMemo(() => overtimeInMonth(engine, ym).map((h) => ({ h, ...overtimeTotal(engine, h.id) })), [engine, ym, v]);
  const machines = useMemo(() => sortedMachines(engine), [engine]);
  const histOn = ym <= HISTORY_END && !engine.config.heOff.includes(ym);
  const planned = plan.reduce((q, p) => q + p.total, 0);

  const setHe = (he: OvertimeEntry[]) => config.update({ he });
  const edit = (id: string, patch: Partial<OvertimeEntry>) => setHe(engine.config.he.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  const add = () => {
    const w = monthWeeks(ym).find((x) => x >= `${ym}-01`) ?? `${ym}-01`;
    setHe([...engine.config.he, { id: `he-${Date.now().toString(36)}`, ini: w, fim: engine.util.s2iso(engine.util.iso2s(w) + 6), alvo: 'all', sem: 0, sab: 8, dom: 0, obs: '' }]);
  };
  const toggleHistory = () => config.update({ heOff: histOn ? [...engine.config.heOff, ym] : engine.config.heOff.filter((x) => x !== ym) });
  const maxG = Math.max(1, ...D.groups.map((g) => g.minutes));

  return (
    <>
      <section className="panel tbar">
        <MonthPicker ym={ym} onChange={setYm} />
        {ym <= HISTORY_END && (
          <button type="button" className={histOn ? 'btn ok' : 'btn'} aria-pressed={histOn} onClick={toggleHistory} title="Nos meses sem HE lançada, o PULSO infere a HE pela produção além da jornada">
            HE inferida do histórico: {histOn ? 'ativa' : 'desligada'}
          </button>
        )}
      </section>

      <section className="kpis" aria-label="Indicadores de horas extras">
        <KpiCard hero label="HE realizada" value={hours(D.total)} unit="h" sub={`${pct(D.capacity ? D.total / D.capacity : null)} da capacidade fixa`} />
        <KpiCard label="Recursos com HE" value={int(D.rows.length)} color={SERIES.overtime} sub={D.rows[0] ? `maior: ${D.rows[0].m.name}` : 'nenhum no mês'} />
        <KpiCard label="HE programada" value={hours(planned)} unit="h" color={SERIES.produced} sub={`${plan.length} lançamento${plan.length === 1 ? '' : 's'} no mês`} />
        <KpiCard label="Origem do realizado" value={histOn ? 'Histórico' : 'Lançada'} text sub={histOn ? 'inferida da produção além da jornada' : 'só janelas de HE programadas'} />
      </section>

      <div className="split">
        <section className="panel">
          <div className="ph"><h2>HE realizada por recurso</h2><span className="meta">produção dentro das janelas de HE</span></div>
          <div className="pb tw" style={{ maxHeight: 520 }}>
            {D.rows.length ? (
              <table className="t">
                <thead><tr><th>Recurso</th><th>Grupo</th><th className="barc" /><th className="n">HE realizada</th></tr></thead>
                <tbody>{D.rows.map((r) => (
                  <tr key={r.m.rc}><td><b>{r.m.name}</b> <span className="code">{r.m.rc}</span></td><td><i className="dot" style={{ background: groupColor(r.grp) }} />{r.grp}</td>
                    <td className="barc"><span className="mb" style={{ width: `${(r.minutes / D.rows[0].minutes) * 100}%`, background: SERIES.overtime }} /></td><td className="n"><b>{hours1(r.minutes)} h</b></td></tr>
                ))}</tbody>
                <tfoot><tr className="tot"><td colSpan={3}>Total</td><td className="n">{hours1(D.total)} h</td></tr></tfoot>
              </table>
            ) : <p className="empty pad">Sem HE realizada no mês.</p>}
          </div>
        </section>
        <section className="panel">
          <div className="ph"><h2>HE por grupo</h2></div>
          <div className="pb">
            {D.groups.length ? <HBars max={maxG} valueWidth={96} items={D.groups.map((g) => ({ key: g.label, label: g.label, segs: [{ v: g.minutes, color: groupColor(g.label) }], value: <><strong>{hours1(g.minutes)}</strong> h · {pct(g.minutes / D.total)}</> }))} /> : <p className="empty">Sem HE realizada no mês.</p>}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="ph"><h2>Programação de horas extras</h2><span className="meta">seg–sex: horas no período, divididas nos dias úteis · sábado e domingo: horas em cada dia</span></div>
        <div className="pb tw">
          <table className="t het">
            <thead><tr><th>Início</th><th>Fim</th><th>Aplica a</th><th className="n">Seg–sex (h)</th><th className="n">Sábado (h)</th><th className="n">Domingo (h)</th><th className="n">Máq.</th><th className="n">Total</th><th>Observação</th><th /></tr></thead>
            <tbody>
              {plan.map(({ h, total, machines: n, workDays }) => (
                <tr key={h.id}>
                  <td><input className="ctl dt" type="date" aria-label="Início" defaultValue={h.ini} onBlur={(e) => e.target.value && e.target.value !== h.ini && edit(h.id, { ini: e.target.value, wk: undefined, ...(e.target.value > h.fim ? { fim: e.target.value } : {}) })} /></td>
                  <td><input className="ctl dt" type="date" aria-label="Fim" min={h.ini} defaultValue={h.fim} onBlur={(e) => e.target.value && e.target.value !== h.fim && edit(h.id, { fim: e.target.value < h.ini ? h.ini : e.target.value })} /></td>
                  <td>
                    <select className="ctl alvo" aria-label="Aplica a" value={h.alvo} onChange={(e) => edit(h.id, { alvo: e.target.value })}>
                      <option value="all">Todas as máquinas</option>
                      <optgroup label="Grupo">{engine.constants.GRP_ORDER.map((g) => <option key={g} value={`g:${g}`}>{g}</option>)}</optgroup>
                      <optgroup label="Máquina">{machines.map((m) => <option key={m.rc} value={`m:${m.rc}`}>{m.name} · {m.rc}</option>)}</optgroup>
                    </select>
                  </td>
                  {(['sem', 'sab', 'dom'] as const).map((k) => (
                    <td key={k} className="n"><input className="ctl num" type="number" min={0} max={k === 'sem' ? 300 : 24} step={0.5} aria-label={k} defaultValue={+h[k] || 0} onBlur={(e) => +e.target.value !== (+h[k] || 0) && edit(h.id, { [k]: Math.max(0, +e.target.value || 0) })} /></td>
                  ))}
                  <td className="n">{n}</td>
                  <td className="n"><b>{hours1(total)} h</b>{+h.sem > 0 && h.ini !== h.fim && !workDays && <small className="sub warn">sem dia útil</small>}</td>
                  <td><input className="ctl obs" aria-label="Observação" defaultValue={h.obs ?? ''} placeholder="Ex.: carteira de dezembro" onBlur={(e) => e.target.value !== (h.obs ?? '') && edit(h.id, { obs: e.target.value })} /></td>
                  <td className="acts">
                    <button type="button" className="lnk" onClick={() => setHe(repeatOverWeeks(engine, h.id, ym))} title="Repetir nas outras semanas do mês">repetir no mês</button>
                    <button type="button" className="lnk del" onClick={() => setHe(engine.config.he.filter((x) => x.id !== h.id))} aria-label={`Excluir HE de ${dm(h.ini)}`}>excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!plan.length && <p className="empty pad">Nenhuma HE programada no mês.</p>}
        </div>
        <div className="pf"><button type="button" className="btn pri" onClick={add}>+ Programar hora extra</button><span className="meta">As horas programadas entram na capacidade a partir do fim do último turno do dia, já com a disponibilidade da máquina.</span></div>
      </section>
    </>
  );
}
