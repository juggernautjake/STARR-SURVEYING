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

interface Completion {
  /** Second key (or remaining chord steps) to type. */
  rest: string;
  /** User-facing label of the action that fires. */
  label: string;
  /** Stable id for keying. */
  id: string;
}

export default function ChordHUD() {
  const [prefix, setPrefix] = useState<string>('');

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ prefix: string }>).detail;
      setPrefix(detail?.prefix ?? '');
    };
    window.addEventListener('cad:chordPrefixChanged', handler);
    return () => window.removeEventListener('cad:chordPrefixChanged', handler);
  }, []);

  // Precompute the chord index — a map from prefix (first step
  // + trailing space) to the list of completions. The default
  // action set is static, so a useMemo computed once is enough.
  const chordIndex = useMemo(() => {
    const map = new Map<string, Completion[]>();
    for (const action of DEFAULT_ACTIONS) {
      if (!action.isChord || !action.defaultKey) continue;
      const parts = action.defaultKey.split(' ');
      if (parts.length < 2) continue;
      const head = parts[0];
      const rest = parts.slice(1).join(' ');
      const bucket = map.get(head) ?? [];
      bucket.push({ id: action.id, label: action.label, rest });
      map.set(head, bucket);
    }
    // Sort each bucket alphabetically by `rest` so the HUD list
    // is predictable.
    for (const bucket of map.values()) {
      bucket.sort((a, b) => a.rest.localeCompare(b.rest));
    }
    return map;
  }, []);

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
      </div>
    </div>
  );
}
