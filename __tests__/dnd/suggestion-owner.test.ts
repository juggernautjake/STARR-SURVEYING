import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
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

// The gate is only real if the ROUTES apply it. Source-anchored so a future edit can't silently drop
// the 403 and re-open the unauthenticated-manage hole (driving the routes needs a live DB + session).
describe('the suggestion routes enforce the owner gate at the right places', () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
  const ID_ROUTE = read('app/api/dnd/suggestions/[id]/route.ts');
  const BASE_ROUTE = read('app/api/dnd/suggestions/route.ts');

  it('DELETE and PATCH both gate on isDndOwner with a 403', () => {
    const gates = ID_ROUTE.match(/if \(!isDndOwner\(getDndSession\(\)\)\)/g) ?? [];
    expect(gates.length, 'both managing handlers must gate').toBeGreaterThanOrEqual(2);
    expect(ID_ROUTE).toContain('status: 403');
  });
  it('managing a request is only reachable via the [id] route — GET/POST are not owner-gated', () => {
    // The public list + open submit must NOT 403 non-owners; the 403 message lives only in the [id] route.
    expect(BASE_ROUTE).not.toContain('Only the owner');
  });
});
