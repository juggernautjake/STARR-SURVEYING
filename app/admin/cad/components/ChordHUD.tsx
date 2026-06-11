'use client';
// app/admin/cad/components/ChordHUD.tsx
//
// Phase 8 polish — chord-shortcut in-progress HUD.
//
// CAD's two-letter shortcuts (`I X` intersect, `Z E` zoom-
// extents, `R O` rotate, `S P` spline, etc.) had no on-screen
// progress indicator. Surveyors who pressed the first key and
// forgot the second had no idea what completions existed —
// the feature felt broken.
//
// Now, whenever `useHotkeys` dispatches `cad:chordPrefixChanged`
// with a non-empty prefix, this HUD pops a small toast at
// bottom-center showing every action whose binding starts with
// that prefix (plus the second key that triggers it). Pressing
// the second key, Esc, or just waiting out the engine's
// timeout (~1 s) clears it.

import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_ACTIONS } from '@/lib/cad/hotkeys/registry';
import { useHotkeysStore } from '@/lib/cad/store';
import type { BindableAction, UserBinding } from '@/lib/cad/hotkeys';

interface Completion {
  /** Second key (or remaining chord steps) to type. */
  rest: string;
  /** User-facing label of the action that fires. */
  label: string;
  /** Stable id for keying. */
  id: string;
}

/** cad-domain-audit Slice J — build the chord index from the
 *  ENGINE-MERGED bindings (user override → default), not just
 *  `defaultKey`. Mirrors `lib/cad/hotkeys/engine.ts buildTree` so
 *  the HUD shows exactly the chords the engine would actually fire.
 *  A binding shorter than 2 steps isn't a chord; an empty binding
 *  means "no binding" and drops out entirely. */
export function buildChordIndex(
  actions: ReadonlyArray<BindableAction>,
  userBindings: ReadonlyArray<UserBinding>,
): Map<string, Completion[]> {
  const overrideById = new Map<string, string | null>();
  for (const ub of userBindings) overrideById.set(ub.actionId, ub.key);
  const map = new Map<string, Completion[]>();
  for (const action of actions) {
    const override = overrideById.get(action.id);
    const rawKey = override === undefined ? action.defaultKey : override;
    if (!rawKey) continue;
    const parts = rawKey.split(' ').filter(Boolean);
    if (parts.length < 2) continue;
    const head = parts[0];
    const rest = parts.slice(1).join(' ');
    const bucket = map.get(head) ?? [];
    bucket.push({ id: action.id, label: action.label, rest });
    map.set(head, bucket);
  }
  // Sort each bucket alphabetically by `rest` so the HUD list is
  // predictable across rebuilds.
  for (const bucket of map.values()) {
    bucket.sort((a, b) => a.rest.localeCompare(b.rest));
  }
  return map;
}

export default function ChordHUD() {
  const [prefix, setPrefix] = useState<string>('');
  // cad-domain-audit Slice J — subscribe to userBindings so a custom
  // rebind (e.g. `p l` → `p x`) updates the HUD live. Previously the
  // index was useMemo'd with empty deps, so the HUD kept showing the
  // registry defaults even after the user customised their keys.
  const userBindings = useHotkeysStore((s) => s.userBindings);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ prefix: string }>).detail;
      setPrefix(detail?.prefix ?? '');
    };
    window.addEventListener('cad:chordPrefixChanged', handler);
    return () => window.removeEventListener('cad:chordPrefixChanged', handler);
  }, []);

  const chordIndex = useMemo(
    () => buildChordIndex(DEFAULT_ACTIONS, userBindings),
    [userBindings],
  );

  if (prefix.length === 0) return null;
  const completions = chordIndex.get(prefix) ?? [];
  if (completions.length === 0) return null;

  return (
    <div
      className="fixed bottom-12 left-1/2 -translate-x-1/2 z-40 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      <div className="bg-gray-900/95 border border-blue-600/60 rounded-lg shadow-2xl px-3 py-2 text-[12px] text-gray-200 animate-[scaleIn_120ms_cubic-bezier(0.16,1,0.3,1)]">
        <div className="flex items-center gap-2 mb-1.5">
          <kbd className="px-1.5 py-0.5 rounded bg-blue-900/60 border border-blue-500 text-blue-100 font-mono text-[11px] uppercase">
            {prefix}
          </kbd>
          <span className="text-gray-400 text-[11px]">…then</span>
        </div>
        <ul className="space-y-0.5">
          {completions.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-[11px]">
              <kbd className="px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-100 font-mono uppercase min-w-[1.5rem] text-center">
                {c.rest}
              </kbd>
              <span className="text-gray-300">{c.label}</span>
            </li>
          ))}
        </ul>
        {/* cad-ux-cleanup-pass Slice 5 — visible dismiss hint, so a
            mistyped chord prefix never feels stuck. */}
        <div className="mt-1.5 pt-1.5 border-t border-gray-700/60 flex items-center gap-1.5 text-[10px] text-gray-500">
          <kbd className="px-1 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-300 font-mono">
            Esc
          </kbd>
          <span>to cancel</span>
        </div>
      </div>
    </div>
  );
}
