'use client';
// lib/hub/widgets/quick-actions/index.tsx
//
// Quick Actions widget. Surfaces a user-curated grid (or list) of
// shortcut tiles — clock in/out, new job, approve receipts, etc. All
// five size buckets supported. Settings drive: which actions are
// shown, their order, layout (grid/list), display style (icon-only or
// icon+label), and ⌘1–⌘9 keyboard shortcuts on the first nine tiles.
//
// Slice 95 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket } from '@/lib/hub/size-bucket';
import { useElementSize } from '@/lib/hub/use-element-size';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import { gridCapacity, listCapacity, splitForCapacity } from './capacity';
import {
  moveUp,
  moveDown,
  addOrdered,
  removeOrdered,
  unselectedOptions,
} from '@/lib/hub/widgets/_shared/ordered-list';
import {
  QUICK_ACTIONS_CATALOG,
  DEFAULT_QUICK_ACTION_IDS,
  findQuickAction,
  type QuickActionDef,
} from '@/lib/hub/quick-actions-catalog';

export interface QuickActionsContent extends Record<string, unknown> {
  /** Ordered list of action ids the user wants displayed. Defaults to
   *  every catalog entry — settings panel lets the user reorder + hide. */
  actionIds: string[];
  layoutStyle: 'grid' | 'list';
  /** 'icon-label' shows the action label under the icon; 'icon-only'
   *  hides it (icon-only is most useful in tiny/small buckets). */
  displayStyle: 'icon-label' | 'icon-only';
  /** When true, attaches ⌘1–⌘9 keyboard shortcuts to the first 9
   *  visible actions. Off by default — power users can opt in. */
  enableShortcuts: boolean;
}

const DEFAULTS: QuickActionsContent = {
  actionIds: [...DEFAULT_QUICK_ACTION_IDS],
  layoutStyle: 'grid',
  displayStyle: 'icon-label',
  enableShortcuts: false,
};

function QuickActionsWidget({ size, content }: WidgetProps<QuickActionsContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);

  // Self-measure the rendered body so capacity fills the actual cell
  // (doc 15: "render the maximum that fit the widget size") rather than
  // a hard per-bucket cap. Falls back to the bucket cap before the
  // ResizeObserver first fires (widthPx/heightPx === 0).
  const containerRef = useRef<HTMLDivElement>(null);
  const { widthPx, heightPx } = useElementSize(containerRef);

  // Resolve ids → defs. Skip retired ids gracefully.
  const actions: QuickActionDef[] = settings.actionIds
    .map((id) => findQuickAction(id))
    .filter((a): a is QuickActionDef => a !== undefined);

  // ⌘1–⌘9 shortcuts on first 9. Defensive: skip when SSR (no window)
  // and when the user has disabled shortcuts.
  useEffect(() => {
    if (!settings.enableShortcuts) return;
    if (typeof window === 'undefined') return;
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > 9) return;
      const target = actions[n - 1];
      if (!target) return;
      e.preventDefault();
      if (target.kind === 'link' && target.href) {
        window.location.assign(target.href);
      }
      // action-kind handlers wire up in slice 156/159; silently ignored
      // until then.
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions, settings.enableShortcuts]);

  if (actions.length === 0) {
    return (
      <WidgetEmpty
        icon="⚡"
        title="No quick actions yet"
        description="Pick the shortcuts you use most from the settings panel."
      />
    );
  }

  // Tiny + explicit list layout both render a vertical row stack; the
  // grid layout fills cols × rows. Capacity comes from the measured body
  // (bucket cap as the pre-measure fallback).
  const isRowLayout = bucket === 'tiny' || settings.layoutStyle === 'list';
  const rowDisplay = bucket === 'tiny' ? 'icon-only' : settings.displayStyle;

  const { cap, cols } = computeCapacity({
    bucket,
    widthPx,
    heightPx,
    isRowLayout,
    displayStyle: rowDisplay,
  });
  const { visible, overflow } = splitForCapacity(actions, cap);

  if (isRowLayout) {
    return (
      <div ref={containerRef} style={{ height: '100%' }}>
        <ul role="list" style={listFillStyle}>
          {visible.map((a) => (
            <li key={a.id}>
              <ActionTrigger action={a} displayStyle={rowDisplay} variant="row" />
            </li>
          ))}
          {overflow > 0 && (
            <li>
              <OverflowIndicator count={overflow} variant="row" />
            </li>
          )}
        </ul>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="list"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: 'var(--hub-spc-3, 12px)',
        alignContent: 'start',
        height: '100%',
      }}
    >
      {visible.map((a) => (
        <ActionTrigger
          key={a.id}
          action={a}
          displayStyle={settings.displayStyle}
          variant="tile"
        />
      ))}
      {overflow > 0 && <OverflowIndicator count={overflow} variant="tile" />}
    </div>
  );
}

/** Capacity from the measured body, with the bucket cap as the
 *  pre-measure fallback. Icon-only tiles pack tighter than icon+label. */
export function computeCapacity({
  bucket,
  widthPx,
  heightPx,
  isRowLayout,
  displayStyle,
}: {
  bucket: ReturnType<typeof sizeBucket>;
  widthPx: number;
  heightPx: number;
  isRowLayout: boolean;
  displayStyle: 'icon-label' | 'icon-only';
}): { cap: number; cols: number } {
  if (isRowLayout) {
    if (heightPx <= 0) return { cap: capForBucket(bucket), cols: 1 };
    return { cap: listCapacity(heightPx, { rowH: 44 }).cap, cols: 1 };
  }
  if (widthPx <= 0 || heightPx <= 0) {
    return { cap: capForBucket(bucket), cols: colsForBucket(bucket) };
  }
  const iconOnly = displayStyle === 'icon-only';
  const minTileW = iconOnly ? 56 : 84;
  const minTileH = iconOnly ? 52 : 66;
  const { cap, cols } = gridCapacity(widthPx, heightPx, { minTileW, minTileH });
  return { cap, cols };
}

/** A non-interactive "+N more" cell shown when the chosen actions
 *  overflow the available capacity. It links nowhere (never a dead
 *  link) — the hint tells the user how to reveal the rest. */
function OverflowIndicator({ count, variant }: { count: number; variant: 'tile' | 'row' }) {
  const base = variant === 'tile' ? tileStyle : rowStyle;
  return (
    <div
      role="listitem"
      style={{ ...base, color: 'var(--theme-fg-secondary)', cursor: 'default' }}
      title={`${count} more action${count === 1 ? '' : 's'} — resize the widget larger or trim the list in settings`}
      aria-label={`${count} more actions`}
    >
      <span aria-hidden style={{ fontSize: variant === 'tile' ? '1.1rem' : '1rem', fontWeight: 600 }}>
        +{count}
      </span>
      {variant === 'row' && <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>more</span>}
    </div>
  );
}

function QuickActionsSettings({ value, onChange }: WidgetSettingsFormProps<QuickActionsContent>) {
  const settings = { ...DEFAULTS, ...value };
  const allIds = QUICK_ACTIONS_CATALOG.map((a) => a.id);

  // Selected = the user's ordered list (drop any retired ids). The
  // "add" candidates are the catalog entries not yet chosen, in catalog
  // order — doc 15's reorderable chip/multi-select, built on the shared
  // ordered-list helpers (Foundation Doc 02 Slice 4).
  const selected = settings.actionIds.filter((id) => allIds.includes(id));
  const addable = unselectedOptions(selected, allIds);

  function setIds(next: string[]) {
    onChange({ ...settings, actionIds: next });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <label>
        <span style={settingsLabelStyle}>Layout</span>
        <select
          value={settings.layoutStyle}
          onChange={(e) => onChange({ ...settings, layoutStyle: e.target.value as QuickActionsContent['layoutStyle'] })}
        >
          <option value="grid">Grid</option>
          <option value="list">List</option>
        </select>
      </label>

      <label>
        <span style={settingsLabelStyle}>Display</span>
        <select
          value={settings.displayStyle}
          onChange={(e) => onChange({ ...settings, displayStyle: e.target.value as QuickActionsContent['displayStyle'] })}
        >
          <option value="icon-label">Icon + label</option>
          <option value="icon-only">Icon only</option>
        </select>
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={settings.enableShortcuts}
          onChange={(e) => onChange({ ...settings, enableShortcuts: e.target.checked })}
        />
        <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>
          Enable ⌘1–⌘9 shortcuts on the first nine actions
        </span>
      </label>

      {/* Reorderable chosen-actions list. */}
      <fieldset style={{ border: '1px solid var(--theme-border)', borderRadius: 6, padding: 'var(--hub-spc-3, 12px)' }}>
        <legend style={settingsLabelStyle}>Shown actions</legend>
        {selected.length === 0 ? (
          <p style={{ margin: 0, fontSize: 'var(--hub-font-sm, 0.875rem)', color: 'var(--theme-fg-secondary)' }}>
            No actions selected — add one below.
          </p>
        ) : (
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
            {selected.map((id, i) => {
              const def = findQuickAction(id);
              return (
                <li key={id} style={chosenRowStyle}>
                  <span aria-hidden style={{ color: colorForTint(def?.tint), width: 18, textAlign: 'center' }}>
                    {emojiForAction(def?.iconName ?? '')}
                  </span>
                  <span style={{ flex: 1, fontSize: 'var(--hub-font-sm, 0.875rem)' }}>{def?.label ?? id}</span>
                  <button type="button" aria-label={`Move ${def?.label ?? id} up`} disabled={i === 0}
                    onClick={() => setIds(moveUp(selected, i))} style={iconBtnStyle}>↑</button>
                  <button type="button" aria-label={`Move ${def?.label ?? id} down`} disabled={i === selected.length - 1}
                    onClick={() => setIds(moveDown(selected, i))} style={iconBtnStyle}>↓</button>
                  <button type="button" aria-label={`Remove ${def?.label ?? id}`}
                    onClick={() => setIds(removeOrdered(selected, id))} style={iconBtnStyle}>✕</button>
                </li>
              );
            })}
          </ol>
        )}
      </fieldset>

      {/* Add candidates. */}
      {addable.length > 0 && (
        <fieldset style={{ border: '1px solid var(--theme-border)', borderRadius: 6, padding: 'var(--hub-spc-3, 12px)' }}>
          <legend style={settingsLabelStyle}>Add an action</legend>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--hub-spc-2, 8px)' }}>
            {addable.map((id) => {
              const def = findQuickAction(id);
              return (
                <button key={id} type="button" onClick={() => setIds(addOrdered(selected, id))} style={addChipStyle}>
                  <span aria-hidden style={{ color: colorForTint(def?.tint) }}>{emojiForAction(def?.iconName ?? '')}</span>
                  <span>{def?.label ?? id}</span>
                  <span aria-hidden style={{ color: 'var(--theme-fg-secondary)' }}>＋</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {/* Live preview of the chosen action grid. */}
      <div>
        <span style={settingsLabelStyle}>Preview</span>
        {selected.length === 0 ? (
          <p style={{ margin: 0, fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>
            Add actions to preview them.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--hub-spc-2, 8px)' }}>
            {selected.slice(0, 8).map((id) => {
              const def = findQuickAction(id);
              return (
                <div key={id} style={{ ...tileStyle, minHeight: 48, padding: 8 }}>
                  <span aria-hidden style={{ color: colorForTint(def?.tint), fontSize: '1.1rem' }}>
                    {emojiForAction(def?.iconName ?? '')}
                  </span>
                  {settings.displayStyle === 'icon-label' && (
                    <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)' }}>{def?.label ?? id}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

defineWidget<QuickActionsContent>({
  id: 'quick-actions',
  label: 'Quick Actions',
  description: 'Customizable shortcuts to your most-used flows.',
  category: 'personal',
  iconName: 'Zap',
  defaultSize: { w: 4, h: 2 },
  // Slice 217 — minSize lowered to 1×1; widget already had a tiny bucket render.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 8, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: [],
  Widget: QuickActionsWidget,
  SettingsForm: QuickActionsSettings,
});

// ─── Trigger ───────────────────────────────────────────────────────────

function ActionTrigger({
  action,
  displayStyle,
  variant,
}: {
  action: QuickActionDef;
  displayStyle: 'icon-label' | 'icon-only';
  variant: 'tile' | 'row';
}) {
  const containerStyle = variant === 'tile' ? tileStyle : rowStyle;
  const tintColor = colorForTint(action.tint);

  const inner = (
    <>
      <span aria-hidden style={{ fontSize: variant === 'tile' ? '1.25rem' : '1.1rem', color: tintColor, lineHeight: 1 }}>
        {emojiForAction(action.iconName)}
      </span>
      {displayStyle === 'icon-label' && (
        <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500 }}>{action.label}</span>
      )}
    </>
  );

  if (action.kind === 'link' && action.href) {
    return (
      <Link href={action.href} role="listitem" style={containerStyle} aria-label={action.label}>
        {inner}
      </Link>
    );
  }

  // Command actions render as a disabled-style button until their
  // handler ships in a later slice.
  return (
    <button
      type="button"
      role="listitem"
      disabled
      style={{ ...containerStyle, opacity: 0.7, cursor: 'not-allowed', border: 'none' }}
      aria-label={`${action.label} (coming soon)`}
      title="Coming soon"
    >
      {inner}
    </button>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────

export function colsForBucket(bucket: ReturnType<typeof sizeBucket>): number {
  switch (bucket) {
    case 'tiny': return 1;
    case 'small': return 2;
    case 'medium': return 3;
    case 'large': return 4;
    case 'xlarge': return 6;
  }
}

export function capForBucket(bucket: ReturnType<typeof sizeBucket>): number {
  switch (bucket) {
    case 'tiny': return 2;
    case 'small': return 4;
    case 'medium': return 6;
    case 'large': return 12;
    case 'xlarge': return 24;
  }
}

function colorForTint(tint: QuickActionDef['tint']): string {
  switch (tint) {
    case 'success': return 'var(--theme-success)';
    case 'warning': return 'var(--theme-warning)';
    case 'info':    return 'var(--theme-info)';
    case 'danger':  return 'var(--theme-danger)';
    case 'accent':
    case undefined: return 'var(--theme-accent)';
  }
}

function emojiForAction(iconName: string): string {
  // Same fallback table style as pinned-pages — replaced with real
  // lucide components in slice 100.
  const map: Record<string, string> = {
    Clock: '⏱',
    FilePlus: '➕',
    BadgeCheck: '✔︎',
    FileBarChart: '📊',
    PenTool: '✏️',
    MessageSquarePlus: '💬',
    Camera: '📷',
    Calendar: '🗓',
  };
  return map[iconName] ?? '⚡';
}

// ─── Style fragments ───────────────────────────────────────────────────

const listFillStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--hub-spc-2, 8px)',
  height: '100%',
};

const tileStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--hub-spc-2, 8px)',
  padding: 'var(--hub-spc-3, 12px) var(--hub-spc-2, 8px)',
  borderRadius: 8,
  textDecoration: 'none',
  color: 'var(--theme-fg-primary)',
  background: 'var(--theme-bg-elevated)',
  textAlign: 'center' as const,
  minHeight: 56,
  font: 'inherit',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--hub-spc-2, 8px)',
  padding: 'var(--hub-spc-2, 8px) var(--hub-spc-3, 12px)',
  borderRadius: 6,
  textDecoration: 'none',
  color: 'var(--theme-fg-primary)',
  background: 'var(--theme-bg-elevated)',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  width: '100%',
  font: 'inherit',
  textAlign: 'left' as const,
};

const settingsLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 600,
  marginBottom: 4,
};

const chosenRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 8px',
  borderRadius: 6,
  background: 'var(--theme-bg-elevated)',
};

const iconBtnStyle: React.CSSProperties = {
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-surface)',
  color: 'var(--theme-fg-primary)',
  borderRadius: 4,
  width: 24,
  height: 24,
  cursor: 'pointer',
  fontSize: '0.85rem',
  lineHeight: 1,
};

const addChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  borderRadius: 999,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-surface)',
  color: 'var(--theme-fg-primary)',
  cursor: 'pointer',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
};
