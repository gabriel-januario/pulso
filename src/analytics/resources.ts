import type { AggResult, Engine, MachineAgg, MachineEvent, ProdRecord, StopRecord } from '../engine';

/* Cálculos das telas Máquinas, Grupos e Linha do tempo. Funções puras, testadas em tests/views.test.ts. */

export interface OrderRow { opn: number; ped: number; item: number; org: string; minutes: number; count: number; operations: number[]; operators: string[]; t0: number; t1: number }

/** OPs apontadas em um conjunto de registros, da que mais consumiu horas para a que menos consumiu. */
export function ordersOf(recs: ProdRecord[]): { rows: OrderRow[]; total: number } {
  const by = new Map<string, OrderRow & { ops: Set<string>; oper: Set<number> }>();
  for (const x of recs) {
    const k = `${x.opn}|${x.rc}`;
    let o = by.get(k);
    if (!o) {
      o = { opn: x.opn, ped: x.ped, item: x.item, org: x.org, minutes: 0, count: 0, operations: [], operators: [], t0: x.t0, t1: x.t0 + x.min, ops: new Set(), oper: new Set() };
      by.set(k, o);
    }
    o.minutes += x.min; o.count++; o.oper.add(x.oper); o.ops.add(x.op);
    o.t0 = Math.min(o.t0, x.t0); o.t1 = Math.max(o.t1, x.t0 + x.min);
  }
  const rows = [...by.values()].map(({ ops, oper, ...o }) => ({ ...o, operations: [...oper].sort((a, b) => a - b), operators: [...ops] }))
    .sort((a, b) => b.minutes - a.minutes);
  return { rows, total: rows.reduce((q, o) => q + o.minutes, 0) };
}

export interface ReasonRow { code: number; name: string; category: string; maintenance: boolean; minutes: number; count: number }

/** Improdutivos de uma máquina agrupados por motivo (minutos dentro do período). */
export function stopsByReason(stops: StopRecord[], engine: Engine): ReasonRow[] {
  const cats = Object.fromEntries(engine.constants.CATS);
  const by = new Map<number, { min: number; n: number }>();
  for (const s of stops) { const o = by.get(s.oper) ?? { min: 0, n: 0 }; o.min += s.mp; o.n++; by.set(s.oper, o); }
  return [...by.entries()].map(([code, o]) => {
    const c = engine.motCat(code);
    return { code, name: engine.motName(code), category: cats[c] ?? c, maintenance: c === 'man', minutes: o.min, count: o.n };
  }).sort((a, b) => b.minutes - a.minutes);
}

export interface GroupDiagnosis {
  group: string; util: number | null; active: number;
  /** máquinas na meta (do melhor para o pior) e abaixo dela (do pior para o melhor) */
  top: string[]; low: string[];
  /** utilização do grupo sem as máquinas que estão na meta */
  utilWithoutTop: number | null;
  /** o resultado do grupo é sustentado por poucas máquinas na meta */
  masked: boolean;
}
export interface LowPerformer { a: MachineAgg; missing: number; mainLoss: string; reasons: [string, number][] }

/**
 * Recursos abaixo da meta, com quanto falta para chegar nela, a principal perda e os três maiores motivos de parada.
 * Também diz se a média do grupo está sendo "puxada" por máquinas de destaque.
 */
export function lowPerformers(A: AggResult, meta: number): { groups: GroupDiagnosis[]; low: LowPerformer[]; active: number } {
  const groups = A.G.map((g) => {
    const act = g.list.filter((a) => a.cap > 0);
    const top = act.filter((a) => a.util != null && a.util >= meta).sort((x, y) => y.util! - x.util!);
    const low = act.filter((a) => a.util != null && a.util < meta).sort((x, y) => x.util! - y.util!);
    const restCap = g.cap - top.reduce((q, a) => q + a.cap, 0), restProd = g.fixedProd - top.reduce((q, a) => q + a.fixedProd, 0);
    const utilWithoutTop = top.length && restCap > 0 ? restProd / restCap : null;
    const masked = !!(top.length && low.length && utilWithoutTop != null && g.util != null && (g.util >= meta || g.util - utilWithoutTop >= 0.05));
    return { diag: { group: g.g, util: g.util, active: act.length, top: top.map((a) => a.m.rc), low: low.map((a) => a.m.rc), utilWithoutTop, masked }, low };
  });
  const low = groups.flatMap((x) => x.low).sort((a, b) => a.util! - b.util!).map((a) => {
    const by = new Map<string, number>();
    for (const s of a.stops) by.set(String(s.oper), (by.get(String(s.oper)) ?? 0) + s.mp);
    if (a.ocult > 0) by.set('__oc', a.ocult);
    const reasons = [...by.entries()].sort((p, q) => q[1] - p[1]).slice(0, 3);
    const mainLoss = ([['Improdutivo', a.stop], ['Manutenção não apontada', a.ocult], ['Sem apontamento', a.gap]] as [string, number][]).sort((p, q) => q[1] - p[1])[0][0];
    return { a, missing: Math.max(0, a.cap * meta - a.fixedProd), mainLoss, reasons };
  });
  return { groups: groups.map((x) => x.diag), low, active: A.list.filter((a) => a.cap > 0).length };
}

export interface SalesOrderRow { ped: string; minutes: number; count: number; orders: number; items: number; machines: [string, number][]; t0: number; t1: number }

/** Pedidos de venda (PV) pelas horas de máquina consumidas no período. */
export function salesOrders(A: AggResult): { rows: SalesOrderRow[]; total: number; orders: number } {
  const by = new Map<string, { min: number; n: number; ops: Set<number>; items: Set<number>; mach: Map<string, number>; t0: number; t1: number }>();
  let total = 0;
  const orders = new Set<number>();
  for (const a of A.list) for (const x of a.recs) {
    const k = String(x.ped || '0');
    let o = by.get(k);
    if (!o) { o = { min: 0, n: 0, ops: new Set(), items: new Set(), mach: new Map(), t0: x.t0, t1: x.t0 + x.min }; by.set(k, o); }
    o.min += x.min; o.n++; o.ops.add(x.opn); o.items.add(x.item); o.mach.set(a.m.rc, (o.mach.get(a.m.rc) ?? 0) + x.min);
    o.t0 = Math.min(o.t0, x.t0); o.t1 = Math.max(o.t1, x.t0 + x.min);
    total += x.min; orders.add(x.opn);
  }
  const rows = [...by.entries()].map(([ped, o]) => ({ ped, minutes: o.min, count: o.n, orders: o.ops.size, items: o.items.size, machines: [...o.mach.entries()].sort((p, q) => q[1] - p[1]), t0: o.t0, t1: o.t1 }))
    .sort((a, b) => b.minutes - a.minutes);
  return { rows, total, orders: orders.size };
}

/* ---------------- linha do tempo ---------------- */

export interface GanttBlock { s: number; e: number; kind: 'prod' | 'stop' | 'maint'; inferred?: boolean; label?: string; rec: ProdRecord | StopRecord }
export interface GanttDown { s: number; e: number; ev: MachineEvent }
export interface GanttRow { key: string; label: string; rc: string; date?: string; bands: [number, number][]; blocks: GanttBlock[]; downs: GanttDown[] }

const blocksFor = (a: MachineAgg, base: number, limit: number): GanttBlock[] => [
  ...a.recs.filter((x) => x.t0 < limit && x.t0 + x.min > base)
    .map((x) => ({ s: Math.max(0, x.t0 - base), e: Math.min(limit - base, x.t0 - base + x.min), kind: 'prod' as const, label: String(x.opn), rec: x })),
  ...a.stops.filter((x) => x.t0 < limit && x.t0 + x.min > base)
    .map((x) => ({ s: Math.max(0, x.t0 - base), e: Math.min(limit - base, x.t0 - base + x.min), kind: x.isMan ? 'maint' as const : 'stop' as const, inferred: x.inf, rec: x })),
];
const downsFor = (a: MachineAgg, base: number, limit: number): GanttDown[] =>
  a.evs.map((ev) => ({ s: Math.max(ev.e.t0, base) - base, e: Math.min(ev.e.end, limit) - base, ev })).filter((d) => d.e > d.s);

/** Uma linha por dia produtivo (06:00 → 06:00) para uma máquina: turnos, apontamentos e paradas. */
export function machineDays(engine: Engine, a: MachineAgg, days: string[]): GanttRow[] {
  const { iso2s } = engine.util, DAY0 = engine.constants.DAY0;
  return days.map((d) => {
    const p = iso2s(d), base = p * 1440 + DAY0, limit = base + 1440;
    const bands = engine.dayWins(a.m.rc, p - 1).concat(engine.dayWins(a.m.rc, p))
      .filter((w) => w.a < limit && w.b > base).map((w) => [Math.max(0, w.a - base), Math.min(1440, w.b - base)] as [number, number]);
    return { key: d, label: d, rc: a.m.rc, date: d, bands, blocks: blocksFor(a, base, limit), downs: downsFor(a, base, limit) };
  });
}

/** Uma linha por máquina em uma janela de 1 a 7 dias, a partir do dia produtivo p0. */
export function resourceTimeline(engine: Engine, A: AggResult, p0: number, span: number): GanttRow[] {
  const base = p0 * 1440 + engine.constants.DAY0, limit = base + span * 1440;
  return A.G.flatMap((g) => [...g.list].sort((x, y) => x.m.name.localeCompare(y.m.name, 'pt-BR'))).map((a) => {
    const bands: [number, number][] = [];
    for (let p = p0; p < p0 + span; p++) for (const w of engine.dayWins(a.m.rc, p)) bands.push([w.a - base, w.b - base]);
    return { key: a.m.rc, label: a.m.name, rc: a.m.rc, bands, blocks: blocksFor(a, base, limit), downs: downsFor(a, base, limit) };
  });
}
