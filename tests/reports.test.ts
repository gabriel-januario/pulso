import ExcelJS from 'exceljs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Engine } from '../src/engine';
import { performanceWorkbook } from '../src/reports/excel';
import { loadTestEngine } from './helpers';

/* O Excel precisa fechar com os mesmos números das telas. Gera o arquivo, relê e confere. */
let engine: Engine;
beforeAll(async () => { engine = (await loadTestEngine()).engine; });

describe('relatório de performance em Excel', () => {
  it('abas, totais por recurso e pareto batem com o motor', async () => {
    const A = engine.agg({ from: '2026-10-01', to: '2026-10-31' });
    const wb = performanceWorkbook(ExcelJS, engine, A, { title: 'Relatório de performance', scope: 'Usinagem', period: 'Outubro 2026', issued: '13/11/2026' });
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(await wb.xlsx.writeBuffer());
    expect(back.worksheets.map((w) => w.name)).toEqual(['Resumo', 'Recursos', 'Diário', 'Paradas', 'Memória de cálculo']);

    const res = back.getWorksheet('Recursos')!;
    let cap = 0, fixed = 0, n = 0;
    res.eachRow((row, i) => {
      if (i < 7 || typeof row.getCell(4).value !== 'number' || !row.getCell(2).value) return;
      cap += row.getCell(4).value as number; fixed += row.getCell(6).value as number; n++;
      expect((row.getCell(8).value as { formula: string }).formula).toBe(`IF(D${i}=0,"",F${i}/D${i})`);
    });
    expect(n).toBe(A.list.length);
    expect(cap).toBeCloseTo(A.T.cap / 60, 6);
    expect(fixed).toBeCloseTo(A.T.fixedProd / 60, 6);

    const day = back.getWorksheet('Diário')!;
    let dc = 0; for (let i = 7; i < 7 + A.dayT.length; i++) dc += day.getCell(i, 3).value as number;
    expect(dc).toBeCloseTo(A.T.cap / 60, 6);

    const par = back.getWorksheet('Paradas')!;
    let ph = 0; par.eachRow((row, i) => { if (i >= 7) ph += row.getCell(3).value as number; });
    expect(ph).toBeCloseTo(A.stops.filter((s) => s.mach).reduce((q, s) => q + s.mp, 0) / 60, 4);
  });
});
