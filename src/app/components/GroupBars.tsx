import type { Engine, GroupAgg } from '../../engine';
import { hours, pct } from '../format';

const COLOR = { good: '#2563c9', warn: '#e3a33b', crit: '#d64b45', none: '#cfd7e0' } as const;

export function GroupBars({ groups, engine, onSelect }: { groups: GroupAgg[]; engine: Engine; onSelect(g: string): void }) {
  const meta = engine.config.meta;
  return (
    <div className="hb">
      {groups.map((g) => {
        const st = engine.status(g.util).k;
        return (
          <button key={g.g} type="button" className="hbrow" onClick={() => onSelect(g.g)} title={`Filtrar por ${g.g}`}>
            <span className="nm">{g.g}<small>{g.list.length} {g.list.length === 1 ? 'máquina' : 'máquinas'}</small></span>
            <span className="br">
              <b style={{ width: `${Math.min(100, (g.util ?? 0) * 100)}%`, background: COLOR[st] }} />
              <i style={{ left: `${meta}%` }} />
            </span>
            <span className="vl"><strong>{pct(g.util)}</strong> · {hours(g.fixedProd)}/{hours(g.cap)} h</span>
          </button>
        );
      })}
    </div>
  );
}
