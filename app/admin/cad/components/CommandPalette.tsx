'use client';
// app/admin/cad/components/CommandPalette.tsx — Phase 8 §10.6
// Searchable command palette. Triggered via Ctrl+K (the
// `view.commandPalette` action emits the
// `cad:openCommandPalette` custom event from `useHotkeys`),
// surfaces every entry in the hotkey registry plus every
// layer in the active drawing, and dispatches the chosen
// command directly. Esc closes; Up / Down / Enter navigate
// + commit. The palette never renders into the DOM until
// the first open so it has zero idle cost.

import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_ACTIONS } from '@/lib/cad/hotkeys/registry';
import { dispatchDefaultAction } from '../hooks/useHotkeys';
import { useDrawingStore, useAIStore } from '@/lib/cad/store';
import type { BindableAction } from '@/lib/cad/hotkeys/types';

type PaletteItem =
  | {
      kind: 'ACTION';
      id: string;
      label: string;
      description: string;
      category: string;
      shortcut: string | null;
      run: () => void;
    }
  | {
      kind: 'LAYER';
      id: string;
      label: string;
      description: string;
      category: 'LAYER';
      shortcut: null;
      color: string;
      run: () => void;
    };

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const drawingStore = useDrawingStore();

  // Open on the same custom event that the hotkey engine
  // emits, so Ctrl+K and any future menu entry both flow
  // through one place.
  useEffect(() => {
    const onOpen = () => {
      setQuery('');
      setActiveIndex(0);
      setOpen(true);
    };
    window.addEventListener('cad:openCommandPalette', onOpen as EventListener);
    return () => window.removeEventListener('cad:openCommandPalette', onOpen as EventListener);
  }, []);

  // Build the searchable item list — registry actions plus
  // every layer in the document, each with a `run()` closure
  // so the result handler doesn't need to re-resolve.
  const items: PaletteItem[] = useMemo(() => {
    const actionItems: PaletteItem[] = DEFAULT_ACTIONS.map((a: BindableAction) => ({
      kind: 'ACTION' as const,
      id: a.id,
      label: a.label,
      description: a.description,
      category: a.category,
      shortcut: a.defaultKey ?? null,
      run: () => dispatchDefaultAction(a),
    }));

    const layerItems: PaletteItem[] = drawingStore.document.layerOrder
      .map((id) => drawingStore.document.layers[id])
      .filter(Boolean)
      .map((l) => ({
        kind: 'LAYER' as const,
        id: l.id,
        label: `Set Active Layer · ${l.name}`,
        description: `Make "${l.name}" the active layer for new features.`,
        category: 'LAYER' as const,
        shortcut: null,
        color: l.color,
        run: () => {
          drawingStore.setActiveLayer(l.id);
        },
      }));

    return [...actionItems, ...layerItems];
  }, [drawingStore]);

  // §32 Slice 13 — MANUAL mode lockdown. Hide every ai.*
  // palette entry (except the mode-cycle action itself, which
  // is how the surveyor turns AI back on) when mode is MANUAL.
  const aiMode = useAIStore((s) => s.mode);
  const visibleItems = useMemo(() => {
    if (aiMode !== 'MANUAL') return items;
    return items.filter((it) =>
      !(it.kind === 'ACTION' && it.id.startsWith('ai.') && it.id !== 'ai.cycleMode'),
    );
  }, [items, aiMode]);

  // Simple substring filter — case-insensitive, matches on
  // label + description + category + (action) id so a user
  // can search by Tool name, action id ("file.save"), or any
  // word in the description.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visibleItems.slice(0, 60); // cap idle list
    return visibleItems
      .filter((it) => {
        const haystack = `${it.label} ${it.description} ${it.category} ${it.id}`.toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 60);
  }, [visibleItems, query]);

  // Reset highlight when the filtered list changes so the
  // top-most match is always selected.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // When the surveyor hasn't typed anything, render section
  // headers between categories so the 80+ entries are
  // scannable. Once they start typing, fall back to a flat
  // filtered list since cross-category fuzzy matches read
  // better without dividers.
  const showSections = query.trim().length === 0;
  const sectionDividerIndices = useMemo(() => {
    if (!showSections) return new Set<number>();
    const out = new Set<number>();
    let prevCategory: string | null = null;
    filtered.forEach((it, idx) => {
      if (it.category !== prevCategory) {
        out.add(idx);
        prevCategory = it.category;
      }
    });
    return out;
  }, [filtered, showSections]);

  // Auto-focus the input when the palette opens.
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  function close() {
    setOpen(false);
    setQuery('');
  }

  function commit(idx: number) {
    const item = filtered[idx];
    if (!item) return;
    close();
    // Defer the run() to the next frame so the modal has a
    // chance to unmount before the action mutates state —
    // this avoids any visible flicker for actions that open
    // dialogs.
    requestAnimationFrame(() => item.run());
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-black/60 animate-[fadeIn_120ms_ease-out] pt-24"
      onClick={close}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[600px] max-w-[90vw] overflow-hidden animate-[scaleIn_150ms_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b border-gray-700 flex items-center gap-2">
          <span className="text-gray-500 text-xs">⌕</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                close();
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                commit(activeIndex);
              }
            }}
            placeholder="Type a command, tool, or layer name…"
            className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-gray-500"
          />
          <kbd className="text-[10px] text-gray-500 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500 text-xs">
              No commands match &quot;{query}&quot;.
            </div>
          ) : (
            filtered.map((it, idx) => (
              <div key={`${it.kind}-${it.id}`}>
                {sectionDividerIndices.has(idx) && (
                  <div className="px-3 pt-2 pb-1 text-[9px] uppercase tracking-wider text-gray-500 font-semibold bg-gray-900 sticky top-0 z-10 border-t border-gray-800 first:border-t-0">
                    {it.category}
                  </div>
                )}
                <button
                  type="button"
                  className={`w-full px-3 py-2 flex items-center gap-3 text-left text-xs border-l-2 transition-colors
                    ${idx === activeIndex
                      ? 'bg-blue-700/30 border-blue-500'
                      : 'border-transparent hover:bg-gray-800'}`}
                  onClick={() => commit(idx)}
                  onMouseEnter={() => setActiveIndex(idx)}
                >
                {it.kind === 'LAYER' ? (
                  <span
                    className="w-3 h-3 rounded-sm border border-gray-600 shrink-0"
                    style={{ backgroundColor: it.color }}
                  />
                ) : (
                  <span className="w-3 text-[10px] text-gray-500 text-center shrink-0">⌃</span>
                )}
                <span className="flex-1 min-w-0">
                  <span className="text-white block truncate">{it.label}</span>
                  <span className="text-gray-500 block truncate text-[10px]">{it.description}</span>
                </span>
                <span className="text-[10px] text-gray-500 shrink-0">{it.category}</span>
                {it.shortcut && (
                  <kbd className="text-[10px] text-gray-400 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 shrink-0 font-mono">
                    {formatShortcut(it.shortcut)}
                  </kbd>
                )}
                </button>
              </div>
            ))
          )}
        </div>
        <div className="px-3 py-1.5 border-t border-gray-700 flex items-center gap-3 text-[10px] text-gray-500">
          <span><kbd className="bg-gray-800 border border-gray-700 rounded px-1">↑↓</kbd> navigate</span>
          <span><kbd className="bg-gray-800 border border-gray-700 rounded px-1">↵</kbd> run</span>
          <span><kbd className="bg-gray-800 border border-gray-700 rounded px-1">Esc</kbd> close</span>
          <span className="ml-auto">{filtered.length} of {visibleItems.length}</span>
        </div>
      </div>
    </div>
  );
}

/** Render a registry shortcut string in a friendly form. */
function formatShortcut(s: string): string {
  return s
    .split('+')
    .map((part) => {
      const p = part.trim();
      if (p === 'ctrl') return 'Ctrl';
      if (p === 'shift') return 'Shift';
      if (p === 'alt') return 'Alt';
      if (p === 'meta') return '⌘';
      if (p === 'escape') return 'Esc';
      if (p.length === 1) return p.toUpperCase();
      return p;
    })
    .join('+');
}
