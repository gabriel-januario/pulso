import { useMemo, useState } from 'react';
import { monthLong } from '../../analytics/period';
import { downloadPerformanceWorkbook } from '../../reports/excel';
import { dmy } from '../format';
import { LossesDoc, OvertimeDoc, PerformanceDoc, PortfolioDoc, ReportFrame, REPORTS, type ReportKind } from '../reports/ReportDocs';
import type { ViewProps } from './types';

const issuedNow = () => { const d = new Date(); return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`; };

/** Relatórios: documento A4 pronto para PDF (impressão do navegador) e planilha Excel com fórmulas. */
export function Reports({ pulso, filters }: ViewProps) {
  const { engine } = pulso;
  const { range, grp } = filters.state;
  const [kind, setKind] = useState<ReportKind>(() => (new URLSearchParams(location.hash.split('?')[1]).get('rel') as ReportKind) || 'performance');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const A = useMemo(() => engine.agg({ ...range, grp }), [engine, range, grp]);
  const R = REPORTS.find((r) => r.kind === kind)!;
  const scopeName = grp === 'all' ? 'Usinagem · todos os grupos' : grp;
  const period = `Período ${dmy(range.from)} a ${dmy(range.to)}`;
  const ym = range.to.slice(0, 7);
  const scope = R.scope === 'period' ? [scopeName, period + (A.cutIn ? ` · dados até ${engine.util.fmtDT(A.cut)}` : '')] : R.scope === 'month' ? ['Usinagem', monthLong(ym)] : ['Carteira de pedidos', `Base até ${dmy(engine.util.s2iso(engine.dataset.maxPd))}`];
  const issued = useMemo(issuedNow, [kind, range, grp]);
  const file = `PULSO_${R.title.split(':')[0].replace(/\s+/g, '_')}_${range.from}_${range.to}`;

  const pdf = () => {
    const t = document.title;
    document.title = file;
    addEventListener('afterprint', () => { document.title = t; }, { once: true });
    print();
  };
  const excel = async () => {
    setBusy(true); setErr('');
    try { await downloadPerformanceWorkbook(engine, A, { title: R.title, scope: scopeName, period, issued }, `${file}.xlsx`); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Não foi possível gerar o Excel.'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <section className="rcat no-print" aria-label="Relatórios disponíveis">
        {REPORTS.map((r) => (
          <button key={r.kind} type="button" className={r.kind === kind ? 'rcard on' : 'rcard'} aria-pressed={r.kind === kind} onClick={() => setKind(r.kind)}>
            <b>{r.title}</b><span>{r.text}</span>
            <small>{r.scope === 'period' ? 'usa o período e o grupo do topo' : r.scope === 'month' ? 'mês do fim do período' : 'carteira atual'}{r.excel ? ' · PDF e Excel' : ' · PDF'}</small>
          </button>
        ))}
      </section>
      <section className="panel tbar no-print">
        <span className="meta">Pré-visualização em A4. O PDF sai pela impressão do navegador: escolha <b>Salvar como PDF</b>.</span>
        <div className="row">
          {R.excel && <button type="button" className="btn" onClick={excel} disabled={busy}>{busy ? 'Gerando…' : 'Exportar Excel'}</button>}
          <button type="button" className="btn pri" onClick={pdf}>Gerar PDF</button>
        </div>
        {err && <p className="note warn" role="alert">{err}</p>}
      </section>
      <div className="rwrap">
        <ReportFrame title={R.title} scope={scope} issued={issued}>
          {kind === 'performance' && <PerformanceDoc engine={engine} A={A} />}
          {kind === 'perdas' && <LossesDoc engine={engine} A={A} />}
          {kind === 'he' && <OvertimeDoc engine={engine} ym={ym} />}
          {kind === 'carteira' && <PortfolioDoc engine={engine} />}
        </ReportFrame>
      </div>
    </>
  );
}
