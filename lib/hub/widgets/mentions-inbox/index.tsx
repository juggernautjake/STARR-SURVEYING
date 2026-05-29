'use client';
// lib/hub/widgets/mentions-inbox/index.tsx
//
// Mentions Inbox widget. Surfaces conversations / threads with direct
// mentions of the current user.
// Slice 119 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';

export type MentionDateRange = 'today' | 'week' | 'month' | 'all';

export interface MentionsInboxContent extends Record<string, unknown> {
  dateRange: MentionDateRange;
}

const DEFAULTS: MentionsInboxContent = { dateRange: 'week' };

interface Mention {
  id: string;
  message_id: string;
  conversation_id: string;
  conversation_title?: string | null;
  author_email?: string | null;
  body_preview?: string | null;
  created_at: string;
}

function MentionsInboxWidget({ size, content }: WidgetProps<MentionsInboxContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [status, setStatus] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [mentions, setMentions] = useState<Mention[]>([]);

  const fetchMentions = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/admin/messages/mentions');
      if (!res.ok) { setStatus('empty'); return; }
      const data: { mentions?: Mention[] } = await res.json();
      const list = filterByRange(data.mentions ?? [], settings.dateRange);
      setMentions(list);
      setStatus(list.length === 0 ? 'empty' : 'ok');
    } catch {
      setStatus('empty');
    }
  }, [settings.dateRange]);

  useEffect(() => { fetchMentions(); }, [fetchMentions]);

  if (status === 'loading') return <WidgetSkeleton rows={3} />;
  if (status === 'empty') return <WidgetEmpty icon="@" title="No mentions" description="Direct @-mentions appear here for quick reply." />;

  const visible = mentions.slice(0, capForBucket(bucket));
  return (
    <ul role="list" style={listStyle}>
      {visible.map((m) => (
        <li key={m.id} style={rowStyle}>
          <span style={mentionBadgeStyle} aria-hidden>@</span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
            <span style={titleStyle}>{m.conversation_title ?? 'Conversation'}</span>
            {bucket !== 'tiny' && m.body_preview && (
              <span style={previewStyle}>{m.body_preview}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function MentionsInboxSettings({ value, onChange }: WidgetSettingsFormProps<MentionsInboxContent>) {
  const settings = { ...DEFAULTS, ...value };
  return (
    <label>
      <span style={labelStyle}>Date range</span>
      <select value={settings.dateRange} onChange={(e) => onChange({ ...settings, dateRange: e.target.value as MentionDateRange })}>
        <option value="today">Today</option>
        <option value="week">Past 7 days</option>
        <option value="month">Past 30 days</option>
        <option value="all">All time</option>
      </select>
    </label>
  );
}

defineWidget<MentionsInboxContent>({
  id: 'mentions-inbox',
  label: 'Mentions Inbox',
  description: 'Direct @-mentions across DMs + threads.',
  category: 'communication',
  iconName: 'AtSign',
  defaultSize: { w: 4, h: 3 },
  minSize: { w: 3, h: 2 },
  maxSize: { w: 8, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'field_crew', 'drawer', 'researcher', 'equipment_manager', 'tech_support'],
  Widget: MentionsInboxWidget,
  SettingsForm: MentionsInboxSettings,
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

export function filterByRange(list: Mention[], range: MentionDateRange, nowMs: number = Date.now()): Mention[] {
  if (range === 'all') return list;
  const ms = rangeToMs(range);
  return list.filter((m) => {
    const t = Date.parse(m.created_at);
    return Number.isFinite(t) && nowMs - t <= ms;
  });
}

function rangeToMs(range: Exclude<MentionDateRange, 'all'>): number {
  switch (range) {
    case 'today': return 24 * 3600 * 1000;
    case 'week':  return 7 * 24 * 3600 * 1000;
    case 'month': return 30 * 24 * 3600 * 1000;
  }
}

const listStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' };
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 6, background: 'var(--theme-bg-elevated)' };
const mentionBadgeStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, background: 'var(--theme-accent)', color: 'var(--theme-accent-fg)', fontWeight: 700, fontSize: '0.85rem', flexShrink: 0 };
const titleStyle: React.CSSProperties = { fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500, color: 'var(--theme-fg-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const previewStyle: React.CSSProperties = { fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 600, marginBottom: 4 };
