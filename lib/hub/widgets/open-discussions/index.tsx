'use client';
// lib/hub/widgets/open-discussions/index.tsx
//
// Open Discussions widget. Reads `/api/admin/messages/conversations`
// and surfaces conversations awaiting the user's reply.
//
// Slice 116 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
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

export type DiscussionScope = 'mine' | 'mentions' | 'all';

export interface OpenDiscussionsContent extends Record<string, unknown> {
  scope: DiscussionScope;
}

const DEFAULTS: OpenDiscussionsContent = { scope: 'mine' };

interface Conversation {
  id: string;
  title?: string | null;
  unread_count?: number;
  last_message_at?: string | null;
  last_sender_email?: string | null;
  has_mention?: boolean;
}

function OpenDiscussionsWidget({ size, content }: WidgetProps<OpenDiscussionsContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading');
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const fetchData = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/admin/messages/conversations?limit=20');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { conversations?: Conversation[] } = await res.json();
      const filtered = filterByScope(data.conversations ?? [], settings.scope);
      setConversations(filtered);
      setStatus(filtered.length === 0 ? 'empty' : 'ok');
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
      <WidgetEmpty icon="💭" title="Inbox zero" description="No open discussions in scope." />
    );
  }

  if (bucket === 'tiny') {
    const withMention = conversations.filter((c) => c.has_mention).length;
    const color = withMention > 0 ? 'var(--theme-accent)' : 'var(--theme-fg-primary)';
    return (
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, color)}>{conversations.length}</span>
        <span style={tinyStatLabelStyle()}>{withMention > 0 ? `${withMention} @you` : 'open'}</span>
      </div>
    );
  }

  const visible = conversations.slice(0, capForBucket(bucket));
  return (
    <ul role="list" style={listStyle}>
      {visible.map((c) => (
        <li key={c.id} style={rowStyle}>
          {(c.unread_count ?? 0) > 0 && (
            <span aria-label="Unread" style={{ width: 8, height: 8, borderRadius: 8, background: 'var(--theme-accent)' }} />
          )}
          <span style={titleStyle}>{c.title ?? 'Conversation'}</span>
          {c.has_mention && (
            <span style={mentionStyle} aria-label="You were mentioned">@</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function OpenDiscussionsSettings({ value, onChange }: WidgetSettingsFormProps<OpenDiscussionsContent>) {
  const settings = { ...DEFAULTS, ...value };
  return (
    <label>
      <span style={labelStyle}>Scope</span>
      <select value={settings.scope} onChange={(e) => onChange({ ...settings, scope: e.target.value as DiscussionScope })}>
        <option value="mine">Awaiting my reply</option>
        <option value="mentions">Where I&apos;m mentioned</option>
        <option value="all">All open discussions</option>
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

export function filterByScope(list: Conversation[], scope: DiscussionScope, currentEmail?: string): Conversation[] {
  return list.filter((c) => {
    if (scope === 'all') return true;
    if (scope === 'mentions') return Boolean(c.has_mention);
    // 'mine': has unread and the last sender was not me (heuristic; the
    // real "awaiting my reply" lives in slice 156's messaging refactor).
    if ((c.unread_count ?? 0) === 0) return false;
    if (currentEmail && c.last_sender_email === currentEmail) return false;
    return true;
  });
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
};

const titleStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 500,
  color: 'var(--theme-fg-primary)',
};

const mentionStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 18,
  height: 18,
  borderRadius: 4,
  background: 'var(--theme-accent)',
  color: 'var(--theme-accent-fg)',
  fontWeight: 700,
  fontSize: '0.75rem',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 600,
  marginBottom: 4,
};
