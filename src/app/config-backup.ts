import { isIsoDay } from '../analytics/period';
import type { EngineConfig } from '../engine';

type Obj = Record<string, unknown>;
type Check = (value: unknown) => boolean;
const object = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
const text: Check = (v) => typeof v === 'string';
const id: Check = (v) => typeof v === 'string' && v.length > 0;
const bool: Check = (v) => typeof v === 'boolean';
const number = (min: number, max = Infinity): Check => (v) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const oneOf = (...values: string[]): Check => (v) => typeof v === 'string' && values.includes(v);
const optional = (check: Check): Check => (v) => v === undefined || check(v);
const nullable = (check: Check): Check => (v) => v === null || check(v);
const list = (check: Check): Check => (v) => Array.isArray(v) && v.every(check);
const fields = (shape: Record<string, Check>): Check => (v) => object(v) && Object.entries(shape).every(([k, check]) => check(v[k]));
const safeKey: Check = (k) => typeof k === 'string' && !Object.hasOwn(Object.prototype, k) && k !== 'prototype';
const record = (check: Check, key: Check = safeKey): Check =>
  (v) => object(v) && Object.entries(v).every(([k, item]) => key(k) && check(item));
const month: Check = (v) => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const time: Check = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const dateTime: Check = (v) => typeof v === 'string' && v.length === 16 && v[10] === 'T' && isIsoDay(v.slice(0, 10)) && time(v.slice(11));
const shift = fields({ id, nome: text, ini: time, fim: time, int: number(0, 1440), h: nullable(number(0, 24)), def: bool });
const overtime: Check = (v) => {
  if (!object(v) || !fields({ id, alvo: id, sem: number(0), sab: number(0), dom: number(0), obs: optional(text) })(v)) return false;
  if (isIsoDay(v.ini) && isIsoDay(v.fim)) return v.ini <= v.fim;
  return !v.ini && !v.fim && isIsoDay(v.wk);
};
const stop: Check = (v) => object(v) && fields({ id, rc: id, ini: dateTime, fim: nullable(dateTime), tipo: text, obs: text })(v)
  && (v.fim === null || String(v.fim) > String(v.ini));

const checks = {
  meta: number(1, 150),
  alerta: number(0, 150),
  corte: oneOf('dados', 'dia'),
  man: fields({ maxDias: number(1, 60), suspH: number(1, 72) }),
  motivos: record(fields({ n: text, c: id })),
  shifts: (v: unknown) => Array.isArray(v) && v.length > 0 && v.every(shift) && new Set(v.map((s) => s.id)).size === v.length,
  mach: record(fields({ grp: optional(text), disp: optional(number(0, 100)), on: optional(bool), sh: optional(list(id)), src: optional(text) })),
  cal: record(fields({ t: oneOf('util', 'folga', 'fer', 'manut', 'extra'), sh: list(id) }), isIsoDay),
  escala: record(record(fields({
    modo: oneOf('fixo', 'compartilhado', 'eventual', 'sem_turno', 'inativo', 'pendente'),
    turnos: record(text), obs: text, crit: optional(bool), carga: optional(nullable(number(0))),
  })), month),
  ex: record(list(fields({
    id, rc: id, dst: optional(text), sh: id, tipo: oneOf('troca', 'operador', 'quebra', 'carga', 'apoio'),
    ini: optional(time), fim: optional((v) => v === '' || time(v)), coberta: optional(bool), obs: optional(text),
  })), isIsoDay),
  he: list(overtime),
  heOff: list(month),
  paradas: list(stop),
  evt: record(oneOf('m', 'x')),
  cart: record(fields({ h: optional(number(0, Number.MAX_SAFE_INTEGER / 60)), due: optional(isIsoDay), done: optional(bool), hide: optional(bool), g: optional(text) }),
    (k) => typeof k === 'string' && /^\d+$/.test(k)),
} satisfies Record<string, Check>;

export type Editable = Pick<EngineConfig, keyof typeof checks>;

export function parseConfigBackup(input: unknown, recover = false): Partial<Editable> {
  const valid: Obj = {};
  if (object(input)) {
    for (const [key, check] of Object.entries(checks)) {
      if (!Object.hasOwn(input, key)) continue;
      if (check(input[key])) valid[key] = input[key];
      else if (!recover) throw new Error(`Configuração inválida na seção “${key}”. Nenhuma alteração foi aplicada.`);
    }
  }
  if (!recover && !Object.keys(valid).length) throw new Error('Arquivo sem configuração do PULSO.');
  return valid as Partial<Editable>;
}
