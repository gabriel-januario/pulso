import { useCallback, useState } from 'react';
import type { Engine, EngineConfig } from '../engine';

/** Partes da configuração que o usuário altera pelas telas e que ficam salvas neste navegador. */
type Editable = Pick<EngineConfig, 'paradas' | 'evt' | 'cart'>;
const KEY = 'pulso-v3-config';

export interface ConfigApi {
  /** muda a cada alteração; as telas usam como chave para recalcular */
  version: number;
  update(patch: Partial<Editable>): void;
  reset(): void;
  /** descarta as edições de uma parte e volta ao que veio da base */
  restore(key: keyof Editable): void;
}

const read = (): Partial<Editable> => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Editable>; } catch { return {}; }
};
const write = (v: Partial<Editable>) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* armazenamento indisponível: segue só em memória */ } };

/** Aplica a configuração salva no motor e devolve a API para alterá-la. */
export function useConfig(engine: Engine, defaults: Partial<Editable> = {}): ConfigApi {
  const [version, setVersion] = useState(() => {
    engine.setConfig({ ...engine.config, ...defaults, ...read() });
    return 0;
  });
  const update = useCallback((patch: Partial<Editable>) => {
    const next = { ...read(), ...patch };
    write(next);
    engine.setConfig({ ...engine.config, ...patch });
    setVersion((v) => v + 1);
  }, [engine]);
  const reset = useCallback(() => {
    write({});
    engine.setConfig({ ...engine.config, paradas: [], evt: {}, cart: {}, ...defaults });
    setVersion((v) => v + 1);
  }, [engine, defaults]);
  const restore = useCallback((key: keyof Editable) => {
    const saved = read();
    delete saved[key];
    write(saved);
    engine.setConfig({ ...engine.config, [key]: defaults[key] ?? (key === 'paradas' ? [] : {}) });
    setVersion((v) => v + 1);
  }, [engine, defaults]);
  return { version, update, reset, restore };
}
