// app/admin/research/components/Tooltip.tsx — Reusable tooltip wrapper for research UI
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface TooltipProps {
  text: string;
  enabled?: boolean;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  children: React.ReactNode;
}

export default function Tooltip({
  text,
  enabled = true,
  position = 'top',
  delay = 400,
  children,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (!enabled) return;
    timerRef.current = setTimeout(() => {
      if (!wrapRef.current) return;
      const rect = wrapRef.current.getBoundingClientRect();
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
      setVisible(true);
    }, delay);
  }, [enabled, position, delay]);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setVisible(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  if (!text) return <>{children}</>;

  return (
    <span
      ref={wrapRef}
      className="research-tip-wrap"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && enabled && (
        <div
          ref={tipRef}
          className={`research-tip research-tip--${position}`}
          style={{ left: coords.x, top: coords.y }}
          role="tooltip"
        >
          {text}
        </div>
      )}
    </span>
  );
}
