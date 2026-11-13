import type { Machine, ProdRecord, RawDataset, StopRecord } from '../types';
import { DAY0, s2iso } from './time';

/* Leitura da base compacta: apontamentos viram registros de produção e de parada ligados às máquinas de usinagem. */

/** centros de recurso de usinagem */
const USIN_CR = new Set(['52010', '52020']);

export interface Rec extends ProdRecord {
  /** índice do operador, nome do recurso, centro de recurso, centro de custo e usuário que lançou */
  oi: number; rn: string; cr: string; cc: number; user: string;
  isMach: boolean; isStop: boolean;
  /** máquina da parada (direta ou inferida pelo operador) e se foi inferida */
  mach: string | null; inf: boolean;
}
export type BaseStop = Rec;
export interface MachineInfo extends Machine {
  /** fração da produção à noite, horas por dia com produção e sugestão de turnos a partir disso */
  night: number; hday: number; twoShifts: boolean; sugT: number;
}
export interface Dataset {
  R: Rec[]; prod: Rec[]; stops: Rec[]; machines: Record<string, MachineInfo>; usinOps: Set<string>;
  byRc: Record<string, Rec[]>; byOp: Record<string, Rec[]>; minPd: number; maxPd: number; lastT: number;
  meta: RawDataset['meta']; nAll: number;
}
/** parada copiada para o período com categoria e minutos dentro do período */
export type PeriodStop = Rec & StopRecord;

export function familyOf(name: string) {
  const n = String(name).toUpperCase();
  if (/^MANDRI/.test(n)) return 'Mandrilhadoras';
  if (/^CENTRO/.test(n)) return 'Centros de usinagem';
  if (/^TORNO VERT/.test(n)) return 'Tornos verticais';
  if (/^TORNO/.test(n)) return 'Tornos horizontais';
  if (/^FURADEIRA/.test(n)) return 'Furadeiras radiais';
  if (/^(PLAINA|FRESADORA)/.test(n)) return 'Plainas e fresadoras';
  return 'Outros postos';
}
/** caixa de título, mantendo siglas de modelo em maiúsculas */
export const title = (s: string) =>
  String(s)
    .toLowerCase()
    .replace(/(^|\s|\.|\/|-)([a-zà-ú])/g, (_m, a: string, b: string) => a + b.toUpperCase())
    .replace(/\b(Cnc|Mos|Mod|Tos|Hp100|Twhs3|Hcp|Frn60|Frn|Frn80|Gl280m|S-30a|Mc220|In|Vr8|Vr8a|2h58|80a|Ii|Mhs|You-Ji|Mas|Okuma)\b/gi, (w) => w.toUpperCase())
    .replace(/\b(De|Da|Do|Dos|Das|E)\b/g, (w) => w.toLowerCase());
/** primeiro nome (com a preposição seguinte, se houver) */
export const shortNm = (n: string) => {
  const w = title(n).split(' '), o = [w[0]];
  for (let i = 1; i < w.length; i++) { o.push(w[i]); if (!/^(da|de|do|das|dos|e)$/i.test(w[i])) break; }
  return o.join(' ');
};
const push = <T>(m: Record<string, T[]>, k: string, v: T) => { (m[k] ||= []).push(v); };

export function buildDataset(raw: RawDataset): Dataset {
  const R: Rec[] = raw.rows.map((r) => {
    const rs = raw.res[r[10]] || ['?', '?', ''];
    const t0 = r[0] * 1440 + r[1], pd = Math.floor((t0 - DAY0) / 1440);
    const x = {
      t0, min: r[2], pd, date: s2iso(pd), op: raw.ops[r[3]], oi: r[3], chapa: r[4], org: String(r[5]), opn: r[6], ped: r[7], item: r[8], oper: r[9],
      rc: rs[0], rn: rs[1], cr: String(rs[2]), cc: r[11], user: raw.users[r[12]] || '', isMach: false, isStop: false, manual: false, mach: null, inf: false,
    };
    x.isMach = USIN_CR.has(x.cr) && x.rc !== 'IMP';
    x.isStop = x.org === '900' || x.rc === 'IMP';
    x.manual = !/^coletor/i.test(x.user);
    return x;
  });
  // operadores de usinagem: pelo menos metade das horas produtivas em máquinas de usinagem
  const opM: Record<number, number> = {};
  for (const x of R) if (!x.isStop && x.isMach) opM[x.oi] = (opM[x.oi] || 0) + x.min;
  const tot = (i: number) => (raw.opTot && raw.opTot[i]) || 0;
  const usinOps = new Set(Object.keys(opM).map(Number).filter((i) => opM[i] / Math.max(tot(i), opM[i]) >= 0.5).map((i) => raw.ops[i]));
  const prod = R.filter((x) => x.isMach && !x.isStop);
  const stops = R.filter((x) => x.isStop && (x.isMach || usinOps.has(x.op)));
  // parada fora da máquina: atribuída à máquina em que o operador produzia antes (ou à primeira do dia)
  const byOD: Record<string, Rec[]> = {};
  for (const x of prod) push(byOD, x.op + '|' + x.pd, x);
  for (const k in byOD) byOD[k].sort((a, b) => a.t0 - b.t0);
  for (const s of stops) {
    if (s.isMach) { s.mach = s.rc; s.inf = false; continue; }
    const L = byOD[s.op + '|' + s.pd];
    let best: Rec | null = null;
    if (L) { for (const x of L) if (x.t0 <= s.t0) best = x; if (!best) best = L[0]; }
    s.mach = best ? best.rc : null;
    s.inf = true;
  }
  const machines: Record<string, MachineInfo> = {};
  for (const x of prod.concat(stops.filter((s) => !s.inf))) {
    if (machines[x.rc]) continue;
    const inat = /INATIVO/i.test(x.rn);
    machines[x.rc] = { rc: x.rc, name: inat ? x.rc + ' (inativo)' : title(x.rn), raw: x.rn, cr: x.cr, fam: inat ? 'Outros postos' : familyOf(x.rn), inat, night: 0, hday: 0, twoShifts: false, sugT: 1 };
  }
  const night: Record<string, number> = {}, tt: Record<string, number> = {}, dset: Record<string, Set<number>> = {};
  for (const x of prod) {
    const cm = ((x.t0 % 1440) + 1440) % 1440;
    tt[x.rc] = (tt[x.rc] || 0) + x.min;
    if (cm >= 16 * 60 + 30 || cm < 180) night[x.rc] = (night[x.rc] || 0) + x.min;
    (dset[x.rc] ||= new Set()).add(x.pd);
  }
  for (const rc in machines) {
    const m = machines[rc];
    m.night = (night[rc] || 0) / (tt[rc] || 1);
    m.hday = (tt[rc] || 0) / 60 / ((dset[rc] && dset[rc].size) || 1);
    m.twoShifts = m.hday >= 9.5 || (m.night >= 0.25 && m.hday >= 6);
    m.sugT = m.twoShifts ? 2 : 1;
  }
  const byRc: Record<string, Rec[]> = {}, byOp: Record<string, Rec[]> = {};
  for (const x of prod) { push(byRc, x.rc, x); push(byOp, x.op, x); }
  for (const k in byRc) byRc[k].sort((a, b) => a.t0 - b.t0);
  for (const k in byOp) byOp[k].sort((a, b) => a.t0 - b.t0);
  let minPd = Infinity, maxPd = -Infinity, lastT = 0;
  for (const x of prod.concat(stops)) {
    if (x.pd < minPd) minPd = x.pd;
    if (x.pd > maxPd) maxPd = x.pd;
    if (x.t0 + x.min > lastT) lastT = x.t0 + x.min;
  }
  return { R, prod, stops, machines, usinOps, byRc, byOp, minPd, maxPd, lastT, meta: raw.meta || { empresa: '', fonte: '' }, nAll: R.length };
}
