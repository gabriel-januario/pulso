import { useCallback, useRef, useState } from 'react';
import type { Engine } from '../engine';
import { parseConfigBackup, type Editable } from './config-backup';

const KEY = 'pulso-v3-config';

export interface ConfigApi {
  /** muda a cada alteração; as telas usam como chave para recalcular */
  version: number;
  update(patch: Partial<Editable>): void;
  /** volta tudo ao padrão (descarta todas as alterações deste navegador) */
  reset(): void;
  /** descarta as edições de uma parte e volta ao que veio da base */
  restore(key: keyof Editable): void;
  /** o que foi alterado neste navegador, para exportar */
  saved(): Partial<Editable> & { savedAt?: string };
  /** substitui as alterações pelas de um arquivo exportado; devolve as partes reconhecidas */
  load(input: unknown): string[];
}

const read = (): Partial<Editable> => {
  try { return parseConfigBackup(JSON.parse(localStorage.getItem(KEY) ?? '{}'), true); } catch { return {}; }
};
const write = (v: Partial<Editable>) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* armazenamento indisponível: segue só em memória */ } };

/** Aplica a configuração salva no motor e devolve a API para alterá-la. */
export function useConfig(engine: Engine, defaults: Partial<Editable> = {}): ConfigApi {
  const [base] = useState(() => structuredClone(engine.config));
  const savedState = useRef<Partial<Editable> | null>(null);
  if (savedState.current === null) savedState.current = read();
  const [version, setVersion] = useState(() => {
    engine.setConfig({ ...base, ...defaults, ...savedState.current });
    return 0;
  });
  const apply = useCallback((saved: Partial<Editable>) => {
    engine.setConfig({ ...structuredClone(base), ...defaults, ...saved });
    savedState.current = saved;
    write(saved);
    setVersion((v) => v + 1);
  }, [engine, base, defaults]);
  const update = useCallback((patch: Partial<Editable>) => apply({ ...savedState.current, ...patch }), [apply]);
  const reset = useCallback(() => apply({}), [apply]);
  const restore = useCallback((key: keyof Editable) => { const s = { ...savedState.current }; delete s[key]; apply(s); }, [apply]);
  const saved = useCallback(() => ({ ...savedState.current, savedAt: new Date().toISOString() }), []);
  const load = useCallback((input: unknown) => {
    const next = parseConfigBackup(input);
    apply(next);
    return Object.keys(next);
  }, [apply]);
  return { version, update, reset, restore, saved, load };
}
