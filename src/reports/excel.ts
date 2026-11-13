import type ExcelJSType from 'exceljs';
import { stopPareto } from '../analytics/dashboard';
import type { AggResult, Engine } from '../engine';

type ExcelJS = typeof ExcelJSType;
export interface ReportContext { title: string; scope: string; period: string; issued: string }

const BRAND = 'FF1D5FB4', SOFT = 'FFE8F0FA', INK = 'FF0E1D2C', MUTED = 'FF6B7C8D', LINE = 'FFE1E7EE';
const thin = { style: 'thin' as const, color: { argb: LINE } };
const h = (min: number) => (min || 0) / 60;

/**
 * Relatório de performance em Excel. Os valores vão em horas sem arredondar (o formato da célula mostra uma casa)
 * e utilização, status, subtotais e total são fórmulas: quem abre a planilha consegue auditar a conta.
 * Recebe o módulo exceljs por parâmetro para poder ser carregado sob demanda no navegador e testado no Node.
 */
export function performanceWorkbook(X: ExcelJS, engine: Engine, A: AggResult, ctx: ReportContext) {
  const wb = new X.Workbook();
  wb.creator = 'PULSO · Gabriel Januário'; wb.created = new Date();
  const meta = engine.config.meta / 100, alert = engine.config.alerta / 100, T = A.T;

  const header = (ws: ExcelJSType.Worksheet, cols: number, sub?: string) => {
    const last = ws.getColumn(cols).letter;
    ws.mergeCells(`A1:${last}1`); ws.mergeCells(`A2:${last}2`); ws.mergeCells(`A3:${last}3`);
    ws.getCell('A1').value = `PULSO · ${ctx.title}`; ws.getCell('A1').font = { bold: true, size: 15, color: { argb: INK } };
    ws.getCell('A2').value = `${ctx.scope} · ${ctx.period}`; ws.getCell('A2').font = { size: 10, color: { argb: MUTED } };
    ws.getCell('A3').value = `Emitido em ${ctx.issued}${sub ? ` · ${sub}` : ''} · dados fictícios · Desenvolvido por Gabriel Januário`; ws.getCell('A3').font = { size: 9, color: { argb: MUTED } };
    ws.getRow(1).height = 24;
    for (let c = 1; c <= cols; c++) ws.getCell(4, c).border = { bottom: { style: 'medium', color: { argb: BRAND } } };
    ws.getRow(4).height = 6;
  };
  const head = (ws: ExcelJSType.Worksheet, row: number, values: string[]) => {
    const r = ws.getRow(row); r.values = values; r.height = 30;
    r.eachCell((c) => { c.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } }; c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; });
  };
  const sheet = (name: string, widths: number[], landscape = true) => {
    const ws = wb.addWorksheet(name, { views: [{ showGridLines: false, state: 'frozen', ySplit: 6 }], pageSetup: { paperSize: 9, orientation: landscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '6:6' } });
    ws.columns = widths.map((width) => ({ width }));
    return ws;
  };
  const status = (cap: string, util: string) => ({ formula: `IF(${cap}=0,"Sem capacidade",IF(${util}>=${meta},"No alvo",IF(${util}>=${alert},"Atenção","Crítico")))` });
  const statusColors = (ws: ExcelJSType.Worksheet, ref: string) => ws.addConditionalFormatting({ ref, rules: [
    { type: 'containsText', operator: 'containsText', text: 'No alvo', priority: 1, style: { font: { color: { argb: 'FF1F8A4C' }, bold: true }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFE5F4EA' } } } },
    { type: 'containsText', operator: 'containsText', text: 'Atenção', priority: 2, style: { font: { color: { argb: 'FF9A6200' }, bold: true }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFDF3DC' } } } },
    { type: 'containsText', operator: 'containsText', text: 'Crítico', priority: 3, style: { font: { color: { argb: 'FFC0392B' }, bold: true }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFBE6E5' } } } },
  ] });

  /* ---- Resumo ---- */
  const ws = sheet('Resumo', [38, 18, 52], false);
  header(ws, 3);
  head(ws, 6, ['Indicador', 'Valor', 'Definição']);
  const kpis: [string, number | { formula: string }, string, string][] = [
    ['Capacidade fixa (h)', h(T.cap), '#,##0.0', 'Turnos validados na escala × dias úteis do calendário × disponibilidade'],
    ['Produção na escala (h)', h(T.fixedProd), '#,##0.0', 'Produção dentro da capacidade fixa (numerador da utilização)'],
    ['Utilização', { formula: 'IF(B7=0,"",B8/B7)' }, '0.0%', 'Produção na escala ÷ capacidade fixa'],
    ['Meta de utilização', meta, '0%', 'Configurável em Configurações'],
    ['Produção total (h)', h(T.union), '#,##0.0', 'União dos intervalos apontados: apontamentos simultâneos contam uma vez'],
    ['Hora extra realizada (h)', h(T.heAp), '#,##0.0', 'Produção dentro das janelas de HE (lançadas ou inferidas do histórico)'],
    ['Improdutivo apontado (h)', h(T.stop), '#,##0.0', 'Paradas não ligadas a manutenção'],
    ['Manutenção real (h)', h(T.manR), '#,##0.0', 'Capacidade dentro dos eventos de manutenção (até o retorno à produção)'],
    ['Capacidade sem apontamento (h)', h(T.gap), '#,##0.0', 'Capacidade fixa sem produção nem parada registrada'],
    ['Recursos', A.list.length, '0', 'Máquinas de usinagem com capacidade ou apontamento no período'],
  ];
  kpis.forEach(([k, v, fmt, d], i) => {
    const r = ws.getRow(7 + i); r.values = [k, v as ExcelJSType.CellValue, d];
    r.getCell(2).numFmt = fmt; r.getCell(1).font = { bold: true, size: 10 }; r.getCell(3).font = { size: 9, color: { argb: MUTED } };
    r.getCell(3).alignment = { wrapText: true, vertical: 'middle' };
    r.eachCell((c) => { c.border = { bottom: thin }; });
  });
  ws.getCell('B9').font = { bold: true, size: 12, color: { argb: BRAND } };

  /* ---- Recursos (com subtotais por grupo) ---- */
  const wr = sheet('Recursos', [40, 10, 20, 13, 12, 13, 12, 13, 14, 13, 13, 14, 8]);
  header(wr, 13, 'utilização, status, subtotais e total são fórmulas');
  head(wr, 6, ['Recurso', 'Código', 'Grupo', 'Capacidade fixa (h)', 'HE lançada (h)', 'Produção na escala (h)', 'Produção total (h)', 'Utilização', 'Status', 'Improdutivo (h)', 'Manutenção real (h)', 'Sem apontamento (h)', 'OPs']);
  let r = 7; const subtotals: number[] = [];
  const fmt = (row: number) => { for (const c of [4, 5, 6, 7, 10, 11, 12]) wr.getCell(row, c).numFmt = '#,##0.0'; wr.getCell(row, 8).numFmt = '0.0%'; for (let c = 1; c <= 13; c++) wr.getCell(row, c).border = { bottom: thin }; wr.getCell(row, 9).alignment = { horizontal: 'center' }; };
  for (const g of A.G) {
    wr.mergeCells(`A${r}:M${r}`);
    const gc = wr.getCell(`A${r}`); gc.value = g.g.toUpperCase(); gc.font = { bold: true, size: 9, color: { argb: BRAND } }; gc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } };
    r++;
    const r0 = r;
    for (const a of [...g.list].sort((x, y) => (y.util ?? -1) - (x.util ?? -1))) {
      wr.getRow(r).values = [a.m.name, a.m.rc, a.grp, h(a.cap), h(a.capHE), h(a.fixedProd), h(a.union), { formula: `IF(D${r}=0,"",F${r}/D${r})` }, status(`D${r}`, `H${r}`), h(a.stop), h(a.manR), h(a.gap), a.ords.size];
      fmt(r); r++;
    }
    const S = (c: string) => ({ formula: `SUM(${c}${r0}:${c}${r - 1})` });
    wr.getRow(r).values = [`Subtotal ${g.g}`, '', '', S('D'), S('E'), S('F'), S('G'), { formula: `IF(D${r}=0,"",F${r}/D${r})` }, status(`D${r}`, `H${r}`), S('J'), S('K'), S('L'), g.ords.size];
    wr.getRow(r).font = { bold: true, size: 10, color: { argb: 'FF475A6C' } }; fmt(r); subtotals.push(r); r++;
  }
  const sumOf = (c: string) => ({ formula: subtotals.length ? `SUM(${subtotals.map((x) => c + x).join(',')})` : '0' });
  wr.getRow(r).values = ['TOTAL', '', '', sumOf('D'), sumOf('E'), sumOf('F'), sumOf('G'), { formula: `IF(D${r}=0,"",F${r}/D${r})` }, status(`D${r}`, `H${r}`), sumOf('J'), sumOf('K'), sumOf('L'), T.ords.size];
  wr.getRow(r).font = { bold: true, size: 10.5, color: { argb: INK } }; fmt(r);
  for (let c = 1; c <= 13; c++) wr.getCell(r, c).border = { top: { style: 'medium', color: { argb: INK } }, bottom: { style: 'medium', color: { argb: INK } } };
  const lastRes = r;
  statusColors(wr, `I7:I${lastRes}`);
  wr.addConditionalFormatting({ ref: `H7:H${lastRes}`, rules: [{ type: 'dataBar', priority: 4, minLength: 0, maxLength: 100, cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: { argb: 'FF2A78D6' }, gradient: false } as unknown as ExcelJSType.ConditionalFormattingRule] });

  /* ---- Diário ---- */
  const wd = sheet('Diário', [13, 9, 14, 14, 14, 12, 14, 14, 14]);
  header(wd, 9);
  head(wd, 6, ['Data', 'Dia', 'Capacidade fixa (h)', 'Produção na escala (h)', 'Produção total (h)', 'Utilização', 'Improdutivo (h)', 'Manutenção real (h)', 'HE realizada (h)']);
  const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  A.dayT.forEach((d, i) => {
    const row = 7 + i, dt = new Date(`${d.d}T12:00:00Z`);
    wd.getRow(row).values = [dt, WD[dt.getUTCDay()], h(d.cap), h(d.fixedProd), h(d.union), { formula: `IF(C${row}=0,"",D${row}/C${row})` }, h(d.stop), h(d.manR), h(d.heAp)];
    wd.getCell(row, 1).numFmt = 'dd/mm/yyyy'; for (const c of [3, 4, 5, 7, 8, 9]) wd.getCell(row, c).numFmt = '#,##0.0'; wd.getCell(row, 6).numFmt = '0.0%';
    for (let c = 1; c <= 9; c++) wd.getCell(row, c).border = { bottom: thin };
  });
  const dl = 6 + A.dayT.length, tr = dl + 1;
  wd.getRow(tr).values = ['Total', '', ...['C', 'D', 'E'].map((c) => ({ formula: `SUM(${c}7:${c}${dl})` })), { formula: `IF(C${tr}=0,"",D${tr}/C${tr})` }, ...['G', 'H', 'I'].map((c) => ({ formula: `SUM(${c}7:${c}${dl})` }))];
  wd.getRow(tr).font = { bold: true }; for (const c of [3, 4, 5, 7, 8, 9]) wd.getCell(tr, c).numFmt = '#,##0.0'; wd.getCell(tr, 6).numFmt = '0.0%';
  wd.addConditionalFormatting({ ref: `F7:F${dl}`, rules: [{ type: 'colorScale', priority: 5, cfvo: [{ type: 'num', value: alert }, { type: 'num', value: meta }], color: [{ argb: 'FFFBE6E5' }, { argb: 'FFE5F4EA' }] } as unknown as ExcelJSType.ConditionalFormattingRule] });

  /* ---- Paradas ---- */
  const wp = sheet('Paradas', [44, 22, 13, 12, 11, 12, 10], false);
  header(wp, 7, 'pareto dos motivos de parada ligados a uma máquina');
  head(wp, 6, ['Motivo', 'Categoria', 'Horas', '% do total', '% acumulado', 'Ocorrências', 'Máquinas']);
  const P = stopPareto(A, engine, 999), cats = Object.fromEntries(engine.constants.CATS);
  const pl = 6 + P.length;
  P.forEach((o, i) => {
    const row = 7 + i;
    wp.getRow(row).values = [o.name, o.code != null ? cats[engine.motCat(o.code)] ?? '' : '', h(o.minutes), { formula: `C${row}/SUM($C$7:$C$${pl})` }, { formula: `SUM($C$7:C${row})/SUM($C$7:$C$${pl})` }, o.count, o.machines];
    wp.getCell(row, 3).numFmt = '#,##0.0'; wp.getCell(row, 4).numFmt = '0.0%'; wp.getCell(row, 5).numFmt = '0.0%';
    if (o.vital) wp.getCell(row, 1).font = { bold: true };
    for (let c = 1; c <= 7; c++) wp.getCell(row, c).border = { bottom: thin };
  });

  /* ---- Memória de cálculo ---- */
  const wm = wb.addWorksheet('Memória de cálculo', { views: [{ showGridLines: false }] });
  wm.columns = [{ width: 30 }, { width: 100 }];
  header(wm, 2);
  const rules: [string, string][] = [
    ['Dia produtivo', 'Das 06:00 às 06:00 do dia seguinte: o 2º turno que passa da meia-noite pertence ao dia em que começou.'],
    ['Capacidade fixa', 'Horas líquidas dos turnos marcados na escala validada do mês, nos dias úteis do calendário, × disponibilidade da máquina. Recurso sem escala validada não tem capacidade fixa.'],
    ['Produção', 'União dos intervalos apontados na máquina: dois operadores no mesmo intervalo contam uma vez.'],
    ['Utilização', 'Produção dentro da capacidade fixa ÷ capacidade fixa. Hora extra não infla a utilização.'],
    ['Manutenção real', 'O evento abre no apontamento de manutenção e fecha no próximo apontamento produtivo (limite de dias configurável). Conta a capacidade de turno dentro do evento.'],
    ['Destino da capacidade', 'Cada minuto de capacidade fixa recebe um destino, nesta ordem: manutenção, sem cobertura, produção, improdutivo, sem programação, sem apontamento.'],
    ['Corte da base', 'A capacidade só é contada até o último apontamento da base, para não penalizar um relatório tirado no meio do dia.'],
    ['Status', `No alvo ≥ ${engine.config.meta}% · atenção entre ${engine.config.alerta}% e ${engine.config.meta}% · crítico abaixo de ${engine.config.alerta}%.`],
  ];
  head(wm, 6, ['Regra', 'Como o PULSO calcula']);
  rules.forEach(([k, v], i) => { const row = wm.getRow(7 + i); row.values = [k, v]; row.getCell(1).font = { bold: true }; row.getCell(2).alignment = { wrapText: true, vertical: 'top' }; row.height = 32; });
  return wb;
}

/** Gera o .xlsx no navegador (exceljs é carregado só quando o usuário pede). */
export async function downloadPerformanceWorkbook(engine: Engine, A: AggResult, ctx: ReportContext, filename: string) {
  const X = (await import('exceljs')).default;
  const buf = await performanceWorkbook(X, engine, A, ctx).xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
