import { createEngine as createCore } from './core';
import type { Engine, EngineConfig, RawDataset } from './types';

export * from './types';

/**
 * Cria o motor de indicadores para uma base de apontamentos.
 * Cada instância guarda sua própria base, configuração e caches — não há estado global.
 */
export function createEngine(raw: RawDataset, config?: Partial<EngineConfig>, options?: { imported?: boolean }): Engine {
  return createCore(raw, config, options);
}

/** Primeiro e último dia (AAAA-MM-DD) do mês mais recente com dados. */
export function lastMonthRange(engine: Engine): { from: string; to: string } {
  const last = engine.util.s2iso(engine.dataset.maxPd);
  const [y, m] = last.split('-').map(Number);
  const end = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${last.slice(0, 7)}-01`, to: `${last.slice(0, 7)}-${String(end).padStart(2, '0')}` };
}
