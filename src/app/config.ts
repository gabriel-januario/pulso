import { useCallback, useState } from 'react';
import type { Engine, EngineConfig } from '../engine';

/**
 * Partes da configuração que o usuário altera pelas telas. Ficam salvas neste navegador, por cima dos padrões
 * do motor e da base (carteira de demonstração). Só o que foi alterado é gravado.
 */
export const EDITABLE = ['meta', 'alerta', 'corte', 'man', 'motivos', 'shifts', 'mach', 'cal', 'escala', 'ex', 'he', 'heOff', 'paradas', 'evt', 'cart'] as const;
export type Editable = Pick<EngineConfig, (typeof EDITABLE)[number]>;
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
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Editable>; } catch { return {}; }
};
const write = (v: Partial<Editable>) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* armazenamento indisponível: segue só em memória */ } };

/** Aplica a configuração salva no motor e devolve a API para alterá-la. */
export function useConfig(engine: Engine, defaults: Partial<Editable> = {}): ConfigApi {
  const [base] = useState(() => structuredClone(engine.config));
  const [version, setVersion] = useState(() => {
    engine.setConfig({ ...engine.config, ...defaults, ...read() });
    return 0;
  });
  const apply = useCallback((saved: Partial<Editable>) => {
    write(saved);
    engine.setConfig({ ...structuredClone(base), ...defaults, ...saved });
    setVersion((v) => v + 1);
  }, [engine, base, defaults]);
  const update = useCallback((patch: Partial<Editable>) => apply({ ...read(), ...patch }), [apply]);
  const reset = useCallback(() => apply({}), [apply]);
  const restore = useCallback((key: keyof Editable) => { const s = read(); delete s[key]; apply(s); }, [apply]);
  const saved = useCallback(() => ({ ...read(), savedAt: new Date().toISOString() }), []);
  const load = useCallback((input: unknown) => {
    if (!input || typeof input !== 'object') throw new Error('Arquivo sem configuração do PULSO.');
    const src = input as Record<string, unknown>, next: Record<string, unknown> = {};
    for (const k of EDITABLE) if (Object.hasOwn(src, k)) next[k] = src[k];
    if (!Object.keys(next).length) throw new Error('Arquivo sem configuração do PULSO.');
    apply(next as Partial<Editable>);
    return Object.keys(next);
  }, [apply]);
  return { version, update, reset, restore, saved, load };
}
