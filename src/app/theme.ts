import type { StatusKey } from '../engine';

/** Cores por status da utilização: barra e rótulo. */
export const STATUS_BAR: Record<StatusKey, string> = { good: '#2563c9', warn: '#e3a33b', crit: '#d64b45', none: '#b8c3cf' };
export const STATUS_INK: Record<StatusKey, string> = { good: '#33475b', warn: '#9a6200', crit: '#c0392b', none: '#7c8b9a' };

export const GROUP_ORDER = ['Mandrilhadoras', 'Centros de usinagem', 'Tornos verticais', 'Tornos horizontais', 'Furadeiras radiais', 'Plainas e fresadoras', 'Outros postos'];
const GROUP_PALETTE = ['#2563c9', '#0f9d8a', '#e3a33b', '#8b5cf6', '#d64b45', '#14a3c7', '#64748b'];
export const groupColor = (g: string) => {
  const i = GROUP_ORDER.indexOf(g);
  return GROUP_PALETTE[(i < 0 ? GROUP_ORDER.length : i) % GROUP_PALETTE.length];
};

export const SERIES = { produced: '#2a78d6', outside: '#7fb2ea', overtime: '#0f9d8a', capacity: '#0e1d2c', stop: '#eb6834', maint: '#6250d6', gap: '#a3b1c0' };

/** Largura aproximada de um texto em px (Inter), para decidir se um rótulo cabe. */
export const textWidth = (s: string, size = 11) => s.length * size * 0.56;
export const truncate = (s: string, maxPx: number, size = 11) => {
  if (textWidth(s, size) <= maxPx) return s;
  const n = Math.max(3, Math.floor(maxPx / (size * 0.56)) - 1);
  return s.slice(0, n).trimEnd() + '…';
};

/** Eixo "redondo": passo 1/2/2,5/5 × 10ⁿ e topo múltiplo do passo. */
export function niceAxis(max: number, ticks = 4) {
  const raw = Math.max(max, 1e-9) / ticks, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  const n = Math.max(1, Math.ceil(max / step));
  return { step, n, max: step * n };
}
