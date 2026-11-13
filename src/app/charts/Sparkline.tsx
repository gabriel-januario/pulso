/** Linha de tendência miniatura. Valores nulos são pulados. */
export function Sparkline({ values, color = '#2563c9', reference, max, height = 28 }: { values: (number | null)[]; color?: string; reference?: number; max?: number; height?: number }) {
  const W = 120, H = height;
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null && isFinite(p[1]));
  if (pts.length < 2) return null;
  const mx = max ?? Math.max(...pts.map((p) => p[1]), 1e-9), n = values.length - 1 || 1;
  const X = (i: number) => 2 + (i / n) * (W - 6), Y = (v: number) => H - 3 - (Math.min(v, mx) / (mx || 1)) * (H - 7);
  const d = pts.map((p, j) => `${j ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join('');
  const last = pts[pts.length - 1];
  return (
    <svg className="spk" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} aria-hidden="true">
      {reference != null && <line x1={0} x2={W} y1={Y(reference)} y2={Y(reference)} stroke="#9aa8b6" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      <path d={`${d}L${X(last[0])} ${H - 2}L${X(pts[0][0])} ${H - 2}Z`} fill={color} fillOpacity={0.1} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
