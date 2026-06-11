'use client';
// app/admin/cad/hooks/useHotkeyContext.ts
//
// cad-domain-audit Slice I — push a hotkey context (`DIALOG`,
// `COMMAND_BAR`, etc.) while a surface owns focus, then restore the
// previous one on unmount.  Solves the H-1 audit finding:
// `useHotkeysStore.activeContext` was defined but never narrowed
// anywhere, so canvas hotkeys fired inside modal dialogs and through
// the command bar.
//
// Nesting is handled with a module-level stack — top wins. Mounting
// another dialog inside a dialog still narrows correctly, and
// closing the inner dialog restores the outer dialog's context
// (instead of jumping straight back to CANVAS).
//
// Pure React + zustand; no platform globals.

import { useEffect } from 'react';

import { useHotkeysStore } from '@/lib/cad/store';
import type { ActionContext } from '@/lib/cad/hotkeys';

const DEFAULT_CONTEXT: ActionContext = 'CANVAS';

// Module-scope stack of currently-active context pushes. The latest
// push wins; popping restores the previous (or DEFAULT_CONTEXT when
// empty). Exported so unit tests can exercise the push / pop /
// top-wins semantics without spinning up React.
export const __hotkeyContextStack: ActionContext[] = [];

function applyTop(): void {
  const next = __hotkeyContextStack.length > 0
    ? __hotkeyContextStack[__hotkeyContextStack.length - 1]
    : DEFAULT_CONTEXT;
  // Only call the setter when something actually changes so a
  // mount/unmount round-trip doesn't re-render every subscriber.
  if (useHotkeysStore.getState().activeContext !== next) {
    useHotkeysStore.getState().setActiveContext(next);
  }
}

/** Test-only — push a context as if a host component mounted. Returns
 *  the matching pop function. Production code should use the
 *  `useHotkeyContext` hook instead. */
export function __pushHotkeyContextForTests(context: ActionContext): () => void {
  __hotkeyContextStack.push(context);
  applyTop();
  return () => {
    const idx = __hotkeyContextStack.lastIndexOf(context);
    if (idx >= 0) __hotkeyContextStack.splice(idx, 1);
    else __hotkeyContextStack.pop();
    applyTop();
  };
}

/**
 * Push `context` onto the hotkey-context stack for the lifetime of
 * the mounted component, then restore the previous top on unmount.
 * When `enabled` is false the push is skipped (useful for surfaces
 * that conditionally need narrowing, e.g. CommandBar only while
 * focused).
 */
export function useHotkeyContext(context: ActionContext, enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return undefined;
    __hotkeyContextStack.push(context);
    applyTop();
    return () => {
      // Pop the LAST occurrence of this context (not necessarily the
      // top — components can unmount in any order if the parent kept
      // a Portal etc.). Falling back to popping the top keeps the
      // stack balanced even when a sibling unmounts out of order.
      const idx = __hotkeyContextStack.lastIndexOf(context);
      if (idx >= 0) __hotkeyContextStack.splice(idx, 1);
      else __hotkeyContextStack.pop();
      applyTop();
    };
  }, [context, enabled]);
}
