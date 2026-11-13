/* Datas e constantes do calendário. O dia produtivo vai das 06:00 às 06:00 do dia seguinte. */

/** minuto do dia em que começa o dia produtivo (06:00) */
export const DAY0 = 360;
const EPOCH = Date.UTC(1899, 11, 30);

/** número de série (dias desde 30/12/1899, o mesmo do Excel) → AAAA-MM-DD */
export const s2iso = (s: number) => new Date(EPOCH + s * 864e5).toISOString().slice(0, 10);
/** AAAA-MM-DD → número de série */
export const iso2s = (iso: string) => Math.round((Date.parse(iso + 'T00:00:00Z') - EPOCH) / 864e5);
/** dia da semana (0 = domingo) */
export const wday = (iso: string) => new Date(iso + 'T12:00:00Z').getUTCDay();
/** HH:MM → minutos */
export const toMin = (s: string | null | undefined) => {
  const [h, m] = String(s || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
/** minutos absolutos → HH:MM */
export const hhmm = (t: number) => {
  const m = Math.round(((t % 1440) + 1440) % 1440);
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
};
const dm = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
/** minutos absolutos → DD/MM HH:MM */
export const fmtDT = (t: number) => dm(s2iso(Math.floor(t / 1440))) + ' ' + hhmm(t);
/** agora, em minutos absolutos no fuso local */
export const nowMin = () => (Date.now() - new Date().getTimezoneOffset() * 60000 - EPOCH) / 60000;
/** AAAA-MM-DDTHH:MM → minutos absolutos */
export const dtl2min = (v: string | null | undefined) => {
  if (!v) return null;
  const [d, t] = v.split('T');
  return iso2s(d) * 1440 + toMin(t || '00:00');
};
/** segunda-feira da semana da data */
export const weekKey = (iso: string) => s2iso(iso2s(iso) - ((wday(iso) + 6) % 7));

export const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** Feriados nacionais, estaduais (SP) e o aniversário do município-sede. Exceções da fábrica têm prioridade. */
export const HOL: Record<string, string> = {
  '2026-01-01': 'Confraternização Universal', '2026-04-03': 'Sexta-feira da Paixão', '2026-04-21': 'Tiradentes',
  '2026-05-01': 'Dia do Trabalho', '2026-06-04': 'Corpus Christi', '2026-07-09': 'Revolução Constitucionalista · SP',
  '2026-09-07': 'Independência do Brasil', '2026-10-12': 'Nossa Senhora Aparecida', '2026-11-02': 'Finados',
  '2026-11-15': 'Proclamação da República', '2026-11-20': 'Consciência Negra', '2026-12-05': 'Aniversário do município',
  '2026-12-25': 'Natal', '2027-01-01': 'Confraternização Universal', '2027-03-26': 'Sexta-feira da Paixão',
  '2027-04-21': 'Tiradentes', '2027-05-01': 'Dia do Trabalho', '2027-05-27': 'Corpus Christi',
  '2027-07-09': 'Revolução Constitucionalista · SP', '2027-09-07': 'Independência do Brasil', '2027-10-12': 'Nossa Senhora Aparecida',
  '2027-11-02': 'Finados', '2027-11-15': 'Proclamação da República', '2027-11-20': 'Consciência Negra',
  '2027-12-05': 'Aniversário do município', '2027-12-25': 'Natal',
};
/** Pontos facultativos: só informativos, não mudam o tipo de dia. */
export const FACULT: Record<string, string> = {
  '2026-01-02': 'Ponte de Ano Novo', '2026-02-16': 'Ponte de Carnaval', '2026-02-17': 'Carnaval', '2026-02-18': 'Cinzas (até 13h)',
  '2026-04-02': 'Quinta-feira Santa', '2026-04-20': 'Ponte de Tiradentes', '2026-06-05': 'Ponte de Corpus Christi',
  '2026-07-10': 'Ponte de 9 de Julho', '2026-10-30': 'Dia do Servidor Público', '2027-02-08': 'Carnaval', '2027-02-09': 'Carnaval',
  '2027-02-10': 'Cinzas',
};
