import { useCallback, useEffect, useState } from 'react';
import type { MonthOption, Period } from '../analytics/period';

export interface FilterState {
  /** 'all' (todo o histórico), 'AAAA-MM' ou 'day' (detalhe de um dia) */
  period: string;
  range: Period;
  grp: string;
  machines: string[] | null;
  /** máquina aberta na tela Máquinas */
  machine: string | null;
  /** período de onde o usuário entrou no detalhe de um dia (para voltar) */
  drillDay: { period: string; range: Period } | null;
}
export interface Filters {
  state: FilterState;
  set(p: Partial<Pick<FilterState, 'grp' | 'machines' | 'machine'>>): void;
  setPeriod(value: string): void;
  drill(day: string | null): void;
  reset(): void;
}

/** Filtros globais compartilhados pelas telas, guardados na URL (#/tela?p=2026-10&g=…&m=…) para poder compartilhar o link. */
export function useFilters(months: MonthOption[], all: Period, view = ''): Filters {
  const rangeOf = useCallback((period: string): Period => {
    if (period === 'all') return all;
    return months.find((m) => m.value === period) ?? months[0];
  }, [months, all]);

  const [state, setState] = useState<FilterState>(() => {
    const q = new URLSearchParams(location.hash.split('?')[1] ?? '');
    const p = q.get('p');
    const period = p && (p === 'all' || months.some((m) => m.value === p)) ? p : months[0].value;
    return { period, range: rangeOf(period), grp: q.get('g') ?? 'all', machines: q.get('m') ? q.get('m')!.split(',') : null, machine: q.get('r'), drillDay: null };
  });

  useEffect(() => {
    const [path] = location.hash.split('?');
    const q = new URLSearchParams();
    if (!state.drillDay) q.set('p', state.period);
    if (state.grp !== 'all') q.set('g', state.grp);
    if (state.machines) q.set('m', state.machines.join(','));
    if (state.machine && path.startsWith('#/maquinas')) q.set('r', state.machine);
    const next = `${path || '#/'}?${q}`;
    if (next !== location.hash) history.replaceState(null, '', next);
  }, [state, view]);

  return {
    state,
    set: (p) => setState((s) => ({ ...s, ...p })),
    setPeriod: (value) => setState((s) => ({ ...s, period: value, range: rangeOf(value), drillDay: null })),
    drill: (day) => setState((s) => {
      if (day == null) return s.drillDay ? { ...s, period: s.drillDay.period, range: s.drillDay.range, drillDay: null } : s;
      return { ...s, period: 'day', range: { from: day, to: day }, drillDay: s.drillDay ?? { period: s.period, range: s.range } };
    }),
    reset: () => setState((s) => ({ ...s, grp: 'all', machines: null, ...(s.drillDay ? { period: s.drillDay.period, range: s.drillDay.range } : {}), drillDay: null })),
  };
}
