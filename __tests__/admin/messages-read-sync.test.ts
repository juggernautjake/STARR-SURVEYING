// __tests__/admin/messages-read-sync.test.ts — N3, "read once, read everywhere".
//
// What is worth pinning here is not that an event bus works, but the two things that were actually
// broken and the one browser behaviour that makes a naive fix wrong:
//
//   1. Every surface that marks a conversation read must ANNOUNCE it. The conversation page
//      (`/admin/messages/[conversationId]`) marked the server side read and told nobody, so the bell's
//      bubble and the home-screen app-icon badge kept a count the user had just cleared. That page is
//      exactly where N2's bell notification link lands, so the bell was undoing its own fix.
//   2. Every surface that DISPLAYS an unread count must LISTEN. The bell was not subscribed at all.
//   3. `BroadcastChannel` does not deliver to the context that posted. A cross-tab-only
//      implementation therefore updates every tab EXCEPT the one the user is looking at — the exact
//      opposite of what is wanted. So the same-tab CustomEvent is not redundant with the channel.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  emitConversationRead,
  subscribeConversationRead,
  MESSAGES_READ_EVENT,
} from '@/lib/messages/read-sync';

/** Source, with comments stripped. The assertions below look for real code near real code, and this
 *  file's own explanatory comments are long enough to push the code out of any character window —
 *  the first draft failed on exactly that, matching its own prose instead of the source. */
const read = (p: string) =>
  fs.readFileSync(path.join(process.cwd(), p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/^\s*\/\/[^\n]*$/gm, '');

// This suite runs under `environment: 'node'` (vitest.config.ts), so there is no `window`. Rather than
// pull in jsdom for one module, install the smallest thing `read-sync` actually needs: an EventTarget.
// Node already provides `EventTarget`, `CustomEvent` and `BroadcastChannel` as globals, so this is a
// two-line shim in the same spirit as the localStorage shim in vitest.setup.ts.
//
// Worth stating plainly: this proves the module's own contract (dispatch reaches subscribers, the
// channel is posted to and closed, failures are swallowed). It does not prove a React component
// re-renders — the source assertions further down are what cover the wiring.
const g = globalThis as { window?: unknown };
let savedWindow: unknown;

beforeEach(() => {
  savedWindow = g.window;
  g.window = new EventTarget();
});
afterEach(() => {
  if (savedWindow === undefined) delete g.window;
  else g.window = savedWindow;
});

describe('N3 — the read-sync bus', () => {
  let unsubscribes: Array<() => void> = [];
  beforeEach(() => { unsubscribes = []; });
  afterEach(() => { unsubscribes.forEach((u) => { try { u(); } catch { /* window already restored */ } }); });

  const track = (u: () => void) => { unsubscribes.push(u); return u; };

  it('delivers to a subscriber in the SAME context', () => {
    // The case a BroadcastChannel-only implementation silently misses.
    const seen: string[] = [];
    track(subscribeConversationRead((d) => seen.push(d.conversationId)));
    emitConversationRead('conv-1');
    expect(seen).toEqual(['conv-1']);
  });

  it('delivers to every subscriber, not just the first', () => {
    // The bell, the messenger FAB and the Hub widget all listen at once.
    const a: string[] = [];
    const b: string[] = [];
    track(subscribeConversationRead((d) => a.push(d.conversationId)));
    track(subscribeConversationRead((d) => b.push(d.conversationId)));
    emitConversationRead('conv-2');
    expect(a).toEqual(['conv-2']);
    expect(b).toEqual(['conv-2']);
  });

  it('stops delivering after unsubscribe', () => {
    // A leaked listener on an unmounted bell would setState after unmount.
    const seen: string[] = [];
    const off = subscribeConversationRead((d) => seen.push(d.conversationId));
    off();
    emitConversationRead('conv-3');
    expect(seen).toEqual([]);
  });

  it('ignores an empty conversation id rather than firing a useless refetch', () => {
    const seen: string[] = [];
    track(subscribeConversationRead((d) => seen.push(d.conversationId)));
    emitConversationRead('');
    expect(seen).toEqual([]);
  });

  it('still notifies same-tab listeners when BroadcastChannel is unavailable', () => {
    // Safari private mode and older browsers. The channel is the enhancement; the window event is
    // the floor, and losing the floor would mean the bell never clears without a poll.
    const original = (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
    // Deliberately removing a global to simulate the unsupported case. No ts-expect-error needed —
    // the cast makes the property optional, so `delete` is legal (and an unused directive is itself
    // a TS error under this config).
    delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
    try {
      const seen: string[] = [];
      track(subscribeConversationRead((d) => seen.push(d.conversationId)));
      emitConversationRead('conv-4');
      expect(seen).toEqual(['conv-4']);
    } finally {
      if (original) (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = original;
    }
  });

  it('survives a BroadcastChannel constructor that throws', () => {
    // Some privacy configurations throw on construction. That must not stop the same-tab delivery,
    // and it must not propagate out of a fire-and-forget call made inside a fetch .then().
    const original = (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
    (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = class {
      constructor() { throw new Error('blocked by privacy settings'); }
    };
    try {
      const seen: string[] = [];
      track(subscribeConversationRead((d) => seen.push(d.conversationId)));
      expect(() => emitConversationRead('conv-5')).not.toThrow();
      expect(seen).toEqual(['conv-5']);
    } finally {
      if (original) (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = original;
      else delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
    }
  });

  it('posts on the channel so OTHER tabs hear it', () => {
    const posted: unknown[] = [];
    const closed = { count: 0 };
    const original = (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
    (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = class {
      onmessage: ((e: MessageEvent) => void) | null = null;
      postMessage(data: unknown) { posted.push(data); }
      close() { closed.count += 1; }
    };
    try {
      emitConversationRead('conv-6');
      expect(posted).toEqual([{ conversationId: 'conv-6' }]);
      // Not left open — one leaked channel per read would accumulate for the life of the tab.
      expect(closed.count).toBe(1);
    } finally {
      if (original) (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = original;
      else delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
    }
  });
});

describe('N3 — every read path announces, every unread display listens', () => {
  // Source-level assertions. These are the wiring bugs the slice actually fixed, and a runtime test
  // of the full React tree would not catch a surface that simply never calls the bus.

  const EMITTERS: Array<[string, string]> = [
    ['app/admin/components/FloatingMessenger.tsx', 'the popup messenger'],
    ['app/admin/messages/_tabs/InboxTab.tsx', 'the messages list'],
    ['app/admin/messages/[conversationId]/page.tsx', 'a single conversation page'],
  ];

  for (const [file, label] of EMITTERS) {
    it(`${label} announces its reads`, () => {
      const src = read(file);
      expect(src, `${file} marks messages read but never calls emitConversationRead`)
        .toMatch(/emitConversationRead\s*\(/);
    });
  }

  const LISTENERS: Array<[string, string]> = [
    ['app/admin/components/NotificationBell.tsx', 'the notification bell (and with it the app-icon badge)'],
    ['app/admin/components/FloatingMessenger.tsx', "the messenger's FAB badge"],
    ['lib/hub/widgets/messages/index.tsx', 'the Hub messages widget'],
  ];

  for (const [file, label] of LISTENERS) {
    it(`${label} subscribes to reads from other surfaces`, () => {
      const src = read(file);
      expect(src, `${file} shows an unread count but never subscribes to read-sync`)
        .toMatch(/subscribeConversationRead\s*\(/);
    });
  }

  it('nothing attaches MESSAGES_READ_EVENT directly any more', () => {
    // Attaching the window event by hand gets same-tab delivery and silently misses cross-tab, which
    // is the bug that made a second tab keep re-asserting a cleared app-icon badge. The constant stays
    // exported for the event name itself; what must not come back is a bare addEventListener on it.
    for (const [file] of [...EMITTERS, ...LISTENERS]) {
      const src = read(file);
      expect(src, `${file} attaches MESSAGES_READ_EVENT directly instead of using subscribeConversationRead`)
        .not.toMatch(/addEventListener\(\s*MESSAGES_READ_EVENT/);
    }
  });

  it('the bell refetches rather than decrementing a guessed count', () => {
    // One conversation can carry several unread notifications, so subtracting a guess drifts from the
    // server and eventually strands the badge on a number no surface agrees with.
    //
    // Anchored on the CALL, not on the first occurrence of the identifier — that is the import line,
    // which is what the first draft accidentally asserted against.
    const src = read('app/admin/components/NotificationBell.tsx');
    const call = src.match(/subscribeConversationRead\(([\s\S]{0,160})/);
    expect(call, 'the bell never calls subscribeConversationRead').not.toBeNull();
    expect(call![1]).toMatch(/fetchNotifications/);
  });

  it('MESSAGES_READ_EVENT is still the documented event name', () => {
    expect(MESSAGES_READ_EVENT).toBe('messages:read');
  });
});

describe('N3 — the app-icon badge clears with the count', () => {
  it('the bell clears the badge at zero and sets it otherwise', () => {
    // The owner's complaint was a badge that outlived the unread messages. Pinning both directions:
    // a set when there is something to see, an explicit clear when there is not.
    const src = read('app/admin/components/NotificationBell.tsx');
    expect(src).toMatch(/setAppBadge\(/);
    expect(src).toMatch(/clearAppBadge\(/);
    // Guarded, because iOS Safari lacks the API entirely and an unguarded call throws.
    expect(src).toMatch(/'setAppBadge'\s+in\s+navigator/);
  });
});

describe('N3 — the emit happens after the write, not before', () => {
  it.each([
    ['app/admin/messages/[conversationId]/page.tsx'],
    ['app/admin/components/FloatingMessenger.tsx'],
  ])('%s only announces once the POST resolved', (file) => {
    const src = read(file);
    // Either awaited-then-emitted, or chained off .then() — both mean "the server agreed first".
    // Announcing before the write means a failed POST clears a badge the next poll brings back.
    //
    // The emit here is the CALL, not the import, and the window is measured on comment-stripped
    // source so this file's own prose cannot displace the code being checked.
    const emitIdx = src.search(/emitConversationRead\((?!\s*\))/);
    expect(emitIdx, `${file} never calls emitConversationRead`).toBeGreaterThan(-1);
    const before = src.slice(Math.max(0, emitIdx - 300), emitIdx);
    expect(before, `${file} appears to emit before the read is persisted`)
      .toMatch(/await\s+fetch|\.then\(/);
  });
});
