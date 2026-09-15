// app/admin/research/components/Tooltip.tsx — Reusable tooltip wrapper.
//
// Slice button-tooltip-portal-2026-06-20 — the tooltip now portals
// its popup into `document.body` and the CSS lives in
// AdminLayout.css (loaded for every admin page). The previous
// implementation rendered the popup as a child of the trigger's
// inline-flex <span>, and the CSS was scoped to /admin/research/
// only — so on /admin/jobs the popup rendered as UNSTYLED inline
// text that shifted the form rows around. Portal + global CSS
// fixes both at once.
//
// ── IT GOES AWAY THE MOMENT THE POINTER DOES (owner, 2026-09-15) ─────────────────────────────────
// "The tool tips, especially for the projects and jobs pages, kind of tend to linger even when I
//  don't want it to and have moved my cursor off of the element … They should disappear as soon as
//  the user removes the cursor from the element."
//
// Why they lingered, each fixed below:
//   1. TWO TIMERS, ONE REF. Hovering started a show timer; clicking the trigger focused it, and
//      `onFocus` started a SECOND timer that overwrote the ref. Leaving cleared only the second, so
//      the first fired after the cursor had gone — and nothing was left to hide it.
//   2. A CLICK FOCUSED IT. A mouse click leaves focus on the button, and focus showed the tooltip,
//      so it came back after the click. Focus now only shows it for KEYBOARD focus (:focus-visible).
//   3. LEAVE EVENTS THAT NEVER COME. A disabled button, a trigger that re-renders or moves under a
//      still pointer, a scroll, a tab switch: none of these reliably fire `mouseleave`. While a tip
//      is open, the pointer's position is checked against the trigger on every move, and scrolling,
//      pressing, Escape, window blur and a hidden tab all close it.
//   4. ONE AT A TIME. Opening a tooltip closes any other that is still up.

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  text: string;
  enabled?: boolean;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  /** Optional keyboard shortcut badge shown at the end of the tooltip */
  shortcut?: string;
  /** Override the default 300px max-width */
  maxWidth?: number;
  children: React.ReactNode;
}

/** The tooltip currently open anywhere on the page — opening another closes it. */
let closeOpenTooltip: (() => void) | null = null;

export default function Tooltip({
  text,
  enabled = true,
  position = 'top',
  delay = 300,
  shortcut,
  maxWidth,
  children,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const hide = useCallback(() => {
    clearTimer();
    setVisible(false);
  }, []);

  const place = useCallback((): boolean => {
    const wrap = wrapRef.current;
    if (!wrap || !wrap.isConnected) return false;
    const rect = wrap.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let x = 0;
    let y = 0;
    switch (position) {
      case 'top':
        x = rect.left + rect.width / 2;
        y = rect.top - 6;
        break;
      case 'bottom':
        x = rect.left + rect.width / 2;
        y = rect.bottom + 6;
        break;
      case 'left':
        x = rect.left - 6;
        y = rect.top + rect.height / 2;
        break;
      case 'right':
        x = rect.right + 6;
        y = rect.top + rect.height / 2;
        break;
    }

    // Clamp to viewport edges
    x = Math.max(8, Math.min(vw - 8, x));
    y = Math.max(8, Math.min(vh - 8, y));
    setCoords({ x, y });
    return true;
  }, [position]);

  const show = useCallback(() => {
    if (!enabled) return;
    // Always one pending timer at most — the lingering tooltip was a second, orphaned one.
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (!place()) return;
      if (closeOpenTooltip && closeOpenTooltip !== hide) closeOpenTooltip();
      closeOpenTooltip = hide;
      setVisible(true);
    }, delay);
  }, [enabled, delay, place, hide]);

  // Pointer, not mouse: a touch "hover" has no leave, so a tap never opens a tooltip that would stay.
  const onPointerEnter = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    show();
  }, [show]);

  // Keyboard focus only. A mouse click also focuses a button, and that focus used to re-open the tip.
  const onFocus = useCallback((e: React.FocusEvent) => {
    const t = e.target as HTMLElement;
    let keyboard = true;
    try { keyboard = t.matches(':focus-visible'); } catch { /* older browsers: treat as keyboard */ }
    if (keyboard) show();
  }, [show]);

  // While open (or about to open), close on anything that means the pointer or the page moved on.
  const armed = visible;
  useEffect(() => {
    if (!armed) return;
    const outside = (x: number, y: number) => {
      const wrap = wrapRef.current;
      if (!wrap || !wrap.isConnected) return true;
      const r = wrap.getBoundingClientRect();
      return x < r.left || x > r.right || y < r.top || y > r.bottom;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      // Focus-shown (keyboard) tips stay while focus does; pointer-shown ones track the pointer.
      if (wrapRef.current?.contains(document.activeElement) && (document.activeElement as HTMLElement | null)?.matches?.(':focus-visible')) return;
      if (outside(e.clientX, e.clientY)) hide();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    const onVisibility = () => { if (document.hidden) hide(); };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('wheel', hide, { passive: true });
    window.addEventListener('resize', hide);
    window.addEventListener('blur', hide);
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('wheel', hide);
      window.removeEventListener('resize', hide);
      window.removeEventListener('blur', hide);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [armed, hide]);

  // A disabled tooltip, or text that went away, closes an open one.
  useEffect(() => { if (!enabled || !text) hide(); }, [enabled, text, hide]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (closeOpenTooltip === hide) closeOpenTooltip = null;
    };
  }, [hide]);

  // SSR / first paint — `document` doesn't exist on the server, so
  // gate the portal target behind a mount check.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!text) return <>{children}</>;

  const popup = visible && enabled && mounted ? createPortal(
    <div
      ref={tipRef}
      className={`research-tip research-tip--${position}`}
      style={{ left: coords.x, top: coords.y, maxWidth }}
      role="tooltip"
    >
      {text}
      {shortcut && <kbd className="research-tip__shortcut">{shortcut}</kbd>}
    </div>,
    document.body,
  ) : null;

  return (
    <span
      ref={wrapRef}
      className="research-tip-wrap"
      onPointerEnter={onPointerEnter}
      onPointerLeave={hide}
      onMouseLeave={hide}
      onPointerDown={hide}
      onFocus={onFocus}
      onBlur={hide}
    >
      {children}
      {popup}
    </span>
  );
}
