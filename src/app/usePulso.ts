import { useEffect, useState } from 'react';
import type { Database } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { openDatabase } from '../db/client';
import { loadRawDataset } from '../db/dataset';
import { createEngine, type Engine } from '../engine';

export interface Pulso { db: Database; engine: Engine }
type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; pulso: Pulso };

/** Baixa o banco SQLite, abre no navegador e monta o motor de indicadores. */
export function usePulso(): State {
  const [state, setState] = useState<State>({ status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    let database: Database | undefined;
    (async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}pulso.db`, { signal: controller.signal });
        if (!res.ok) throw new Error(`Não foi possível baixar o banco de dados (HTTP ${res.status}).`);
        const db = await openDatabase(new Uint8Array(await res.arrayBuffer()), wasmUrl);
        if (controller.signal.aborted) { db.close(); return; }
        database = db;
        const engine = createEngine(loadRawDataset(db));
        setState({ status: 'ready', pulso: { db, engine } });
      } catch (err) {
        database?.close();
        database = undefined;
        if (!controller.signal.aborted) setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => { controller.abort(); database?.close(); };
  }, []);
  return state;
}
