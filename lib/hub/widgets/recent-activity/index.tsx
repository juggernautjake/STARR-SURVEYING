'use client';
// lib/hub/widgets/recent-activity/index.tsx
//
// Recent Activity widget. Reads `recentRoutes` from the admin
// nav-store and renders the user's most-recently-visited pages.
// Activity-log integration (e.g., "you marked job X complete") lands
// in a follow-up slice once the user-scoped activity API exists.
//
// Slice 114 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useAdminNavStore } from '@/lib/admin/nav-store';
import { ADMIN_ROUTES, type AdminRoute } from '@/lib/admin/route-registry';
import { resolveRouteHrefs } from '@/lib/hub/widgets/_shared/route-resolve';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import {
  statNumberStyle,
  tinyStatLabelStyle,
  tinyStatWrapStyle,
} from '@/lib/hub/widgets/_shared/stat-bucket';

/**
 * C0m (2026-08-15) — `includeTypes: ActivityType[]` was removed rather than given a control.
 *
 * The C0l audit found it as the ONE genuinely unreachable setting across all 54 widgets: the
 * widget read it to decide whether to render recent routes, and no form ever offered it. The
 * obvious fix is a checkbox. It would have been the wrong one.
 *
 * `ActivityType` had exactly one member. So the control's only "off" state renders an empty
 * widget — a checkbox labelled, in effect, *"show nothing"*, for which removing the tile is both
 * the better answer and the one already available.
 *
 * It was a placeholder: the form's own note said *"activity log integration lands in a follow-up
 * slice"*. That follow-up landed as the separate `activity` widget, which supersedes this one —
 * this widget stays registered only so saved layouts keep their tile. The key outlived the plan it
 * was reserved for, which is the same shape as the `padding-right: 14rem` in C0j.
 *
 * Safe to drop: no external consumer, and no hub layout in the live database stores it — or even
 * has this widget. `{ ...DEFAULTS, ...content }` ignores a stray saved key harmlessly.
 */
export interface RecentActivityContent extends Record<string, unknown> {
  itemLimit: number;
}

const DEFAULTS: RecentActivityContent = {
  itemLimit: 8,
};

function RecentActivityWidget({ size, content }: WidgetProps<RecentActivityContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const recentRoutes = useAdminNavStore((s) => s.recentRoutes);

  // R2 — resolve recent hrefs against the route table, DROPPING any that
  // no longer resolve (a retired route would be a dead link). Then cap.
  const resolved = useMemo(
    () => resolveRouteHrefs(recentRoutes, ADMIN_ROUTES),
    [recentRoutes],
  );
  const items = useMemo(
    () => resolved.slice(0, Math.min(settings.itemLimit, capForBucket(bucket))),
    [resolved, settings.itemLimit, bucket],
  );

  if (items.length === 0) {
    if (bucket === 'tiny') {
      return (
        <div style={tinyStatWrapStyle()}>
          <span style={statNumberStyle(bucket, 'var(--theme-fg-secondary)')}>0</span>
          <span style={tinyStatLabelStyle()}>recent</span>
        </div>
      );
    }
    return (
      <WidgetEmpty
        icon="🕘"
        title="No recent activity"
        description="Pages you visit will appear here for quick re-entry."
      />
    );
  }

  // Tiny — counter card showing how many resolvable recent pages are
  // tracked (matches what the list renders).
  if (bucket === 'tiny') {
    return (
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, 'var(--theme-fg-primary)')}>{resolved.length}</span>
        <span style={tinyStatLabelStyle()}>recent</span>
      </div>
    );
  }

  return (
    <ul role="list" style={listStyle}>
      {items.map((it) => (
        <li key={it.href}>
          <Link href={it.href} style={rowStyle}>
            <span style={iconStyle} aria-hidden>
              {iconForRoute(it.iconName)}
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
              <span style={titleStyle}>{it.label || trimHref(it.href)}</span>
              <span style={mutedStyle}>{it.href}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function RecentActivitySettings({ value, onChange }: WidgetSettingsFormProps<RecentActivityContent>) {
  const settings = { ...DEFAULTS, ...value };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <label>
        <span style={labelStyle}>Max items</span>
        <input
          type="number"
          min={1}
          max={20}
          value={settings.itemLimit}
          onChange={(e) => onChange({ ...settings, itemLimit: Math.max(1, Math.min(20, Number(e.target.value))) })}
        />
      </label>
      <p style={{ fontSize: '0.75rem', color: 'var(--theme-fg-secondary)', margin: 0 }}>
        Tracks the pages you visit most recently. For job events and activity together, use the
        Activity widget — it supersedes this one.
      </p>
    </div>
  );
}

// consolidation Slice 5 (2026-05-30) — SUPERSEDED by `activity`,
// the unified job-events + recent-pages widget. Stays registered so
// saved hub layouts keep their tile.
defineWidget<RecentActivityContent>({
  id: 'recent-activity',
  label: 'Recent Activity',
  description: 'Pages you visited recently and recent events.',
  category: 'personal',
  iconName: 'History',
  defaultSize: { w: 3, h: 3 },
  // Slice 213 — minSize lowered to 1×1 with the tiny counter mode.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 6, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: [],
  Widget: RecentActivityWidget,
  SettingsForm: RecentActivitySettings,
});

// ─── Helpers (exported for tests) ────────────────────────────────────

export function capForBucket(bucket: SizeBucket): number {
  switch (bucket) {
    case 'tiny':   return 2;
    case 'small':  return 4;
    case 'medium': return 6;
    case 'large':  return 12;
    case 'xlarge': return 20;
  }
}

export function trimHref(href: string): string {
  return href.replace(/^\/admin\//, '');
}

export function iconForRoute(iconName?: string): string {
  switch (iconName) {
    case 'Home': return '🏠';
    case 'FolderOpen': return '📁';
    case 'Calendar': return '🗓';
    case 'Wallet': return '💰';
    case 'MessageSquare': return '💬';
    case 'GraduationCap': return '🎓';
    case 'Briefcase': return '💼';
    case 'Receipt': return '🧾';
    case 'PenTool': return '✏️';
    default: return '🔗';
  }
}

export type { AdminRoute };

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--hub-spc-2, 8px)',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--hub-spc-2, 8px)',
  padding: 'var(--hub-spc-2, 8px) var(--hub-spc-3, 12px)',
  borderRadius: 6,
  background: 'var(--theme-bg-elevated)',
  textDecoration: 'none',
  color: 'var(--theme-fg-primary)',
};

const iconStyle: React.CSSProperties = {
  fontSize: '1rem',
  flexShrink: 0,
};

const titleStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const mutedStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.75rem)',
  color: 'var(--theme-fg-secondary)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 600,
  marginBottom: 4,
};
