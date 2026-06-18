'use client';
// lib/hub/widgets/comms-inbox/index.tsx
//
// Slice W8 (hub-cad-roles-polish-2026-06-18) — consolidated
// communications widget. Absorbs the existing three single-stream
// widgets so one big tile shows everything the surveyor needs to
// see at once: unread DMs + recent mentions + open discussion
// threads.
//
// Size-relative content (matches the W5 pattern):
//   tiny    — single combined unread count
//   small   — list of most recent unread DMs (top 4)
//   medium  — DMs + mentions, two-column compact list
//   large   — three columns side-by-side (DMs / mentions /
//             discussions)
//   xlarge  — three columns + per-section "Show all" links
//
// Endpoints reused from the legacy widgets so this slice is
// pure UI consolidation (no API changes):
//   - /api/admin/messages/conversations?limit=12
//   - /api/admin/messages/mentions
//   - /api/admin/discussions?status=open&limit=8

import React, { useCallback, useEffect, useState } from 'react';
import { defineWidget, type WidgetProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetError from '@/lib/hub/components/WidgetError';

interface Conversation {
  id: string;
  title: string | null;
  last_message_preview: string | null;
  unread_count?: number;
}
interface Mention {
  id: string;
  body: string;
  sender_email?: string | null;
  created_at: string;
}
interface DiscussionThread {
  id: string;
  title: string;
  status: string;
  escalation_level?: string | null;
}

interface CommsContent extends Record<string, unknown> {
  /** When true, the consolidated widget shows the link in the
   *  header that opens the full /admin/messages page. */
  showOpenLink: boolean;
}
const DEFAULTS: CommsContent = { showOpenLink: true };

interface FetchState {
  status: 'loading' | 'ok' | 'empty' | 'error';
  errorMessage: string;
  conversations: Conversation[];
  mentions: Mention[];
  discussions: DiscussionThread[];
}

function CommsInboxWidget({ size, content }: WidgetProps<CommsContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const [state, setState] = useState<FetchState>({
    status: 'loading',
    errorMessage: '',
    conversations: [],
    mentions: [],
    discussions: [],
  });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading' }));
    try {
      const [convRes, mentionRes, discRes] = await Promise.all([
        fetch('/api/admin/messages/conversations?limit=12').catch(() => null),
        fetch('/api/admin/messages/mentions').catch(() => null),
        fetch('/api/admin/discussions?status=open&limit=8').catch(() => null),
      ]);

      // 401/403 → treat as empty (auth says you can't see comms;
      // not a broken service). Matches the W5/widget-empty-vs-
      // error pattern.
      function readOrSkip(res: Response | null): unknown | null {
        if (!res) return null;
        if (res.status === 401 || res.status === 403) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      }

      const convData = await readOrSkip(convRes) as { conversations?: Conversation[] } | null;
      const mentionData = await readOrSkip(mentionRes) as { mentions?: Mention[] } | null;
      const discData = await readOrSkip(discRes) as { threads?: DiscussionThread[] } | null;

      const conversations = convData?.conversations ?? [];
      const mentions = mentionData?.mentions ?? [];
      const discussions = discData?.threads ?? [];
      const total =
        conversations.reduce((acc, c) => acc + (c.unread_count ?? 0), 0)
        + mentions.length
        + discussions.length;

      setState({
        status: total === 0 ? 'empty' : 'ok',
        errorMessage: '',
        conversations,
        mentions,
        discussions,
      });
    } catch (err) {
      setState({
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
        conversations: [],
        mentions: [],
        discussions: [],
      });
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  if (state.status === 'loading') return <WidgetSkeleton rows={3} />;
  if (state.status === 'error') {
    return <WidgetError message={`Couldn't reach comms (${state.errorMessage}).`} onRetry={refresh} />;
  }
  if (state.status === 'empty') {
    return <WidgetEmpty icon="📨" title="Inbox is clear" description="No unread DMs, mentions, or open discussion threads." />;
  }

  const unreadCount = state.conversations.reduce((acc, c) => acc + (c.unread_count ?? 0), 0);
  const totalCount = unreadCount + state.mentions.length + state.discussions.length;

  // Tiny — single combined number.
  if (bucket === 'tiny') {
    return (
      <div style={tinyWrapStyle} data-testid="comms-inbox-tiny">
        <span style={tinyCountStyle}>{totalCount}</span>
        <span style={tinyLabelStyle}>unread</span>
      </div>
    );
  }

  // Small — top DM list.
  if (bucket === 'small') {
    return (
      <div style={columnStyle} data-testid="comms-inbox-small">
        <SectionHeader label="Messages" badge={unreadCount} showOpenLink={settings.showOpenLink} href="/admin/messages" />
        <ConversationList rows={state.conversations.slice(0, 4)} />
      </div>
    );
  }

  // Medium — DMs + mentions side-by-side.
  if (bucket === 'medium') {
    return (
      <div style={twoColStyle} data-testid="comms-inbox-medium">
        <section style={columnStyle}>
          <SectionHeader label="Messages" badge={unreadCount} showOpenLink={settings.showOpenLink} href="/admin/messages" />
          <ConversationList rows={state.conversations.slice(0, 4)} />
        </section>
        <section style={columnStyle}>
          <SectionHeader label="Mentions" badge={state.mentions.length} showOpenLink={settings.showOpenLink} href="/admin/messages?filter=mentions" />
          <MentionList rows={state.mentions.slice(0, 4)} />
        </section>
      </div>
    );
  }

  // Large / xlarge — three columns. xlarge adds per-section "Show
  // all" CTAs via the `showOpenLink` flag.
  return (
    <div style={threeColStyle} data-testid={`comms-inbox-${bucket}`}>
      <section style={columnStyle}>
        <SectionHeader label="Messages" badge={unreadCount} showOpenLink={settings.showOpenLink} href="/admin/messages" />
        <ConversationList rows={state.conversations.slice(0, bucket === 'xlarge' ? 8 : 5)} />
      </section>
      <section style={columnStyle}>
        <SectionHeader label="Mentions" badge={state.mentions.length} showOpenLink={settings.showOpenLink} href="/admin/messages?filter=mentions" />
        <MentionList rows={state.mentions.slice(0, bucket === 'xlarge' ? 8 : 5)} />
      </section>
      <section style={columnStyle}>
        <SectionHeader label="Discussions" badge={state.discussions.length} showOpenLink={settings.showOpenLink} href="/admin/discussions" />
        <DiscussionList rows={state.discussions.slice(0, bucket === 'xlarge' ? 8 : 5)} />
      </section>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────

function SectionHeader({ label, badge, showOpenLink, href }: {
  label: string; badge: number; showOpenLink: boolean; href: string;
}) {
  return (
    <header style={sectionHeaderStyle}>
      <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>
        {label}
        {badge > 0 && (
          <span style={badgeStyle} data-testid={`comms-inbox-badge-${label.toLowerCase()}`}>{badge}</span>
        )}
      </span>
      {showOpenLink && (
        <a href={href} style={openLinkStyle}>Open →</a>
      )}
    </header>
  );
}

function ConversationList({ rows }: { rows: Conversation[] }) {
  if (rows.length === 0) {
    return <p style={emptyTextStyle}>No unread messages.</p>;
  }
  return (
    <ul style={listStyle}>
      {rows.map((c) => (
        <li key={c.id} style={rowStyle}>
          <span style={rowTitleStyle}>{c.title ?? 'Direct message'}</span>
          {c.last_message_preview && (
            <span style={rowPreviewStyle}>{c.last_message_preview.slice(0, 60)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function MentionList({ rows }: { rows: Mention[] }) {
  if (rows.length === 0) {
    return <p style={emptyTextStyle}>No new mentions.</p>;
  }
  return (
    <ul style={listStyle}>
      {rows.map((m) => (
        <li key={m.id} style={rowStyle}>
          {m.sender_email && <span style={rowTitleStyle}>@{m.sender_email.split('@')[0]}</span>}
          <span style={rowPreviewStyle}>{m.body.slice(0, 60)}</span>
        </li>
      ))}
    </ul>
  );
}

function DiscussionList({ rows }: { rows: DiscussionThread[] }) {
  if (rows.length === 0) {
    return <p style={emptyTextStyle}>No open discussions.</p>;
  }
  return (
    <ul style={listStyle}>
      {rows.map((t) => (
        <li key={t.id} style={rowStyle}>
          <span style={rowTitleStyle}>{t.title}</span>
          {t.escalation_level && (
            <span style={rowPreviewStyle}>· {t.escalation_level}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

// ─── Pure helpers exported for testing ─────────────────────────────────

/** Sum unread DMs + mention count + open thread count into the
 *  single number the tiny bucket renders. Pure + exported. */
export function totalCommsCount(state: Pick<FetchState, 'conversations' | 'mentions' | 'discussions'>): number {
  const unread = state.conversations.reduce((acc, c) => acc + (c.unread_count ?? 0), 0);
  return unread + state.mentions.length + state.discussions.length;
}

/** Decide the layout variant from a SizeBucket. Pure + exported. */
export function commsLayoutForBucket(bucket: SizeBucket): 'tiny' | 'small' | 'medium' | 'three' {
  if (bucket === 'tiny') return 'tiny';
  if (bucket === 'small') return 'small';
  if (bucket === 'medium') return 'medium';
  return 'three';
}

// ─── Style fragments ───────────────────────────────────────────────────

const tinyWrapStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  height: '100%', gap: 2,
};
const tinyCountStyle: React.CSSProperties = {
  fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', fontWeight: 700, lineHeight: 1,
  color: 'var(--theme-fg-primary)',
};
const tinyLabelStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)',
  textTransform: 'uppercase', letterSpacing: 0.5,
};
const twoColStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--hub-spc-3, 12px)', height: '100%', minHeight: 0,
};
const threeColStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--hub-spc-3, 12px)', height: '100%', minHeight: 0,
};
const columnStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0,
};
const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  borderBottom: '1px solid var(--theme-border)', paddingBottom: 4,
};
const badgeStyle: React.CSSProperties = {
  display: 'inline-block', marginLeft: 6, padding: '0 6px',
  borderRadius: 12, background: 'var(--theme-accent, #3b82f6)',
  color: 'var(--theme-accent-fg, #fff)', fontSize: '0.65rem', fontWeight: 700,
};
const openLinkStyle: React.CSSProperties = {
  fontSize: '0.7rem', color: 'var(--theme-accent, #3b82f6)', textDecoration: 'none',
};
const listStyle: React.CSSProperties = {
  listStyle: 'none', margin: 0, padding: 0,
  display: 'flex', flexDirection: 'column', gap: 4,
  overflow: 'hidden',
};
const rowStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 1,
  padding: '4px 0',
};
const rowTitleStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-sm, 0.85rem)', fontWeight: 500,
  color: 'var(--theme-fg-primary)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};
const rowPreviewStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.72rem)', color: 'var(--theme-fg-secondary)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};
const emptyTextStyle: React.CSSProperties = {
  margin: 0, fontSize: 'var(--hub-font-xs, 0.72rem)', color: 'var(--theme-fg-secondary)',
};

defineWidget<CommsContent>({
  id: 'comms-inbox',
  label: 'Comms inbox',
  description: 'Unified inbox: unread DMs, mentions, and open discussions.',
  category: 'personal',
  iconName: 'Inbox',
  defaultSize: { w: 6, h: 3 },
  minSize: { w: 1, h: 1 },
  maxSize: { w: 8, h: 8 },
  defaultContent: DEFAULTS,
  allowedRoles: [],
  Widget: CommsInboxWidget,
});
