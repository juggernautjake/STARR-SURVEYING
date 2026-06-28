// __tests__/admin/messenger-smoothing.test.ts
//
// messenger-smoothing-2026-06-18 — user reported the chat history was
// slow (~3s) to reflect a sent message AND that the panel "blipped"
// every poll cycle. Fixes:
//   1. handleSend pushes an optimistic row instantly, then the server
//      confirm runs in the background.
//   2. fetchMessages takes a { showSkeleton } option so polled refreshes
//      don't flash the skeleton.
//   3. The polled fetch merges via mergeServerWithOptimistic which
//      short-circuits the setState call when nothing changed.
//   4. The scroll-to-bottom effect only fires on message-count growth
//      so polling refreshes don't constantly re-animate the scroll.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  makeOptimisticId,
  mergeServerWithOptimistic,
  sameConversationSnapshot,
  sameCountMap,
  type Message,
} from '@/app/admin/components/FloatingMessenger';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const msg = (over: Partial<Message> = {}): Message => ({
  id: 'srv-1',
  sender_email: 'a@x',
  content: 'hi',
  message_type: 'text',
  created_at: '2026-06-18T00:00:00Z',
  attachments: [],
  ...over,
});

describe('makeOptimisticId (pure)', () => {
  it('always returns a string prefixed with `optimistic:`', () => {
    for (let i = 0; i < 5; i += 1) {
      expect(makeOptimisticId().startsWith('optimistic:')).toBe(true);
    }
  });

  it('produces unique ids across rapid calls', () => {
    const ids = new Set(Array.from({ length: 25 }, () => makeOptimisticId()));
    expect(ids.size).toBe(25);
  });
});

describe('mergeServerWithOptimistic (pure)', () => {
  it("short-circuits when the server array is identical to prev", () => {
    const prev: Message[] = [msg({ id: 's-1' }), msg({ id: 's-2' })];
    const server: Message[] = [msg({ id: 's-1' }), msg({ id: 's-2' })];
    const out = mergeServerWithOptimistic(prev, server);
    // SAME reference — React skips the re-render.
    expect(out).toBe(prev);
  });

  it('returns the server list when prev is empty', () => {
    const server = [msg({ id: 's-1' })];
    const out = mergeServerWithOptimistic([], server);
    expect(out).toEqual(server);
  });

  it('keeps optimistic rows the server has NOT echoed yet', () => {
    const prev: Message[] = [
      msg({ id: 'optimistic:abc', sender_email: 'me@x', content: 'in flight' }),
    ];
    const server: Message[] = [msg({ id: 's-1', sender_email: 'them@x', content: 'hello' })];
    const out = mergeServerWithOptimistic(prev, server);
    expect(out.map((m) => m.id)).toEqual(['s-1', 'optimistic:abc']);
  });

  it("drops optimistic rows once the server confirms the matching content", () => {
    const prev: Message[] = [
      msg({ id: 'optimistic:abc', sender_email: 'me@x', content: 'in flight' }),
    ];
    const server: Message[] = [
      msg({ id: 's-real', sender_email: 'me@x', content: 'in flight' }),
    ];
    const out = mergeServerWithOptimistic(prev, server);
    // Only the server row — optimistic dissolved.
    expect(out).toEqual(server);
  });

  it('does NOT re-keep the optimistic when prev had non-optimistic entries too', () => {
    const prev: Message[] = [
      msg({ id: 's-1' }),
      msg({ id: 'optimistic:x', sender_email: 'me@x', content: 'wip' }),
    ];
    const server: Message[] = [msg({ id: 's-1' }), msg({ id: 's-2', sender_email: 'me@x', content: 'wip' })];
    const out = mergeServerWithOptimistic(prev, server);
    // The optimistic matches s-2's content + sender → dropped.
    expect(out).toEqual(server);
  });
});

describe('FloatingMessenger smoothing contract (source-lock)', () => {
  const SRC = read('app/admin/components/FloatingMessenger.tsx');

  it('handleSend pushes the optimistic row BEFORE the network call', () => {
    expect(SRC).toMatch(/Optimistic insert \+ clear the input/);
    expect(SRC).toMatch(/setMessages\(\(prev\) => \[\.\.\.prev, optimisticMsg\]\)/);
  });

  it('fetchMessages takes a showSkeleton option', () => {
    expect(SRC).toMatch(/options: \{ showSkeleton\?: boolean \} = \{\}/);
    expect(SRC).toMatch(/if \(showSkeleton\) setLoadingMessages\(true\)/);
  });

  it('polled refreshes pass showSkeleton: false', () => {
    expect(SRC).toMatch(/if \(activeConv\) fetchMessages\(activeConv\.id, \{ showSkeleton: false \}\)/);
    expect(SRC).toMatch(/fetchMessages\(activeConv\.id, \{ showSkeleton: false \}\);[\s\S]{0,200}?fetchConversations\(\);/);
  });

  it('scroll-to-bottom only fires when message count grows', () => {
    expect(SRC).toMatch(/const lastMessageCountRef = useRef<number>\(0\)/);
    expect(SRC).toMatch(/if \(messages\.length > lastMessageCountRef\.current\)/);
  });

  it('rolls the optimistic row back on a send failure so the user sees + can retry', () => {
    // The compose box is now a contentEditable rich input, so the draft is
    // restored via richRef.setHtml(content) (was setNewMessage(content)).
    expect(SRC).toMatch(/setMessages\(\(prev\) => prev\.filter\(\(m\) => m\.id !== optimisticMsg\.id\)\);[\s\S]{0,80}richRef\.current\?\.setHtml\(content\)/);
  });

  it("flags optimistic bubbles via data-pending + 'Sending…' chip", () => {
    expect(SRC).toMatch(/data-pending=\{m\.id\.startsWith\('optimistic:'\) \? 'true' : undefined\}/);
    // messenger-smoothing-pass2-2026-06-18 — optimistic rows now share
    // the same clock-face string as server-acked ones (so widths stay
    // identical) plus a tiny ⏳ chip after the time.
    expect(SRC).toMatch(/m\.id\.startsWith\('optimistic:'\) && \(/);
    expect(SRC).toMatch(/aria-label="Sending"/);
  });
});

describe('FloatingMessenger smoothing pass 2 (source-lock)', () => {
  const SRC = read('app/admin/components/FloatingMessenger.tsx');

  it('fetchConversations skips setState when the snapshot is identical', () => {
    expect(SRC).toMatch(/sameConversationSnapshot\(prev, next\) \? prev : next/);
  });

  it('fetchUnread skips setState when counts are identical', () => {
    expect(SRC).toMatch(/sameCountMap\(prev, nextByConv\) \? prev : nextByConv/);
    expect(SRC).toMatch(/setTotalUnread\(\(prev\) => prev === nextTotal \? prev : nextTotal\)/);
  });
});

describe('Smoothing pass 2 pure helpers (vitest)', () => {
  it('sameConversationSnapshot returns true when ids + last_message stamps match', () => {
    const prev = [
      { id: 'c1', last_message_at: 't1', last_message_preview: 'hi' },
      { id: 'c2', last_message_at: 't2', last_message_preview: 'hello' },
    ];
    const next = [
      { id: 'c1', last_message_at: 't1', last_message_preview: 'hi' },
      { id: 'c2', last_message_at: 't2', last_message_preview: 'hello' },
    ];
    expect(sameConversationSnapshot(prev, next)).toBe(true);
  });

  it("returns false when a conversation's last_message_at changes", () => {
    const prev = [{ id: 'c1', last_message_at: 't1', last_message_preview: 'hi' }];
    const next = [{ id: 'c1', last_message_at: 't2', last_message_preview: 'hi' }];
    expect(sameConversationSnapshot(prev, next)).toBe(false);
  });

  it("returns false on a length change", () => {
    expect(sameConversationSnapshot([], [{ id: 'c1' }])).toBe(false);
  });

  it('sameCountMap returns true for identical maps', () => {
    expect(sameCountMap({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
  });

  it("returns false when a count changes", () => {
    expect(sameCountMap({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("returns false when keys differ", () => {
    expect(sameCountMap({ a: 1 }, { b: 1 })).toBe(false);
    expect(sameCountMap({ a: 1 }, { a: 1, b: 1 })).toBe(false);
  });
});
