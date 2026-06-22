// __tests__/hub/widgets/messages.test.ts
//
// Slice 109 — Messages widget helpers + registry round-trip.

import { describe, it, expect } from 'vitest';
import { getWidget } from '@/lib/hub/widget-registry';
import {
  capForBucket,
  deriveConversationStatus,
  filterConversations,
  formatGroupMemberSubtitle,
  toConversation,
} from '@/lib/hub/widgets/messages';

describe('messages — toConversation (R1: group from type)', () => {
  it('derives is_group from the raw conversation type', () => {
    expect(toConversation({ id: 'c1', type: 'group' }).is_group).toBe(true);
    expect(toConversation({ id: 'c2', type: 'direct' }).is_group).toBe(false);
  });
  it('keeps an explicit is_group when already present', () => {
    expect(toConversation({ id: 'c3', is_group: true, type: 'direct' }).is_group).toBe(true);
  });
});

describe('messages widget — registry', () => {
  it('registers under id "messages" in communication category', () => {
    const def = getWidget('messages');
    expect(def).toBeDefined();
    expect(def?.id).toBe('messages');
    expect(def?.category).toBe('communication');
    expect(def?.iconName).toBe('MessageSquare');
  });

  it('only internal roles can add it (no student/teacher)', () => {
    const def = getWidget('messages');
    expect(def?.allowedRoles).toEqual([
      'admin', 'developer', 'field_crew', 'drawer', 'researcher', 'equipment_manager', 'tech_support',
    ]);
  });

  it('default size 3×3, min 1×1, max 6×6', () => {
    const def = getWidget('messages');
    expect(def?.defaultSize).toEqual({ w: 3, h: 3 });
    // Slice 213 — minSize lowered to 1×1 with the tiny unread-count mode.
    expect(def?.minSize).toEqual({ w: 1, h: 1 });
    expect(def?.maxSize).toEqual({ w: 6, h: 6 });
  });

  it('default content opts in to groups + preview, opts out of mark-read', () => {
    const def = getWidget('messages');
    const c = def?.defaultContent as { includeGroups: boolean; showPreview: boolean; markAsReadOnView: boolean };
    expect(c.includeGroups).toBe(true);
    expect(c.showPreview).toBe(true);
    expect(c.markAsReadOnView).toBe(false);
  });
});

describe('messages — capForBucket', () => {
  it('tiny → 3', () => { expect(capForBucket('tiny')).toBe(3); });
  it('small → 5', () => { expect(capForBucket('small')).toBe(5); });
  it('medium → 8', () => { expect(capForBucket('medium')).toBe(8); });
  it('large → 12', () => { expect(capForBucket('large')).toBe(12); });
  it('xlarge → 20', () => { expect(capForBucket('xlarge')).toBe(20); });
});

describe('messages — filterConversations', () => {
  const list = [
    { id: 'a', is_group: false, is_external: false },
    { id: 'b', is_group: true,  is_external: false },
    { id: 'c', is_group: false, is_external: true },
    { id: 'd', is_group: true,  is_external: true },
  ];

  it('with defaults keeps every conversation', () => {
    const out = filterConversations(list, { includeGroups: true, senderFilter: 'any' });
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('drops groups when includeGroups=false', () => {
    const out = filterConversations(list, { includeGroups: false, senderFilter: 'any' });
    expect(out.map((x) => x.id)).toEqual(['a', 'c']);
  });

  it('team-only drops external conversations', () => {
    const out = filterConversations(list, { includeGroups: true, senderFilter: 'team-only' });
    expect(out.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('external-only keeps only external conversations', () => {
    const out = filterConversations(list, { includeGroups: true, senderFilter: 'external-only' });
    expect(out.map((x) => x.id)).toEqual(['c', 'd']);
  });

  it('combinations stack (no groups + team-only)', () => {
    const out = filterConversations(list, { includeGroups: false, senderFilter: 'team-only' });
    expect(out.map((x) => x.id)).toEqual(['a']);
  });
});

// messages-widget-richer-rows-2026-06-21 — viewer-perspective status
// + group member subtitle.
describe("deriveConversationStatus — DM perspective", () => {
  const me = "jacob@firm.com";
  const them = "john.harding@firm.com";

  it("waiting_from_other when they sent + I have not read", () => {
    const s = deriveConversationStatus(
      {
        id: "c1", type: "direct",
        last_message_at: "2026-06-21T10:00:00Z",
        last_sender_email: them,
        participants: [
          { user_email: me, last_read_at: "2026-06-20T00:00:00Z" },
          { user_email: them, display_name: "John Harding" },
        ],
      },
      me,
    );
    expect(s.kind).toBe("waiting_from_other");
    expect(s.label).toBe("Message Waiting from John Harding");
    expect(s.icon).toBe("🟢");
  });

  it("seen_from_other when they sent + I have read", () => {
    const s = deriveConversationStatus(
      {
        id: "c2", type: "direct",
        last_message_at: "2026-06-21T10:00:00Z",
        last_sender_email: them,
        participants: [
          { user_email: me, last_read_at: "2026-06-21T11:00:00Z" },
          { user_email: them, display_name: "John Harding" },
        ],
      },
      me,
    );
    expect(s.kind).toBe("seen_from_other");
    expect(s.label).toBe("Message Seen From John Harding");
    expect(s.icon).toBe("✓");
  });

  it("sent_to_other when I sent + they have not read", () => {
    const s = deriveConversationStatus(
      {
        id: "c3", type: "direct",
        last_message_at: "2026-06-21T10:00:00Z",
        last_sender_email: me,
        participants: [
          { user_email: me, last_read_at: "2026-06-21T10:00:00Z" },
          { user_email: them, display_name: "John Harding" },
        ],
      },
      me,
    );
    expect(s.kind).toBe("sent_to_other");
    expect(s.label).toBe("Message Sent to John Harding");
    expect(s.icon).toBe("✓");
  });

  it("seen_by_other when I sent + they have read", () => {
    const s = deriveConversationStatus(
      {
        id: "c4", type: "direct",
        last_message_at: "2026-06-21T10:00:00Z",
        last_sender_email: me,
        participants: [
          { user_email: me, last_read_at: "2026-06-21T10:00:00Z" },
          { user_email: them, display_name: "John Harding", last_read_at: "2026-06-21T11:00:00Z" },
        ],
      },
      me,
    );
    expect(s.kind).toBe("seen_by_other");
    expect(s.label).toBe("Message Seen by John Harding");
    expect(s.icon).toBe("✓✓");
  });

  it("no_messages on an empty conversation", () => {
    const s = deriveConversationStatus({ id: "c5", type: "direct" }, me);
    expect(s.kind).toBe("no_messages");
  });
});

describe("deriveConversationStatus — group perspective", () => {
  const me = "jacob@firm.com";
  const alice = "alice@firm.com";
  const bob = "bob@firm.com";

  it("waiting from a named sender uses the short \"New from X\" label", () => {
    const s = deriveConversationStatus(
      {
        id: "g1", type: "group", title: "Project Alpha",
        last_message_at: "2026-06-21T10:00:00Z",
        last_sender_email: alice,
        participants: [
          { user_email: me, last_read_at: "2026-06-20T00:00:00Z" },
          { user_email: alice, display_name: "Alice Adams" },
          { user_email: bob, display_name: "Bob Brown" },
        ],
      },
      me,
    );
    expect(s.kind).toBe("waiting_from_other");
    expect(s.label).toBe("New from Alice Adams");
  });

  it("\"Seen by\" lists who read after the message landed", () => {
    const s = deriveConversationStatus(
      {
        id: "g2", type: "group", title: "Project Alpha",
        last_message_at: "2026-06-21T10:00:00Z",
        last_sender_email: me,
        participants: [
          { user_email: me, last_read_at: "2026-06-21T10:00:00Z" },
          { user_email: alice, display_name: "Alice Adams", last_read_at: "2026-06-21T11:00:00Z" },
          { user_email: bob, display_name: "Bob Brown", last_read_at: "2026-06-20T00:00:00Z" },
        ],
      },
      me,
    );
    expect(s.kind).toBe("seen_by_other");
    expect(s.label).toContain("Alice Adams");
    expect(s.label).not.toContain("Bob Brown");
  });
});

describe("formatGroupMemberSubtitle", () => {
  const me = "jacob@firm.com";

  it("comma-joins display names of others", () => {
    expect(formatGroupMemberSubtitle(
      [
        { user_email: me, display_name: "Me" },
        { user_email: "a@x.com", display_name: "Alice" },
        { user_email: "b@x.com", display_name: "Bob" },
      ],
      me,
    )).toBe("Alice, Bob");
  });

  it("truncates with \"+ N more\" beyond the cap", () => {
    const ps = [
      { user_email: me },
      { user_email: "a@x.com", display_name: "Alice" },
      { user_email: "b@x.com", display_name: "Bob" },
      { user_email: "c@x.com", display_name: "Carol" },
      { user_email: "d@x.com", display_name: "Dave" },
      { user_email: "e@x.com", display_name: "Eve" },
    ];
    expect(formatGroupMemberSubtitle(ps, me, 3)).toBe("Alice, Bob, Carol + 2 more");
  });

  it("\"Just you\" when the viewer is the only member", () => {
    expect(formatGroupMemberSubtitle([{ user_email: me }], me)).toBe("Just you");
  });
});

