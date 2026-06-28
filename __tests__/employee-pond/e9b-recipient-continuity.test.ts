// __tests__/employee-pond/e9b-recipient-continuity.test.ts
//
// employee-pond Slice E9b — shared recipient continuity across the
// FloatingMessenger widget and the dedicated /admin/messages page.
// Locks the pure helpers (TTL freshness check, normalization), the
// localStorage round-trip, and the page-level persist + hydrate
// wiring on both surfaces.
//
import { beforeAll, beforeEach, describe, it, expect } from 'vitest';

// Stub a minimal localStorage on the node-default test env — the
// helper functions short-circuit when `typeof window === 'undefined'`,
// so we mount a tiny shim before the round-trip tests run. Lighter
// than pulling in jsdom for one test file (matches the pattern used
// by __tests__/desktop/).
beforeAll(() => {
  if (typeof globalThis.window === 'undefined') {
    const store = new Map<string, string>();
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
        clear: () => store.clear(),
      },
    };
  }
});
import fs from 'node:fs';
import path from 'node:path';
import {
  MESSENGER_RECIPIENT_STORAGE_KEY,
  MESSENGER_RECIPIENT_TTL_MS,
  clearActiveRecipient,
  isRecipientFresh,
  normalizeRecipientEmail,
  readActiveRecipient,
  saveActiveRecipient,
} from '@/lib/employee-pond/messenger-recipient';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('normalizeRecipientEmail', () => {
  it('lower-cases + trims', () => {
    expect(normalizeRecipientEmail('  HANK@Example.COM ')).toBe('hank@example.com');
  });
  it('returns empty string for null / undefined / blank', () => {
    expect(normalizeRecipientEmail(null)).toBe('');
    expect(normalizeRecipientEmail(undefined)).toBe('');
    expect(normalizeRecipientEmail('   ')).toBe('');
  });
});

describe('isRecipientFresh — TTL gating', () => {
  const NOW = 1_000_000;
  it('false for null / missing email / wrong shape', () => {
    expect(isRecipientFresh(null, NOW)).toBe(false);
    expect(isRecipientFresh({ email: '', savedAt: NOW } as never, NOW)).toBe(false);
    expect(isRecipientFresh({ email: 'a@b', savedAt: 'not a number' } as never, NOW)).toBe(false);
  });
  it('true for a recent entry', () => {
    expect(isRecipientFresh({ email: 'a@b', savedAt: NOW - 1000 }, NOW)).toBe(true);
  });
  it('false after TTL_MS has elapsed', () => {
    expect(
      isRecipientFresh(
        { email: 'a@b', savedAt: NOW - MESSENGER_RECIPIENT_TTL_MS - 1 },
        NOW,
      ),
    ).toBe(false);
  });
});

describe('save / read / clear — localStorage round trip', () => {
  beforeEach(() => {
    // Vitest's jsdom provides a localStorage; ensure it's clean.
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  it('save → read returns the normalized email', () => {
    saveActiveRecipient('  HANK@Example.COM ');
    expect(readActiveRecipient()).toBe('hank@example.com');
  });

  it("save('') clears the entry rather than persisting an empty value", () => {
    saveActiveRecipient('a@b.com');
    saveActiveRecipient('   ');
    expect(readActiveRecipient()).toBeNull();
  });

  it('clearActiveRecipient drops the entry', () => {
    saveActiveRecipient('a@b.com');
    clearActiveRecipient();
    expect(readActiveRecipient()).toBeNull();
  });

  it('read returns null when stored value is too old (uses freshness check)', () => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      MESSENGER_RECIPIENT_STORAGE_KEY,
      JSON.stringify({ email: 'a@b.com', savedAt: 0 }),
    );
    expect(readActiveRecipient(Date.now())).toBeNull();
  });

  it('read returns null when stored value is unparseable', () => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(MESSENGER_RECIPIENT_STORAGE_KEY, '{not json');
    expect(readActiveRecipient()).toBeNull();
  });
});

describe('FloatingMessenger — E9b persist + hydrate wiring', () => {
  const SRC = read('app/admin/components/FloatingMessenger.tsx');

  it('imports the shared store helpers', () => {
    expect(SRC).toMatch(/from '@\/lib\/employee-pond\/messenger-recipient'/);
    expect(SRC).toMatch(/readActiveRecipient,\s*\n?\s*saveActiveRecipient/);
  });

  it('persists the other participant\'s email when activeConv is a direct conv', () => {
    expect(SRC).toMatch(/if \(activeConv\.type !== 'direct'\) return;/);
    expect(SRC).toMatch(/saveActiveRecipient\(other\)/);
  });

  it('on open, hydrates by jumping to an existing direct conv with the saved recipient', () => {
    // The back-button fix made auto-jump one-shot per open: the open guard now
    // resets didAutoJumpRef on close. Hydration still reads the saved recipient.
    expect(SRC).toMatch(/if \(!isOpen\) \{ didAutoJumpRef\.current = false; return; \}[\s\S]*?const saved = readActiveRecipient\(\);/);
    expect(SRC).toMatch(/const existing = conversations\.find\(\(c\) => \{[\s\S]*?others\.includes\(targetEmail\)/);
  });

  it("hydrate skips when the user is already on a chat (don't override their active context)", () => {
    expect(SRC).toMatch(/if \(view === 'chat' && activeConv\) return; \/\/ user already landed on a chat/);
  });
});

describe('/admin/messages page — E9b persist + hydrate wiring', () => {
  const SRC = read('app/admin/messages/page.tsx');

  it('imports the shared store helpers', () => {
    expect(SRC).toMatch(/from '@\/lib\/employee-pond\/messenger-recipient'/);
  });

  it('persist effect writes the recipient whenever activeConv is direct', () => {
    expect(SRC).toMatch(/if \(!activeConv \|\| activeConv\.type !== 'direct'\) return;/);
    expect(SRC).toMatch(/saveActiveRecipient\(other\)/);
  });

  it("hydrate effect runs once via continuityHydratedRef and only after conversations loaded", () => {
    expect(SRC).toMatch(/const continuityHydratedRef = useRef<boolean>/);
    expect(SRC).toMatch(/if \(continuityHydratedRef\.current\) return;/);
    expect(SRC).toMatch(/if \(conversations\.length === 0\) return;/);
  });

  it("hydrate sets the active conversation + fetches its messages", () => {
    expect(SRC).toMatch(/setActiveConv\(existing\);\s*\n\s*fetchMessages\(existing\.id\)/);
  });
});
