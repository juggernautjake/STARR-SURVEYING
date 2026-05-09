'use client';
// app/admin/cad/components/KeyboardShortcutOverlay.tsx
//
// Phase 8 §10.5 — keyboard shortcut cheat-sheet. Press `?`
// (normalized as `shift+slash`) to surface every action in
// the registry grouped by category, with the active key for
// each (default OR user override). Esc closes; clicking the
// backdrop closes; same render-nothing-when-closed pattern
// as the command palette so idle cost is zero.

import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_ACTIONS } from '@/lib/cad/hotkeys/registry';
import { findHotkeyConflicts, findConflictForAction } from '@/lib/cad/hotkeys/conflicts';
import { useHotkeysStore } from '@/lib/cad/store';
import type { ActionCategory, BindableAction } from '@/lib/cad/hotkeys/types';

const CATEGORY_ORDER: ActionCategory[] = [
  'FILE', 'EDIT', 'TOOLS', 'DRAW', 'MODIFY', 'SELECTION',
  'ZOOM_PAN', 'VIEW', 'SNAP', 'LAYERS', 'ANNOTATIONS',
  'SURVEY_MATH', 'AI', 'APP',
];

const CATEGORY_LABEL: Record<ActionCategory, string> = {
  FILE: 'File',
  EDIT: 'Edit',
  TOOLS: 'Tools',
  DRAW: 'Draw',
  MODIFY: 'Modify',
  SELECTION: 'Selection',
  ZOOM_PAN: 'Zoom & Pan',
  VIEW: 'View',
  SNAP: 'Snap',
  LAYERS: 'Layers',
  ANNOTATIONS: 'Annotations',
  SURVEY_MATH: 'Survey Math',
  AI: 'AI',
  APP: 'App',
};

export default function KeyboardShortcutOverlay() {
  const [open, setOpen] = useState(false);
  const userBindings = useHotkeysStore((s) => s.userBindings);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('cad:openShortcutHelp', onOpen);
    return () => window.removeEventListener('cad:openShortcutHelp', onOpen);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Merge default bindings with user overrides into a single
  // (actionId → activeKey) map. User overrides win.
  const activeKeys = useMemo(() => {
    const out: Record<string, string> = {};
    for (const a of DEFAULT_ACTIONS) {
      if (a.defaultKey) out[a.id] = a.defaultKey;
    }
    for (const u of userBindings) {
      // UserBinding.key may be null in some store flows
      // (key removal). Treat null/empty as "drop the entry"
      // so the cheat sheet hides actions that the surveyor
      // unbound rather than rendering an empty kbd box.
      if (u.key) out[u.actionId] = u.key;
      else delete out[u.actionId];
    }
    return out;
  }, [userBindings]);

  // Group actions by category.
  const grouped = useMemo(() => {
    const map = new Map<ActionCategory, BindableAction[]>();
    for (const a of DEFAULT_ACTIONS) {
      const arr = map.get(a.category) ?? [];
      arr.push(a);
      map.set(a.category, arr);
    }
    return map;
  }, []);

  // Detect any (key, context) collisions in the merged
  // binding map. Surveyors see a red badge on every action
  // that's part of a conflict + a header pill summarising
  // the count.
  const conflicts = useMemo(
    () => findHotkeyConflicts(DEFAULT_ACTIONS, userBindings),
    [userBindings],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[205] flex items-center justify-center bg-black/60 animate-[fadeIn_120ms_ease-out] p-6"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[860px] max-w-[95vw] max-h-[90vh] overflow-hidden flex flex-col animate-[scaleIn_150ms_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-2.5 border-b border-gray-700 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm text-white font-semibold">Keyboard Shortcuts</h2>
            {conflicts.length > 0 && (
              <span
                className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-900/40 border border-red-800/60 text-red-300 font-semibold"
                title={`${conflicts.length} hotkey collision${conflicts.length === 1 ? '' : 's'} — open a conflict's row to see which actions share the key`}
              >
                {conflicts.length} conflict{conflicts.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            <kbd className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 font-mono">Esc</kbd>
            <span>close</span>
          </div>
        </div>
        <div className="overflow-y-auto p-4 grid grid-cols-2 gap-x-6 gap-y-4">
          {CATEGORY_ORDER.map((cat) => {
            const actions = grouped.get(cat);
            if (!actions || actions.length === 0) return null;
            return (
              <section key={cat}>
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5 font-semibold">
                  {CATEGORY_LABEL[cat]}
                </div>
                <div className="space-y-0.5">
                  {actions.map((a) => {
                    const key = activeKeys[a.id];
                    if (!key) return null; // skip preset switchers etc.
                    const conflict = findConflictForAction(a.id, conflicts);
                    const partners = conflict
                      ? conflict.actionIds.filter((id) => id !== a.id)
                      : [];
                    return (
                      <div
                        key={a.id}
                        className="flex items-center justify-between gap-3 text-[11px] py-0.5"
                        title={
                          partners.length > 0
                            ? `Conflict: this key also fires ${partners.join(', ')} in the ${conflict!.context.toLowerCase()} context.`
                            : undefined
                        }
                      >
                        <span className={`truncate ${conflict ? 'text-red-300' : 'text-gray-300'}`}>{a.label}</span>
                        <kbd
                          className={`rounded px-1.5 py-0.5 text-[10px] font-mono shrink-0 border ${
                            conflict
                              ? 'bg-red-900/40 border-red-800/60 text-red-300'
                              : 'bg-gray-800 border-gray-700 text-gray-400'
                          }`}
                        >
                          {formatShortcut(key)}
                        </kbd>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
        <div className="px-4 py-2 border-t border-gray-700 text-[10px] text-gray-500 flex items-center justify-between">
          <span>Tip: Open the command palette (<kbd className="bg-gray-800 border border-gray-700 rounded px-1 font-mono">Ctrl+K</kbd>) to search by name.</span>
          <span>{userBindings.length > 0 ? `${userBindings.length} custom binding${userBindings.length === 1 ? '' : 's'}` : 'Defaults'}</span>
        </div>
      </div>
    </div>
  );
}

/** Convert a canonical key string ("ctrl+shift+s") to a
 *  human-friendly cheat-sheet form ("Ctrl+Shift+S"). */
function formatShortcut(s: string): string {
  return s
    .split(' ')
    .map((step) =>
      step
        .split('+')
        .map((part) => {
          const p = part.trim();
          if (p === 'ctrl') return 'Ctrl';
          if (p === 'shift') return 'Shift';
          if (p === 'alt') return 'Alt';
          if (p === 'meta') return '⌘';
          if (p === 'escape') return 'Esc';
          if (p === 'space') return 'Space';
          if (p === 'comma') return ',';
          if (p === 'period') return '.';
          if (p === 'slash') return '/';
          if (p === 'backslash') return '\\';
          if (p === 'minus') return '-';
          if (p === 'equal') return '=';
          if (p === 'leftbracket') return '[';
          if (p === 'rightbracket') return ']';
          if (p === 'semicolon') return ';';
          if (p === 'quote') return "'";
          if (p === 'backtick') return '`';
          if (p === 'delete') return 'Del';
          if (p.length === 1) return p.toUpperCase();
          return p;
        })
        .join('+')
    )
    .join(' ');
}
