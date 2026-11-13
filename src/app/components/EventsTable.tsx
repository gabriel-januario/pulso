import type { Engine, MachineEvent } from '../../engine';
import { hours1 } from '../format';

const SRC = { manual: 'Quadro', cal: 'Calendário', conf: 'Confirmada', apont: 'Apontamento' } as const;

/** Paradas de manutenção: tempo real (horas de turno parado) contra o tempo apontado. */
export function EventsTable({ events, engine, showMachine, onPickMachine }: { events: MachineEvent[]; engine: Engine; showMachine?: boolean; onPickMachine?(rc: string): void }) {
  const { fmtDT, hhmm } = engine.util;
  if (!events.length) return <p className="empty">Nenhuma parada de manutenção no período.</p>;
  return (
    <div className="tw" style={{ maxHeight: 420 }}>
      <table className="t">
        <thead><tr>{showMachine && <th>Máquina</th>}<th>Início</th><th>Retorno</th><th className="n">Parada real h</th><th className="n">Apontado h</th><th className="n">Não apontado h</th><th>Origem</th><th>Operador deslocado</th></tr></thead>
        <tbody>
          {events.map((o) => {
            const e = o.e, mv = e.mv ? engine.dataset.machines[e.mv.rc] : null;
            return (
              <tr key={`${e.rc}|${e.t0}`} className={showMachine ? 'clk' : undefined} onClick={showMachine && onPickMachine ? () => onPickMachine(e.rc) : undefined}>
                {showMachine && <td><b>{engine.dataset.machines[e.rc]?.name}</b> <span className="code">{e.rc}</span></td>}
                <td className="nw">{fmtDT(e.t0)}</td>
                <td className="nw">{e.open ? <span className="pill s-crit"><i />{e.src === 'manual' ? 'Parada' : 'Sem retorno'}</span> : fmtDT(e.end)}{e.capped && <span className="tag"> limite</span>}</td>
                <td className="n"><b>{hours1(o.real)}</b></td><td className="n">{hours1(o.ap)}</td>
                <td className="n" style={o.ocult > 60 ? { color: '#6250d6', fontWeight: 600 } : undefined}>{hours1(o.ocult)}</td>
                <td><span className={e.src === 'manual' ? 'tag' : 'tag man'}>{SRC[e.src]}</span></td>
                <td>{mv ? <>→ {mv.name} <span className="code">{hhmm(e.mv!.t0)}</span></> : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
