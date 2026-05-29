'use client';
// lib/hub/widgets/recent-announcements/index.tsx
//
// Recent Announcements widget. Surfaces the last N org announcements.
// Announcements API may not exist yet — the widget renders an empty
// state until the data layer lands.
//
// Slice 117 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import {
  statNumberStyle,
  tinyStatLabelStyle,
  tinyStatWrapStyle,
} from '@/lib/hub/widgets/_shared/stat-bucket';

export interface RecentAnnouncementsContent extends Record<string, unknown> {
  unreadOnly: boolean;
  itemLimit: number;
}

const DEFAULTS: RecentAnnouncementsContent = { unreadOnly: false, itemLimit: 3 };

interface Announcement {
  id: string;
  title: string;
  body?: string | null;
  author?: string | null;
  created_at: string;
  unread?: boolean;
}

const ENDPOINT = '/api/admin/announcements';

function RecentAnnouncementsWidget({ size, content }: WidgetProps<RecentAnnouncementsContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [items, setItems] = useState<Announcement[]>([]);

  const { unreadOnly, itemLimit } = settings;
  const fetchItems = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch(`${ENDPOINT}?limit=${itemLimit}`);
      if (!res.ok) { setStatus('empty'); return; }
      const data: { announcements?: Announcement[] } = await res.json();
      const list = filterAnnouncements(data.announcements ?? [], { unreadOnly });
      setItems(list);
      setStatus(list.length === 0 ? 'empty' : 'ok');
    } catch {
      setStatus('empty');
    }
  }, [unreadOnly, itemLimit]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  if (status === 'loading') return <WidgetSkeleton rows={2} />;
  if (status === 'empty') {
    if (bucket === 'tiny') {
      return (
        <div style={tinyStatWrapStyle()}>
          <span style={statNumberStyle(bucket, 'var(--theme-fg-secondary)')}>0</span>
          <span style={tinyStatLabelStyle()}>updates</span>
        </div>
      );
    }
    return <WidgetEmpty icon="📢" title="No announcements" description="New org-wide updates will show up here." />;
  }

  if (bucket === 'tiny') {
    return (
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, 'var(--theme-info)')}>{items.length}</span>
        <span style={tinyStatLabelStyle()}>{items.length === 1 ? 'update' : 'updates'}</span>
      </div>
    );
  }

  const visible = items.slice(0, capForBucket(bucket));
  return (
    <ul role="list" style={listStyle}>
      {visible.map((a) => (
        <li key={a.id} style={rowStyle}>
          {a.unread && (
            <span aria-label="Unread" style={{ width: 8, height: 8, borderRadius: 8, background: 'var(--theme-accent)' }} />
          )}
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
            <span style={titleStyle}>{a.title}</span>
            {a.body && (
              <span style={previewStyle}>{a.body}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RecentAnnouncementsSettings({ value, onChange }: WidgetSettingsFormProps<RecentAnnouncementsContent>) {
  const settings = { ...DEFAULTS, ...value };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="checkbox"
          checked={settings.unreadOnly}
          onChange={(e) => onChange({ ...settings, unreadOnly: e.target.checked })}
        />
        <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>Show only unread announcements</span>
      </label>
      <label>
        <span style={labelStyle}>Max items</span>
        <input
          type="number"
          min={1}
          max={10}
          value={settings.itemLimit}
          onChange={(e) => onChange({ ...settings, itemLimit: Math.max(1, Math.min(10, Number(e.target.value))) })}
        />
      </label>
    </div>
  );
}

defineWidget<RecentAnnouncementsContent>({
  id: 'recent-announcements',
  label: 'Recent Announcements',
  description: 'The last few org-wide announcements.',
  category: 'communication',
  iconName: 'Megaphone',
  defaultSize: { w: 4, h: 2 },
  // Slice 216 — minSize lowered to 1×1 with the tiny counter mode.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 8, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: [],
  Widget: RecentAnnouncementsWidget,
  SettingsForm: RecentAnnouncementsSettings,
});

export function capForBucket(bucket: SizeBucket): number {
  switch (bucket) {
    case 'tiny':   return 1;
    case 'small':  return 2;
    case 'medium': return 3;
    case 'large':  return 5;
    case 'xlarge': return 10;
  }
}

export function filterAnnouncements(
  list: Announcement[],
  settings: Pick<RecentAnnouncementsContent, 'unreadOnly'>,
): Announcement[] {
  if (!settings.unreadOnly) return list;
  return list.filter((a) => a.unread);
}

const listStyle: React.CSSProperties = {
  listStyle: 'none', padding: 0, margin: 0,
  display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)',
};

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 'var(--hub-spc-2, 8px)',
  padding: 'var(--hub-spc-2, 8px) var(--hub-spc-3, 12px)',
  borderRadius: 6, background: 'var(--theme-bg-elevated)',
};

const titleStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 600,
  color: 'var(--theme-fg-primary)',
};

const previewStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)',
  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 600, marginBottom: 4,
};
