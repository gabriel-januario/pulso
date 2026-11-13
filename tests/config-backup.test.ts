import { describe, expect, it } from 'vitest';
import { parseConfigBackup } from '../src/app/config-backup';
import { defaultConfig } from '../src/engine/core/config';

describe('backup de configuração', () => {
  it('aceita configurações exportadas e ignora metadados', () => {
    const { shifts, man } = defaultConfig();
    const config = { shifts, man, cart: { '123': { h: 10, due: '2028-02-29', done: true } } };
    expect(parseConfigBackup({ ...config, savedAt: '2026-11-13T11:00:00Z' })).toEqual(config);
  });

  it.each([
    { shifts: [null] }, { cart: { '123': null } }, { cart: { '123': { due: '2026-02-29' } } },
    { paradas: [null] }, { cal: { '2026-11-31': { t: 'util', sh: ['T1'] } } },
  ])('rejeita o backup integralmente quando uma seção é inválida: %j', (invalid) => {
    expect(() => parseConfigBackup({ meta: 90, ...invalid })).toThrow('Nenhuma alteração foi aplicada');
    expect(parseConfigBackup({ meta: 90, ...invalid }, true)).toEqual({ meta: 90 });
  });

  it('recupera uma configuração local nula ou sem seções reconhecidas', () => {
    expect(parseConfigBackup(null, true)).toEqual({});
    expect(() => parseConfigBackup({ savedAt: '2026-11-13' })).toThrow('Arquivo sem configuração');
  });
});
