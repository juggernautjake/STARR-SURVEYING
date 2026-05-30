// lib/messages/mentions.ts
//
// hub-widget-excellence-14 — the /api/admin/messages/mentions endpoint
// was missing (no mentions table exists), so the mentions-inbox widget
// always showed empty. There's no structured mentions store, so we
// detect them by scanning message `content` for the user's @-handle
// (their email or its local-part). Pure + testable; the route does the
// queries + enrichment.

export interface MentionMessage {
  id: string;
  conversation_id?: string | null;
  sender_email?: string | null;
  content?: string | null;
  created_at?: string | null;
}

export interface Mention {
  id: string;
  message_id: string;
  conversation_id: string;
  conversation_title: string | null;
  author_email: string | null;
  body_preview: string | null;
  created_at: string;
}

/** The @-handles that count as mentioning `email`: the full email and
 *  its local-part, lowercased. */
export function mentionHandles(email: string): string[] {
  const e = email.trim().toLowerCase();
  if (!e) return [];
  const local = e.split('@')[0];
  return local && local !== e ? [e, local] : [e];
}

function previewOf(content: string): string {
  const trimmed = content.trim().replace(/\s+/g, ' ');
  return trimmed.length > 100 ? `${trimmed.slice(0, 99)}…` : trimmed;
}

/**
 * Messages that @-mention the user, mapped to the widget's Mention
 * shape. A message mentions the user when its content contains
 * `@{handle}` for any of the user's handles (case-insensitive).
 */
export function detectMentions(
  messages: readonly MentionMessage[],
  email: string,
  titleByConversation: ReadonlyMap<string, string> = new Map(),
): Mention[] {
  const handles = mentionHandles(email);
  if (handles.length === 0) return [];
  const out: Mention[] = [];
  for (const m of messages) {
    const content = m.content ?? '';
    const lower = content.toLowerCase();
    if (!handles.some((h) => lower.includes(`@${h}`))) continue;
    const conv = m.conversation_id ?? '';
    out.push({
      id: m.id,
      message_id: m.id,
      conversation_id: conv,
      conversation_title: conv ? (titleByConversation.get(conv) ?? null) : null,
      author_email: m.sender_email ?? null,
      body_preview: previewOf(content),
      created_at: m.created_at ?? '',
    });
  }
  return out;
}
