// lib/hub/widget-refresh.ts
//
// Refresh-strategy helpers. Each widget can declare a per-instance
// refresh interval (seconds) via its `customization.interaction.
// refreshIntervalSec` setting. The shared `useWidgetRefresh` hook
// honors the interval but pauses on background tab + resumes on
// focus.
//
// Slice 153 of customizable-hub-and-work-mode-2026-05-28.md.

'use client';

import { useEffect, useRef } from 'react';

export interface WidgetRefreshOptions {
  /** Refresh interval in seconds. 0 disables auto-refresh. */
  intervalSec: number;
  /** When true, refresh runs immediately on mount (in addition to the
   *  first tick). Default true. */
  immediate?: boolean;
}

/** Runs `onRefresh` on the given cadence. Pauses on hidden tab + runs
 *  once on visibility change back to visible. Returns nothing —
 *  caller's `onRefresh` is the only side effect. */
export function useWidgetRefresh(onRefresh: () => void, opts: WidgetRefreshOptions): void {
  const { intervalSec, immediate = true } = opts;
  const callbackRef = useRef(onRefresh);
  callbackRef.current = onRefresh;

  useEffect(() => {
    if (intervalSec <= 0) return;
    if (typeof window === 'undefined') return;

    let timer: ReturnType<typeof setInterval> | null = null;
    let visible = !document.hidden;

    function start() {
      if (timer !== null) return;
      timer = setInterval(() => callbackRef.current(), intervalSec * 1000);
    }
    function stop() {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    }
    function handleVisibility() {
      const nowVisible = !document.hidden;
      if (nowVisible && !visible) {
        // Tab became visible — fire once + restart.
        callbackRef.current();
        start();
      } else if (!nowVisible) {
        stop();
      }
      visible = nowVisible;
    }

    if (immediate) callbackRef.current();
    if (visible) start();

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      stop();
    };
  }, [intervalSec, immediate]);
}
