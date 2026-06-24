// lib/admin/use-focus-highlight.ts
// Doc 06, slice N5 — "deep-link focus". When a page is opened from an alert whose
// link carries `?focus=<id>`, scroll the matching element into view and flash a
// highlight so the user lands ON the relevant row/card, not just the page.
//
// Usage:
//   1. Render the target element with `data-focus-id={row.id}`.
//   2. Call `useFocusHighlight()` once in the page/client component.
//   3. Make the alert link `/admin/whatever?focus=<row.id>`.
//
// The flash class is `.focus-flash` (defined once in AdminLayout.css).
'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export function useFocusHighlight(options?: { deps?: ReadonlyArray<unknown>; paramName?: string }) {
  const searchParams = useSearchParams();
  const paramName = options?.paramName ?? 'focus';
  const focusId = searchParams?.get(paramName) ?? null;
  // Stringify deps for the effect dependency without spreading an array literal.
  const depKey = options?.deps ? JSON.stringify(options.deps) : '';

  useEffect(() => {
    if (!focusId) return;
    // Defer a couple of frames so list data has a chance to render the row.
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const attempt = () => {
      const el = document.querySelector<HTMLElement>(`[data-focus-id="${CSS.escape(focusId)}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('focus-flash');
        window.setTimeout(() => el.classList.remove('focus-flash'), 2400);
        return;
      }
      if (tries++ < 12) timer = setTimeout(attempt, 300); // retry up to ~3.6s
    };
    attempt();
    return () => { if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, depKey]);
}
