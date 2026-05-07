'use client';
// app/admin/cad/components/TooltipProvider.tsx
//
// Phase 8 §5 — global tooltip provider. Owns:
//   * The current tooltip state (visible / content / x / y).
//   * One pending-show timer per kind (UI / FEATURE / LAYER /
//     SHORTCUT) so the right delay fires per the §5.1 table.
//   * The fixed-position tooltip element rendered above
//     everything else.
//
// Consumer surfaces use the `useUITooltip(content)` hook to
// wire `onMouseEnter` / `onMouseLeave` / `onMouseMove` props
// onto any button or form control. Feature-hover tooltips on
// the canvas land in the next slice through a different path
// (canvas-side hover handler calls `showTooltip` directly).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useUIStore } from '@/lib/cad/store';

type TooltipKind = 'UI' | 'FEATURE' | 'LAYER' | 'SHORTCUT';

const DELAYS_MS: Record<TooltipKind, number> = {
  UI: 600,
  SHORTCUT: 600,
  LAYER: 1000,
  FEATURE: 800,
};

interface TooltipState {
  visible: boolean;
  content: ReactNode;
  x:       number;
  y:       number;
  kind:    TooltipKind;
}

interface TooltipApi {
  showTooltip: (
    content: ReactNode,
    x: number,
    y: number,
    kind?: TooltipKind
  ) => void;
  hideTooltip: () => void;
}

const TooltipContext = createContext<TooltipApi | null>(null);

export function TooltipProvider({ children }: { children: ReactNode }) {
  const uiEnabled = useUIStore((s) => s.uiTooltipsEnabled);
  const featureEnabled = useUIStore((s) => s.featureTooltipsEnabled);
  const [state, setState] = useState<TooltipState>({
    visible: false,
    content: null,
    x: 0,
    y: 0,
    kind: 'UI',
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isKindEnabled = useCallback(
    (kind: TooltipKind): boolean => {
      if (kind === 'FEATURE') return featureEnabled;
      // UI / LAYER / SHORTCUT all share the UI tooltip
      // toggle so the surveyor can mute everything except
      // canvas-feature tooltips with one click.
      return uiEnabled;
    },
    [uiEnabled, featureEnabled]
  );

  const showTooltip = useCallback(
    (content: ReactNode, x: number, y: number, kind: TooltipKind = 'UI') => {
      if (!isKindEnabled(kind)) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      // While a tooltip is already visible, swap the content
      // immediately (mouse moved between two adjacent
      // buttons); otherwise wait for the per-kind delay.
      if (state.visible) {
        setState({ visible: true, content, x, y, kind });
        return;
      }
      timerRef.current = setTimeout(() => {
        setState({ visible: true, content, x, y, kind });
      }, DELAYS_MS[kind]);
    },
    [isKindEnabled, state.visible]
  );

  const hideTooltip = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setState((s) => (s.visible ? { ...s, visible: false } : s));
  }, []);

  // Cleanup outstanding timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const api = useMemo<TooltipApi>(
    () => ({ showTooltip, hideTooltip }),
    [showTooltip, hideTooltip]
  );

  return (
    <TooltipContext.Provider value={api}>
      {children}
      {state.visible ? (
        <TooltipBody x={state.x} y={state.y}>
          {state.content}
        </TooltipBody>
      ) : null}
    </TooltipContext.Provider>
  );
}

function TooltipBody({
  x,
  y,
  children,
}: {
  x: number;
  y: number;
  children: ReactNode;
}) {
  // Pin to the right + below the cursor by default; nudge
  // back into the viewport on the rare case where the
  // tooltip would clip the right edge of the screen.
  const offsetX = 14;
  const offsetY = 18;
  const left =
    x + offsetX + 280 > window.innerWidth ? x - 280 : x + offsetX;
  const top = y + offsetY;
  return (
    <div role="tooltip" style={{ ...styles.box, left, top }}>
      {children}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Public hook
// ────────────────────────────────────────────────────────────

/** `useUITooltip(content)` returns event handlers to spread
 *  on any clickable surface. The handlers are stable across
 *  renders unless `content` changes. */
export function useUITooltip(
  content: ReactNode,
  kind: TooltipKind = 'UI'
): {
  onMouseEnter: (e: React.MouseEvent) => void;
  onMouseLeave: () => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onFocus: (e: React.FocusEvent) => void;
  onBlur: () => void;
} {
  const ctx = useContext(TooltipContext);
  return useMemo(() => {
    if (!ctx) {
      // Provider missing — keep the surface usable; tooltip
      // just doesn't appear.
      return {
        onMouseEnter: () => {},
        onMouseLeave: () => {},
        onMouseMove: () => {},
        onFocus: () => {},
        onBlur: () => {},
      };
    }
    return {
      onMouseEnter: (e: React.MouseEvent) =>
        ctx.showTooltip(content, e.clientX, e.clientY, kind),
      onMouseLeave: () => ctx.hideTooltip(),
      onMouseMove: (e: React.MouseEvent) =>
        ctx.showTooltip(content, e.clientX, e.clientY, kind),
      onFocus: (e: React.FocusEvent) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        ctx.showTooltip(content, r.left + r.width / 2, r.bottom, kind);
      },
      onBlur: () => ctx.hideTooltip(),
    };
  }, [ctx, content, kind]);
}

/** Direct-access API for surfaces that drive the tooltip
 *  imperatively (canvas-side feature hover lands through
 *  this). Returns null when the provider isn't mounted. */
export function useTooltipApi(): TooltipApi | null {
  return useContext(TooltipContext);
}

const styles: Record<string, React.CSSProperties> = {
  box: {
    position: 'fixed',
    zIndex: 9999,
    maxWidth: 280,
    padding: '6px 10px',
    background: '#0F172A',
    color: '#FFFFFF',
    borderRadius: 6,
    fontSize: 12,
    lineHeight: 1.4,
    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.18)',
    pointerEvents: 'none',
    whiteSpace: 'normal',
  },
};
