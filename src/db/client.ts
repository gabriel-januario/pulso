import initSqlJs, { type Database } from 'sql.js';

/** Abre um arquivo SQLite em memória. No navegador, informe a URL do sql-wasm.wasm. */
export async function openDatabase(bytes: Uint8Array, wasmUrl?: string): Promise<Database> {
  const SQL = await initSqlJs(wasmUrl ? { locateFile: () => wasmUrl } : undefined);
  return new SQL.Database(bytes);
}

/** Executa uma consulta e devolve as linhas como objetos. */
export function query<T = Record<string, unknown>>(db: Database, sql: string, params: (string | number | null)[] = []): T[] {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const out: T[] = [];
    while (stmt.step()) out.push(stmt.getAsObject() as T);
    return out;
  } finally {
    stmt.free();
  }
}
