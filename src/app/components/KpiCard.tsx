import type { ReactNode } from 'react';

interface Props { label: string; value: string; unit?: string; sub?: ReactNode; color?: string; hero?: boolean; meter?: { value: number; target: number }; /** valor é um texto (ex.: nome de um motivo) */ text?: boolean }

export function KpiCard({ label, value, unit, sub, color, hero, meter, text }: Props) {
  return (
    <div className={hero ? 'kpi hero' : 'kpi'}>
      <div className="kl">{color && <i style={{ background: color }} />}{label}</div>
      <div className={text ? 'kv txt' : 'kv'}>{value}{unit && <small>{unit}</small>}</div>
      {sub && <div className="ks">{sub}</div>}
      {meter && (
        <div className="meter" role="img" aria-label={`${Math.round(meter.value * 100)}% de ${Math.round(meter.target * 100)}% de meta`}>
          <b style={{ width: `${Math.min(100, meter.value * 100)}%` }} />
          <i style={{ left: `${Math.min(100, meter.target * 100)}%` }} />
        </div>
      )}
    </div>
  );
}
