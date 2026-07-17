import { describe, it, expect, afterEach } from 'vitest';
import { isDndOwner, dndOwnerKeys, type DndSession } from '@/lib/dnd/auth';

const session = (email: string): DndSession => ({ userId: 'u1', email, displayName: 'X' });
const ORIGINAL = process.env.DND_OWNER_KEYS;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.DND_OWNER_KEYS;
  else process.env.DND_OWNER_KEYS = ORIGINAL;
});

// Area A3 — the owner gate that closes the unauthenticated-delete hole on the requests board.
describe('isDndOwner / dndOwnerKeys', () => {
  it('defaults to Jacob’s pseudo-login keys', () => {
    delete process.env.DND_OWNER_KEYS;
    expect(dndOwnerKeys()).toEqual(['quick:jacob', 'name:jacob']);
  });

  it('recognizes the owner by either synthetic key, case-insensitively', () => {
    delete process.env.DND_OWNER_KEYS;
    expect(isDndOwner(session('quick:jacob'))).toBe(true);
    expect(isDndOwner(session('name:jacob'))).toBe(true);
    expect(isDndOwner(session('QUICK:JACOB'))).toBe(true);
  });

  it('rejects every non-owner and the anonymous (no-session) case', () => {
    delete process.env.DND_OWNER_KEYS;
    expect(isDndOwner(session('quick:andrew'))).toBe(false);
    expect(isDndOwner(session('name:susie'))).toBe(false);
    expect(isDndOwner(null)).toBe(false);
  });

  it('honors DND_OWNER_KEYS override (comma-separated, trimmed)', () => {
    process.env.DND_OWNER_KEYS = 'name:gm , quick:jacob';
    expect(dndOwnerKeys()).toEqual(['name:gm', 'quick:jacob']);
    expect(isDndOwner(session('name:gm'))).toBe(true);
    expect(isDndOwner(session('name:jacob'))).toBe(false); // no longer an owner under the override
  });
});
