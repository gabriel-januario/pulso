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
  heHist: number;
  operCap: number;
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
  /** pedido: item e origem do apontamento */
  item: number;
  org: string;
}

/** Um apontamento de parada. `mach` é a máquina (direta ou inferida pelo operador); `mp` são os minutos dentro do período. */
export interface StopRecord extends ProdRecord {
  mach: string | null;
  inf: boolean;
  cat: string;
  isMan: boolean;
  mp: number;
}

/** Parada de manutenção consolidada: abre no apontamento de manutenção e fecha no próximo apontamento produtivo. */
export interface MaintenanceEvent {
  rc: string;
  t0: number;
  end: number;
  open: boolean;
  /** o fim foi limitado pela regra de duração máxima */
  capped: boolean;
  /** apont = apontamento; conf = confirmada; cal = calendário; manual = quadro de paradas */
  src: 'apont' | 'conf' | 'cal' | 'manual';
  /** primeiro apontamento do operador em outra máquina durante a parada */
  mv: ProdRecord | null;
}
export interface MachineEvent { e: MaintenanceEvent; real: number; ap: number; ocult: number }

/**
 * Parada provável a confirmar: um improdutivo (não de manutenção) seguido de horas de turno sem produção,
 * enquanto o operador foi apontar em outra máquina.
 */
export interface SuspectStop { rc: string; t0: number; end: number; s: StopRecord; idle: number; mv: ProdRecord; key: string; open: boolean }

export interface CartEntry { h?: number; due?: string; done?: boolean; hide?: boolean; g?: string }

/** Parada registrada manualmente no quadro de máquinas paradas (datas em AAAA-MM-DDTHH:MM). */
export interface ManualStop { id: string; rc: string; ini: string; fim: string | null; tipo: string; obs: string }

/** Janela de capacidade (minutos absolutos); `c` é a capacidade líquida da janela e `he` marca hora extra. */
export interface CapacityWindow { a: number; b: number; c: number; he?: boolean }

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
  evs: MachineEvent[];
  peds: Set<number>;
  /** máquina com parada aberta no quadro */
  down: boolean;
  heHist: number;
  operCap: number;
  conflict: number;
  manual: number;
  /** apontamentos com mais de 10 h */
  long: ProdRecord[];
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
  /** todos os apontamentos de produção da base e os mesmos agrupados por operador (ordenados por início) */
  prod: ProdRecord[];
  byOp: Record<string, ProdRecord[]>;
  meta: RawDataset['meta'];
}

export interface EngineConfig {
  meta: number;
  alerta: number;
  shifts: { id: string; nome: string; ini: string; fim: string; int: number; h: number | null; def: boolean }[];
  motivos: Record<string, { n: string; c: string }>;
  /** quadro de paradas e decisões sobre paradas a confirmar ('m' = manutenção, 'x' = descartada) */
  paradas: ManualStop[];
  /** carteira: previsão por PV (horas previstas, entrega, concluído, oculto, grupo para PV sem apontamento) */
  cart: Record<string, CartEntry>;
  evt: Record<string, 'm' | 'x'>;
  man: { maxDias: number; suspH: number };
  [key: string]: unknown;
}

export interface Engine {
  readonly dataset: EngineDataset;
  readonly config: EngineConfig;
  setConfig(next: Partial<EngineConfig>): void;
  agg(opt: AggOptions): AggResult;
  status(util: number | null): Status;
  grpOf(rc: string): string;
  /** eventos de manutenção consolidados de toda a base e paradas a confirmar */
  buildEvents(): { ev: (MaintenanceEvent & { realAll: number; p?: ManualStop })[]; sus: SuspectStop[] };
  /** capacidade (min) da máquina dentro do intervalo absoluto [a, b) */
  capSeg(rc: string, a: number, b: number): number;
  /** capacidade do dia: n = turnos, he = hora extra, op = operacional (min) */
  capParts(rc: string, iso: string, noCut?: boolean): { n: number; he: number; op: number };
  /** janelas de capacidade do dia produtivo p (serial) */
  dayWins(rc: string, p: number): CapacityWindow[];
  /** fim da base em minutos absolutos (a capacidade não é contada depois disso) */
  readonly cutT: number;
  motName(code: number | string): string;
  motCat(code: number | string): string;
  constants: { DAY0: number; GRP_ORDER: string[]; MES: string[]; WD: string[]; CATS: [string, string][]; HOL: Record<string, string>; [key: string]: unknown };
  util: { s2iso(serial: number): string; iso2s(iso: string): number; title(s: string): string; shortNm(s: string): string; hhmm(t: number): string; fmtDT(t: number): string };
}
