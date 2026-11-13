import { useState } from 'react';
import { restrictToMachines } from '../../analytics/crossfilter';
import type { AggResult, Engine, Measures } from '../../engine';
import { dec1, hours, int, pct } from '../format';
import { groupColor, STATUS_BAR, STATUS_INK } from '../theme';
import { Sparkline } from './Sparkline';

type SortKey = 'rec' | 'cap' | 'union' | 'util' | 'delta' | 'stop' | 'man' | 'gap' | 'he' | 'ops';
const COLS: [SortKey | 'trend', string][] = [['rec', 'Recurso'], ['cap', 'Capacidade h'], ['union', 'Produzido h'], ['util', 'Utilização'], ['delta', 'Δ vs anterior'],
  ['stop', 'Improdutivo h'], ['man', 'Manutenção h'], ['gap', 'Sem apont. h'], ['he', 'Hora extra h'], ['ops', 'OPs'], ['trend', 'Tendência diária']];

interface Row extends Measures { util: number | null; ords: Set<number> }

/** Matriz de desempenho: grupos com suas máquinas, total geral e comparação com o período anterior. Colunas ordenáveis. */
export function Matrix({ A, prev, engine, selected, onPickMachine, onPickGroup }: {
  A: AggResult; prev: AggResult | null; engine: Engine; selected: string[] | null; onPickMachine(rc: string): void; onPickGroup(g: string): void;
}) {
  const [sort, setSort] = useState<{ k: SortKey; d: 1 | -1 }>({ k: 'util', d: -1 });
  const meta = engine.config.meta / 100;
  const get: Record<SortKey, (a: AggResult['list'][number]) => number | string> = {
    rec: (a) => a.m.name, cap: (a) => a.cap, union: (a) => a.union, util: (a) => a.util ?? -1,
    delta: (a) => { const p = prev?.M[a.m.rc]; return a.util != null && p?.util != null ? a.util - p.util : -9; },
    stop: (a) => a.stop, man: (a) => a.manR, gap: (a) => a.gap, he: (a) => a.heAp, ops: (a) => a.ords.size,
  };
  const cmp = (p: AggResult['list'][number], q: AggResult['list'][number]) => {
    const x = get[sort.k](p), y = get[sort.k](q);
    return (typeof x === 'string' ? x.localeCompare(String(y)) : x - (y as number)) * sort.d;
  };
  const head = (k: SortKey | 'trend', label: string) => (
    <th key={k} className={k === 'rec' ? 'l' : k === 'trend' ? 'c' : ''} aria-sort={k === sort.k ? (sort.d > 0 ? 'ascending' : 'descending') : undefined}>
      {k === 'trend' ? label : (
        <button type="button" onClick={() => setSort((s) => ({ k, d: s.k === k ? (-s.d as 1 | -1) : k === 'rec' ? 1 : -1 }))}>
          {label}{k === sort.k ? (sort.d > 0 ? ' ▲' : ' ▼') : ''}
        </button>
      )}
    </th>
  );
  const utilCell = (u: number | null) => {
    if (u == null) return <span className="mu">—</span>;
    const st = engine.status(u).k;
    return <><div className="ub"><i style={{ width: `${Math.min(100, u * 100)}%`, background: STATUS_BAR[st] }} /><b style={{ left: `${meta * 100}%` }} /></div><span className="uv" style={{ color: STATUS_INK[st] }}>{pct(u)}</span></>;
  };
  const deltaCell = (u: number | null, p: number | null | undefined) => {
    if (u == null || p == null) return <span className="mu">—</span>;
    const d = (u - p) * 100;
    return <span className={Math.abs(d) < 0.05 ? 'mu' : d > 0 ? 'up' : 'dn'}>{d > 0 ? '▲' : d < 0 ? '▼' : ''} {dec1(Math.abs(d))}</span>;
  };
  const hcell = (v: number, base?: number) => (v >= 6 ? <>{hours(v)}{base ? <em>{pct(v / base)}</em> : null}</> : <span className="mu">—</span>);
  const cells = (r: Row, p: { util: number | null } | null | undefined) => (
    <>
      <td>{hours(r.cap)}</td><td>{hours(r.union)}</td><td className="uc">{utilCell(r.util)}</td><td>{deltaCell(r.util, p?.util)}</td>
      <td>{hcell(r.stop, r.cap)}</td><td>{hcell(r.manR, r.cap)}</td><td>{hcell(r.gap, r.cap)}</td><td>{hcell(r.heAp)}</td><td>{int(r.ords.size)}</td>
    </>
  );

  return (
    <div className="mx">
      <table>
        <thead><tr>{COLS.map(([k, l]) => head(k, l))}</tr></thead>
        <tbody>
          {A.G.map((g) => {
            const L = g.list.filter((a) => a.cap > 0 || a.union > 0).sort(cmp);
            if (!L.length) return null;
            const pg = prev ? restrictToMachines(prev, g.list.map((a) => a.m.rc)).T : null;
            return [
              <tr key={'g' + g.g} className="g clk" onClick={() => onPickGroup(g.g)}>
                <td className="l"><i className="gd" style={{ background: groupColor(g.g) }} />{g.g}<small>{L.length} {L.length === 1 ? 'máquina' : 'máquinas'}</small></td>
                {cells(g as unknown as Row, pg)}<td />
              </tr>,
              ...L.map((a) => (
                <tr key={a.m.rc} className={selected?.includes(a.m.rc) ? 'sel clk' : 'clk'} onClick={() => onPickMachine(a.m.rc)}>
                  <td className="l">{a.m.name}<small>{a.m.rc}</small></td>
                  {cells(a as unknown as Row, prev?.M[a.m.rc])}
                  <td className="c"><Sparkline values={A.days.map((d) => (a.byDay[d].cap > 0 ? a.byDay[d].fixedProd / a.byDay[d].cap : null))} reference={meta} max={1} height={22} /></td>
                </tr>
              )),
            ];
          })}
          <tr className="tot"><td className="l">Total</td>{cells(A.T as unknown as Row, prev?.T)}<td /></tr>
        </tbody>
      </table>
    </div>
  );
}
