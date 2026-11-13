import type { Measures } from '../../engine';
import { hours1, pct } from '../format';

const PARTS: { key: 'used' | 'accountStop' | 'accountMaint' | 'uncovered' | 'noLoad' | 'gap'; label: string; color: string }[] = [
  { key: 'used', label: 'Produção alocada', color: '#2a78d6' },
  { key: 'accountStop', label: 'Improdutivo', color: '#eb6834' },
  { key: 'accountMaint', label: 'Manutenção', color: '#6250d6' },
  { key: 'uncovered', label: 'Sem cobertura', color: '#b45309' },
  { key: 'noLoad', label: 'Sem programação', color: '#475569' },
  { key: 'gap', label: 'Sem apontamento', color: '#b9c6d6' },
];

/** Para onde foi cada hora da capacidade fixa. As partes somam 100% da capacidade. */
export function CapacityBar({ totals }: { totals: Pick<Measures, 'cap' | 'used' | 'accountStop' | 'accountMaint' | 'uncovered' | 'noLoad' | 'gap'> }) {
  const parts = PARTS.map((p) => ({ ...p, v: totals[p.key] })).filter((p) => p.v > 0.5);
  if (!(totals.cap > 0)) return <p className="empty">Sem capacidade validada no período.</p>;
  return (
    <div>
      <div className="compo" role="img" aria-label="Destino da capacidade fixa">
        {parts.map((p) => (
          <b key={p.key} style={{ width: `${(p.v / totals.cap) * 100}%`, background: p.color }} title={`${p.label}: ${hours1(p.v)} h`}>
            {p.v / totals.cap >= 0.08 ? pct(p.v / totals.cap) : ''}
          </b>
        ))}
      </div>
      <ul className="compoleg">
        {parts.map((p) => (
          <li key={p.key}><i style={{ background: p.color }} />{p.label}<strong>{hours1(p.v)} h</strong><em>{pct(p.v / totals.cap)}</em></li>
        ))}
      </ul>
    </div>
  );
}
