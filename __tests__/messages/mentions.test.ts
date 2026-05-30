// __tests__/messages/mentions.test.ts
//
// hub-widget-excellence-14 — mentions-inbox R1: the
// /api/admin/messages/mentions endpoint was missing. Locks the pure
// @-mention detector behind the new endpoint.

import { describe, it, expect } from 'vitest';
import { mentionHandles, detectMentions } from '@/lib/messages/mentions';

describe('mentionHandles', () => {
  it('returns the email + its local-part, lowercased', () => {
    expect(mentionHandles('Jacob@x.com')).toEqual(['jacob@x.com', 'jacob']);
  });
});

describe('detectMentions', () => {
  const titles = new Map([['c1', 'Boundary crew']]);
  const messages = [
    { id: 'm1', conversation_id: 'c1', sender_email: 'lead@x.com', content: 'Hey @jacob can you stake this?', created_at: '2026-05-30T10:00:00Z' },
    { id: 'm2', conversation_id: 'c1', sender_email: 'lead@x.com', content: 'No mention here', created_at: '2026-05-30T11:00:00Z' },
    { id: 'm3', conversation_id: 'c2', sender_email: 'p@x.com', content: 'cc @jacob@x.com please', created_at: '2026-05-30T12:00:00Z' },
  ];

  it('keeps only messages that @-mention the user, enriched with the title', () => {
    const out = detectMentions(messages, 'jacob@x.com', titles);
    expect(out.map((m) => m.id)).toEqual(['m1', 'm3']);
    expect(out[0]).toMatchObject({
      message_id: 'm1', conversation_id: 'c1', conversation_title: 'Boundary crew',
      author_email: 'lead@x.com',
    });
    expect(out[0].body_preview).toContain('@jacob');
    expect(out[1].conversation_title).toBeNull(); // c2 not in the title map
  });

  it('is case-insensitive + returns [] for a blank email', () => {
    expect(detectMentions([{ id: 'x', content: 'HI @JACOB!', conversation_id: 'c1' }], 'jacob@x.com')).toHaveLength(1);
    expect(detectMentions(messages, '')).toEqual([]);
  });
});
