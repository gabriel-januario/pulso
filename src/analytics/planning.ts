import type { CalendarException, DayConfig, Engine, Machine, MachineMonthConfig, OvertimeEntry, RosterEntry } from '../engine';
import { addDays, weekday } from './period';

/* Planejamento: Calendário fabril e Horas extras. Funções puras, testadas contra a v2.2 em tests/planning.test.ts. */

export const DAY_TYPES: [DayConfig['t'], string][] = [['util', 'Dia útil'], ['folga', 'Folga'], ['fer', 'Feriado'], ['manut', 'Parada programada']];
export const isWork = (d: DayConfig) => d.t === 'util' || d.t === 'extra';

export const monthDays = (ym: string) => {
  const [y, m] = ym.split('-').map(Number), n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`);
};
const weekStart = (iso: string) => addDays(iso, -((weekday(iso) + 6) % 7));
/** segundas-feiras das semanas que tocam o mês */
export const monthWeeks = (ym: string) => {
  const D = monthDays(ym), out: string[] = [];
  for (let w = weekStart(D[0]); w <= D[D.length - 1]; w = addDays(w, 7)) out.push(w);
  return out;
};
export const nextMonth = (ym: string) => { const [y, m] = ym.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };
export const prevMonth = (ym: string) => { const [y, m] = ym.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };

/** máquinas na ordem dos grupos e, dentro do grupo, pelo nome */
export function sortedMachines(engine: Engine): Machine[] {
  const G = engine.constants.GRP_ORDER, gi = (rc: string) => { const i = G.indexOf(engine.grpOf(rc)); return i < 0 ? 99 : i; };
  return Object.values(engine.dataset.machines).sort((a, b) => gi(a.rc) - gi(b.rc) || a.name.localeCompare(b.name));
}

/* =========================== CAPACIDADE DO MÊS =========================== */

export interface MonthRow { m: Machine; grp: string; mc: MachineMonthConfig; roster: RosterEntry | null; fixed: number; overtime: number; operational: number; workDays: number }
export interface DayTotals { fixed: number; operational: number; overtime: number; history: number }

/** Capacidade de cada recurso e de cada dia do mês (sem o corte do fim da base: o calendário é planejamento). */
export function monthCapacity(engine: Engine, ym: string) {
  const days = monthDays(ym), machines = sortedMachines(engine);
  const hist = new Map(engine.agg({ from: days[0], to: days[days.length - 1], grp: 'all' }).dayT.map((d) => [d.d, d.heHist]));
  const perDay: Record<string, DayTotals> = Object.fromEntries(days.map((d) => [d, { fixed: 0, operational: 0, overtime: 0, history: hist.get(d) || 0 }]));
  const rows: MonthRow[] = machines.map((m) => {
    let fixed = 0, overtime = 0, operational = 0, workDays = 0;
    for (const d of days) {
      const c = engine.capParts(m.rc, d, true);
      fixed += c.n; overtime += c.he; operational += c.op; if (c.n > 0) workDays++;
      perDay[d].fixed += c.n; perDay[d].overtime += c.he; perDay[d].operational += c.op;
    }
    return { m, grp: engine.grpOf(m.rc), mc: engine.machCfgM(m.rc, ym), roster: engine.rosterEntry(m.rc, ym), fixed, overtime, operational, workDays };
  });
  const sum = (k: 'fixed' | 'overtime' | 'operational') => rows.reduce((q, r) => q + r[k], 0);
  return { days, rows, perDay, fixed: sum('fixed'), overtime: sum('overtime'), operational: sum('operational'), modes: engine.rosterModes(ym), exceptions: days.reduce((q, d) => q + (engine.config.ex[d]?.length ?? 0), 0) };
}

/**
 * Copia o padrão de um mês para outro: para cada dia da semana, o tipo de dia e os turnos mais frequentes
 * na origem (feriados ficam como feriado), e a escala de cada recurso, preservando a carga já informada no destino.
 */
export function copyMonth(engine: Engine, src: string, dst: string): { cal: Record<string, DayConfig>; escala: Record<string, Record<string, RosterEntry>>; days: number; resources: number } {
  const HOL = engine.constants.HOL, count: Record<number, Map<string, number>> = {};
  for (const d of monthDays(src)) {
    if (HOL[d]) continue;
    const c = engine.dayCfg(d), k = `${c.t}|${(c.sh || []).join(',')}`, w = weekday(d);
    (count[w] ??= new Map()).set(k, (count[w].get(k) ?? 0) + 1);
  }
  const pattern: Record<number, DayConfig> = {};
  for (const [w, m] of Object.entries(count)) {
    let best = '', n = -1;
    for (const [k, v] of m) if (v > n) { n = v; best = k; }
    const i = best.indexOf('|');
    pattern[+w] = { t: best.slice(0, i) as DayConfig['t'], sh: best.slice(i + 1) ? best.slice(i + 1).split(',') : [] };
  }
  const cal = { ...engine.config.cal };
  let days = 0;
  for (const d of monthDays(dst)) {
    if (HOL[d]) { cal[d] = { t: 'fer', sh: [] }; days++; continue; }
    const p = pattern[weekday(d)];
    if (!p) continue;
    cal[d] = { t: p.t, sh: p.sh.slice() }; days++;
  }
  const before = engine.config.escala[dst] ?? {}, out: Record<string, RosterEntry> = {};
  let resources = 0;
  for (const rc of Object.keys(engine.dataset.machines)) {
    const row = engine.rosterEntry(rc, src), existing = before[rc];
    if (row) { out[rc] = { ...row, turnos: { ...row.turnos }, carga: existing?.carga ?? null }; resources++; }
    else if (existing?.carga != null) out[rc] = { modo: 'pendente', turnos: {}, obs: '', crit: !!existing.crit, carga: existing.carga };
  }
  return { cal, escala: { ...engine.config.escala, [dst]: out }, days, resources };
}

/* =========================== EVIDÊNCIA DA ESCALA =========================== */

const toMin = (s: string) => { const [h, m] = String(s || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
function shiftWindow(engine: Engine, id: string, p: number) {
  const s = engine.config.shifts.find((x) => x.id === id);
  if (!s) return null;
  const dur = ((toMin(s.fim) - toMin(s.ini)) + 1440) % 1440 || 1440, D0 = engine.constants.DAY0;
  const a = p * 1440 + D0 + ((((toMin(s.ini) - D0) % 1440) + 1440) % 1440);
  return { a, b: a + dur };
}
const merged = (L: [number, number][]) => {
  const out: [number, number][] = [];
  for (const [a, b] of L.slice().sort((x, y) => x[0] - y[0])) { if (b <= a) continue; const l = out[out.length - 1]; if (l && a <= l[1]) l[1] = Math.max(l[1], b); else out.push([a, b]); }
  return out;
};

/** Operadores com chapa que apontaram no recurso dentro da janela do turno, no dia. */
export function shiftEvidence(engine: Engine, rc: string, shift: string, iso: string) {
  const w = shiftWindow(engine, shift, engine.util.iso2s(iso));
  if (!w) return [];
  const by = new Map<string, { id: string; name: string; L: [number, number][] }>();
  for (const x of engine.dataset.byRc[rc] ?? []) {
    if (!x.chapa || x.t0 >= w.b || x.t0 + x.min <= w.a) continue;
    const k = String(x.chapa);
    if (!by.has(k)) by.set(k, { id: k, name: engine.util.title(x.op), L: [] });
    by.get(k)!.L.push([Math.max(w.a, x.t0), Math.min(w.b, x.t0 + x.min)]);
  }
  return [...by.values()].map((o) => ({ id: o.id, name: o.name, L: merged(o.L), min: merged(o.L).reduce((q, [a, b]) => q + b - a, 0) })).sort((p, q) => q.min - p.min);
}

/**
 * Sugestão de titular do turno: quem mais apareceu no miolo do turno (descontada a primeira e a última hora)
 * nos dias úteis do mês, com pelo menos 1 h no dia. Devolve os dois mais frequentes.
 */
export function shiftCandidates(engine: Engine, rc: string, shift: string, days: string[]) {
  const by = new Map<string, { id: string; name: string; days: number; min: number }>();
  for (const d of days) {
    const w = weekday(d);
    if (w === 0 || w === 6 || !isWork(engine.dayCfg(d))) continue;
    const win = shiftWindow(engine, shift, engine.util.iso2s(d));
    if (!win) continue;
    const a = win.a + 60, b = win.b - 60;
    if (b <= a) continue;
    for (const p of shiftEvidence(engine, rc, shift, d)) {
      const min = p.L.reduce((q, [x, y]) => q + Math.max(0, Math.min(y, b) - Math.max(x, a)), 0);
      if (min < 60) continue;
      const o = by.get(p.id) ?? { id: p.id, name: p.name, days: 0, min: 0 };
      o.days++; o.min += min; by.set(p.id, o);
    }
  }
  return [...by.values()].sort((p, q) => q.days - p.days || q.min - p.min).slice(0, 2);
}

/** Pessoas com chapa na base, para preencher a escala. */
export function operatorDirectory(engine: Engine) {
  const out = new Map<string, string>();
  for (const p of engine.dataset.prod) if (p.chapa > 0 && !out.has(String(p.chapa))) out.set(String(p.chapa), engine.util.title(p.op));
  return out;
}

/* =========================== HORAS EXTRAS =========================== */

const heStart = (h: OvertimeEntry) => h.ini || h.wk!;
const heEnd = (h: OvertimeEntry) => h.fim || addDays(h.wk!, 6);
export const overtimeRange = (h: OvertimeEntry) => ({ from: heStart(h), to: heEnd(h) });
const matches = (engine: Engine, h: OvertimeEntry, rc: string) => h.alvo === 'all' || h.alvo === `m:${rc}` || h.alvo === `g:${engine.grpOf(rc)}`;

/** Lançamentos de HE que tocam o mês, em ordem de início. */
export const overtimeInMonth = (engine: Engine, ym: string) => {
  const D = monthDays(ym);
  return engine.config.he.filter((h) => heStart(h) <= D[D.length - 1] && heEnd(h) >= D[0]).sort((a, b) => heStart(a).localeCompare(heStart(b)));
};

/** Horas efetivas de um lançamento (minutos), somando as máquinas atingidas e já com a disponibilidade de cada uma. */
export function overtimeTotal(engine: Engine, id: string): { total: number; machines: number; workDays: number } {
  const h = engine.config.he.find((x) => x.id === id);
  if (!h) return { total: 0, machines: 0, workDays: 0 };
  let total = 0, machines = 0, workDays = 0;
  const { iso2s, s2iso } = engine.util;
  for (let p = iso2s(heStart(h)); p <= iso2s(heEnd(h)); p++) { const d = s2iso(p), w = weekday(d); if (w >= 1 && w <= 5 && isWork(engine.dayCfg(d))) workDays++; }
  for (const m of Object.values(engine.dataset.machines)) {
    let min = 0;
    for (let p = iso2s(heStart(h)); p <= iso2s(heEnd(h)); p++) {
      const d = s2iso(p), mc = engine.machCfgM(m.rc, d.slice(0, 7));
      if (mc.modo === 'inativo' || !matches(engine, h, m.rc) || (!mc.on && h.alvo !== `m:${m.rc}`)) continue;
      min += (engine.heDay(m.rc, d, h, !mc.on) * (+mc.disp || 0)) / 100;
    }
    if (min > 0) { machines++; total += min; }
  }
  return { total, machines, workDays };
}

/** HE realizada no mês: por recurso e por grupo (minutos de produção dentro das janelas de HE). */
export function overtimeDone(engine: Engine, ym: string) {
  const D = monthDays(ym), A = engine.agg({ from: D[0], to: D[D.length - 1], grp: 'all' });
  const rows = A.list.filter((a) => a.heAp > 0).map((a) => ({ m: a.m, grp: a.grp, minutes: a.heAp, history: a.heHist }))
    .sort((a, b) => b.minutes - a.minutes || a.m.name.localeCompare(b.m.name, 'pt-BR'));
  const g = new Map<string, number>();
  for (const r of rows) g.set(r.grp, (g.get(r.grp) ?? 0) + r.minutes);
  const groups = [...g].map(([label, minutes]) => ({ label, minutes })).sort((a, b) => b.minutes - a.minutes || a.label.localeCompare(b.label, 'pt-BR'));
  return { rows, groups, total: rows.reduce((q, r) => q + r.minutes, 0), capacity: A.T.cap };
}

/** Repete um lançamento nas outras semanas do mês (mesmo alvo e horas), sem duplicar semanas já programadas. */
export function repeatOverWeeks(engine: Engine, id: string, ym: string): OvertimeEntry[] {
  const h = engine.config.he.find((x) => x.id === id);
  if (!h) return engine.config.he;
  const D = monthDays(ym), first = D[0], last = D[D.length - 1], out = [...engine.config.he];
  for (const w of monthWeeks(ym)) {
    const ini = w < first ? first : w, end = addDays(w, 6), fim = end > last ? last : end;
    if (out.some((x) => x.alvo === h.alvo && heStart(x) <= fim && heEnd(x) >= ini)) continue;
    out.push({ ...h, id: `${h.id}-${w}`, ini, fim, wk: w });
  }
  return out;
}

export const newException = (e: Omit<CalendarException, 'id'>): CalendarException => ({ ...e, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) });
