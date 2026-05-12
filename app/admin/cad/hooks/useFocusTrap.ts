'use client';
// app/admin/cad/hooks/useFocusTrap.ts
//
// Phase 8 §9 — modal-dialog focus management. Surveyors
// expect Tab to cycle through every control inside the
// open dialog and never jump out to the canvas / toolbar
// behind it. This hook does three things:
//
//   1. Captures whatever was focused before the dialog
//      mounted (usually a toolbar button or canvas) and
//      restores focus there when the dialog unmounts.
//   2. Focuses the first focusable element inside the
//      container on mount so the surveyor doesn't have to
//      mouse-click before typing.
//   3. Hijacks Tab / Shift+Tab to wrap around the
//      container's focusable list. The user's existing
//      DOM order becomes the tab order — markup edits are
//      the right place to fix specific orderings.
//
// Usage inside a dialog component:
//
//   const ref = useRef<HTMLDivElement>(null);
//   useFocusTrap(ref);
//   return <div ref={ref}>…dialog body…</div>;
//
// The ref is bound to the OUTER container (typically the
// backdrop or the dialog box). Pass `enabled: false` as the
// second argument to disable trapping (useful when a dialog
// is inside another modal or otherwise nested).
//
// Note: this is a focus *trap*, not a focus *fence*. We
// only redirect Tab cycling — clicking outside the
// container is unrelated and is the backdrop component's
// responsibility (most dialogs already close on backdrop
// click via `onClose`).

import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusable(container: HTMLElement): HTMLElement[] {
  const nodes = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  return Array.from(nodes).filter((el) => {
    // Skip elements that are visually hidden via display:none
    // / visibility:hidden — they exist in the DOM but Tab
    // skips them in real browsers, so we should too.
    if (el.offsetParent === null && el.tagName !== 'INPUT') return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    return true;
  });
}

export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean = true,
): void {
  useEffect(() => {
    if (!enabled) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Auto-focus the first focusable element. If the dialog
    // hasn't rendered any focusable content yet (rare, but
    // possible for async-loaded bodies), we punt to a
    // microtask so the post-mount layout pass has a chance.
    const focusFirst = () => {
      const focusable = getFocusable(container);
      if (focusable.length === 0) return;
      // Prefer an element marked `data-autofocus` so dialogs
      // can opt a specific control into the initial focus
      // (e.g. the danger button in a confirm dialog).
      const preferred =
        container.querySelector<HTMLElement>('[data-autofocus]') ?? focusable[0];
      preferred.focus();
    };
    // Defer one tick so the children's `disabled` state and
    // visibility are stable.
    const t = setTimeout(focusFirst, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = getFocusable(container);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      // Tab forward off the last → wrap to first.
      // Shift+Tab back off the first → wrap to last.
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (active && !container.contains(active)) {
        // Focus escaped the container somehow (programmatic
        // blur, etc.) — pull it back to the first element.
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);

    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKeyDown, true);
      // Restore focus to whatever owned it before the dialog
      // opened. Guard against the previous element having
      // been removed from the DOM in the meantime.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        try {
          previouslyFocused.focus();
        } catch {
          // ignore — DOM elements occasionally throw on focus
          // when transitioning (e.g. iframes); not actionable.
        }
      }
    };
  }, [containerRef, enabled]);
}
