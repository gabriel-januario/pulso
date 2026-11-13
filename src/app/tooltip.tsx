import { createContext, useCallback, useContext, useRef, useState, type ReactNode, type PointerEvent as RPointerEvent } from 'react';

export interface TipRow { label: string; value: string; color?: string }
export interface Tip { title: string; subtitle?: string; rows?: TipRow[]; note?: string }

interface Api { show(e: RPointerEvent | MouseEvent, tip: Tip): void; hide(): void }
const Ctx = createContext<Api>({ show() {}, hide() {} });

/** Uma única dica flutuante para todos os gráficos. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ tip: Tip; x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const show = useCallback((e: RPointerEvent | MouseEvent, tip: Tip) => setState({ tip, x: e.clientX, y: e.clientY }), []);
  const hide = useCallback(() => setState(null), []);

  let left = 0, top = 0;
  if (state) {
    const w = box.current?.offsetWidth ?? 240, h = box.current?.offsetHeight ?? 100;
    left = state.x + 14 + w > window.innerWidth - 8 ? state.x - w - 14 : state.x + 14;
    top = Math.min(window.innerHeight - h - 8, Math.max(8, state.y - h / 2));
  }
  return (
    <Ctx.Provider value={{ show, hide }}>
      {children}
      <div ref={box} className={state ? 'tip on' : 'tip'} style={{ left, top }} role="tooltip" aria-hidden={!state}>
        {state && (
          <>
            <b>{state.tip.title}</b>
            {state.tip.subtitle && <span className="tsub">{state.tip.subtitle}</span>}
            {state.tip.rows?.map((r) => (
              <span key={r.label} className="trow"><i style={{ background: r.color ?? 'transparent' }} />{r.label}<strong>{r.value}</strong></span>
            ))}
            {state.tip.note && <em>{state.tip.note}</em>}
          </>
        )}
      </div>
    </Ctx.Provider>
  );
}

export const useTip = () => useContext(Ctx);

/** Atalho: props de evento para um elemento SVG/HTML que mostra uma dica. */
export function useTipProps() {
  const tip = useTip();
  return (t: Tip) => ({ onPointerMove: (e: RPointerEvent) => tip.show(e, t), onPointerLeave: tip.hide });
}
