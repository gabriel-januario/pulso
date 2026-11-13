import { useCallback, useState } from 'react';
import type { Engine, EngineConfig } from '../engine';

/** Partes da configuração que o usuário altera pelas telas e que ficam salvas neste navegador. */
type Editable = Pick<EngineConfig, 'paradas' | 'evt'>;
const KEY = 'pulso-v3-config';

export interface ConfigApi {
  /** muda a cada alteração; as telas usam como chave para recalcular */
  version: number;
  update(patch: Partial<Editable>): void;
  reset(): void;
}

const read = (): Partial<Editable> => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Editable>; } catch { return {}; }
};
const write = (v: Partial<Editable>) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* armazenamento indisponível: segue só em memória */ } };

/** Aplica a configuração salva no motor e devolve a API para alterá-la. */
export function useConfig(engine: Engine): ConfigApi {
  const [version, setVersion] = useState(() => {
    const saved = read();
    if (Object.keys(saved).length) engine.setConfig({ ...engine.config, ...saved });
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
    engine.setConfig({ ...engine.config, paradas: [], evt: {} });
    setVersion((v) => v + 1);
  }, [engine]);
  return { version, update, reset };
}
