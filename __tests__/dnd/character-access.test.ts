// __tests__/dnd/character-access.test.ts — the security-critical read/write decision for a character,
// extracted from the DB-fetching getCharacterAccess so the whole access matrix is exhaustively pinned
// without a live DB. A regression here is a data leak (wrong read) or an unauthorized write, so every
// role × visibility combination is asserted explicitly.
import { describe, it, expect } from 'vitest';
import { resolveCharacterAccess } from '@/lib/dnd/characters';

type Vis = 'private' | 'campaign' | 'public';
const A = (o: Partial<{ isOwner: boolean; isPlayer: boolean; isDM: boolean; isMember: boolean; visibility: Vis }>) =>
  resolveCharacterAccess({ isOwner: false, isPlayer: false, isDM: false, isMember: false, visibility: 'private', ...o });

describe('resolveCharacterAccess — WRITE is owner / assigned player / DM only', () => {
  it('the owner, the assigned player, and a DM can each write (and therefore read)', () => {
    for (const role of ['isOwner', 'isPlayer', 'isDM'] as const) {
      const r = A({ [role]: true, visibility: 'private' });
      expect(r.canWrite, `${role} should be able to write`).toBe(true);
      expect(r.canRead).toBe(true);
    }
  });

  it('a mere campaign MEMBER (not owner/player/DM) can NEVER write, whatever the visibility', () => {
    for (const visibility of ['private', 'campaign', 'public'] as const) {
      expect(A({ isMember: true, visibility }).canWrite, `member+${visibility} must not write`).toBe(false);
    }
  });

  it('a total stranger (no roles) can never write', () => {
    for (const visibility of ['private', 'campaign', 'public'] as const) {
      expect(A({ visibility }).canWrite).toBe(false);
    }
  });
});

describe('resolveCharacterAccess — READ follows visibility for non-writers', () => {
  it('PRIVATE: readable ONLY by someone who can write it — a member or stranger cannot read', () => {
    expect(A({ visibility: 'private', isMember: true }).canRead).toBe(false); // member alone: no read
    expect(A({ visibility: 'private' }).canRead).toBe(false);                 // stranger: no read
    expect(A({ visibility: 'private', isOwner: true }).canRead).toBe(true);   // writer: read
  });

  it('CAMPAIGN: a member can read (but not write); a non-member stranger cannot', () => {
    expect(A({ visibility: 'campaign', isMember: true })).toEqual({ canWrite: false, canRead: true });
    expect(A({ visibility: 'campaign', isMember: false }).canRead).toBe(false); // not in the campaign → no read
  });

  it('PUBLIC: any signed-in user can read (but still not write)', () => {
    expect(A({ visibility: 'public' })).toEqual({ canWrite: false, canRead: true });
    expect(A({ visibility: 'public', isMember: false }).canRead).toBe(true);
  });

  it('a writer can always read regardless of visibility (write implies read)', () => {
    for (const visibility of ['private', 'campaign', 'public'] as const) {
      expect(A({ isDM: true, visibility }).canRead).toBe(true);
    }
  });
});
