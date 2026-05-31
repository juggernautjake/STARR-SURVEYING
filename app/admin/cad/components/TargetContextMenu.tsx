'use client';
// app/admin/cad/components/TargetContextMenu.tsx
//
// cad-layer-grouping-and-context-menus Slice 5 — unified context-
// menu component for layer / group / feature targets in the
// LayerPanel. Discriminated-union `target` prop, real store calls
// for every action (no placeholder TODO entries).
//
// First wired use-case (this slice): right-click on a GROUP row in
// the LayerPanel. Earlier work already covered:
//   - Layer rows have their own bespoke context menu in LayerPanel.
//   - Feature right-click on the CANVAS uses FeatureContextMenu.
// Future slices can fold those into this component if the
// duplication becomes a maintenance problem; for now this component
// owns the previously-MISSING group-row + feature-row LayerPanel
// menus so users can right-click anywhere in the panel and get
// actions that work.

import { useEffect, useRef, useState } from 'react';
import { useDrawingStore, useSelectionStore } from '@/lib/cad/store';
// cad-layer-grouping Slice 5 amendment — descendant lookup for the
// "Move to group…" submenu so we exclude self + descendants from the
// available targets (cycle prevention).
import { allDescendants } from '@/lib/cad/feature-groups';

/** Discriminated target for the menu. `group` is the only kind we
 *  surface in Slice 5; the other kinds are sketched here so future
 *  consumers can extend without changing the public shape. */
export type ContextMenuTarget =
  | { kind: 'group'; id: string }
  | { kind: 'feature'; id: string }
  | { kind: 'layer'; id: string }
  | { kind: 'selection' };

interface TargetContextMenuProps {
  target: ContextMenuTarget;
  x: number;
  y: number;
  onClose: () => void;
  /** Optional callback the parent can wire to start an inline rename
   *  flow (the rename input lives in the parent panel — this menu
   *  just triggers it). */
  onRequestRename?: (groupId: string) => void;
}

export default function TargetContextMenu({
  target,
  x,
  y,
  onClose,
  onRequestRename,
}: TargetContextMenuProps) {
  const drawingStore = useDrawingStore();
  const selectionStore = useSelectionStore();
  const ref = useRef<HTMLDivElement | null>(null);
  // cad-layer-grouping Slice 5 amendment — controls the inline
  // "Move to group…" submenu (which group should the user pick as
  // the new parent). Local state; closes with the parent menu.
  const [moveSubOpen, setMoveSubOpen] = useState(false);

  // Close on outside click / Escape — same pattern the other
  // context menus in the codebase use.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => {
    function onDown(e: Event) {
      if (ref.current && !ref.current.contains(e.target as Node)) onCloseRef.current();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current();
    }
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onDown);
      document.addEventListener('click', onDown, true);
      document.addEventListener('contextmenu', onDown, true);
    }, 0);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('click', onDown, true);
      document.removeEventListener('contextmenu', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  // ── GROUP menu items ──────────────────────────────────────────
  if (target.kind === 'group') {
    const group = drawingStore.document.featureGroups?.[target.id];
    if (!group) {
      // Stale id — render an empty menu shell and close immediately
      // on first paint so the user sees nothing flicker. Returning
      // null instead is fine too; we return null for simplicity.
      return null;
    }
    const isNested = (group.parentGroupId ?? null) !== null;
    // cad-layer-grouping Slice 5 amendment — possible reparent
    // targets for the "Move to group…" submenu: every other group on
    // the same layer that's NOT this group and NOT a descendant of
    // it (cycle guard). The store's moveFeatureGroup also enforces
    // this at write time, but pre-filtering keeps invalid options
    // off the menu.
    const allGroups = drawingStore.document.featureGroups ?? {};
    const descendants = new Set(allDescendants(allGroups, group.id));
    const moveTargets = Object.values(allGroups).filter((g) =>
      g.id !== group.id
      && g.layerId === group.layerId
      && !descendants.has(g.id),
    );
    const item = (label: string, action: () => void, opts: { danger?: boolean; disabled?: boolean } = {}) => (
      <button
        type="button"
        data-testid={`target-context-menu-item-${label.toLowerCase().replace(/\s+/g, '-')}`}
        disabled={opts.disabled}
        onClick={() => {
          if (opts.disabled) return;
          action();
          onClose();
        }}
        className={
          'w-full text-left px-3 py-1 text-xs transition-colors ' +
          (opts.disabled
            ? 'text-gray-600 cursor-not-allowed'
            : opts.danger
              ? 'text-red-400 hover:bg-red-900/40'
              : 'text-gray-200 hover:bg-gray-700')
        }
      >
        {label}
      </button>
    );

    return (
      <div
        ref={ref}
        data-testid="target-context-menu-group"
        data-target-kind="group"
        data-target-id={target.id}
        className="fixed z-50 min-w-[180px] max-w-[260px] bg-gray-800 border border-gray-700 rounded shadow-xl py-1"
        style={{ left: x, top: y }}
        role="menu"
      >
        <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-700">
          Group: {group.name}
        </div>
        {item('Select all in group', () => {
          selectionStore.selectMultiple(group.featureIds, 'REPLACE');
        })}
        {item('Rename', () => onRequestRename?.(group.id), { disabled: !onRequestRename })}
        {isNested && item('Move to layer root', () => {
          drawingStore.moveFeatureGroup(group.id, null);
        })}
        {/* cad-layer-grouping Slice 5 amendment — "Move to group…"
            opens an inline submenu listing valid parent targets on
            the same layer. Shown only when there's at least one
            other eligible group; clicking a target calls
            moveFeatureGroup, which double-checks the cycle guard at
            the store level. */}
        {moveTargets.length > 0 && (
          <>
            <button
              type="button"
              data-testid="target-context-menu-item-move-to-group"
              onClick={() => setMoveSubOpen((v) => !v)}
              className="w-full text-left px-3 py-1 text-xs text-gray-200 hover:bg-gray-700 transition-colors flex items-center justify-between"
            >
              <span>Move to group…</span>
              <span className="text-gray-500">{moveSubOpen ? '▾' : '▸'}</span>
            </button>
            {moveSubOpen && (
              <div
                data-testid="target-context-menu-move-submenu"
                className="pl-3 max-h-40 overflow-y-auto"
              >
                {moveTargets.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    data-testid={`target-context-menu-move-target-${t.id}`}
                    onClick={() => {
                      drawingStore.moveFeatureGroup(group.id, t.id);
                      onClose();
                    }}
                    className="w-full text-left px-3 py-1 text-xs text-gray-300 hover:bg-gray-700 transition-colors truncate"
                    title={t.name}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        <div className="my-0.5 border-t border-gray-700" />
        {item('Ungroup', () => {
          drawingStore.ungroupFeatures(group.id);
        }, { danger: true })}
      </div>
    );
  }

  // Other target kinds aren't surfaced yet (Slice 5 first cut). The
  // shape stays here so future slices can layer on layer / feature
  // / selection menus without changing the public API.
  return null;
}
