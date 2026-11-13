import type { ReactNode } from 'react';

interface Props { label: string; value: string; unit?: string; sub?: ReactNode; color?: string; hero?: boolean; meter?: { value: number; target: number } }

export function KpiCard({ label, value, unit, sub, color, hero, meter }: Props) {
  return (
    <div className={hero ? 'kpi hero' : 'kpi'}>
      <div className="kl">{color && <i style={{ background: color }} />}{label}</div>
      <div className="kv">{value}{unit && <small>{unit}</small>}</div>
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
