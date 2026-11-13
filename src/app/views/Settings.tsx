import { useMemo, useRef, useState } from 'react';
import { sortedMachines } from '../../analytics/planning';
import { int, hours1, pct } from '../format';
import { groupColor, STATUS_BAR } from '../theme';
import type { ViewProps } from './types';

/** Configurações: metas, regras de manutenção, cadastro das máquinas, motivos de parada e backup. */
export function Settings({ pulso, config }: ViewProps) {
  const { engine } = pulso;
  const cfg = engine.config;
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const machines = useMemo(() => sortedMachines(engine), [engine, config.version]);
  const reasons = useMemo(() => {
    const by = new Map<number, { code: number; min: number; n: number; direct: number }>();
    for (const s of engine.dataset.stops) {
      const o = by.get(s.oper) ?? { code: s.oper, min: 0, n: 0, direct: 0 };
      o.min += s.min; o.n++; if (!s.inf) o.direct += s.min; by.set(s.oper, o);
    }
    return [...by.values()].sort((a, b) => b.min - a.min);
  }, [engine]);
  const saved = config.saved();
  const changed = Object.keys(saved).filter((k) => k !== 'savedAt' && k !== 'cart');
  const num = (v: string, lo: number, hi: number, d: number) => { const n = +v; return isFinite(n) && v !== '' ? Math.max(lo, Math.min(hi, n)) : d; };

  const exportCfg = () => {
    const blob = new Blob([JSON.stringify(config.saved(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `pulso-configuracao-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importCfg = async (f: File | undefined) => {
    if (!f) return;
    try { const keys = config.load(JSON.parse(await f.text())); setMsg({ ok: true, text: `Configuração importada (${keys.length} parte${keys.length > 1 ? 's' : ''}).` }); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Arquivo inválido.' }); }
    if (file.current) file.current.value = '';
  };
  const setMach = (rc: string, patch: { grp?: string; disp?: number }) => config.update({ mach: { ...cfg.mach, [rc]: { ...(cfg.mach[rc] ?? {}), ...patch } } });
  const setMot = (code: number, patch: { n?: string; c?: string }) => {
    const cur = cfg.motivos[code] ?? { n: '', c: 'nc' };
    config.update({ motivos: { ...cfg.motivos, [code]: { ...cur, ...patch } } });
  };

  return (
    <>
      <div className="grid2">
        <section className="panel">
          <div className="ph"><h2>Metas de utilização</h2></div>
          <div className="pb cal-form">
            <div className="two">
              <label>No alvo a partir de (%)<input className="ctl" type="number" min={1} max={150} defaultValue={cfg.meta} onBlur={(e) => { const v = num(e.target.value, 1, 150, cfg.meta); if (v !== cfg.meta) config.update({ meta: v, alerta: Math.min(cfg.alerta, v) }); }} /></label>
              <label>Atenção a partir de (%)<input className="ctl" type="number" min={0} max={150} defaultValue={cfg.alerta} onBlur={(e) => { const v = num(e.target.value, 0, cfg.meta, cfg.alerta); if (v !== cfg.alerta) config.update({ alerta: v }); }} /></label>
            </div>
            <div className="legend">
              <span><i style={{ background: STATUS_BAR.good }} />No alvo ≥ {cfg.meta}%</span>
              <span><i style={{ background: STATUS_BAR.warn }} />Atenção {cfg.alerta}–{cfg.meta}%</span>
              <span><i style={{ background: STATUS_BAR.crit }} />Crítico &lt; {cfg.alerta}%</span>
            </div>
            <label>Corte da capacidade no fim da base
              <select className="ctl" value={cfg.corte} onChange={(e) => config.update({ corte: e.target.value as 'dados' | 'dia' })}>
                <option value="dados">Até o último apontamento ({engine.util.fmtDT(engine.dataset.lastT)}) · recomendado</option>
                <option value="dia">Dia inteiro do último dia da base</option>
              </select>
            </label>
            <p className="meta">Sem o corte, uma base exportada no meio do dia conta o turno inteiro como capacidade e derruba a utilização.</p>
          </div>
        </section>
        <section className="panel">
          <div className="ph"><h2>Regras de manutenção</h2></div>
          <div className="pb cal-form">
            <div className="two">
              <label>Limite de parada sem retorno (dias)<input className="ctl" type="number" min={1} max={60} defaultValue={cfg.man.maxDias} onBlur={(e) => { const v = num(e.target.value, 1, 60, cfg.man.maxDias); if (v !== cfg.man.maxDias) config.update({ man: { ...cfg.man, maxDias: v } }); }} /></label>
              <label>Parada provável a partir de (h de turno)<input className="ctl" type="number" min={1} max={72} defaultValue={cfg.man.suspH} onBlur={(e) => { const v = num(e.target.value, 1, 72, cfg.man.suspH); if (v !== cfg.man.suspH) config.update({ man: { ...cfg.man, suspH: v } }); }} /></label>
            </div>
            <p className="meta">Uma parada de manutenção fica aberta até o próximo apontamento produtivo da máquina, no máximo pelo limite acima. Uma parada comum vira <i>provável manutenção</i> quando a máquina fica esse tempo de turno sem produzir e o operador aparece em outra máquina.</p>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="ph"><h2>Backup e alterações</h2><span className="meta">{changed.length ? `alterado neste navegador: ${changed.length} parte${changed.length > 1 ? 's' : ''}` : 'nenhuma alteração além dos padrões'}</span></div>
        <div className="pb">
          <div className="row">
            <button type="button" className="btn" onClick={exportCfg}>Exportar configuração</button>
            <button type="button" className="btn" onClick={() => file.current?.click()}>Importar configuração</button>
            <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => importCfg(e.target.files?.[0])} />
            {Object.keys(cfg.evt).length > 0 && <button type="button" className="btn" onClick={() => config.restore('evt')}>Limpar {Object.keys(cfg.evt).length} decisões sobre paradas</button>}
            <button type="button" className="btn no" onClick={() => { config.reset(); setMsg({ ok: true, text: 'Configuração restaurada ao padrão.' }); }} disabled={!Object.keys(saved).some((k) => k !== 'savedAt')}>Restaurar o padrão</button>
          </div>
          <p className="meta" style={{ marginTop: 10 }}>As alterações (calendário, escala, HE, paradas, carteira, metas e motivos) ficam salvas neste navegador. Exporte para levar a outro computador ou guardar uma versão.</p>
          {msg && <p className={msg.ok ? 'note' : 'note warn'} role="status">{msg.text}</p>}
        </div>
      </section>

      <section className="panel">
        <div className="ph"><h2>Cadastro das máquinas</h2><span className="meta">grupo e disponibilidade; turnos e escala ficam no Calendário fabril</span></div>
        <div className="pb tw" style={{ maxHeight: 560 }}>
          <table className="t">
            <thead><tr><th>Máquina</th><th>Grupo</th><th className="n">Disponibilidade (%)</th></tr></thead>
            <tbody>{machines.map((m) => {
              const mc = engine.machCfg(m.rc);
              return (
                <tr key={m.rc}>
                  <td><i className="dot" style={{ background: groupColor(mc.grp) }} /><b>{m.name}</b> <span className="code">{m.rc}</span></td>
                  <td><select className="ctl" aria-label={`Grupo de ${m.name}`} value={mc.grp} onChange={(e) => setMach(m.rc, { grp: e.target.value })}>{engine.constants.GRP_ORDER.map((g) => <option key={g}>{g}</option>)}</select></td>
                  <td className="n"><input className="ctl num" type="number" min={0} max={100} aria-label={`Disponibilidade de ${m.name}`} defaultValue={mc.disp} onBlur={(e) => { const v = num(e.target.value, 0, 100, mc.disp); if (v !== mc.disp) setMach(m.rc, { disp: v }); }} /></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="ph"><h2>Motivos de parada</h2><span className="meta">a categoria decide se a parada conta como manutenção ou improdutivo</span></div>
        <div className="pb tw" style={{ maxHeight: 620 }}>
          <table className="t">
            <thead><tr><th className="n">Código</th><th className="n">Horas</th><th className="n">Ocorr.</th><th className="n">Na máquina</th><th>Nome do motivo</th><th>Categoria</th></tr></thead>
            <tbody>{reasons.map((o) => (
              <tr key={o.code}>
                <td className="n code"><b>{o.code}</b></td><td className="n">{hours1(o.min)}</td><td className="n">{int(o.n)}</td><td className="n">{pct(o.min ? o.direct / o.min : null)}</td>
                <td><input className="ctl wide" aria-label={`Nome do motivo ${o.code}`} defaultValue={cfg.motivos[o.code]?.n ?? ''} placeholder="Ex.: Aguardando material" onBlur={(e) => e.target.value !== (cfg.motivos[o.code]?.n ?? '') && setMot(o.code, { n: e.target.value })} /></td>
                <td><select className="ctl" aria-label={`Categoria do motivo ${o.code}`} value={engine.motCat(o.code)} onChange={(e) => setMot(o.code, { c: e.target.value })}>{engine.constants.CATS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="ph"><h2>Base de dados</h2></div>
        <div className="pb">
          <p>{int(engine.dataset.nAll)} apontamentos · {int(engine.dataset.prod.length)} de produção em usinagem · {int(engine.dataset.stops.length)} paradas ligadas à usinagem · {int(engine.dataset.nAll - engine.dataset.prod.length - engine.dataset.stops.length)} fora do escopo dos indicadores.</p>
          <p className="meta">Período de {engine.util.fmtDT(engine.dataset.minPd * 1440 + engine.constants.DAY0)} a {engine.util.fmtDT(engine.dataset.lastT)} · {Object.keys(engine.dataset.machines).length} recursos · base SQLite fictícia carregada no navegador.</p>
        </div>
      </section>
    </>
  );
}
