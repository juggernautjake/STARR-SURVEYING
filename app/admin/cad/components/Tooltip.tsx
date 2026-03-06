'use client';
// app/admin/cad/components/Tooltip.tsx — Reusable rich hover tooltip with smooth animations

import { useState, useRef, useEffect, useCallback } from 'react';

export interface TooltipProps {
  /** Primary label shown in bold */
  label: string;
  /** Optional longer description */
  description?: string;
  /** Keyboard shortcut shown as a badge */
  shortcut?: string;
  /** Which side of the trigger to show the tooltip */
  side?: 'right' | 'left' | 'top' | 'bottom';
  /** Delay in ms before showing (default 600) */
  delay?: number;
  children: React.ReactNode;
  className?: string;
  /** Skip tooltip entirely */
  disabled?: boolean;
}

export default function Tooltip({
  label,
  description,
  shortcut,
  side = 'right',
  delay = 600,
  children,
  className,
  disabled,
}: TooltipProps) {
  const [mounted, setMounted] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (disabled) return;
    timerRef.current = setTimeout(() => {
      setMounted(true);
      // Trigger animation on next frame after mount
      animTimerRef.current = setTimeout(() => setAnimateIn(true), 10);
    }, delay);
  }, [delay, disabled]);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (animTimerRef.current) clearTimeout(animTimerRef.current);
    setAnimateIn(false);
    // Wait for exit animation before unmounting
    setTimeout(() => setMounted(false), 150);
  }, []);

  // Position after the tooltip element mounts / becomes visible
  useEffect(() => {
    if (!mounted || !triggerRef.current || !tooltipRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tRect = tooltipRef.current.getBoundingClientRect();
    const gap = 8;
    let x = 0;
    let y = 0;

    switch (side) {
      case 'right':
        x = rect.right + gap;
        y = rect.top + rect.height / 2 - tRect.height / 2;
        break;
      case 'left':
        x = rect.left - tRect.width - gap;
        y = rect.top + rect.height / 2 - tRect.height / 2;
        break;
      case 'bottom':
        x = rect.left + rect.width / 2 - tRect.width / 2;
        y = rect.bottom + gap;
        break;
      case 'top':
        x = rect.left + rect.width / 2 - tRect.width / 2;
        y = rect.top - tRect.height - gap;
        break;
    }

    // Clamp to viewport with padding
    x = Math.max(8, Math.min(x, window.innerWidth - tRect.width - 8));
    y = Math.max(8, Math.min(y, window.innerHeight - tRect.height - 8));
    setPos({ x, y });
  }, [mounted, side]);

  // Translate direction for entrance animation based on side
  const translateFrom = {
    right: 'translate-x-1',
    left: '-translate-x-1',
    bottom: 'translate-y-1',
    top: '-translate-y-1',
  }[side];

  return (
    <div
      ref={triggerRef}
      className={className}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}

      {mounted && (
        <div
          ref={tooltipRef}
          className={`fixed z-[200] pointer-events-none transition-all duration-150 ease-out
            ${animateIn ? 'opacity-100 scale-100 translate-x-0 translate-y-0' : `opacity-0 scale-95 ${translateFrom}`}`}
          style={{ left: pos.x, top: pos.y }}
        >
          <div className="bg-gray-900 border border-gray-600 rounded-lg shadow-2xl px-3 py-2 max-w-[240px] backdrop-blur-sm">
            {/* Label + shortcut row */}
            <div className="flex items-center justify-between gap-3">
              <span className="text-white text-xs font-semibold leading-tight">{label}</span>
              {shortcut && (
                <span className="text-[10px] text-gray-400 font-mono bg-gray-700 border border-gray-600 px-1.5 py-0.5 rounded shrink-0">
                  {shortcut}
                </span>
              )}
            </div>
            {/* Description */}
            {description && (
              <p className="text-gray-400 text-[11px] mt-1.5 leading-relaxed">{description}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
