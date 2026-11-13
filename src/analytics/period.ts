import type { Engine } from '../engine';

export interface Period { from: string; to: string }
export interface MonthOption extends Period { value: string; label: string }

const MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DAY = 864e5;

export const isoToDate = (iso: string) => new Date(iso + 'T12:00:00Z');
export const addDays = (iso: string, n: number) => new Date(isoToDate(iso).getTime() + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((isoToDate(b).getTime() - isoToDate(a).getTime()) / DAY);
export const lastDayOfMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};
export const monthShort = (ym: string) => MES[+ym.slice(5, 7) - 1].slice(0, 3);
export const monthLong = (ym: string) => `${MES[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
export const weekday = (iso: string) => isoToDate(iso).getUTCDay();

/** Meses com dados, do mais recente para o mais antigo. */
export function monthOptions(engine: Engine): MonthOption[] {
  const { s2iso } = engine.util;
  const first = s2iso(engine.dataset.minPd).slice(0, 7), last = s2iso(engine.dataset.maxPd).slice(0, 7);
  const out: MonthOption[] = [];
  let [y, m] = first.split('-').map(Number);
  for (;;) {
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    out.push({ value: ym, label: monthLong(ym), from: `${ym}-01`, to: lastDayOfMonth(ym) });
    if (ym >= last) break;
    if (++m > 12) { m = 1; y++; }
  }
  return out.reverse();
}

/**
 * Período de comparação: o mês anterior completo quando o período é um mês fechado;
 * senão, uma janela do mesmo tamanho imediatamente antes. Nulo se cair antes da base.
 */
export function previousPeriod(p: Period, firstDay: string): (Period & { label: string }) | null {
  let from: string, to: string, label: string;
  const fullMonth = p.from.slice(8) === '01' && p.from.slice(0, 7) === p.to.slice(0, 7) && p.to === lastDayOfMonth(p.to.slice(0, 7));
  if (fullMonth) {
    const [y, m] = p.from.split('-').map(Number);
    const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
    from = `${prev}-01`; to = lastDayOfMonth(prev);
    label = `${monthShort(prev).toLowerCase()}/${prev.slice(2, 4)}`;
  } else {
    const n = daysBetween(p.from, p.to) + 1;
    to = addDays(p.from, -1); from = addDays(p.from, -n);
    label = `${from.slice(8)}/${from.slice(5, 7)}–${to.slice(8)}/${to.slice(5, 7)}`;
  }
  if (to < firstDay) return null;
  if (from < firstDay) from = firstDay;
  return { from, to, label };
}
