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

import React, { useEffect } from 'react';
import Link from 'next/link';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
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

  const cap = capForBucket(bucket);
  const visible = actions.slice(0, cap);

  // ── Tiny: stack of two text links, icon glyph only.
  if (bucket === 'tiny') {
    return (
      <ul role="list" style={listResetStyle}>
        {visible.map((a) => (
          <li key={a.id}>
            <ActionTrigger
              action={a}
              displayStyle="icon-only"
              variant="row"
            />
          </li>
        ))}
      </ul>
    );
  }

  if (settings.layoutStyle === 'list') {
    return (
      <ul role="list" style={listResetStyle}>
        {visible.map((a) => (
          <li key={a.id}>
            <ActionTrigger
              action={a}
              displayStyle={settings.displayStyle}
              variant="row"
            />
          </li>
        ))}
      </ul>
    );
  }

  const cols = colsForBucket(bucket);
  return (
    <div
      role="list"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 'var(--hub-spc-3, 12px)',
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
    </div>
  );
}

function QuickActionsSettings({ value, onChange }: WidgetSettingsFormProps<QuickActionsContent>) {
  const settings = { ...DEFAULTS, ...value };
  function toggleAction(id: string) {
    const enabled = settings.actionIds.includes(id);
    const next = enabled
      ? settings.actionIds.filter((x) => x !== id)
      : [...settings.actionIds, id];
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

      <fieldset style={{ border: '1px solid var(--theme-border)', borderRadius: 6, padding: 'var(--hub-spc-3, 12px)' }}>
        <legend style={settingsLabelStyle}>Visible actions</legend>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
          {QUICK_ACTIONS_CATALOG.map((a) => (
            <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={settings.actionIds.includes(a.id)}
                onChange={() => toggleAction(a.id)}
              />
              <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>{a.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
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

const listResetStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--hub-spc-2, 8px)',
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
