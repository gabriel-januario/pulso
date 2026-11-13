import type { AggResult, CartEntry, Engine, MachineAgg, ProdRecord } from '../engine';
import { mergedIntervals, spanOf, type Interval } from '../engine/core/intervals';
import { isWork } from './planning';
import { addDays, isIsoDay, weekday } from './period';

/* Telas de gestão: Carteira e prazos, Simulador, Operadores e Qualidade dos dados.
   Funções puras, testadas contra a v2.2 em tests/management.test.ts. */

const DAY = 1440;

/* =============================== CARTEIRA =============================== */

export type OrderStatus = 'late' | 'risk' | 'stop' | 'on' | 'np' | 'review' | 'ok';
export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: 'crit' | 'warn' | 'good' | 'done' | 'none' }> = {
  late: { label: 'Atrasado', tone: 'crit' }, risk: { label: 'Em risco', tone: 'warn' }, stop: { label: 'Sem ritmo', tone: 'warn' },
  review: { label: 'Validar saldo', tone: 'warn' }, on: { label: 'No prazo', tone: 'good' }, ok: { label: 'Concluído', tone: 'done' }, np: { label: 'Sem previsão', tone: 'none' },
};

export interface PortfolioRow {
  ped: string; entry: CartEntry;
  /** minutos usinados no total e nos últimos 14 dias da base */
  machined: number; recent: number;
  orders: number; first: number | null; last: number | null;
  planned: number | null; done: boolean; remaining: number | null;
  /** ritmo = média diária dos últimos 14 dias (min/dia) */
  pace: number;
  due: string | null; finish: string | null; status: OrderStatus;
  /** participação de cada grupo nas horas do PV (soma 1) */
  groups: [string, number][];
  /** PV cadastrado manualmente, ainda sem apontamento */
  manual: boolean;
}

const isWorkday = (engine: Engine, iso: string) => isWork(engine.dayCfg(iso));

/**
 * Carteira: PVs com apontamento nos últimos 30 dias da base, mais os cadastrados pelo usuário.
 * Com horas previstas e entrega, projeta o término pelo ritmo dos últimos 14 dias (só em dias úteis)
 * e classifica: atrasado, em risco, sem ritmo, no prazo, sem previsão ou concluído.
 */
export function portfolio(engine: Engine, cart: Record<string, CartEntry>): PortfolioRow[] {
  const { s2iso, iso2s } = engine.util, today = s2iso(engine.dataset.maxPd), T = engine.dataset.lastT;
  const by = new Map<string, { t0: number; t1: number; resources: Map<string, Interval[]>; ops: Set<number> }>();
  for (const x of engine.dataset.prod) {
    if (!x.ped || !engine.dataset.machines[x.rc]) continue;
    const k = String(x.ped), end = x.t0 + x.min;
    let o = by.get(k);
    if (!o) { o = { t0: x.t0, t1: end, resources: new Map(), ops: new Set() }; by.set(k, o); }
    o.t0 = Math.min(o.t0, x.t0);
    o.t1 = Math.max(o.t1, end);
    const intervals = o.resources.get(x.rc) ?? [];
    intervals.push([x.t0, end]);
    o.resources.set(x.rc, intervals);
    o.ops.add(x.opn);
  }
  const keys = new Set([...[...by.entries()].filter(([, o]) => o.t1 >= T - 30 * DAY).map(([k]) => k), ...Object.keys(cart)]);
  const rows: PortfolioRow[] = [];
  for (const k of keys) {
    const o = by.get(k), c = cart[k] ?? {};
    if (c.hide) continue;
    let machined = 0, recent = 0;
    const byGroup = new Map<string, number>();
    for (const [rc, intervals] of o?.resources ?? []) {
      const union = mergedIntervals(intervals);
      const minutes = spanOf(union), g = engine.grpOf(rc);
      machined += minutes;
      recent += union.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(T, b) - Math.max(T - 14 * DAY, a)), 0);
      byGroup.set(g, (byGroup.get(g) ?? 0) + minutes);
    }
    const planned = c.h != null && c.h > 0 && Number.isFinite(c.h * 60) ? c.h * 60 : null;
    const due = isIsoDay(c.due) ? c.due : null;
    const done = c.done === true;
    const remaining = planned != null ? Math.max(0, planned - machined) : null;
    const pace = recent / 14;
    let finish: string | null = null;
    if (remaining != null && remaining > 0 && !done && pace > 0) {
      let left = remaining, p = iso2s(today);
      const limit = p + 366;
      while (left > 0 && p < limit) { p++; if (isWorkday(engine, s2iso(p))) left -= (pace * 7) / 5; }
      finish = left > 0 ? null : s2iso(p);
    }
    let status: OrderStatus = 'np';
    if (done) status = 'ok';
    else if (remaining === 0) status = 'review';
    else if (planned != null && due) status = due < today ? 'late' : !finish ? 'stop' : finish > due ? 'risk' : 'on';
    const groups: [string, number][] = machined ? [...byGroup].map(([g, v]): [string, number] => [g, v / machined]).sort((p, q) => q[1] - p[1]) : [[c.g || 'Outros postos', 1]];
    rows.push({ ped: k, entry: c, machined, recent, orders: o?.ops.size ?? 0, first: o?.t0 ?? null, last: o?.t1 ?? null, planned, done, remaining, pace, due, finish, status, groups, manual: !o });
  }
  const order: Record<OrderStatus, number> = { late: 0, risk: 1, review: 2, stop: 3, on: 4, np: 5, ok: 6 };
  return rows.sort((p, q) => order[p.status] - order[q.status] || (p.due || '9').localeCompare(q.due || '9') || q.machined - p.machined);
}

export interface LoadWeek { from: string; to: string; load: Record<string, number>; cap: Record<string, number>; orders: string[] }

/**
 * Carga da carteira nas próximas semanas, contra a capacidade por grupo.
 * O restante de cada PV com entrega é distribuído por igual nos dias úteis até a entrega.
 * Onde não há escala validada, a capacidade usa a média de cada dia da semana nas últimas 4 semanas.
 */
export function weeklyLoad(engine: Engine, full: AggResult, rows: PortfolioRow[], weeks = 8): LoadWeek[] {
  const { s2iso, iso2s } = engine.util, t = engine.dataset.maxPd;
  let w0 = t + 1 - ((weekday(s2iso(t + 1)) + 6) % 7);
  if (t + 1 - w0 >= 5 && ![t + 1, w0 + 6].some((p) => isWorkday(engine, s2iso(p)))) w0 += 7;
  const start = Math.max(t + 1, w0);
  const W = Array.from({ length: weeks }, (_, k) => ({ from: s2iso(w0 + 7 * k), to: s2iso(w0 + 7 * k + 6), load: {} as Record<string, number>, cap: {} as Record<string, number>, orders: [] as string[] }));
  const recent = full.days.slice(-28);
  for (const a of full.list) {
    const sum = new Array(7).fill(0), n = new Array(7).fill(0);
    for (const d of recent) { const w = weekday(d); sum[w] += a.byDay[d]?.cap || 0; n[w]++; }
    const avg = sum.map((v, i) => (n[i] ? v / n[i] : 0));
    for (const wk of W) for (let p = iso2s(wk.from); p <= iso2s(wk.to); p++) {
      if (p < start) continue;
      const d = s2iso(p);
      let c = engine.capParts(a.m.rc, d, true).op;
      if (engine.machCfgM(a.m.rc, d.slice(0, 7)).modo === 'pendente' && isWorkday(engine, d) && c === 0) {
        c = avg[weekday(d)];
      }
      wk.cap[a.grp] = (wk.cap[a.grp] || 0) + c;
    }
  }
  const overrides = [...new Set([...Object.keys(engine.constants.HOL), ...Object.keys(engine.config.cal)])]
    .filter(isIsoDay).map((d) => ({ p: iso2s(d), delta: Number(isWorkday(engine, d)) - Number(weekday(d) >= 1 && weekday(d) <= 5) }));
  const horizonEnd = w0 + W.length * 7 - 1;
  for (const o of rows) {
    if (!(o.remaining && o.remaining > 0) || !isIsoDay(o.due) || o.done) continue;
    const end = Math.max(start, iso2s(o.due)), days: number[] = [];
    const fullWeeks = Math.floor((end - start + 1) / 7);
    let workdays = fullWeeks * 5;
    for (let p = start + fullWeeks * 7; p <= end; p++) {
      const w = weekday(s2iso(p));
      if (w >= 1 && w <= 5) workdays++;
    }
    for (const { p, delta } of overrides) if (p >= start && p <= end) workdays += delta;
    for (let p = start; p <= Math.min(end, horizonEnd); p++) if (isWorkday(engine, s2iso(p))) days.push(p);
    if (!workdays) {
      for (let p = start; p <= horizonEnd; p++) {
        if (!isWorkday(engine, s2iso(p))) continue;
        days.push(p);
        break;
      }
    }
    const per = o.remaining / (workdays || 1);
    for (const p of days) {
      const wk = W[Math.floor((p - w0) / 7)];
      if (!wk) continue;
      for (const [g, f] of o.groups) wk.load[g] = (wk.load[g] || 0) + per * f;
      if (!wk.orders.includes(o.ped)) wk.orders.push(o.ped);
    }
  }
  return W;
}

/* =============================== SIMULADOR =============================== */

export interface Scenario {
  /** % de redução do improdutivo por categoria */
  cat: Record<string, number>;
  /** % de redução da manutenção e da capacidade sem apontamento */
  man: number; gap: number;
  /** turno extra: id do turno, máquinas que o recebem e dias (5 = seg–sex, 6 = seg–sáb) */
  shift: string; machines: string[]; days: 5 | 6;
}
export interface SimRow { a: MachineAgg; imp: number; man: number; gap: number; addCap: number; addProd: number; u2: number | null; gain: number }
export interface SimTotals { cap: number; fixedProd: number; union: number; imp: number; man: number; gap: number; addCap: number; addProd: number; u1: number | null; cap2: number; u2: number | null; gain: number; perDay: number }

export const emptyScenario = (engine: Engine): Scenario => ({ cat: {}, man: 0, gap: 0, shift: (engine.config.shifts.find((s) => !s.def) ?? engine.config.shifts[0])?.id ?? '', machines: [], days: 5 });

/**
 * Quanto a utilização subiria se parte das perdas virasse produção, ou com um turno extra.
 * Hipóteses: horas recuperadas viram produção dentro da escala; um turno novo produz na utilização atual
 * da máquina (ou 60% da meta, se ela não tiver histórico).
 */
export function simulate(engine: Engine, A: AggResult, S: Scenario): { rows: SimRow[]; T: SimTotals; days: number } {
  const meta = engine.config.meta / 100, sh = engine.config.shifts.find((s) => s.id === S.shift), shiftMin = (+(sh?.h ?? 0) || 0) * 60;
  const days = A.days.filter((d) => { const w = weekday(d); return (S.days === 6 ? w >= 1 && w <= 6 : w >= 1 && w <= 5) && !engine.constants.HOL[d]; }).length;
  const byM = new Map<string, Record<string, number>>();
  for (const s of A.stops) { if (!s.mach || !A.M[s.mach]) continue; const m = byM.get(s.mach) ?? {}; m[s.cat] = (m[s.cat] || 0) + s.mp; byM.set(s.mach, m); }
  const rows = A.list.filter((a) => a.cap > 0 || S.machines.includes(a.m.rc)).map((a) => {
    const cs = byM.get(a.m.rc) ?? {}, ct = Object.values(cs).reduce((q, v) => q + v, 0);
    const imp = ct > 0 ? (a.accountStop * Object.entries(cs).reduce((q, [c, v]) => q + (v * (S.cat[c] || 0)) / 100, 0)) / ct : 0;
    const man = (a.accountMaint * S.man) / 100, gap = (a.gap * S.gap) / 100;
    const addCap = S.machines.includes(a.m.rc) ? shiftMin * days : 0, addProd = addCap * (a.util != null ? a.util : meta * 0.6);
    const cap2 = a.cap + addCap, fx2 = a.fixedProd + imp + man + gap;
    return { a, imp, man, gap, addCap, addProd, u2: cap2 > 0 ? (fx2 + addProd) / cap2 : null, gain: imp + man + gap + addProd };
  });
  const T = { cap: 0, fixedProd: 0, union: 0, imp: 0, man: 0, gap: 0, addCap: 0, addProd: 0 } as SimTotals;
  for (const r of rows) { T.cap += r.a.cap; T.fixedProd += r.a.fixedProd; T.union += r.a.union; T.imp += r.imp; T.man += r.man; T.gap += r.gap; T.addCap += r.addCap; T.addProd += r.addProd; }
  T.u1 = T.cap > 0 ? T.fixedProd / T.cap : null;
  T.cap2 = T.cap + T.addCap;
  T.u2 = T.cap2 > 0 ? (T.fixedProd + T.imp + T.man + T.gap + T.addProd) / T.cap2 : null;
  T.gain = T.imp + T.man + T.gap + T.addProd;
  T.perDay = T.union / (A.dayT.filter((o) => o.cap > 0).length || 1);
  return { rows, T, days };
}

/* =============================== QUALIDADE =============================== */

/** Nota A–E a partir do índice 0–100. */
export const grade = (s: number) => (s >= 90 ? 'A' : s >= 80 ? 'B' : s >= 70 ? 'C' : s >= 60 ? 'D' : 'E');
export const GRADE_COLOR: Record<string, string> = { A: '#1f8a4c', B: '#5aa469', C: '#e3a33b', D: '#ef8f6f', E: '#d64b45' };

export interface Issue { kind: 'long' | 'overlap'; rec: ProdRecord; rc: string }
export interface OperatorRow {
  name: string; prod: number; imp: number; unclassified: number; n: number; stops: number; manual: number;
  long: number; longMin: number; overlap: number; overlapMin: number; orders: Set<number>;
  machines: Map<string, number>; byDay: Map<string, number>; issues: Issue[];
  pillars: { cls: number; lg: number; ov: number; col: number }; score: number;
}

/**
 * Operadores: horas, improdutivos e qualidade do apontamento.
 * Índice (0–100) = média de 4 pilares de 25%: motivos classificados, sem apontamento > 10 h,
 * sem sobreposição (peso triplo nos minutos sobrepostos) e lançamento via coletor.
 */
export function operators(engine: Engine, A: AggResult): OperatorRow[] {
  const { F, T_: T } = A, O = new Map<string, OperatorRow>();
  const get = (k: string) => {
    let o = O.get(k);
    if (!o) { o = { name: k, prod: 0, imp: 0, unclassified: 0, n: 0, stops: 0, manual: 0, long: 0, longMin: 0, overlap: 0, overlapMin: 0, orders: new Set(), machines: new Map(), byDay: new Map(), issues: [], pillars: { cls: 1, lg: 1, ov: 1, col: 1 }, score: 100 }; O.set(k, o); }
    return o;
  };
  const dayOf = (t: number) => engine.util.s2iso(Math.floor(t / DAY));
  for (const a of A.list) for (const x of a.recs) {
    const v = Math.max(0, Math.min(T, x.t0 + x.min) - Math.max(F, x.t0)), o = get(x.op);
    o.prod += v; o.n++; o.orders.add(x.opn); o.machines.set(a.m.rc, (o.machines.get(a.m.rc) ?? 0) + v);
    const d = dayOf(Math.max(F, x.t0)); o.byDay.set(d, (o.byDay.get(d) ?? 0) + v);
    if (x.manual) o.manual++;
    if (x.min > 600) { o.long++; o.longMin += x.min; o.issues.push({ kind: 'long', rec: x, rc: a.m.rc }); }
  }
  for (const s of A.stops) { if (!s.op) continue; const o = get(s.op); o.imp += s.mp; o.stops++; if (s.cat === 'nc') o.unclassified += s.mp; }
  for (const [k, o] of O) {
    const L = (engine.dataset.byOp[k] ?? []).filter((x) => x.t0 + x.min > F && x.t0 < T);
    let end = -Infinity;
    for (const x of L) {
      if (x.t0 < end - 5) { o.overlap++; o.overlapMin += Math.min(end, x.t0 + x.min) - x.t0; o.issues.push({ kind: 'overlap', rec: x, rc: x.rc }); }
      if (x.t0 + x.min > end) end = x.t0 + x.min;
    }
  }
  const rows = [...O.values()].filter((o) => o.n || o.stops);
  for (const o of rows) {
    o.pillars = {
      cls: o.imp > 0 ? 1 - o.unclassified / o.imp : 1,
      lg: o.prod > 0 ? 1 - Math.min(1, o.longMin / o.prod) : 1,
      ov: o.prod > 0 ? 1 - Math.min(1, (3 * o.overlapMin) / o.prod) : 1,
      col: o.n ? 1 - o.manual / o.n : 1,
    };
    const p = o.pillars;
    o.score = Math.round((p.cls * 0.25 + p.lg * 0.25 + p.ov * 0.25 + p.col * 0.25) * 100);
  }
  return rows.sort((p, q) => q.prod - p.prod);
}

export const QUALITY_PILLARS = [
  { key: 'cob', label: 'Cobertura da capacidade', weight: 40, hint: 'capacidade com algum apontamento' },
  { key: 'cls', label: 'Motivos classificados', weight: 20, hint: 'improdutivo com categoria' },
  { key: 'lg', label: 'Apontamentos sem excesso', weight: 15, hint: 'horas fora de registros > 10 h' },
  { key: 'cf', label: 'Sem conflito', weight: 15, hint: 'produção sem sobrepor parada' },
  { key: 'col', label: 'Via coletor', weight: 10, hint: 'apontamentos não manuais' },
] as const;
export type Pillars = Record<(typeof QUALITY_PILLARS)[number]['key'], number>;
const scoreOf = (p: Pillars) => Math.round((p.cob * 0.4 + p.cls * 0.2 + p.lg * 0.15 + p.cf * 0.15 + p.col * 0.1) * 100);

/**
 * Índice de qualidade do apontamento (0–100), por máquina, ponderado pela capacidade e semana a semana.
 * Pesos: cobertura 40%, classificação 20%, sem excesso 15%, sem conflito 15%, via coletor 10%.
 */
export function dataQuality(engine: Engine, A: AggResult) {
  const byM = new Map<string, { imp: number; nc: number }>();
  for (const s of A.stops) { if (!s.mach || !A.M[s.mach]) continue; const o = byM.get(s.mach) ?? { imp: 0, nc: 0 }; o.imp += s.mp; if (s.cat === 'nc') o.nc += s.mp; byM.set(s.mach, o); }
  const machines = A.list.filter((a) => a.cap > 0 || a.union > 0).map((a) => {
    const s = byM.get(a.m.rc) ?? { imp: 0, nc: 0 }, longMin = a.long.reduce((q, x) => q + x.min, 0), n = a.recs.length;
    const p: Pillars = {
      cob: a.cap > 0 ? Math.max(0, 1 - a.gap / a.cap) : 1, cls: s.imp > 0 ? 1 - s.nc / s.imp : 1,
      lg: a.union > 0 ? 1 - Math.min(1, longMin / a.union) : 1, cf: a.union > 0 ? 1 - Math.min(1, a.conflict / a.union) : 1, col: n ? 1 - a.manual / n : 1,
    };
    return { a, p, score: scoreOf(p), gap: a.gap, unclassified: s.nc, longMin, manual: a.manual, n };
  });
  const w = machines.reduce((q, o) => q + (o.a.cap || o.a.union), 0) || 1;
  const avg = (k: keyof Pillars) => machines.reduce((q, o) => q + o.p[k] * (o.a.cap || o.a.union), 0) / w;
  const pillars: Pillars = { cob: avg('cob'), cls: avg('cls'), lg: avg('lg'), cf: avg('cf'), col: avg('col') };

  const weekOf = (d: string) => addDays(d, -((weekday(d) + 6) % 7));
  const wk = new Map<string, { cap: number; gap: number; un: number; cf: number; imp: number; nc: number; lm: number; n: number; man: number }>();
  for (const d of A.days) {
    const k = weekOf(d), o = wk.get(k) ?? { cap: 0, gap: 0, un: 0, cf: 0, imp: 0, nc: 0, lm: 0, n: 0, man: 0 };
    for (const a of A.list) { const b = a.byDay[d] as unknown as Record<string, number>; o.cap += b.cap; o.gap += b.gap || 0; o.un += b.union; o.cf += b.conflict || 0; }
    wk.set(k, o);
  }
  const weekOfT = (t: number) => weekOf(engine.util.s2iso(Math.floor(t / DAY)));
  for (const s of A.stops) { if (!s.mach || !A.M[s.mach]) continue; const o = wk.get(weekOfT(s.t0)); if (!o) continue; o.imp += s.mp; if (s.cat === 'nc') o.nc += s.mp; }
  for (const a of A.list) for (const x of a.recs) { const o = wk.get(weekOfT(Math.max(A.F, x.t0))); if (!o) continue; o.n++; if (x.manual) o.man++; if (x.min > 600) o.lm += x.min; }
  const weeks = [...wk.entries()].map(([k, o]) => ({
    week: k,
    score: scoreOf({ cob: o.cap > 0 ? 1 - o.gap / o.cap : 1, cls: o.imp > 0 ? 1 - o.nc / o.imp : 1, lg: o.un > 0 ? 1 - Math.min(1, o.lm / o.un) : 1, cf: o.un > 0 ? 1 - Math.min(1, o.cf / o.un) : 1, col: o.n ? 1 - o.man / o.n : 1 }),
  }));
  return { machines, pillars, score: scoreOf(pillars), weeks };
}
