import { nextMonth, prevMonth } from '../../analytics/planning';

/** Navegação por mês: anterior, seletor nativo e próximo. */
export function MonthPicker({ ym, onChange }: { ym: string; onChange(ym: string): void }) {
  return (
    <div className="mpick" role="group" aria-label="Mês">
      <button type="button" className="btn" onClick={() => onChange(prevMonth(ym))} aria-label="Mês anterior">‹</button>
      <input className="ctl" type="month" value={ym} onChange={(e) => e.target.value && onChange(e.target.value)} aria-label="Mês" />
      <button type="button" className="btn" onClick={() => onChange(nextMonth(ym))} aria-label="Próximo mês">›</button>
    </div>
  );
}
