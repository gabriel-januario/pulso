import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../src/db/client';
import { loadRawDataset } from '../src/db/dataset';
import { createEngine } from '../src/engine';

const dbPath = fileURLToPath(new URL('../public/pulso.db', import.meta.url));

export async function openTestDb() {
  return openDatabase(new Uint8Array(readFileSync(dbPath)));
}

export async function loadTestEngine() {
  const db = await openTestDb();
  const raw = loadRawDataset(db);
  return { db, raw, engine: createEngine(raw) };
}
