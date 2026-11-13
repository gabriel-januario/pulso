/** Formato compacto da base de apontamentos lido pelo motor (mesmo layout do PULSO v2.2). */
export interface RawDataset {
  meta: { empresa: string; fonte: string };
  /** nomes dos operadores; o índice é o id */
  ops: string[];
  /** minutos produtivos de cada operador em todos os centros de recurso */
  opTot: number[];
  /** [código, nome, centro de recurso] */
  res: [string, string, string][];
  users: string[];
  /** [dia (serial Excel), minuto do dia, duração min, operador, chapa, origem, OP, PV, item, operação, recurso, centro de custo, usuário] */
  rows: RawRow[];
}
export type RawRow = [number, number, number, number, number, string, number, number, number, number, number, number, number];

export interface Machine {
  rc: string;
  name: string;
  raw: string;
  cr: string;
  fam: string;
  inat: boolean;
}

export interface AggOptions {
  /** AAAA-MM-DD (dia produtivo, 06:00 → 06:00) */
  from: string;
  to: string;
  /** nome do grupo de máquinas ou 'all' */
  grp?: string;
}

/** Indicadores em minutos; as mesmas chaves existem no total, por grupo, por máquina e por dia. */
export interface Measures {
  /** capacidade fixa (turnos validados) */
  cap: number;
  /** capacidade de hora extra lançada */
  capHE: number;
  /** minutos apontados (soma simples) */
  prod: number;
  /** minutos de máquina produzindo (apontamentos simultâneos contam uma vez) */
  union: number;
  /** produção dentro da capacidade fixa — numerador da utilização */
  fixedProd: number;
  /** produção em hora extra (lançada ou inferida) */
  heAp: number;
  /** improdutivo apontado */
  stop: number;
  /** manutenção: tempo real de máquina parada / tempo apontado */
  manR: number;
  manA: number;
  /** destino da capacidade fixa */
  used: number;
  accountStop: number;
  accountMaint: number;
  uncovered: number;
  noLoad: number;
  gap: number;
}

export interface Totals extends Measures {
  util: number | null;
  disp: number | null;
  ords: Set<number>;
  peds: Set<number>;
  active: number;
  n: number;
}

export interface DayTotals extends Measures {
  d: string;
  capP: number;
}

/** Um apontamento de produção em uma máquina de usinagem. Tempos em minutos absolutos. */
export interface ProdRecord {
  t0: number;
  min: number;
  /** dia produtivo (serial) e data AAAA-MM-DD */
  pd: number;
  date: string;
  /** nome do operador */
  op: string;
  rc: string;
  opn: number;
  ped: number;
  oper: number;
  manual: boolean;
}

/** Um apontamento de parada. `mach` é a máquina (direta ou inferida pelo operador); `mp` são os minutos dentro do período. */
export interface StopRecord extends ProdRecord {
  mach: string | null;
  inf: boolean;
  cat: string;
  isMan: boolean;
  mp: number;
}

export interface MachineAgg extends Measures {
  m: Machine;
  grp: string;
  util: number | null;
  disp: number | null;
  n: number;
  nDays: number;
  ords: Set<number>;
  ops: Set<string>;
  byDay: Record<string, Measures & { capP: number }>;
  /** apontamentos de produção no período */
  recs: ProdRecord[];
  stops: StopRecord[];
  /** manutenção oculta (tempo parado real além do apontado) */
  ocult: number;
}

export interface GroupAgg extends Measures {
  g: string;
  util: number | null;
  list: MachineAgg[];
  ords: Set<number>;
}

export interface AggResult {
  from: string;
  to: string;
  days: string[];
  T: Totals;
  dayT: DayTotals[];
  G: GroupAgg[];
  list: MachineAgg[];
  M: Record<string, MachineAgg>;
  workDays: number;
  stops: StopRecord[];
  /** início e fim do período em minutos absolutos, e o corte da base */
  F: number;
  T_: number;
  cut: number;
  /** verdadeiro quando o período passa do último apontamento da base */
  cutIn: boolean;
}

export type StatusKey = 'good' | 'warn' | 'crit' | 'none';
export interface Status { k: StatusKey; t: string }

export interface EngineDataset {
  machines: Record<string, Machine>;
  /** primeiro e último dia produtivo (serial) */
  minPd: number;
  maxPd: number;
  nAll: number;
  lastT: number;
  meta: RawDataset['meta'];
}

export interface EngineConfig {
  meta: number;
  alerta: number;
  shifts: { id: string; nome: string; ini: string; fim: string; int: number; h: number | null; def: boolean }[];
  motivos: Record<string, { n: string; c: string }>;
  [key: string]: unknown;
}

export interface Engine {
  readonly dataset: EngineDataset;
  readonly config: EngineConfig;
  setConfig(next: Partial<EngineConfig>): void;
  agg(opt: AggOptions): AggResult;
  status(util: number | null): Status;
  grpOf(rc: string): string;
  motName(code: number | string): string;
  motCat(code: number | string): string;
  constants: { DAY0: number; GRP_ORDER: string[]; MES: string[]; WD: string[]; [key: string]: unknown };
  util: { s2iso(serial: number): string; iso2s(iso: string): number; title(s: string): string; [key: string]: unknown };
}
