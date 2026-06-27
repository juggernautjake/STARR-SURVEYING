'use client';
// lib/hub/widgets/messages/index.tsx
//
// Messages widget. Reads `/api/admin/messages/conversations` and
// surfaces the user's recent conversations with an accent-tinted
// unread dot and the last-message preview.
//
// Slice 109 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import { conversationHref } from '@/lib/hub/widgets/_shared/widget-links';
import { MESSAGES_READ_EVENT } from '@/lib/messages/read-sync';
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

/** messages-widget-richer-rows-2026-06-21 — extended participant
 *  shape the API now returns (display_name from registered_users +
 *  last_read_at for status derivation). */
export interface ConversationParticipant {
  user_email: string;
  display_name?: string | null;
  last_read_at?: string | null;
  role?: string;
}

export interface Conversation {
  id: string;
  title?: string | null;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  unread_count?: number;
  is_group?: boolean;
  /** Raw conversation type from the API ('direct' | 'group'). */
  type?: string | null;
  /** Used by the team-only filter. */
  is_external?: boolean;
  /** messages-widget-richer-rows-2026-06-21 — enriched fields. */
  participants?: ConversationParticipant[];
  last_sender_email?: string | null;
}

// hub-widget-excellence-14 R1 — the conversations API returns the raw
// `conversations` row, where the group flag is the `type` column
// ('group'), not an `is_group` boolean. Normalize it so the group badge
// + the include-groups filter work.
export function toConversation(c: Conversation): Conversation {
  return { ...c, is_group: c.is_group ?? c.type === 'group' };
}

// ── messages-widget-richer-rows-2026-06-21 — viewer-perspective status

export type ConversationStatusKind =
  | 'waiting_from_other'   // someone else sent the last message + I haven't read it (🟢)
  | 'seen_from_other'      // someone else sent the last message + I've read it (✓)
  | 'seen_by_other'        // I sent the last message + someone else has read it (✓✓)
  | 'sent_to_other'        // I sent the last message + nobody else has read it yet (✓)
  | 'no_messages';         // empty conversation

export interface ConversationStatus {
  kind: ConversationStatusKind;
  /** Pre-formatted line the widget renders ("Message waiting from John Harding"). */
  label: string;
  /** Short status icon — emoji so it renders without a font dep. */
  icon: string;
  /** ARIA description for screen readers. */
  aria: string;
}

/** Pure. Derive the viewer's perspective status from the conversation
 *  + viewer email. Source-locked in the widget's test file. */
export function deriveConversationStatus(
  conv: Conversation,
  viewerEmail: string,
): ConversationStatus {
  const lastAt = conv.last_message_at ?? null;
  if (!lastAt || !conv.last_sender_email) {
    return {
      kind: 'no_messages',
      label: 'No messages yet',
      icon: '•',
      aria: 'No messages in this conversation yet.',
    };
  }
  const participants = conv.participants ?? [];
  const others = participants.filter((p) => p.user_email !== viewerEmail);
  const viewerParticipant = participants.find((p) => p.user_email === viewerEmail);
  const senderIsViewer = conv.last_sender_email === viewerEmail;
  const otherName = others[0]?.display_name ?? others[0]?.user_email ?? 'someone';

  const lastMs = Date.parse(lastAt);

  if (senderIsViewer) {
    // I sent the last message — did any other participant read it?
    const seenByAnyone = others.some((p) => {
      if (!p.last_read_at) return false;
      const readMs = Date.parse(p.last_read_at);
      return Number.isFinite(readMs) && readMs >= lastMs;
    });
    if (seenByAnyone) {
      const seenBy = others
        .filter((p) => p.last_read_at && Date.parse(p.last_read_at) >= lastMs)
        .map((p) => p.display_name ?? p.user_email);
      const target = (conv.is_group ?? conv.type === 'group') ? 'the group' : otherName;
      return {
        kind: 'seen_by_other',
        label: (conv.is_group ?? conv.type === 'group')
          ? `Seen by ${seenBy.slice(0, 2).join(', ')}${seenBy.length > 2 ? ` +${seenBy.length - 2}` : ''}`
          : `Message Seen by ${target}`,
        icon: '✓✓',
        aria: `Your message to ${target} has been seen.`,
      };
    }
    const target = (conv.is_group ?? conv.type === 'group') ? (conv.title ?? 'the group') : otherName;
    return {
      kind: 'sent_to_other',
      label: `Message Sent to ${target}`,
      icon: '✓',
      aria: `Your message has been sent to ${target} but not yet read.`,
    };
  }

  // Someone else sent the last message — have I read it?
  const viewerReadMs = viewerParticipant?.last_read_at
    ? Date.parse(viewerParticipant.last_read_at)
    : 0;
  const senderName = participants.find((p) => p.user_email === conv.last_sender_email)?.display_name
    ?? conv.last_sender_email;

  if (Number.isFinite(viewerReadMs) && viewerReadMs >= lastMs) {
    return {
      kind: 'seen_from_other',
      label: (conv.is_group ?? conv.type === 'group')
        ? `Read · last from ${senderName}`
        : `Message Seen From ${senderName}`,
      icon: '✓',
      aria: `You've read the latest message from ${senderName}.`,
    };
  }
  return {
    kind: 'waiting_from_other',
    // No status icon — the green leading dot is the single "waiting" indicator.
    // (Previously '🟢', which duplicated the dot → two green circles per row.)
    label: (conv.is_group ?? conv.type === 'group')
      ? `New from ${senderName}`
      : `Message Waiting from ${senderName}`,
    icon: '',
    aria: `New message from ${senderName} waiting for you to read.`,
  };
}

/** Pure. Build the "X, Y, Z + 2 others" subtitle for a group row. */
export function formatGroupMemberSubtitle(
  participants: ConversationParticipant[],
  viewerEmail: string,
  cap: number = 3,
): string {
  const others = participants
    .filter((p) => p.user_email !== viewerEmail)
    .map((p) => p.display_name ?? p.user_email);
  if (others.length === 0) return 'Just you';
  if (others.length <= cap) return others.join(', ');
  return `${others.slice(0, cap).join(', ')} + ${others.length - cap} more`;
}

function MessagesWidget({ size, content }: WidgetProps<MessagesContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);

  const [status, setStatus] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [viewerEmail, setViewerEmail] = useState<string>('');

  const { includeGroups, senderFilter, messageLimit } = settings;
  const fetchConversations = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setStatus('loading');
    try {
      const params = new URLSearchParams({ limit: String(Math.max(1, Math.min(50, messageLimit))) });
      const res = await fetch(`/api/admin/messages/conversations?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { conversations?: Conversation[]; viewer_email?: string } = await res.json();
      const list = filterConversations((data.conversations ?? []).map(toConversation), { includeGroups, senderFilter });
      setConversations(list);
      setViewerEmail(data.viewer_email ?? '');
      setStatus(list.length === 0 ? 'empty' : 'ok');
    } catch {
      if (!opts?.silent) setStatus('error');
    }
  }, [includeGroups, senderFilter, messageLimit]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Cross-surface read sync: when a conversation is marked read anywhere (the
  // popup messenger or the /admin/messages page), refresh silently so this
  // widget's unread dot/highlight clears instantly — no page reload. Also catch
  // up when the tab returns to the foreground.
  useEffect(() => {
    const onRead = () => fetchConversations({ silent: true });
    const onVisible = () => { if (!document.hidden) fetchConversations({ silent: true }); };
    window.addEventListener(MESSAGES_READ_EVENT, onRead);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(MESSAGES_READ_EVENT, onRead);
      document.removeEventListener('visibilitychange', onVisible);
    };
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
        // messages-widget-richer-rows-2026-06-21 — render shape now
        // depends on (a) DM vs group, (b) viewer's perspective on the
        // last message. Status drives the leading indicator color +
        // the headline; the existing unread_count is folded into the
        // status derivation (waiting_from_other implies unread).
        const conversationStatus = deriveConversationStatus(c, viewerEmail);
        const isUnread = conversationStatus.kind === 'waiting_from_other';
        const headline = c.is_group
          ? (c.title ?? 'Group conversation')
          : (() => {
              const other = (c.participants ?? []).find((p) => p.user_email !== viewerEmail);
              return other?.display_name ?? c.title ?? 'Direct message';
            })();
        const memberSubtitle = c.is_group
          ? formatGroupMemberSubtitle(c.participants ?? [], viewerEmail)
          : null;
        const indicatorColor = statusIndicatorColor(conversationStatus.kind);

        return (
          <li key={c.id}>
            <Link
              href={conversationHref(c.id)}
              style={{
                ...rowStyle,
                background: isUnread
                  ? 'color-mix(in srgb, var(--theme-bg-elevated, #f3f4f6) 75%, var(--theme-accent, #1D3095))'
                  : 'var(--theme-bg-elevated)',
              }}
              aria-label={`${headline} — ${conversationStatus.aria}`}
              data-status={conversationStatus.kind}
            >
              {/* Leading indicator dot — green for waiting, brand for
                  sent-not-seen, etc. Always present so rows align. */}
              <span
                aria-hidden
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: indicatorColor,
                  flexShrink: 0,
                  border: conversationStatus.kind === 'no_messages' ? '1px solid var(--theme-border)' : 'none',
                }}
              />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                <span style={titleStyle}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {headline}
                  </span>
                  {c.is_group && (
                    <span style={badgeStyle} aria-label="Group conversation">group</span>
                  )}
                </span>
                {/* Status line: "Message Sent to John Harding ✓" /
                    "Message Waiting from John Harding 🟢" / etc. */}
                <span
                  style={{
                    ...previewStyle,
                    color: isUnread ? 'var(--theme-fg-primary)' : 'var(--theme-fg-secondary)',
                    fontWeight: isUnread ? 600 : 400,
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}
                >
                  {conversationStatus.icon && <span aria-hidden>{conversationStatus.icon}</span>}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {conversationStatus.label}
                  </span>
                </span>
                {/* Group member subtitle — only on group rows. */}
                {memberSubtitle && (
                  <span style={{ ...previewStyle, fontSize: 'var(--hub-font-xxs, 0.68rem)' }}>
                    {memberSubtitle}
                  </span>
                )}
                {/* Message preview — opt-in via settings. */}
                {renderPreview && c.last_message_preview && (
                  <span style={previewStyle}>{c.last_message_preview}</span>
                )}
              </span>
              {c.last_message_at && (
                <span style={timestampStyle}>{formatRelative(c.last_message_at)}</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Pick the leading-indicator color for a row by status kind. */
function statusIndicatorColor(kind: ConversationStatusKind): string {
  switch (kind) {
    case 'waiting_from_other': return '#10B981'; // green — needs your attention
    case 'sent_to_other':      return 'var(--theme-accent, #1D3095)'; // sent, awaiting read
    case 'seen_by_other':      return '#9CA3AF'; // greyed — already seen
    case 'seen_from_other':    return '#9CA3AF'; // greyed — already read
    case 'no_messages':        return 'transparent';
  }
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
  textDecoration: 'none',
  color: 'inherit',
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
