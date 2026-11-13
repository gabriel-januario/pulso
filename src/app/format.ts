const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** minutos → horas sem casas decimais */
export const hours = (min: number) => nf0.format((min || 0) / 60);
/** minutos → horas com uma casa decimal */
export const hours1 = (min: number) => nf1.format((min || 0) / 60);
export const int = (n: number) => nf0.format(n);
export const dec1 = (n: number) => nf1.format(n);
/** valor do eixo: inteiro quando exato, senão uma casa */
export const axisNum = (n: number) => (Math.abs(n - Math.round(n)) < 1e-9 ? nf0.format(n) : nf1.format(n));
export const pct = (v: number | null | undefined) => (v == null || !isFinite(v) ? '—' : nf0.format(v * 100) + '%');
export const pct1 = (v: number | null | undefined) => (v == null || !isFinite(v) ? '—' : nf1.format(v * 100) + '%');
/** diferença em pontos percentuais com sinal */
export const pp = (v: number) => `${v >= 0 ? '+' : '−'}${nf1.format(Math.abs(v))} p.p.`;
/** AAAA-MM-DD → DD/MM/AAAA */
export const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
export const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const WEEKDAY = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
