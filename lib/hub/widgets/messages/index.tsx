'use client';
// lib/hub/widgets/messages/index.tsx
//
// Messages widget. Reads `/api/admin/messages/conversations` and
// surfaces the user's recent conversations with an accent-tinted
// unread dot and the last-message preview.
//
// Slice 109 of customizable-hub-and-work-mode-2026-05-28.md.

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

export type MessagesSenderFilter = 'any' | 'team-only' | 'external-only';

export interface MessagesContent extends Record<string, unknown> {
  /** When true, group conversations are included alongside DMs. */
  includeGroups: boolean;
  senderFilter: MessagesSenderFilter;
  /** Whether the widget marks conversations as read after they're
   *  surfaced for `markAsReadAfterSec` seconds. */
  markAsReadOnView: boolean;
  showPreview: boolean;
  messageLimit: number;
}

const DEFAULTS: MessagesContent = {
  includeGroups: true,
  senderFilter: 'any',
  markAsReadOnView: false,
  showPreview: true,
  messageLimit: 10,
};

interface Conversation {
  id: string;
  title?: string | null;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  unread_count?: number;
  is_group?: boolean;
  /** Used by the team-only filter. */
  is_external?: boolean;
}

function MessagesWidget({ size, content }: WidgetProps<MessagesContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);

  const [status, setStatus] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading');
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const { includeGroups, senderFilter, messageLimit } = settings;
  const fetchConversations = useCallback(async () => {
    setStatus('loading');
    try {
      const params = new URLSearchParams({ limit: String(Math.max(1, Math.min(50, messageLimit))) });
      const res = await fetch(`/api/admin/messages/conversations?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { conversations?: Conversation[] } = await res.json();
      const list = filterConversations(data.conversations ?? [], { includeGroups, senderFilter });
      setConversations(list);
      setStatus(list.length === 0 ? 'empty' : 'ok');
    } catch {
      setStatus('error');
    }
  }, [includeGroups, senderFilter, messageLimit]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  if (status === 'loading') {
    return <WidgetSkeleton rows={Math.min(4, settings.messageLimit)} />;
  }
  if (status === 'error') {
    return <WidgetError message="Couldn't load messages." onRetry={fetchConversations} />;
  }
  if (status === 'empty') {
    if (bucket === 'tiny') {
      return (
        <div style={tinyStatWrapStyle()}>
          <span style={statNumberStyle(bucket, 'var(--theme-fg-secondary)')}>0</span>
          <span style={tinyStatLabelStyle()}>messages</span>
        </div>
      );
    }
    return (
      <WidgetEmpty
        icon="💬"
        title="Inbox zero"
        description="No conversations match your filters yet."
      />
    );
  }

  const totalUnread = conversations.reduce((s, c) => s + (c.unread_count ?? 0), 0);

  // Tiny — show unread count (or convo count when fully read) as a
  // single big number.
  if (bucket === 'tiny') {
    const showUnread = totalUnread > 0;
    return (
      <div style={tinyStatWrapStyle()}>
        <span style={statNumberStyle(bucket, showUnread ? 'var(--theme-accent)' : 'var(--theme-fg-primary)')}>
          {showUnread ? totalUnread : conversations.length}
        </span>
        <span style={tinyStatLabelStyle()}>{showUnread ? 'unread' : 'messages'}</span>
      </div>
    );
  }

  const cap = capForBucket(bucket);
  const visible = conversations.slice(0, cap);
  const renderPreview = settings.showPreview;

  return (
    <ul role="list" style={listStyle}>
      {visible.map((c) => {
        const hasUnread = (c.unread_count ?? 0) > 0;
        return (
          <li key={c.id} style={rowStyle}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
              {hasUnread && (
                <span
                  aria-label="Unread"
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: 8,
                    background: 'var(--theme-accent)',
                    flexShrink: 0,
                  }}
                />
              )}
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={titleStyle}>
                  {c.title ?? 'Conversation'}
                  {c.is_group && (
                    <span style={badgeStyle} aria-label="Group conversation">group</span>
                  )}
                </span>
                {renderPreview && c.last_message_preview && (
                  <span style={previewStyle}>{c.last_message_preview}</span>
                )}
              </span>
            </span>
            {c.last_message_at && (
              <span style={timestampStyle}>{formatRelative(c.last_message_at)}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function MessagesSettings({ value, onChange }: WidgetSettingsFormProps<MessagesContent>) {
  const settings = { ...DEFAULTS, ...value };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="checkbox"
          checked={settings.includeGroups}
          onChange={(e) => onChange({ ...settings, includeGroups: e.target.checked })}
        />
        <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>Include group conversations</span>
      </label>
      <label>
        <span style={labelStyle}>Sender</span>
        <select
          value={settings.senderFilter}
          onChange={(e) => onChange({ ...settings, senderFilter: e.target.value as MessagesSenderFilter })}
        >
          <option value="any">Anyone</option>
          <option value="team-only">Team only</option>
          <option value="external-only">External only</option>
        </select>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="checkbox"
          checked={settings.markAsReadOnView}
          onChange={(e) => onChange({ ...settings, markAsReadOnView: e.target.checked })}
        />
        <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>Mark as read after surfacing</span>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="checkbox"
          checked={settings.showPreview}
          onChange={(e) => onChange({ ...settings, showPreview: e.target.checked })}
        />
        <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>Show last-message preview</span>
      </label>
      <label>
        <span style={labelStyle}>Max conversations</span>
        <input
          type="number"
          min={1}
          max={50}
          value={settings.messageLimit}
          onChange={(e) => onChange({ ...settings, messageLimit: Math.max(1, Math.min(50, Number(e.target.value))) })}
        />
      </label>
    </div>
  );
}

defineWidget<MessagesContent>({
  id: 'messages',
  label: 'Messages',
  description: 'Your unread conversations with last-message preview.',
  category: 'communication',
  iconName: 'MessageSquare',
  defaultSize: { w: 3, h: 3 },
  // Slice 213 — minSize lowered to 1×1 with the tiny unread-count mode.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 6, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: ['admin', 'developer', 'field_crew', 'drawer', 'researcher', 'equipment_manager', 'tech_support'],
  Widget: MessagesWidget,
  SettingsForm: MessagesSettings,
});

// ─── Helpers (exported for tests) ────────────────────────────────────

export function capForBucket(bucket: SizeBucket): number {
  switch (bucket) {
    case 'tiny':   return 3;
    case 'small':  return 5;
    case 'medium': return 8;
    case 'large':  return 12;
    case 'xlarge': return 20;
  }
}

export function filterConversations(
  list: Conversation[],
  settings: Pick<MessagesContent, 'includeGroups' | 'senderFilter'>,
): Conversation[] {
  return list.filter((c) => {
    if (!settings.includeGroups && c.is_group) return false;
    if (settings.senderFilter === 'team-only' && c.is_external) return false;
    if (settings.senderFilter === 'external-only' && !c.is_external) return false;
    return true;
  });
}

function formatRelative(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
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
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 500,
  color: 'var(--theme-fg-primary)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const previewStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.75rem)',
  color: 'var(--theme-fg-secondary)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const timestampStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.75rem)',
  color: 'var(--theme-fg-secondary)',
  flexShrink: 0,
};

const badgeStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 6px',
  borderRadius: 999,
  fontSize: '0.7rem',
  fontWeight: 600,
  background: 'var(--theme-bg-surface)',
  color: 'var(--theme-fg-secondary)',
  border: '1px solid var(--theme-border)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 600,
  marginBottom: 4,
};
