import type { AggResult, Engine, MachineAgg, MachineEvent, SuspectStop } from '../engine';
import { weekday } from './period';

/* Cálculos das telas Manutenção e Improdutivas. Funções puras, testadas contra a v2.2 em tests/losses.test.ts. */

export interface MaintenanceSummary {
  events: MachineEvent[];
  /** nº de eventos, tempo real parado, tempo apontado e não apontado (min) */
  n: number; real: number; ap: number; hidden: number;
  /** MTTR = parada real ÷ eventos · MTBF = horas produzidas ÷ eventos (min) */
  mttr: number | null; mtbf: number | null;
  /** manutenção apontada sem nenhum apontamento produtivo depois */
  openDetected: ReturnType<Engine['buildEvents']>['ev'];
  suspects: (SuspectStop & { idleInPeriod: number })[];
  suspectMinutes: number;
  byMachine: { rc: string; real: number; ap: number; n: number; suspect: number }[];
}

/** Indicadores de manutenção do período: eventos, MTTR/MTBF, máquinas sem retorno e paradas a confirmar. */
export function maintenanceSummary(engine: Engine, A: AggResult): MaintenanceSummary {
  const E = engine.buildEvents();
  const events = [...A.list.flatMap((a) => a.evs)].sort((a, b) => b.e.t0 - a.e.t0);
  const n = events.length, real = events.reduce((q, o) => q + o.real, 0), ap = events.reduce((q, o) => q + o.ap, 0);
  const openDetected = E.ev.filter((e) => e.open && e.src !== 'manual' && A.M[e.rc]);
  const decided = engine.config.evt;
  const suspects = E.sus.filter((s) => A.M[s.rc] && s.t0 >= A.F && s.t0 < A.T_ && !decided[s.key])
    .map((s) => ({ ...s, idleInPeriod: engine.capSeg(s.rc, Math.max(s.s.t0 + s.s.min, A.F), Math.min(s.end, A.T_)) }));
  const by = new Map<string, { rc: string; real: number; ap: number; n: number; suspect: number }>();
  const row = (rc: string) => { let x = by.get(rc); if (!x) { x = { rc, real: 0, ap: 0, n: 0, suspect: 0 }; by.set(rc, x); } return x; };
  for (const o of events) { const x = row(o.e.rc); x.real += o.real; x.ap += o.ap; x.n++; }
  for (const s of suspects) row(s.rc).suspect += s.idleInPeriod;
  return {
    events, n, real, ap, hidden: Math.max(0, real - ap),
    mttr: n ? real / n : null, mtbf: n ? A.T.union / n : null,
    openDetected, suspects, suspectMinutes: suspects.reduce((q, s) => q + s.idleInPeriod, 0),
    byMachine: [...by.values()].sort((a, b) => b.real + b.suspect - (a.real + a.suspect)).slice(0, 20),
  };
}

export interface ReasonTotal { code: number; minutes: number; count: number; machines: number }
export interface MachineLoss { a: MachineAgg; minutes: number; count: number; unproductive: number; maintenance: number; hidden: number; reasons: [string, number][] }
export interface OperatorLoss { name: string; minutes: number; count: number; reason: number; machine: string | null }

/** Improdutivos do período: pareto de motivos, categorias, máquinas mais afetadas e operadores. */
export function unproductiveSummary(A: AggResult) {
  const stops = A.stops.filter((s) => !s.mach || A.M[s.mach]);
  const total = stops.reduce((q, s) => q + s.mp, 0);
  const reasons = new Map<number, { min: number; n: number; mach: Set<string> }>();
  const categories: Record<string, number> = {};
  for (const s of stops) {
    const o = reasons.get(s.oper) ?? { min: 0, n: 0, mach: new Set<string>() };
    o.min += s.mp; o.n++; if (s.mach) o.mach.add(s.mach);
    reasons.set(s.oper, o);
    categories[s.cat] = (categories[s.cat] ?? 0) + s.mp;
  }
  const workDays = Math.max(1, A.dayT.filter((o) => o.capP > 0).length);
  const withoutMachine = stops.filter((s) => !s.mach).reduce((q, s) => q + s.mp, 0);

  const ranking: MachineLoss[] = A.list.map((a) => {
    const m = new Map<string, number>();
    for (const s of a.stops) m.set(String(s.oper), (m.get(String(s.oper)) ?? 0) + s.mp);
    if (a.ocult > 0) m.set('__oc', a.ocult);
    return { a, minutes: a.stop + a.ocult, count: a.stops.length, unproductive: Math.max(0, a.stop - a.manA), maintenance: a.manA, hidden: a.ocult, reasons: [...m.entries()].sort((p, q) => q[1] - p[1]) };
  }).filter((r) => r.minutes > 0).sort((p, q) => q.minutes - p.minutes);

  const ops = new Map<string, { min: number; n: number; m: Map<number, number>; mc: Map<string, number> }>();
  for (const s of stops) {
    const o = ops.get(s.op) ?? { min: 0, n: 0, m: new Map(), mc: new Map() };
    o.min += s.mp; o.n++; o.m.set(s.oper, (o.m.get(s.oper) ?? 0) + s.mp);
    if (s.mach) o.mc.set(s.mach, (o.mc.get(s.mach) ?? 0) + s.mp);
    ops.set(s.op, o);
  }
  const top = <K,>(m: Map<K, number>) => [...m.entries()].sort((p, q) => q[1] - p[1])[0]?.[0] ?? null;
  const operators: OperatorLoss[] = [...ops.entries()].sort((p, q) => q[1].min - p[1].min).slice(0, 20)
    .map(([name, o]) => ({ name, minutes: o.min, count: o.n, reason: top(o.m)!, machine: top(o.mc) }));

  return {
    stops, total, workDays, withoutMachine, categories, ranking, operators,
    reasons: [...reasons.entries()].map(([code, o]) => ({ code, minutes: o.min, count: o.n, machines: o.mach.size })).sort((a, b) => b.minutes - a.minutes) as ReasonTotal[],
  };
}

export interface LossBucket { key: string; label: string; sub: string; from: string; to: string; stop: number; manA: number; manR: number; ocult: number; cap: number }

/** Série diária de perdas; acima de 45 dias, agrupada por semana (segunda a domingo). */
export function lossSeries(A: AggResult): { buckets: LossBucket[]; weekly: boolean } {
  const weekly = A.days.length > 45, out: LossBucket[] = [], idx = new Map<string, LossBucket>();
  const WD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  for (const o of A.dayT) {
    const w = weekday(o.d);
    let k = o.d;
    if (weekly) { const d = new Date(o.d + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((w + 6) % 7)); k = d.toISOString().slice(0, 10); }
    let b = idx.get(k);
    if (!b) { b = { key: k, label: `${k.slice(8)}/${k.slice(5, 7)}`, sub: weekly ? '' : WD[w], from: o.d, to: o.d, stop: 0, manA: 0, manR: 0, ocult: 0, cap: 0 }; idx.set(k, b); out.push(b); }
    const ocult = Math.max(0, o.manR - o.manA);
    b.to = o.d; b.stop += o.stop; b.manA += o.manA; b.manR += o.manR; b.ocult += ocult; b.cap += o.cap;
  }
  return { buckets: out, weekly };
}
