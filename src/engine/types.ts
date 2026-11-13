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
  /** HE inferida do histórico no dia (min) */
  heHist: number;
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
  /** matrícula (chapa) do operador; 0 quando não informada */
  chapa: number;
}

/** Um apontamento de parada. `mach` é a máquina (direta ou inferida pelo operador); `mp` são os minutos dentro do período. */
/** parada da base: máquina direta ou inferida pela máquina em que o operador produzia */
export interface StopBase extends ProdRecord {
  mach: string | null;
  inf: boolean;
}
/** parada dentro de um período: categoria efetiva (com as decisões do usuário) e minutos no período */
export interface StopRecord extends StopBase {
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
export interface SuspectStop { rc: string; t0: number; end: number; s: StopBase; idle: number; mv: ProdRecord; key: string; open: boolean }

export type DayType = 'util' | 'folga' | 'fer' | 'manut' | 'extra';
export interface DayConfig { t: DayType; sh: string[] }
export type RosterMode = 'fixo' | 'compartilhado' | 'eventual' | 'sem_turno' | 'inativo' | 'pendente';
/** escala do mês: modo, turnos cobertos (com a chapa do titular, opcional), carga programada e criticidade */
export interface RosterEntry { modo: RosterMode; turnos: Record<string, string>; obs: string; crit?: boolean; carga?: number | null }
export type ExceptionType = 'troca' | 'operador' | 'quebra' | 'carga' | 'apoio';
export interface CalendarException { id: string; tipo: ExceptionType; rc: string; dst?: string; sh: string; ini?: string; fim?: string; coberta?: boolean; obs?: string }
/** hora extra por período: sem = h no período (seg–sex), sab/dom = h em cada sábado/domingo; alvo 'all', 'g:grupo' ou 'm:recurso' */
export interface OvertimeEntry { id: string; ini: string; fim: string; wk?: string; alvo: string; sem: number; sab: number; dom: number; obs?: string }
export interface MachineMonthConfig { on: boolean; sh: string[]; disp: number; grp: string; modo: RosterMode; src: string }

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
  /** dias com capacidade fixa (workDays inclui dias só com HE) */
  workDaysN: number;
  /** eventos de manutenção que tocam o período */
  evs: MachineEvent[];
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
  byRc: Record<string, ProdRecord[]>;
  /** paradas ligadas à usinagem (diretas na máquina ou inferidas pelo operador) */
  stops: StopBase[];
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
  /** calendário: tipo de dia e turnos previstos, só nas datas alteradas */
  cal: Record<string, DayConfig>;
  /** escala validada por mês e recurso */
  escala: Record<string, Record<string, RosterEntry>>;
  /** exceções confirmadas por data */
  ex: Record<string, CalendarException[]>;
  /** horas extras programadas */
  he: OvertimeEntry[];
  /** meses em que a HE inferida do histórico está desligada */
  heOff: string[];
  /** cadastro da máquina: grupo e disponibilidade (%) */
  mach: Record<string, { grp?: string; disp?: number; [k: string]: unknown }>;
  machM: Record<string, Record<string, string[]>>;
  /** 'dados' = capacidade até o último apontamento; 'dia' = dia inteiro */
  corte: 'dados' | 'dia';
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
  /** descarta os caches de capacidade (o motor já chama ao trocar a configuração) */
  clearCap(): void;
  /** texto curto da escala da máquina no mês ("2 turnos", "T1+T3", "Eventual"…) */
  turnosTxt(mc: MachineMonthConfig): string;
  /** capacidade do dia em minutos: turnos + hora extra */
  capMin(rc: string, iso: string, noCut?: boolean): number;
  /** capacidade do dia: n = turnos, he = hora extra, op = operacional (min) */
  capParts(rc: string, iso: string, noCut?: boolean): { n: number; he: number; op: number };
  /** tipo de dia e turnos previstos (calendário alterado, feriado ou padrão da semana) */
  dayCfg(iso: string): DayConfig;
  /** cadastro da máquina (grupo, disponibilidade e turnos sugeridos) */
  machCfg(rc: string): { on: boolean; sh: string[]; disp: number; grp: string; src: string };
  /** cadastro efetivo da máquina no mês (escala validada + grupo e disponibilidade) */
  machCfgM(rc: string, ym: string): MachineMonthConfig;
  /** escala do recurso no mês (validada, de demonstração ou nula = a validar) */
  rosterEntry(rc: string, ym: string): RosterEntry | null;
  rosterModes(ym: string): { valid: number; pending: number };
  /** minutos de HE do recurso no dia; `only` restringe a um lançamento (mesmo objeto de config.he) */
  heDay(rc: string, iso: string, only?: OvertimeEntry | null, specific?: boolean): number;
  /** janelas de capacidade do dia produtivo p (serial) */
  dayWins(rc: string, p: number): CapacityWindow[];
  /** fim da base em minutos absolutos (a capacidade não é contada depois disso) */
  readonly cutT: number;
  motName(code: number | string): string;
  motCat(code: number | string): string;
  constants: { DAY0: number; GRP_ORDER: string[]; MES: string[]; WD: string[]; CATS: [string, string][]; HOL: Record<string, string>; FACULT: Record<string, string>; ROSTER_MODES: Record<RosterMode, string>; EX_TYPES: Record<ExceptionType, string>; [key: string]: unknown };
  util: { s2iso(serial: number): string; iso2s(iso: string): number; title(s: string): string; shortNm(s: string): string; hhmm(t: number): string; fmtDT(t: number): string };
}
