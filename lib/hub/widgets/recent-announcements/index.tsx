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

// hub-widget-excellence-14 R1 — the announcements GET returns
// `{ releases }` (the org's visible platform release notes:
// version/release_type/notes_markdown/published_at), NOT
// `{ announcements }` with title/body/author. The "announcements" in
// this app ARE the release notes; map them to the widget's shape.
interface RawRelease {
  id: string;
  version?: string | null;
  release_type?: string | null;
  notes_markdown?: string | null;
  published_at?: string | null;
}

/** First meaningful line of release notes, stripped of common markdown.
 *  Pure + exported. */
export function notesPreview(markdown: string | null | undefined): string {
  if (!markdown) return '';
  const firstLine = markdown
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').replace(/[*_`>]/g, '').trim())
    .find((l) => l.length > 0) ?? '';
  return firstLine.length > 140 ? `${firstLine.slice(0, 139)}…` : firstLine;
}

/** Map a release-notes row to the widget's announcement shape. Pure +
 *  exported. */
export function toAnnouncement(r: RawRelease): Announcement {
  const typeLabel = r.release_type
    ? `${r.release_type.charAt(0).toUpperCase()}${r.release_type.slice(1)} · `
    : '';
  return {
    id: r.id,
    title: `${typeLabel}v${r.version ?? '—'}`,
    body: notesPreview(r.notes_markdown),
    author: null,
    created_at: r.published_at ?? '',
    unread: undefined,
  };
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
      const data: { releases?: RawRelease[] } = await res.json();
      const list = filterAnnouncements((data.releases ?? []).map(toAnnouncement), { unreadOnly });
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

  // Slice S4 — per-bucket density:
  //   small  — title only
  //   medium — + relative date
  //   large  — + body preview (2-line clamp)
  //   xlarge — same + "Open announcements →" CTA pinned bottom
  const visible = items.slice(0, capForBucket(bucket));
  const showDate = bucket === 'medium' || bucket === 'large' || bucket === 'xlarge';
  const showPreview = bucket === 'large' || bucket === 'xlarge';
  const showOpenCta = bucket === 'xlarge';
  return (
    <div
      data-testid={`recent-announcements-${bucket}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, height: '100%' }}
    >
      <ul role="list" style={listStyle}>
        {visible.map((a) => (
          <li key={a.id} style={rowStyle}>
            {a.unread && (
              <span aria-label="Unread" style={{ width: 8, height: 8, borderRadius: 8, background: 'var(--theme-accent)' }} />
            )}
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <span style={titleStyle}>{a.title}</span>
                {showDate && a.created_at && (
                  <span
                    style={dateStyle}
                    data-testid="recent-announcements-row-date"
                    title={a.created_at}
                  >
                    {formatPublishedAge(a.created_at)}
                  </span>
                )}
              </span>
              {showPreview && a.body && (
                <span style={previewStyle} data-testid="recent-announcements-row-preview">{a.body}</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {showOpenCta && (
        <a
          href="/admin/announcements"
          data-testid="recent-announcements-cta"
          style={ctaStyle}
        >
          Open announcements →
        </a>
      )}
    </div>
  );
}

/** Short relative age for the row date column.
 *  "5m" / "3h" / "2d" / "Jun 18" past 7 days. Pure + exported. */
export function formatPublishedAge(iso: string, nowMs: number = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const ms = nowMs - t;
  if (ms < 60_000) return 'just now';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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

const dateStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.7rem)', color: 'var(--theme-fg-secondary)',
  whiteSpace: 'nowrap', flexShrink: 0,
};

const ctaStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: '4px 10px',
  borderRadius: 6,
  background: 'var(--theme-accent, #3b82f6)',
  color: 'white',
  fontSize: '0.75rem',
  fontWeight: 600,
  textDecoration: 'none',
  alignSelf: 'flex-start',
  marginTop: 'auto',
};
