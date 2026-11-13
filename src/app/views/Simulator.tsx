import { useMemo, useState } from 'react';
import type { WaterfallStep } from '../../analytics/dashboard';
import { emptyScenario, simulate, type Scenario } from '../../analytics/management';
import { HBars } from '../charts/HBars';
import { Waterfall } from '../charts/Waterfall';
import { KpiCard } from '../components/KpiCard';
import { dec1, hours, hours1, int, pct, pp } from '../format';
import { GROUP_ORDER, groupColor, SERIES } from '../theme';
import type { ViewProps } from './types';

/** Simulador: quanto a utilização sobe recuperando perdas ou abrindo um turno extra. */
export function Simulator({ pulso, filters }: ViewProps) {
  const { engine } = pulso;
  const { range, grp } = filters.state;
  const A = useMemo(() => engine.agg({ ...range, grp }), [engine, range, grp]);
  const [S, setS] = useState<Scenario>(() => emptyScenario(engine));
  const R = useMemo(() => simulate(engine, A, S), [engine, A, S]);
  const T = R.T, meta = engine.config.meta / 100;
  const cats = engine.constants.CATS.filter(([c]) => c !== 'man');
  const shifts = engine.config.shifts;
  const toggle = (rc: string) => setS({ ...S, machines: S.machines.includes(rc) ? S.machines.filter((x) => x !== rc) : [...S.machines, rc] });
  const groupsSel = GROUP_ORDER.filter((g) => A.list.some((a) => a.grp === g));

  const steps: WaterfallStep[] = [
    { label: 'Produção atual', value: T.fixedProd, kind: 'total', color: SERIES.produced },
    { label: 'Improdutivo recuperado', value: T.imp, kind: 'gain', color: SERIES.stop },
    { label: 'Manutenção reduzida', value: T.man, kind: 'gain', color: SERIES.maint },
    { label: 'Cobertura de apontamento', value: T.gap, kind: 'gain', color: SERIES.gap },
    { label: 'Turno extra', value: T.addProd, kind: 'gain', color: SERIES.overtime },
    { label: 'Produção simulada', value: T.fixedProd + T.gain, kind: 'subtotal', color: '#1e3a5f' },
  ].filter((s) => s.kind !== 'gain' || s.value >= 60) as WaterfallStep[];

  const byG = new Map<string, { cap: number; cap2: number; fx: number; fx2: number }>();
  for (const r of R.rows) {
    const o = byG.get(r.a.grp) ?? { cap: 0, cap2: 0, fx: 0, fx2: 0 };
    o.cap += r.a.cap; o.cap2 += r.a.cap + r.addCap; o.fx += r.a.fixedProd; o.fx2 += r.a.fixedProd + r.gain; byG.set(r.a.grp, o);
  }
  const top = [...R.rows].filter((r) => r.gain > 0).sort((a, b) => b.gain - a.gain).slice(0, 12);
  const touched = T.gain > 0;

  return (
    <>
      <section className="kpis" aria-label="Resultado da simulação">
        <KpiCard hero label="Utilização simulada" value={pct(T.u2)} sub={touched ? <>hoje {pct(T.u1)} · <b>{pp(((T.u2 ?? 0) - (T.u1 ?? 0)) * 100)}</b></> : 'ajuste as alavancas abaixo'} meter={T.u2 != null ? { value: T.u2, target: meta } : undefined} />
        <KpiCard label="Horas ganhas" value={hours(T.gain)} unit="h" color={SERIES.produced} sub="produção adicional no período" />
        <KpiCard label="Equivale a" value={dec1(T.perDay > 0 ? T.gain / T.perDay : 0)} unit="dias" sub={`de produção média (${hours(T.perDay)} h/dia)`} />
        <KpiCard label="Capacidade adicional" value={hours(T.addCap)} unit="h" color={SERIES.overtime} sub={S.machines.length ? `${S.machines.length} máq. × ${R.days} dias` : 'nenhum turno extra'} />
        <KpiCard label="Distância da meta" value={T.u2 != null ? pp((T.u2 - meta) * 100) : '—'} text sub={`meta de ${engine.config.meta}%`} />
      </section>

      <div className="grid-r">
        <section className="panel">
          <div className="ph"><h2>Alavancas</h2><button type="button" className="btn" onClick={() => setS(emptyScenario(engine))} disabled={!touched && !S.machines.length}>Zerar</button></div>
          <div className="pb sim">
            <div className="sls">
              <div>
                <h3>Reduzir improdutivo por categoria</h3>
                {cats.map(([c, name]) => <Slider key={c} label={name} value={S.cat[c] ?? 0} onChange={(v) => setS({ ...S, cat: { ...S.cat, [c]: v } })} />)}
              </div>
              <div>
                <h3>Outras perdas</h3>
                <Slider label="Manutenção" value={S.man} onChange={(v) => setS({ ...S, man: v })} />
                <Slider label="Capacidade sem apontamento" value={S.gap} onChange={(v) => setS({ ...S, gap: v })} />
              </div>
            </div>
            <h3>Turno extra</h3>
            <div className="row">
              <select className="ctl" aria-label="Turno" value={S.shift} onChange={(e) => setS({ ...S, shift: e.target.value })}>
                {shifts.map((s) => <option key={s.id} value={s.id}>{s.nome ?? s.id} · {dec1(s.h ?? 0)} h</option>)}
              </select>
              <div className="seg" role="group" aria-label="Dias"><button type="button" className={S.days === 5 ? 'on' : ''} onClick={() => setS({ ...S, days: 5 })}>Seg–sex</button><button type="button" className={S.days === 6 ? 'on' : ''} onClick={() => setS({ ...S, days: 6 })}>Seg–sáb</button></div>
            </div>
            {groupsSel.map((g) => (
              <div key={g} className="mgrp">
                <small><i className="dot" style={{ background: groupColor(g) }} />{g}</small>
                <div className="chips">{A.list.filter((a) => a.grp === g).map((a) => <button key={a.m.rc} type="button" className={S.machines.includes(a.m.rc) ? 'chip' : 'chip clr'} aria-pressed={S.machines.includes(a.m.rc)} onClick={() => toggle(a.m.rc)} title={a.m.name}>{chipName(a.m.name)}</button>)}</div>
              </div>
            ))}
            <p className="meta">Hipóteses: hora recuperada vira produção dentro da escala; o turno novo produz na utilização atual da máquina (ou 60% da meta, sem histórico).</p>
          </div>
        </section>
        <section className="panel">
          <div className="ph"><h2>Da produção atual à simulada</h2><span className="meta">horas no período filtrado</span></div>
          <div className="pb"><Waterfall steps={steps} capacity={T.cap2} /></div>
          <div className="ph"><h2>Por grupo</h2><span className="meta">utilização hoje → simulada</span></div>
          <div className="pb">
            <HBars max={1} valueWidth={128} items={GROUP_ORDER.filter((g) => byG.get(g)?.cap).map((g) => {
              const o = byG.get(g)!, u1 = o.fx / o.cap, u2 = o.fx2 / o.cap2;
              return { key: g, label: g, segs: [{ v: Math.min(1, u1), color: groupColor(g) }, { v: Math.max(0, Math.min(1, u2) - Math.min(1, u1)), color: '#9fc3ef' }], target: meta, value: <>{pct(u1)} → <strong>{pct(u2)}</strong></> };
            })} />
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="ph"><h2>Máquinas com maior ganho</h2><span className="meta">{touched ? `${int(top.length)} de ${int(R.rows.length)} máquinas` : 'sem alavancas ativas'}</span></div>
        <div className="pb tw">
          {top.length ? (
            <table className="t">
              <thead><tr><th>Máquina</th><th>Grupo</th><th className="n">Improd.</th><th className="n">Manut.</th><th className="n">Apont.</th><th className="n">Turno extra</th><th className="n">Ganho</th><th className="n">Utilização</th></tr></thead>
              <tbody>{top.map((r) => (
                <tr key={r.a.m.rc}>
                  <td><b>{r.a.m.name}</b> <span className="code">{r.a.m.rc}</span></td><td>{r.a.grp}</td>
                  <td className="n">{hours1(r.imp)}</td><td className="n">{hours1(r.man)}</td><td className="n">{hours1(r.gap)}</td><td className="n">{hours1(r.addProd)}</td>
                  <td className="n"><b>{hours1(r.gain)} h</b></td><td className="n">{pct(r.a.util)} → <b>{pct(r.u2)}</b></td>
                </tr>
              ))}</tbody>
            </table>
          ) : <p className="empty pad">Mova uma alavanca ou escolha máquinas para o turno extra.</p>}
        </div>
      </section>
    </>
  );
}

/** Nome curto para o chip: os chips já estão agrupados por tipo de máquina, então o tipo sai do nome. */
const TYPE = /^(torno (vertical|horiz\.?|horizontal)|mandrilh?adora|furadeira radial|centro de usinagem|plaina fresadora|fresadora universal)\s+(cnc\s+)?/i;
const chipName = (n: string) => n.replace(TYPE, '').trim() || n;

function Slider({ label, value, onChange }: { label: string; value: number; onChange(v: number): void }) {
  return (
    <label className="sl">
      <span>{label}</span>
      <input type="range" min={0} max={100} step={5} value={value} onChange={(e) => onChange(+e.target.value)} aria-label={`${label}: reduzir ${value}%`} />
      <b>{value}%</b>
    </label>
  );
}
