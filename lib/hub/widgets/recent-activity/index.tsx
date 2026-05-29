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
import { findRoute, type AdminRoute } from '@/lib/admin/route-registry';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';

export type ActivityType = 'recent-routes';

export interface RecentActivityContent extends Record<string, unknown> {
  itemLimit: number;
  includeTypes: ActivityType[];
}

const DEFAULTS: RecentActivityContent = {
  itemLimit: 8,
  includeTypes: ['recent-routes'],
};

function RecentActivityWidget({ size, content }: WidgetProps<RecentActivityContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const recentRoutes = useAdminNavStore((s) => s.recentRoutes);

  const items = useMemo(() => {
    if (!settings.includeTypes.includes('recent-routes')) return [];
    const cap = Math.min(settings.itemLimit, capForBucket(bucket));
    return recentRoutes.slice(0, cap).map((href) => {
      const route = findRoute(href);
      return { href, route };
    });
  }, [recentRoutes, settings.includeTypes, settings.itemLimit, bucket]);

  if (items.length === 0) {
    return (
      <WidgetEmpty
        icon="🕘"
        title="No recent activity"
        description="Pages you visit will appear here for quick re-entry."
      />
    );
  }

  return (
    <ul role="list" style={listStyle}>
      {items.map(({ href, route }) => (
        <li key={href}>
          <Link href={href} style={rowStyle}>
            <span style={iconStyle} aria-hidden>
              {iconForRoute(route?.iconName)}
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
              <span style={titleStyle}>{route?.label ?? trimHref(href)}</span>
              {bucket !== 'tiny' && (
                <span style={mutedStyle}>{href}</span>
              )}
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
        Activity log integration lands in a follow-up slice. For now,
        this widget tracks the pages you visit most recently.
      </p>
    </div>
  );
}

defineWidget<RecentActivityContent>({
  id: 'recent-activity',
  label: 'Recent Activity',
  description: 'Pages you visited recently and recent events.',
  category: 'personal',
  iconName: 'History',
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 2, h: 2 },
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
