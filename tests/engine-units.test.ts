import { describe, expect, it } from 'vitest';
import { mergeConfig, shiftMin } from '../src/engine/core/config';
import { intervalMinutes, mergedIntervals, outsideIntervals, windowMinutes } from '../src/engine/core/intervals';
import { dtl2min, hhmm, iso2s, s2iso, weekKey } from '../src/engine/core/time';

/* Peças puras do motor: aritmética de intervalos, datas e saneamento da configuração. */
describe('intervalos', () => {
  it('une sobreposições, ignora vazios e ordena', () => {
    expect(mergedIntervals([[30, 40], [0, 10], [5, 20], [20, 25], [50, 50]])).toEqual([[0, 25], [30, 40]]);
  });
  it('recorta o que fica fora de uma lista', () => {
    expect(outsideIntervals(0, 100, [[10, 20], [50, 60]])).toEqual([[0, 10], [20, 50], [60, 100]]);
    expect(outsideIntervals(0, 100, [[0, 100]])).toEqual([]);
  });
  it('soma minutos dentro de janelas que se sobrepõem sem contar duas vezes', () => {
    expect(intervalMinutes([[0, 60]], [{ a: 10, b: 30 }, { a: 20, b: 40 }])).toBe(30);
  });
  it('capacidade líquida proporcional ao trecho da janela', () => {
    // janela de 600 min com 480 min líquidos: metade da janela = 240 min
    expect(windowMinutes([{ a: 0, b: 600, c: 480 }], 300)).toBe(240);
  });
});

describe('datas', () => {
  it('série do Excel ida e volta', () => {
    expect(s2iso(iso2s('2026-10-15'))).toBe('2026-10-15');
    expect(iso2s('1900-01-01')).toBe(2);
  });
  it('semana começa na segunda e horário vira minutos absolutos', () => {
    expect(weekKey('2026-11-15')).toBe('2026-11-09');
    expect(hhmm(dtl2min('2026-11-13T16:48')!)).toBe('16:48');
  });
});

describe('configuração', () => {
  it('completa com os padrões e descarta entradas inválidas', () => {
    const c = mergeConfig({ meta: '90', cal: { 'x': { t: 'folga' }, '2026-11-13': { t: 'folga', sh: [1, 'T1'] } }, escala: { '2026-13': {}, '2026-11': { A: { modo: 'nada' }, B: { modo: 'fixo', turnos: { T1: 123, Z9: '' } } } } });
    expect(c.meta).toBe(90);
    expect(c.alerta).toBe(65);
    expect(c.cal).toEqual({ '2026-11-13': { t: 'folga', sh: ['T1'] } });
    expect(c.escala).toEqual({ '2026-11': { B: { modo: 'fixo', turnos: { T1: '123' }, obs: '', crit: false, carga: null } } });
  });
  it('migra versão antiga: sábado marcado como hora extra vira lançamento de HE', () => {
    const c = mergeConfig({ v: 2, cal: { '2026-11-14': { t: 'extra', sh: ['T1'] } } });
    expect(c.cal['2026-11-14']).toBeUndefined();
    expect(c.he).toMatchObject([{ wk: '2026-11-09', alvo: 'all', sab: 8, dom: 0 }]);
  });
  it('horas líquidas do turno: campo h ou janela menos intervalo', () => {
    expect(shiftMin({ id: 'X', nome: '', ini: '07:00', fim: '16:48', int: 60, h: null, def: true })).toBe(528);
    expect(shiftMin({ id: 'X', nome: '', ini: '07:00', fim: '16:48', int: 60, h: 8, def: true })).toBe(480);
  });
});
