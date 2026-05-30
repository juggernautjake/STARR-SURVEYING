'use client';
// lib/hub/widgets/open-discussions/index.tsx
//
// Open Discussions widget. Reads `/api/admin/messages/conversations`
// and surfaces conversations awaiting the user's reply.
//
// Slice 116 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import WidgetError from '@/lib/hub/components/WidgetError';
import {
  statNumberStyle,
  tinyStatLabelStyle,
  tinyStatWrapStyle,
} from '@/lib/hub/widgets/_shared/stat-bucket';

// hub-widget-excellence-14 R1 — open-discussions read the messages
// conversations API, but discussions are a SEPARATE feature:
// `/api/admin/discussions` returns `{ threads }` (`discussion_threads`
// rows with title/status/created_at) and lives at /admin/discussions/{id}.
export type DiscussionScope = 'open' | 'all';

export interface OpenDiscussionsContent extends Record<string, unknown> {
  scope: DiscussionScope;
}

const DEFAULTS: OpenDiscussionsContent = { scope: 'open' };

interface RawThread {
  id: string;
  title?: string | null;
  status?: string | null;
  created_at?: string | null;
}

interface Discussion {
  id: string;
  title: string;
  status: string;
  created_at?: string | null;
}

/** Map a raw discussion thread to the widget row. The thread title is
 *  stored prefixed "[Discussion] …" on create — strip it. Pure +
 *  exported. */
export function toDiscussion(t: RawThread): Discussion {
  const title = (t.title ?? 'Discussion').replace(/^\[Discussion\]\s*/, '').trim() || 'Discussion';
  return { id: t.id, title, status: t.status ?? 'open', created_at: t.created_at ?? null };
}

function OpenDiscussionsWidget({ size, content }: WidgetProps<OpenDiscussionsContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading');
  const [discussions, setDiscussions] = useState<Discussion[]>([]);

  const fetchData = useCallback(async () => {
    setStatus('loading');
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (settings.scope === 'open') params.set('status', 'open');
      const res = await fetch(`/api/admin/discussions?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { threads?: RawThread[] } = await res.json();
      const list = (data.threads ?? []).map(toDiscussion);
      setDiscussions(list);
      setStatus(list.length === 0 ? 'empty' : 'ok');
    } catch {
      setStatus('error');
    }
  }, [settings.scope]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;
  if (status === 'error') return <WidgetError message="Couldn't load discussions." onRetry={fetchData} />;
  if (status === 'empty') {
    if (bucket === 'tiny') {
      return (
        <div style={tinyStatWrapStyle()}>
          <span style={statNumberStyle(bucket, 'var(--theme-fg-secondary)')}>0</span>
          <span style={tinyStatLabelStyle()}>open</span>
        </div>
      );
    }
    return (
      <WidgetEmpty icon="💭" title="No open discussions" description="Discussion threads appear here." />
    );
  }

  if (bucket === 'tiny') {
    return (
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, 'var(--theme-accent)')}>{discussions.length}</span>
        <span style={tinyStatLabelStyle()}>open</span>
      </div>
    );
  }

  const showTime = bucket === 'medium' || bucket === 'large' || bucket === 'xlarge';
  const visible = discussions.slice(0, capForBucket(bucket));
  return (
    <ul role="list" style={listStyle}>
      {visible.map((d) => (
        <li key={d.id}>
          {/* Row deep link → the discussion thread. */}
          <Link href={`/admin/discussions/${d.id}`} style={rowStyle} aria-label={`Open ${d.title}`}>
            <span style={titleStyle}>{d.title}</span>
            {d.status !== 'open' && <span style={statusChipStyle}>{d.status.replace('_', ' ')}</span>}
            {showTime && d.created_at && <span style={timeStyle}>{formatRelative(d.created_at)}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function formatRelative(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return '';
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function OpenDiscussionsSettings({ value, onChange }: WidgetSettingsFormProps<OpenDiscussionsContent>) {
  const settings = { ...DEFAULTS, ...value };
  return (
    <label>
      <span style={labelStyle}>Scope</span>
      <select value={settings.scope} onChange={(e) => onChange({ ...settings, scope: e.target.value as DiscussionScope })}>
        <option value="open">Open only</option>
        <option value="all">All discussions</option>
      </select>
    </label>
  );
}

defineWidget<OpenDiscussionsContent>({
  id: 'open-discussions',
  label: 'Open Discussions',
  description: 'Conversations awaiting your reply.',
  category: 'communication',
  iconName: 'MessageCircle',
  defaultSize: { w: 3, h: 3 },
  // Slice 214 — minSize lowered to 1×1 with the tiny open-count mode.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 6, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'field_crew', 'drawer', 'researcher', 'equipment_manager', 'tech_support'],
  Widget: OpenDiscussionsWidget,
  SettingsForm: OpenDiscussionsSettings,
});

export function capForBucket(bucket: SizeBucket): number {
  switch (bucket) {
    case 'tiny':   return 2;
    case 'small':  return 4;
    case 'medium': return 6;
    case 'large':  return 10;
    case 'xlarge': return 20;
  }
}

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
  color: 'inherit',
};

const titleStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 500,
  color: 'var(--theme-fg-primary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const statusChipStyle: React.CSSProperties = {
  fontSize: '0.68rem',
  fontWeight: 600,
  textTransform: 'capitalize',
  padding: '1px 7px',
  borderRadius: 999,
  background: 'var(--theme-bg-surface)',
  color: 'var(--theme-fg-secondary)',
  border: '1px solid var(--theme-border)',
  flexShrink: 0,
};

const timeStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.75rem)',
  color: 'var(--theme-fg-secondary)',
  flexShrink: 0,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 600,
  marginBottom: 4,
};
