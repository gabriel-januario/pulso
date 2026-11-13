/* =====================================================================
   PULSO · motor de indicadores
   ---------------------------------------------------------------------
   Extraído do PULSO v2.2 sem mudar regra de negócio e convertido para
   TypeScript estrito. Todo o estado (base, configuração e caches) vive
   dentro de createEngine(): cada instância é independente.
   Os resultados são travados por tests/engine.test.ts e pelos demais
   testes de paridade (valores de referência capturados da v2.2).
   ===================================================================== */
import type {
  AggOptions, AggResult, CalendarException, CapacityWindow, DayConfig, Engine, MachineEvent, MachineMonthConfig,
  MaintenanceEvent, ManualStop, OvertimeEntry, RawDataset, RosterEntry, Status, SuspectStop,
} from './types';
import { CATS, EX_TYPES, ERP_TURNOS, GRP_ORDER, ROSTER_MODES, mergeConfig, shiftDur, shiftMin, type Config } from './core/config';
import { buildDataset, shortNm, title, type Dataset, type PeriodStop, type Rec } from './core/dataset';
import { intervalMinutes, mergedIntervals, outsideIntervals, spanOf, windowMinutes, type Interval } from './core/intervals';
import { DAY0, FACULT, HOL, MES, WD, dtl2min, fmtDT, hhmm, iso2s, nowMin, s2iso, toMin, wday } from './core/time';

/** janela de capacidade com o turno que a originou */
interface Win extends CapacityWindow { id?: string }
interface Impact { blocks: Win[]; gains: Win[]; noLoad: Win[] }
/** evento de manutenção em construção (antes de virar MaintenanceEvent público) */
interface Ev extends MaintenanceEvent {
  recs: Rec[]; ops: Set<string>; key: string; ret?: Rec | null; p?: ManualStop; apont: number; realAll: number;
}
interface Suspect extends Omit<SuspectStop, 's' | 'mv'> { s: Rec; mv: Rec }

/** chaves numéricas acumuladas por dia, por máquina, por grupo e no total */
const ADDITIONAL = ['heHist', 'fixedProd', 'operCap', 'operProd', 'outside', 'uncovered', 'noLoad', 'used', 'accountStop', 'accountMaint', 'conflict', 'gap'] as const;
type AddKey = (typeof ADDITIONAL)[number];
type Extras = Record<AddKey, number>;
const extras = (): Extras => Object.fromEntries(ADDITIONAL.map((k) => [k, 0])) as Extras;
interface DayAcc extends Extras { prod: number; union: number; stop: number; cap: number; capN: number; capHE: number; capP: number; manR: number; manA: number; heAp: number; adj?: boolean }
interface MachAcc extends Extras {
  m: Dataset['machines'][string]; mc: MachineMonthConfig; grp: string;
  prod: number; union: number; sd: number; si: number; stop: number; cap: number; capN: number; capHE: number; capP: number; heAp: number;
  manA: number; manR: number; ocult: number; off: number; over: number; nDays: number; n: number; manual: number; impOut: number;
  util: number | null; disp: number | null; adj?: boolean;
  long: Rec[]; ops: Set<string>; ords: Set<number>; peds: Set<number>; byDay: Record<string, DayAcc>; recs: Rec[]; stops: PeriodStop[];
  evs: MachineEvent[]; down: boolean;
}
interface TotalAcc extends Extras {
  prod: number; union: number; cap: number; capN: number; capHE: number; capP: number; heAp: number; stop: number; manR: number; manA: number;
  ocult: number; off: number; over: number; n: number; active: number; noM: number; ords: Set<number>; peds: Set<number>; util: number | null; disp: number | null;
}
interface GroupAcc extends Extras {
  g: string; list: MachAcc[]; union: number; prod: number; cap: number; capN: number; capHE: number; capP: number; heAp: number;
  stop: number; manR: number; manA: number; ocult: number; ords: Set<number>; util: number | null;
}
type NumKey<T> = { [K in keyof T]: T[K] extends number ? K : never }[keyof T];
const addInto = <D, S>(dst: D, src: S, keys: readonly (NumKey<D> & NumKey<S>)[]) => {
  for (const k of keys) (dst[k] as number) += src[k] as number;
};

/** Recurso que, por informação da produção, trabalha em dois turnos de 8 h no fim de 2026. */
const CUTMAX = 'MHMC2';
/** Até esta data a HE pode ser inferida do histórico (não havia lançamento de HE). */
const HE_HISTORY_END = '2026-10-31';

export function createEngine(raw: RawDataset, cfgInput?: unknown, options: { imported?: boolean } = {}): Engine {
  const isImported = !!options.imported;
  const DS: Dataset = buildDataset(raw);
  if (!Object.keys(DS.machines).length) throw new Error('Sem registros de usinagem na base.');
  let cfg: Config = mergeConfig(cfgInput);

  /* ================= calendário e cadastro ================= */
  const shById = (id: string) => cfg.shifts.find((s) => s.id === id);
  function dayCfg(iso: string): DayConfig {
    const c = cfg.cal[iso];
    if (c) return c;
    const w = wday(iso);
    if (HOL[iso]) return { t: 'fer', sh: [] };
    if (w >= 1 && w <= 5) return { t: 'util', sh: cfg.shifts.filter((s) => s.def).map((s) => s.id) };
    return { t: 'folga', sh: [] };
  }
  const isWork = (d: DayConfig) => d.t === 'util' || d.t === 'extra';
  function machCfg(rc: string) {
    const c = cfg.mach[rc], m = DS.machines[rc], n = ERP_TURNOS[rc];
    const nt = n != null ? n : (m && m.sugT) || 1;
    const base = { on: !(m && m.inat), sh: cfg.shifts.slice(0, nt).map((s) => s.id), disp: 100, grp: m ? m.fam : 'Outros postos', src: n != null ? 'erp' : 'conferir' };
    return c ? (Object.assign(base, c) as typeof base) : base;
  }
  const dayEdits = (d: string): CalendarException[] => cfg.ex[d] || [];
  function shiftWindow(id: string, p: number): Win | null {
    const s = shById(id);
    if (!s) return null;
    const a = p * 1440 + DAY0 + ((((toMin(s.ini) - DAY0) % 1440) + 1440) % 1440);
    return { a, b: a + shiftDur(s), c: shiftMin(s), id, he: false };
  }
  /** janela de uma exceção do calendário (turno inteiro ou recorte HH:MM dentro dele) */
  function editWindow(e: CalendarException, d: string): Win | null {
    const w = shiftWindow(e.sh, iso2s(d));
    if (!w) return null;
    const inside = (t: string) => {
      const p = iso2s(d) * 1440 + DAY0;
      let n = p + ((((toMin(t) - DAY0) % 1440) + 1440) % 1440);
      if (n < w.a) n += 1440;
      return n;
    };
    const a = e.ini ? inside(e.ini) : w.a, b = e.fim ? inside(e.fim) : w.b;
    return a >= w.a && b <= w.b && b > a ? { a, b, c: ((b - a) * w.c) / (w.b - w.a) } : null;
  }
  /** efeito das exceções do dia no recurso: janelas bloqueadas, ganhas e sem programação */
  function shiftImpact(rc: string, d: string): Impact {
    const blocks: Win[] = [], gains: Win[] = [], noLoad: Win[] = [];
    for (const e of dayEdits(d)) {
      if (e.rc !== rc && e.dst !== rc) continue;
      const w = editWindow(e, d);
      if (!w) continue;
      if (e.rc === rc) {
        if (e.tipo === 'carga') noLoad.push(w);
        else if (e.tipo === 'apoio') gains.push(w);
        else if (e.tipo === 'quebra' || !e.coberta) blocks.push(w);
      }
      if (e.dst === rc && (e.tipo === 'troca' || e.tipo === 'quebra')) gains.push(w);
    }
    return { blocks, gains, noLoad };
  }

  /* caches: limpos a cada mudança de configuração */
  let OPERW = new Map<string, Win[]>(), MCM = new Map<string, MachineMonthConfig>(), WINC = new Map<string, Win[]>(), UTW = new Map<string, number>();
  function clearCap() { WINC = new Map(); UTW = new Map(); MCM = new Map(); OPERW = new Map(); }

  /** capacidade operacional: turnos menos bloqueios (exceções e quadro de paradas) mais coberturas */
  function operationalWins(rc: string, p: number): Win[] {
    const k = rc + '|' + p, hit = OPERW.get(k);
    if (hit) return hit;
    const iso = s2iso(p), W = dayWins(rc, p), { blocks, gains } = shiftImpact(rc, iso);
    const manual = cfg.paradas.filter((e) => e.rc === rc && e.ini).map((e): Interval => [dtl2min(e.ini)!, e.fim ? dtl2min(e.fim)! : nowMin()]);
    const remove = mergedIntervals([...blocks.map((w): Interval => [w.a, w.b]), ...manual]);
    const out: Win[] = W.flatMap((w) => outsideIntervals(w.a, w.b, remove).map(([a, b]) => ({ ...w, a, b, c: (w.c * (b - a)) / (w.b - w.a) })));
    for (const w of gains) {
      const covered = mergedIntervals(out.map((v): Interval => [v.a, v.b]));
      for (const [a, b] of outsideIntervals(w.a, w.b, covered)) out.push({ ...w, a, b, c: (w.c * (b - a)) / (w.b - w.a), he: false });
    }
    OPERW.set(k, out);
    return out;
  }

  /* Base de demonstração: escala jan–out/2026 pré-validada a partir dos próprios apontamentos
     (≥ 12 dias com produção no mês → fixo nos turnos cadastrados; menos → eventual). Bases importadas não usam isto. */
  let DEMO_ACT: Record<string, Set<number>> | null = null;
  function demoRoster(rc: string, ym: string): RosterEntry | null {
    if (isImported || ym < '2026-01' || ym > '2026-10') return null;
    if (!DEMO_ACT) { DEMO_ACT = {}; for (const x of DS.prod) (DEMO_ACT[x.rc + '|' + x.date.slice(0, 7)] ||= new Set()).add(x.pd); }
    const m = DS.machines[rc], obs = 'Escala de demonstração';
    if (!m || m.inat) return { modo: 'inativo', turnos: {}, obs };
    const n = DEMO_ACT[rc + '|' + ym]?.size || 0;
    if (n >= 12) return { modo: 'fixo', turnos: Object.fromEntries(machCfg(rc).sh.map((id) => [id, ''])), obs };
    return { modo: n ? 'eventual' : 'sem_turno', turnos: {}, obs };
  }
  function rosterEntry(rc: string, ym: string): RosterEntry | null {
    const current = cfg.escala[ym]?.[rc];
    if (current) return current;
    const demo = demoRoster(rc, ym);
    if (demo) return demo;
    const legacy = cfg.machM[ym]?.[rc];
    if (Array.isArray(legacy)) return { modo: legacy.length ? 'fixo' : 'inativo', turnos: Object.fromEntries(legacy.map((id) => [id, ''])), obs: 'Migrado do cadastro mensal' };
    if (rc === CUTMAX && ym >= '2026-10' && ym <= '2026-12') return { modo: 'fixo', turnos: { T1: '', T2: '' }, obs: 'Regime informado: dois turnos de 8 h' };
    return null;
  }
  function rosterModes(ym: string) {
    const values = Object.keys(DS.machines).map((rc) => rosterEntry(rc, ym)?.modo || 'pendente');
    return { valid: values.filter((v) => v !== 'pendente').length, pending: values.filter((v) => v === 'pendente').length };
  }
  /** cadastro efetivo no mês: só escala fixa ou compartilhada gera turnos */
  function machCfgM(rc: string, ym: string): MachineMonthConfig {
    const k = rc + '|' + ym, hit = MCM.get(k);
    if (hit) return hit;
    const base = machCfg(rc), row = rosterEntry(rc, ym);
    const modo = row?.modo || 'pendente', eligible = modo === 'fixo' || modo === 'compartilhado';
    const sh = eligible && row ? cfg.shifts.filter((s) => Object.hasOwn(row.turnos, s.id)).map((s) => s.id) : [];
    const v: MachineMonthConfig = { ...base, on: sh.length > 0, sh, modo, src: row ? 'mes' : 'conferir' };
    MCM.set(k, v);
    return v;
  }
  const grpOf = (rc: string) => machCfg(rc).grp || DS.machines[rc]?.fam || 'Outros postos';
  function turnosTxt(mc: MachineMonthConfig) {
    if (!mc.on || !mc.sh.length) return ROSTER_MODES[mc.modo] || 'Inativa';
    const ids = cfg.shifts.map((s) => s.id);
    const std = mc.sh.length <= ids.length && mc.sh.every((id, i) => ids[i] === id);
    return std ? `${mc.sh.length} turno${mc.sh.length > 1 ? 's' : ''}` : mc.sh.join('+');
  }

  /* ---------- horas extras ----------
     Lançamento por período: sem = h por máquina distribuídas nos dias úteis de seg–sex do período,
     sab = h em cada sábado, dom = h em cada domingo. Alvo: todas as máquinas, um grupo ou uma máquina. */
  const heMatch = (h: OvertimeEntry, rc: string) => h.alvo === 'all' || h.alvo === 'm:' + rc || h.alvo === 'g:' + grpOf(rc);
  const heIni = (h: OvertimeEntry) => h.ini || h.wk!;
  const heFim = (h: OvertimeEntry) => h.fim || s2iso(iso2s(h.wk!) + 6);
  function utilInRange(a: string, b: string) {
    const k = a + '|' + b, hit = UTW.get(k);
    if (hit != null) return hit;
    let n = 0;
    for (let p = iso2s(a); p <= iso2s(b); p++) { const d = s2iso(p), w = wday(d); if (w >= 1 && w <= 5 && isWork(dayCfg(d))) n++; }
    UTW.set(k, n);
    return n;
  }
  /** minutos de HE do recurso no dia; `only` restringe a um lançamento; `specific` só aceita alvo da própria máquina */
  function heDay(rc: string, iso: string, only?: OvertimeEntry | null, specific = false) {
    if (!cfg.he.length) return 0;
    const w = wday(iso);
    let m = 0;
    for (const h of cfg.he) {
      if ((only && h !== only) || iso < heIni(h) || iso > heFim(h) || !heMatch(h, rc) || (specific && h.alvo !== 'm:' + rc)) continue;
      if (w === 6) m += (+h.sab || 0) * 60;
      else if (w === 0) m += (+h.dom || 0) * 60;
      else if (heIni(h) === heFim(h)) m += (+h.sem || 0) * 60;
      else if (isWork(dayCfg(iso))) { const n = utilInRange(heIni(h), heFim(h)); if (n) m += ((+h.sem || 0) * 60) / n; }
    }
    return m;
  }
  /** janelas dos turnos do dia produtivo p; `reference` ignora a escala (usado na HE histórica) */
  function regularWins(rc: string, p: number, reference = false): Win[] {
    const iso = s2iso(p), ym = iso.slice(0, 7), day = dayCfg(iso), mc = machCfgM(rc, ym);
    if (!isWork(day) || (!mc.on && !reference)) return [];
    const row = rosterEntry(rc, ym);
    const ids = mc.on ? mc.sh : !row || row.modo === 'pendente' ? cfg.shifts.slice(0, rc === CUTMAX ? 2 : ERP_TURNOS[rc] || 0).map((s) => s.id) : [];
    return day.sh
      .filter((id) => ids.includes(id))
      .map((id) => shiftWindow(id, p))
      .filter((w): w is Win => !!w)
      .map((w) => ({ ...w, c: reference ? w.c : (w.c * mc.disp) / 100 }));
  }
  /** HE inferida do histórico: produção além da jornada líquida do dia, onde não houve lançamento */
  function historicalHE(rc: string, iso: string, production: Interval[], declared: Win[]): Interval[] {
    if (iso > HE_HISTORY_END || cfg.heOff.includes(iso.slice(0, 7))) return [];
    const p = iso2s(iso), ym = iso.slice(0, 7), row = rosterEntry(rc, ym);
    if (row && ['eventual', 'sem_turno', 'inativo'].includes(row.modo)) return [];
    if (!machCfgM(rc, ym).on && rc !== CUTMAX && !ERP_TURNOS[rc]) return [];
    if (dayEdits(iso).some((e) => (e.tipo === 'apoio' && e.rc === rc) || e.dst === rc)) return [];
    // lançamentos manuais do mesmo recurso e dia substituem a estimativa histórica
    if (heDay(rc, iso, null, !machCfgM(rc, ym).on) > 0) return [];
    const start = p * 1440 + DAY0, end = start + 1440;
    const fixed = regularWins(rc, p - 1, true).concat(regularWins(rc, p, true)).filter((w) => w.c > 0 && w.a < end && w.b > start);
    const normal = mergedIntervals(fixed.map((w): Interval => [Math.max(w.a, start), Math.min(w.b, end)]));
    const consumed = mergedIntervals(declared.map((w): Interval => [w.a, w.b]));
    const entries = production.flatMap(([a, b]) => outsideIntervals(a, b, consumed));
    const extra = entries.flatMap(([a, b]) => outsideIntervals(a, b, normal));
    // dentro das janelas brutas dos turnos, só o excedente da jornada líquida diária é HE
    let budget = windowMinutes(fixed, end, start);
    for (const [a, b] of entries)
      for (const [x, y] of normal) {
        const s = Math.max(a, x), e = Math.min(b, y);
        if (e <= s) continue;
        const used = Math.min(budget, e - s);
        budget -= used;
        if (s + used < e) extra.push([s + used, e]);
      }
    return mergedIntervals(extra);
  }
  /** janelas de capacidade do dia produtivo p (06:00 → 06:00): turnos da máquina + hora extra lançada */
  function dayWins(rc: string, p: number): Win[] {
    const key = rc + '|' + p, hit = WINC.get(key);
    if (hit) return hit;
    const iso = s2iso(p), mc = machCfgM(rc, iso.slice(0, 7)), k = (+mc.disp || 0) / 100;
    const W = regularWins(rc, p);
    const he = mc.modo !== 'inativo' ? heDay(rc, iso, null, !mc.on) : 0;
    if (he > 0) {
      const a = W.length ? Math.max(...W.map((w) => w.b)) : shiftWindow(cfg.shifts[0].id, p)!.a;
      W.push({ a, b: a + he, c: he * k, he: true });
    }
    WINC.set(key, W);
    return W;
  }
  /** corte: a capacidade só é contada até o último apontamento da base (ou até o fim do último dia) */
  const cutT = () => (cfg.corte === 'dia' ? (DS.maxPd + 1) * 1440 + DAY0 : DS.lastT);
  function capParts(rc: string, iso: string, noCut?: boolean) {
    const p = iso2s(iso), start = p * 1440 + DAY0, end = Math.min(start + 1440, noCut ? Infinity : cutT());
    const W = dayWins(rc, p - 1).concat(dayWins(rc, p)), O = operationalWins(rc, p - 1).concat(operationalWins(rc, p));
    return { n: windowMinutes(W.filter((w) => !w.he), end, start), he: windowMinutes(W.filter((w) => w.he), end, start), op: windowMinutes(O, end, start) };
  }
  function capMin(rc: string, iso: string, noCut?: boolean) { const c = capParts(rc, iso, noCut); return c.n + c.he; }
  /** capacidade (min) da máquina dentro do intervalo absoluto [a, b) — tempo parado real */
  function capSeg(rc: string, a: number, b: number, cb?: (iso: string, v: number) => void) {
    if (b <= a) return 0;
    let tot = 0;
    const p0 = Math.floor((a - DAY0) / 1440) - 1, p1 = Math.floor((b - DAY0) / 1440);
    for (let p = p0; p <= p1; p++)
      for (const w of dayWins(rc, p)) {
        const ov = Math.min(b, w.b) - Math.max(a, w.a);
        if (ov > 0 && w.b > w.a) { const v = (ov * w.c) / (w.b - w.a); tot += v; if (cb) cb(s2iso(p), v); }
      }
    return tot;
  }
  const motName = (c: number | string) => cfg.motivos[c]?.n?.trim() || 'Cód. ' + c;
  const hasMaintenanceMap = () => Object.values(cfg.motivos).some((m) => m.c === 'man');
  const motCat = (c: number | string) => cfg.motivos[c]?.c || 'nc';

  /* ================= eventos de manutenção ================= */
  function firstAfter(L: Rec[], t: number) {
    let lo = 0, hi = L.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (L[m].t0 < t) lo = m + 1; else hi = m; }
    return lo;
  }
  /** primeiro apontamento do operador em outra máquina dentro de [a, b) */
  function movedTo(op: string, rc: string, a: number, b: number) {
    const L = DS.byOp[op];
    if (!L) return null;
    for (let i = firstAfter(L, a); i < L.length && L[i].t0 < b; i++) if (L[i].rc !== rc) return L[i];
    return null;
  }
  let EV: { ev: Ev[]; sus: Suspect[] } | null = null, EVKEY = '';
  /**
   * Eventos de manutenção de toda a base: abrem no apontamento de manutenção e fecham no próximo apontamento
   * produtivo da máquina (limite de dias configurável). Junta exceções de quebra do calendário e o quadro de paradas,
   * une sobreposições e levanta as paradas prováveis (improdutivo seguido de horas de turno sem produção).
   */
  function buildEvents() {
    const key = JSON.stringify([cfg.motivos, cfg.evt, cfg.paradas, cfg.man, cfg.cal, cfg.mach, cfg.machM, cfg.escala, cfg.ex, cfg.shifts, cfg.he, cfg.corte]) + DS.nAll + DS.lastT;
    if (EV && key === EVKEY) return EV;
    const byM: Record<string, Rec[]> = {};
    for (const s of DS.stops) if (s.mach && DS.machines[s.mach]) (byM[s.mach] ||= []).push(s);
    const ev: Ev[] = [], sus: Suspect[] = [];
    const maxW = Math.max(1, cfg.man.maxDias) * 1440;
    const blank = (o: Pick<Ev, 'rc' | 't0' | 'end' | 'open' | 'capped' | 'src' | 'key'> & Partial<Ev>): Ev => ({ recs: [], ops: new Set(), mv: null, apont: 0, realAll: 0, ...o });
    for (const rc in byM) {
      const L = byM[rc].sort((a, b) => a.t0 - b.t0), PL = DS.byRc[rc] || [];
      let cur: Ev | null = null, lastSus: Suspect | null = null;
      for (const s of L) {
        const k = rc + '|' + s.t0, dec = cfg.evt[k];
        const isMan = dec === 'm' || (motCat(s.oper) === 'man' && dec !== 'x');
        const np = PL[firstAfter(PL, s.t0 + 1)];
        let end = np ? np.t0 : null, capped = false;
        const open = !np, lim = s.t0 + maxW;
        if (end == null || end > lim) { capped = !!np; end = Math.min(lim, Math.max(DS.lastT, s.t0 + s.min)); }
        end = Math.max(end, s.t0 + s.min);
        if (isMan) {
          if (cur && s.t0 < cur.end) {
            cur.recs.push(s); cur.ops.add(s.op);
            if (end > cur.end) { cur.end = end; cur.open = open; cur.capped = capped; }
            if (dec === 'm') cur.src = 'conf';
          } else {
            cur = blank({ rc, t0: s.t0, end, open, capped, recs: [s], ops: new Set([s.op]), src: dec === 'm' ? 'conf' : 'apont', key: k, ret: np || null });
            ev.push(cur);
          }
        } else if (!s.inf && dec !== 'x') {
          if (lastSus && s.t0 < lastSus.end) continue;
          if (cur && s.t0 < cur.end) continue;
          const idle = capSeg(rc, s.t0 + s.min, end);
          if (idle >= cfg.man.suspH * 60) {
            const mv = movedTo(s.op, rc, s.t0, end);
            if (mv) { lastSus = { rc, t0: s.t0, end, s, idle, mv, key: k, open }; sus.push(lastSus); }
          }
        }
      }
    }
    for (const [d, rows] of Object.entries(cfg.ex))
      for (const e of rows) {
        if (e.tipo !== 'quebra' || !DS.machines[e.rc]) continue;
        const w = editWindow(e, d);
        if (w) ev.push(blank({ rc: e.rc, t0: w.a, end: w.b, open: false, capped: false, src: 'cal', key: 'cal|' + e.id }));
      }
    const nm = nowMin();
    for (const p of cfg.paradas) {
      if (!DS.machines[p.rc]) continue;
      const t0 = dtl2min(p.ini);
      if (t0 == null) continue;
      const end = p.fim ? dtl2min(p.fim)! : Math.max(nm, t0 + 1);
      ev.push(blank({ rc: p.rc, t0, end, open: !p.fim, capped: false, src: 'manual', p, key: 'p|' + p.id }));
    }
    // une eventos sobrepostos na mesma máquina
    const out: Ev[] = [], g: Record<string, Ev[]> = {};
    for (const e of ev) (g[e.rc] ||= []).push(e);
    for (const rc in g) {
      let c: Ev | null = null;
      for (const e of g[rc].sort((a, b) => a.t0 - b.t0)) {
        if (c && e.t0 <= c.end) {
          const cc: Ev = c;
          cc.end = Math.max(cc.end, e.end);
          cc.recs.push(...e.recs);
          e.ops.forEach((o) => cc.ops.add(o));
          if (e.src === 'manual') { cc.src = 'manual'; cc.p = e.p; cc.open = e.open; }
          else if (e.end >= cc.end) { cc.open = e.open; cc.capped = e.capped; }
        } else {
          c = { ...e, recs: e.recs.slice(), ops: new Set(e.ops) };
          out.push(c);
        }
      }
    }
    for (const e of out) {
      e.apont = e.recs.reduce((s, x) => s + x.min, 0);
      e.mv = null;
      for (const op of e.ops) { const m = movedTo(op, e.rc, e.t0, e.end); if (m) { e.mv = m; break; } }
      e.realAll = Math.max(capSeg(e.rc, e.t0, e.end), e.apont);
    }
    out.sort((a, b) => b.t0 - a.t0);
    sus.sort((a, b) => b.t0 - a.t0);
    EV = { ev: out, sus };
    EVKEY = key;
    return EV;
  }

  /* ================= agregação ================= */
  /**
   * Indicadores do período por dia, máquina, grupo e total. A produção é a união dos intervalos apontados;
   * a capacidade fixa, a soma das janelas dos turnos; cada minuto de capacidade recebe um destino
   * (manutenção → sem cobertura → produção → improdutivo → sem programação → sem apontamento).
   */
  function agg(opt: AggOptions): AggResult {
    const { from, to } = opt, grp = opt.grp || 'all';
    if (!from || !to) throw new Error('agg: informe o período (from, to)');
    const f = iso2s(from), t = iso2s(to), F = f * 1440 + DAY0, T = (t + 1) * 1440 + DAY0, cut = cutT(), Tc = Math.min(T, cut);
    const days: string[] = [];
    for (let p = f; p <= t; p++) days.push(s2iso(p));
    const inR = (x: Rec) => (x.t0 + x.min > F && x.t0 < T) || (x.min === 0 && x.t0 >= F && x.t0 < T);
    /* fatia [s, e) pelos dias produtivos dentro do período: um apontamento que atravessa a virada do dia
       ou o limite do período conta só a parte que cai em cada dia */
    const slice = (s: number, e: number, fn: (iso: string, ps: number, pe: number) => void) => {
      for (let p = Math.max(f, Math.floor((s - DAY0) / 1440)); p <= t; p++) {
        const ds = p * 1440 + DAY0;
        if (ds >= e) break;
        const ps = Math.max(s, ds), pe = Math.min(e, ds + 1440);
        if (pe > ps) fn(s2iso(p), ps, pe);
      }
    };
    const yms = [...new Set(days.map((d) => d.slice(0, 7)))];
    const directStop = new Set(DS.stops.filter((s) => s.mach && inR(s)).map((s) => s.mach));
    const extraRes = new Set(days.flatMap((d) => dayEdits(d).flatMap((e) => [e.rc, e.dst])));
    const mlist = Object.values(DS.machines).filter(
      (m) =>
        (grp === 'all' || grpOf(m.rc) === grp) &&
        (yms.some((ym) => machCfgM(m.rc, ym).on) || (DS.byRc[m.rc] || []).some(inR) || directStop.has(m.rc) || extraRes.has(m.rc) ||
          cfg.he.some((h) => h.alvo === 'm:' + m.rc && heIni(h) <= to && heFim(h) >= from)),
    );
    const M: Record<string, MachAcc> = {};
    for (const m of mlist) {
      const a: MachAcc = {
        ...extras(), m, mc: machCfgM(m.rc, to.slice(0, 7)), grp: grpOf(m.rc),
        prod: 0, union: 0, sd: 0, si: 0, stop: 0, cap: 0, capN: 0, capHE: 0, heAp: 0, capP: 0, nDays: 0, n: 0, manual: 0, impOut: 0,
        long: [], ops: new Set(), ords: new Set(), peds: new Set(), byDay: {}, recs: [], stops: [],
        manA: 0, manR: 0, ocult: 0, util: null, disp: null, evs: [], down: false, off: 0, over: 0,
      };
      for (const d of days) {
        const c = capParts(m.rc, d), cap = c.n;
        a.byDay[d] = { ...extras(), prod: 0, union: 0, stop: 0, cap, capN: c.n, capHE: c.he, capP: 0, manR: 0, manA: 0, heAp: 0, operCap: c.op };
        a.cap += cap; a.capN += c.n; a.capHE += c.he;
        if (c.n > 0) a.nDays++;
      }
      M[m.rc] = a;
    }
    const iv: Record<string, Interval[]> = {}, ivRegular: Record<string, Interval[]> = {};
    for (const x of DS.prod) {
      if (!inR(x)) continue;
      const a = M[x.rc];
      if (!a) continue;
      slice(x.t0, x.t0 + x.min, (d, ps, pe) => { a.prod += pe - ps; a.byDay[d].prod += pe - ps; (iv[x.rc + '|' + d] ||= []).push([ps, pe]); });
      a.n++;
      if (x.min > 600) a.long.push(x);
      if (x.manual) a.manual++;
      a.ops.add(x.op); a.ords.add(x.opn);
      if (x.ped) a.peds.add(x.ped);
      a.recs.push(x);
    }
    /* produção em janelas normais, operacionais e de HE (lançada ou histórica) */
    for (const k in iv) {
      const i = k.indexOf('|'), rc = k.slice(0, i), d = k.slice(i + 1), p = iso2s(d);
      const mv = mergedIntervals(iv[k]);
      iv[k] = mv;
      const planned = dayWins(rc, p - 1).concat(dayWins(rc, p));
      const operational = operationalWins(rc, p - 1).concat(operationalWins(rc, p));
      const b = M[rc].byDay[d];
      b.union = spanOf(mv);
      M[rc].union += b.union;
      const normal = planned.filter((w) => !w.he), manual = planned.filter((w) => w.he);
      const hist = historicalHE(rc, d, mv, manual);
      b.heHist = spanOf(hist);
      const heWindows: { a: number; b: number }[] = manual.concat(hist.map(([a, z]) => ({ a, b: z, c: 0 })));
      b.heAp = intervalMinutes(mv, heWindows);
      const normalProd = mv.flatMap(([a, z]) => outsideIntervals(a, z, mergedIntervals(heWindows.map((w): Interval => [w.a, w.b]))));
      ivRegular[k] = normalProd;
      b.fixedProd = intervalMinutes(normalProd, normal);
      b.operProd = Math.min(b.union, intervalMinutes(mv, [...operational, ...hist.map(([a, z]) => ({ a, b: z }))]));
      b.outside = Math.max(0, b.union - b.fixedProd);
      M[rc].heAp += b.heAp;
    }
    const stops: PeriodStop[] = [], siByDay: Record<string, Interval[]> = {};
    let noM = 0;
    for (const s0 of DS.stops) {
      if (!inR(s0)) continue;
      const a = s0.mach ? M[s0.mach] : null;
      if (grp !== 'all' && !a) continue;
      const decision = s0.mach ? cfg.evt[s0.mach + '|' + s0.t0] : null;
      const cat = decision === 'm' ? 'man' : decision === 'x' && motCat(s0.oper) === 'man' ? 'nc' : motCat(s0.oper);
      const s: PeriodStop = { ...s0, cat, isMan: cat === 'man', mp: 0 };
      slice(s.t0, s.t0 + s.min, (d, ps, pe) => {
        s.mp += pe - ps;
        if (a) {
          a.byDay[d].stop += pe - ps;
          if (s.isMan) a.byDay[d].manA += pe - ps;
          (siByDay[a.m.rc + '|' + d] ||= []).push([ps, pe]);
        }
      });
      stops.push(s);
      if (!a) { noM += s.mp; continue; }
      if (s.inf) a.si += s.mp; else a.sd += s.mp;
      a.stops.push(s);
    }
    // eventos de parada: tempo real de máquina parada = capacidade de turno dentro do evento, até o corte
    const E = buildEvents(), evs: MachineEvent[] = [];
    for (const e of E.ev) {
      const a = M[e.rc];
      if (!a || e.end <= F || e.t0 >= T) continue;
      const real = capSeg(e.rc, Math.max(e.t0, F), Math.min(e.end, Tc), (iso, v) => { if (a.byDay[iso]) a.byDay[iso].manR += v; });
      const ap = e.recs.reduce((q, x) => q + Math.max(0, Math.min(T, x.t0 + x.min) - Math.max(F, x.t0)), 0);
      const r = Math.max(real, ap);
      const o: MachineEvent = { e, real: r, ap, ocult: Math.max(0, r - ap) };
      evs.push(o); a.evs.push(o);
      a.manR += r; a.manA += ap;
      if (e.open && e.src === 'manual') a.down = true;
    }
    const T0: TotalAcc = {
      ...extras(), prod: 0, union: 0, cap: 0, capN: 0, capHE: 0, capP: 0, heAp: 0, stop: 0, gap: 0, manR: 0, manA: 0, ocult: 0, off: 0, over: 0,
      ords: new Set(), peds: new Set(), active: 0, n: 0, noM, util: null, disp: null,
    };
    const list = mlist.map((m) => M[m.rc]);
    for (const a of list) {
      a.capP = a.cap + a.capHE;
      for (const d of days) {
        const b = a.byDay[d], rc = a.m.rc, p = iso2s(d), k = rc + '|' + d;
        b.capP = b.cap + b.capHE;
        const prod = iv[k] || [], rawStops = mergedIntervals(siByDay[k] || []);
        const impacts = [shiftImpact(rc, s2iso(p - 1)), shiftImpact(rc, d)];
        const maintenance = mergedIntervals(a.evs.map((o): Interval => [o.e.t0, o.e.end]));
        const blocked = mergedIntervals(impacts.flatMap((x) => x.blocks.map((w): Interval => [w.a, w.b])));
        const noLoad = mergedIntervals(impacts.flatMap((x) => x.noLoad.map((w): Interval => [w.a, w.b])));
        for (const w of dayWins(rc, p - 1).concat(dayWins(rc, p))) {
          if (w.he) continue;
          const start = Math.max(w.a, p * 1440 + DAY0), end = Math.min(w.b, cut, (p + 1) * 1440 + DAY0);
          if (end <= start) continue;
          const net = w.c / (w.b - w.a);
          let free: Interval[] = [[start, end]];
          /** retira L do que ainda está livre e devolve a capacidade retirada */
          const take = (L: Interval[]) => {
            const next = free.flatMap(([s, e]) => outsideIntervals(s, e, L));
            const n = (spanOf(free) - spanOf(next)) * net;
            free = next;
            return n;
          };
          b.accountMaint += take(maintenance);
          b.uncovered += take(blocked);
          b.used += take(ivRegular[k] || []);
          b.accountStop += take(rawStops);
          b.noLoad += take(noLoad);
          b.gap += spanOf(free) * net;
          b.conflict += intervalMinutes(prod, mergedIntervals([...maintenance, ...blocked, ...rawStops]).map(([s, e]) => ({ a: Math.max(s, start), b: Math.min(e, end) })));
        }
        addInto(a, b, ADDITIONAL);
        if (b.capP <= 0 && b.union > 0) a.off += b.union;
        else if (b.fixedProd > b.cap + 1) a.over += b.fixedProd - b.cap;
      }
      a.stop = a.sd + a.si;
      a.ocult = Math.max(0, a.manR - a.manA);
      a.util = a.cap > 0 ? a.fixedProd / a.cap : null;
      a.disp = a.cap > 0 && (hasMaintenanceMap() || a.evs.length || a.accountMaint > 0) ? Math.max(0, 1 - a.accountMaint / a.cap) : null;
      a.impOut = Math.max(0, a.stop - a.manA);
      addInto(T0, a, ['prod', 'union', 'cap', 'capP', 'capN', 'capHE', 'heAp', 'stop', 'manR', 'manA', 'ocult', 'off', 'over', 'n', ...ADDITIONAL]);
      a.ords.forEach((o) => T0.ords.add(o));
      a.peds.forEach((o) => T0.peds.add(o));
      if (a.n > 0) T0.active++;
    }
    applyAdj(list, days, T0);
    T0.util = T0.cap > 0 ? T0.fixedProd / T0.cap : null;
    T0.disp = T0.cap > 0 && (hasMaintenanceMap() || evs.length || T0.accountMaint > 0) ? Math.max(0, 1 - T0.accountMaint / T0.cap) : null;
    const DAY_KEYS = ['prod', 'union', 'stop', 'cap', 'capP', 'capHE', 'heAp', 'manR', 'manA', ...ADDITIONAL] as const;
    const dayT = days.map((d) => {
      const o = { d, prod: 0, union: 0, stop: 0, cap: 0, capP: 0, capHE: 0, heAp: 0, manR: 0, manA: 0, ...extras(), ocult: 0 };
      for (const a of list) for (const k of DAY_KEYS) o[k] += a.byDay[d][k] || 0;
      o.ocult = Math.max(0, o.manR - o.manA);
      return o;
    });
    const workDays = dayT.filter((o) => o.capP > 0).length, workDaysN = days.filter((d) => list.some((a) => a.byDay[d].capN > 0)).length;
    const groups: Record<string, GroupAcc> = {};
    for (const a of list) {
      const g = (groups[a.grp] ||= { ...extras(), g: a.grp, list: [], union: 0, prod: 0, cap: 0, capN: 0, capHE: 0, capP: 0, heAp: 0, stop: 0, manR: 0, manA: 0, ocult: 0, gap: 0, ords: new Set(), util: null });
      g.list.push(a);
      addInto(g, a, ['union', 'prod', 'cap', 'capN', 'capHE', 'capP', 'heAp', 'stop', 'manR', 'manA', 'ocult', ...ADDITIONAL]);
      a.ords.forEach((o) => g.ords.add(o));
    }
    for (const g of Object.values(groups)) g.util = g.cap > 0 ? g.fixedProd / g.cap : null;
    const G = GRP_ORDER.concat(Object.keys(groups).filter((k) => !GRP_ORDER.includes(k))).filter((k) => groups[k]).map((k) => groups[k]);
    return { M, list, days, stops, T: T0, dayT, workDays, workDaysN, G, evs, F, T_: T, from, to, cut, cutIn: cut < T };
  }
  function status(u: number | null): Status {
    if (u == null) return { k: 'none', t: 'Sem capacidade' };
    if (u * 100 >= cfg.meta) return { k: 'good', t: 'No alvo' };
    if (u * 100 >= cfg.alerta) return { k: 'warn', t: 'Atenção' };
    return { k: 'crit', t: 'Crítico' };
  }
  /** ajustes manuais por dia (cfg.adj): substituem capacidade, produção, HE, improdutivo e manutenção do dia */
  function applyAdj(list: MachAcc[], days: string[], T0: TotalAcc) {
    const ADJ = cfg.adj || {};
    if (!Object.keys(ADJ).length) return;
    const dset = new Set(days);
    type Key = 'cap' | 'capN' | 'capP' | 'fixedProd' | 'used' | 'union' | 'prod' | 'heAp' | 'stop' | 'accountStop' | 'manR' | 'accountMaint' | 'gap';
    for (const a of list) {
      const A = ADJ[a.m.rc];
      if (!A) continue;
      let hit = false;
      for (const d in A) {
        if (!dset.has(d)) continue;
        const o = A[d], b = a.byDay[d];
        if (!b || !o) continue;
        hit = true;
        const add = (k: Key, dv: number) => { if (!dv) return; b[k] = (b[k] || 0) + dv; a[k] = (a[k] || 0) + dv; T0[k] = (T0[k] || 0) + dv; };
        const dl = (k: Key, v: number | undefined) => (v == null ? 0 : v - (b[k] || 0));
        const dCap = dl('cap', o.cap), dFx = dl('fixedProd', o.fx), dHe = dl('heAp', o.he), dSt = dl('stop', o.stop), dMan = dl('manR', o.man);
        add('cap', dCap); add('capN', dCap); add('capP', dCap);
        add('fixedProd', dFx); add('used', dFx); add('union', dFx + dHe); add('prod', dFx + dHe); add('heAp', dHe);
        add('stop', dSt); add('accountStop', dSt); add('manR', dMan); add('accountMaint', dMan);
        const ng = Math.max(0, (b.gap || 0) + dCap - dFx - dSt - dMan);
        add('gap', ng - (b.gap || 0));
        b.adj = true;
      }
      if (hit) {
        a.adj = true;
        a.ocult = Math.max(0, a.manR - a.manA);
        a.util = a.cap > 0 ? a.fixedProd / a.cap : null;
        if (a.disp != null || a.accountMaint > 0) a.disp = a.cap > 0 ? Math.max(0, 1 - a.accountMaint / a.cap) : null;
      }
    }
    T0.ocult = list.reduce((q, a) => q + a.ocult, 0);
  }

  return {
    get dataset() { return DS; },
    get config() { return cfg; },
    setConfig(next) { cfg = mergeConfig(next); clearCap(); EV = null; },
    agg, status,
    buildEvents,
    clearCap, machCfg, machCfgM, rosterEntry, rosterModes, grpOf, turnosTxt, dayCfg, capParts, capMin, capSeg, heDay, dayWins, motName, motCat,
    constants: { DAY0, GRP_ORDER, CATS, HOL, FACULT, ROSTER_MODES, EX_TYPES, MES, WD },
    util: { s2iso, iso2s, hhmm, fmtDT, title, shortNm },
    get cutT() { return cutT(); },
  };
}
