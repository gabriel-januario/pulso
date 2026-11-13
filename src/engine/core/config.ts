import type { CalendarException, DayConfig, EngineConfig, ExceptionType, ManualStop, OvertimeEntry, RosterEntry, RosterMode } from '../types';
import { wday, weekKey, toMin } from './time';

/* Configuração do motor: padrões, saneamento e migração de versões antigas do arquivo de configuração. */

export type Shift = EngineConfig['shifts'][number];
/** ajuste manual de um dia de um recurso (valores em minutos que substituem os calculados) */
export interface DayAdjust { cap?: number; fx?: number; he?: number; stop?: number; man?: number }
export interface Config extends EngineConfig {
  v: number;
  adj: Record<string, Record<string, DayAdjust>>;
  _log: unknown;
}

export const ROSTER_MODES: Record<RosterMode, string> = {
  fixo: 'Fixo', compartilhado: 'Compartilhado', eventual: 'Eventual', sem_turno: 'Sem turno', inativo: 'Inativo', pendente: 'A validar',
};
export const EX_TYPES: Record<ExceptionType, string> = {
  troca: 'Remanejamento', operador: 'Sem operador', quebra: 'Manutenção / quebra', carga: 'Sem programação', apoio: 'Cobertura eventual',
};
export const CATS: [string, string][] = [
  ['nc', 'Não classificado'], ['man', 'Manutenção'], ['setup', 'Setup / preparação'], ['mat', 'Falta de material'],
  ['prog', 'Falta de programa / desenho'], ['qual', 'Qualidade / retrabalho'], ['org', 'Organização / limpeza'],
  ['pess', 'Pessoal / reunião'], ['out', 'Outros'],
];
export const GRP_ORDER = ['Mandrilhadoras', 'Centros de usinagem', 'Tornos verticais', 'Tornos horizontais', 'Furadeiras radiais', 'Plainas e fresadoras', 'Outros postos'];

/** Turnos por recurso conforme o relatório "Capacidade Instalada" do ERP. Recursos fora da lista usam a sugestão dos apontamentos. */
export const ERP_TURNOS: Record<string, number> = {
  MHG1: 2, MHMC2: 2, MHMC1: 2, MHG2: 2, MHGC1: 2, MHP1: 1, CUHCNC: 2, TVMC: 1, TVGC: 2, TVG1: 2, TVG: 1, THPC: 1, THPC1: 1, THMC: 1, THGC: 1, PFR: 2, PFR1: 1,
};

const MOTIVOS_PADRAO: Record<string, { n: string; c: string }> = {
  '5': { n: 'Ginástica laboral', c: 'pess' }, '10': { n: 'Preparação de máquina (setup)', c: 'setup' }, '20': { n: 'Troca de ferramenta', c: 'setup' },
  '30': { n: 'Aguardando ponte rolante', c: 'org' }, '40': { n: 'Aguardando material', c: 'mat' }, '50': { n: 'Aguardando programa CNC', c: 'prog' },
  '60': { n: 'Aguardando desenho / revisão', c: 'prog' }, '70': { n: 'Aguardando inspeção', c: 'qual' }, '80': { n: 'Limpeza e organização do posto', c: 'org' },
  '90': { n: 'Reunião / treinamento', c: 'pess' }, '100': { n: 'Retrabalho', c: 'qual' }, '115': { n: 'Falta de operador', c: 'pess' },
  '121': { n: 'Manutenção preventiva', c: 'man' }, '122': { n: 'Manutenção hidráulica', c: 'man' }, '123': { n: 'Manutenção elétrica', c: 'man' },
  '124': { n: 'Manutenção mecânica', c: 'man' }, '125': { n: 'Aguardando peça de reposição', c: 'man' }, '126': { n: 'Falha no CNC / comando', c: 'man' },
  '127': { n: 'Lubrificação', c: 'man' }, '137': { n: 'Aguardando dispositivo de fixação', c: 'setup' }, '147': { n: 'Falta de energia / utilidades', c: 'out' },
  '155': { n: 'Montagem e ajuste da peça', c: 'setup' }, '157': { n: 'Medição em máquina', c: 'qual' }, '159': { n: 'Aguardando ordem de produção', c: 'org' },
};

export function defaultConfig(): Config {
  return {
    v: 5, escala: {}, ex: {}, heOff: [],
    shifts: [
      { id: 'T1', nome: '1º Turno', ini: '07:00', fim: '16:48', int: 60, h: 8, def: true },
      { id: 'T2', nome: '2º Turno', ini: '16:48', fim: '02:30', int: 60, h: 8, def: true },
      { id: 'T3', nome: 'Apoio madrugada', ini: '02:30', fim: '07:00', int: 0, h: 4.5, def: false },
    ],
    cart: {}, adj: {}, cal: {}, mach: {}, machM: {}, he: [], corte: 'dados',
    motivos: structuredClone(MOTIVOS_PADRAO), meta: 85, alerta: 65, evt: {}, paradas: [], man: { maxDias: 5, suspH: 4 }, _log: null,
  };
}

/** duração bruta da janela do turno (min) */
export const shiftDur = (s: Shift) => (toMin(s.fim) - toMin(s.ini) + 1440) % 1440 || 1440;
/** horas líquidas que entram na capacidade (campo "h" do turno); sem ele, janela − intervalo */
export const shiftMin = (s: Shift | undefined) => (!s ? 0 : s.h != null && isFinite(+s.h) ? Math.max(0, +s.h * 60) : Math.max(0, shiftDur(s) - (+s.int || 0)));

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object';
const entries = (v: unknown): [string, unknown][] => (isObj(v) ? Object.entries(v) : []);
const num = (v: unknown, d: number) => (isFinite(Number(v)) ? Number(v) : d);

/**
 * Saneia uma configuração vinda de fora (arquivo salvo, backup, versão anterior) e completa com os padrões.
 * Versões < 3 têm migração: horas líquidas por turno, "dia de hora extra" no calendário vira lançamento de HE
 * e turnos por máquina passam a vir do ERP.
 */
export function mergeConfig(input: unknown): Config {
  const d = defaultConfig();
  if (!isObj(input)) return d;
  const o = input;
  const motivos: Config['motivos'] = {};
  for (const [k, v] of entries(isObj(o.motivos) && Object.keys(o.motivos).length ? o.motivos : d.motivos))
    motivos[k] = typeof v === 'string' ? { n: v, c: 'nc' } : { n: String((v as Obj)?.n || ''), c: String((v as Obj)?.c || 'nc') };
  const ver = Number(o.v) || 1;
  const shifts: Shift[] = Array.isArray(o.shifts) && o.shifts.length ? (o.shifts as Shift[]).map((s) => ({ ...s })) : d.shifts;
  const cal: Record<string, DayConfig> = {};
  for (const [k, v] of entries(o.cal)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !isObj(v)) continue;
    cal[k] = { t: (typeof v.t === 'string' ? v.t : 'util') as DayConfig['t'], sh: Array.isArray(v.sh) ? v.sh.filter((x): x is string => typeof x === 'string') : [] };
  }
  type LegacyHe = OvertimeEntry & { mig?: boolean };
  const he: LegacyHe[] = Array.isArray(o.he)
    ? (o.he as unknown[]).filter((x): x is LegacyHe => isObj(x) && typeof x.alvo === 'string' && (typeof x.ini === 'string' || typeof x.wk === 'string')).map((x) => ({ ...x }))
    : [];
  const mach: Config['mach'] = {};
  for (const [rc, c] of entries(o.mach)) if (isObj(c)) mach[rc] = { ...c };
  if (ver < 3) {
    for (const s of shifts) if (s.h == null) s.h = s.id === 'T1' || s.id === 'T2' ? 8 : +(Math.max(0, shiftDur(s) - (+s.int || 0)) / 60).toFixed(2);
    for (const [iso, c] of Object.entries(cal)) {
      if (c.t !== 'extra') continue;
      const w = wday(iso);
      const hrs = c.sh.reduce((q, id) => { const s = shifts.find((x) => x.id === id); return q + (s ? +(s.h ?? 0) || 0 : 0); }, 0);
      if (w === 0 || w === 6) {
        const wk = weekKey(iso);
        let L = he.find((x) => x.wk === wk && x.alvo === 'all' && x.mig);
        if (!L) { L = { id: 'mig' + wk, wk, ini: '', fim: '', alvo: 'all', sem: 0, sab: 0, dom: 0, obs: 'Convertido do calendário anterior', mig: true }; he.push(L); }
        if (w === 6) L.sab += hrs; else L.dom += hrs;
        delete cal[iso];
      } else cal[iso] = { t: 'util', sh: c.sh };
    }
    for (const rc in mach) {
      const c = mach[rc];
      if (ERP_TURNOS[rc] != null) { c.sh = shifts.slice(0, ERP_TURNOS[rc]).map((s) => s.id); c.src = 'erp'; } else c.src = 'conferir';
    }
  }
  for (const s of shifts) s.h = s.h == null ? null : Math.max(0, +s.h || 0);
  const machM: Config['machM'] = {};
  for (const [ym, o2] of entries(o.machM)) {
    if (!/^\d{4}-\d{2}$/.test(ym) || !isObj(o2)) continue;
    machM[ym] = {};
    for (const [rc, v] of Object.entries(o2)) if (Array.isArray(v)) machM[ym][rc] = v.filter((x): x is string => typeof x === 'string');
  }
  const escala: Config['escala'] = {}, ex: Config['ex'] = {};
  for (const [ym, rr] of entries(o.escala)) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym) || !isObj(rr)) continue;
    escala[ym] = {};
    for (const [rc, v] of Object.entries(rr)) {
      if (!isObj(v) || typeof v.modo !== 'string' || !Object.hasOwn(ROSTER_MODES, v.modo)) continue;
      const t = isObj(v.turnos) ? v.turnos : {};
      const turnos = Object.fromEntries(shifts.filter((s) => Object.hasOwn(t, s.id)).map((s) => [s.id, String(t[s.id] || '')]));
      const row: RosterEntry = { modo: v.modo as RosterMode, turnos, obs: String(v.obs || ''), crit: !!v.crit, carga: v.carga == null ? null : Math.max(0, Number(v.carga) || 0) };
      escala[ym][rc] = row;
    }
  }
  for (const [day, rows] of entries(o.ex)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Array.isArray(rows)) continue;
    ex[day] = rows
      .filter((v): v is CalendarException => isObj(v) && typeof v.rc === 'string' && typeof v.tipo === 'string' && Object.hasOwn(EX_TYPES, v.tipo) && shifts.some((s) => s.id === v.sh))
      .map((v) => ({ ...v }));
  }
  const man = isObj(o.man) ? o.man : {};
  return {
    v: 5,
    cart: isObj(o.cart) ? (o.cart as Config['cart']) : {},
    adj: isObj(o.adj) ? (o.adj as Config['adj']) : {},
    escala, ex,
    heOff: Array.isArray(o.heOff) ? o.heOff.filter((v): v is string => typeof v === 'string' && /^\d{4}-\d{2}$/.test(v)) : [],
    _log: isObj(o._log) ? o._log : null,
    shifts, cal, mach, machM, he,
    corte: o.corte === 'dia' ? 'dia' : 'dados',
    motivos,
    meta: num(o.meta, 85), alerta: num(o.alerta, 65),
    evt: isObj(o.evt) ? (o.evt as Config['evt']) : {},
    paradas: Array.isArray(o.paradas) ? (o.paradas as ManualStop[]) : [],
    man: { maxDias: num(man.maxDias, 5), suspH: num(man.suspH, 4) },
  };
}
