// lib/dnd/homebrew/store.ts — the row↔model boundary and the visibility rules (P6-2/P6-3).
//
// NAMED `homebrew-catalog-store` because `homebrew-store.test.ts` is taken by
// `lib/dnd/classes/homebrew-store.ts`, which is a DIFFERENT thing: that one keeps homebrew ON one
// character; this one is the shareable catalog. Worth keeping the names apart — the two were easy to
// confuse when the Studio was being planned.
//
// Visibility is the kind of rule that is quietly wrong in one direction for months, so it is tested over
// the whole visibility × status product rather than at a few sampled points. The bug this caught during
// authoring is pinned below by name.
import { describe, expect, it } from 'vitest';
import {
  rowToHomebrew, homebrewToRow, normalizeVisibility, canReadHomebrew, canWriteHomebrew,
  isBrowsable, statusForVisibility, visibleHomebrew, pickCreatorWritable, CREATOR_WRITABLE_FIELDS,
  type HomebrewRow, type StoredHomebrew, type HomebrewVisibility,
} from '@/lib/dnd/homebrew/store';
import { isHomebrewPublished, type HomebrewStatus } from '@/lib/dnd/homebrew/model';

const OWNER = 'user-owner';
const OTHER = 'user-other';

const row = (over: Partial<HomebrewRow> = {}): HomebrewRow => ({
  id: 'hb-1', owner_user_id: OWNER, kind: 'item', system: 'dnd5e-2024', name: 'Belt of Sure Footing',
  status: 'draft', visibility: 'private', ...over,
});

const piece = (over: Partial<StoredHomebrew> = {}): StoredHomebrew =>
  ({ ...rowToHomebrew(row(), 'Jacob')!, ...over });

const VISIBILITIES: HomebrewVisibility[] = ['private', 'unlisted', 'public'];
const STATUSES: HomebrewStatus[] = ['draft', 'submitted', 'approved', 'rejected'];

describe('rowToHomebrew', () => {
  it('maps a row into the model with attribution', () => {
    const p = rowToHomebrew(row(), 'Jacob')!;
    expect(p.name).toBe('Belt of Sure Footing');
    expect(p.creator).toEqual({ id: OWNER, name: 'Jacob' });
    expect(p.ownerUserId).toBe(OWNER);
  });

  it('drops a row the model would refuse, rather than coercing it', () => {
    // `normalizeHomebrew` owns this judgement so the Studio and the library agree on what a valid piece is.
    expect(rowToHomebrew(row({ kind: 'nonsense-kind' }), 'Jacob')).toBeNull();
    expect(rowToHomebrew(row({ name: '   ' }), 'Jacob')).toBeNull();
    expect(rowToHomebrew(row(), '  '), 'attribution is required — content is never anonymous').toBeNull();
  });

  it('carries the Studio-only fields the pure model has no place for', () => {
    const p = rowToHomebrew(row({
      image_url: 'https://x/y.png', based_on: 'Fighter', partial_to_level: 5, origin_id: 'hb-0',
    }), 'Jacob')!;
    expect(p.imageUrl).toBe('https://x/y.png');
    expect(p.basedOn).toBe('Fighter');
    expect(p.partialToLevel).toBe(5);
    expect(p.originId).toBe('hb-0');
  });

  it('omits absent optionals instead of writing nulls into the model', () => {
    const p = rowToHomebrew(row(), 'Jacob')!;
    expect('imageUrl' in p).toBe(false);
    expect('partialToLevel' in p).toBe(false);
  });
});

describe('normalizeVisibility fails CLOSED', () => {
  it('keeps the three real values', () => {
    for (const v of VISIBILITIES) expect(normalizeVisibility(v)).toBe(v);
  });

  it('and sends anything else to private, never public', () => {
    // The one direction this must not fail in: a value we cannot read must never be assumed shareable.
    for (const junk of [undefined, null, '', 'PUBLIC', 'world', 42, {}]) {
      expect(normalizeVisibility(junk), String(junk)).toBe('private');
    }
  });
});

describe('homebrewToRow writes only what a caller owns', () => {
  it('maps camelCase to columns', () => {
    expect(homebrewToRow({ imageUrl: 'u', basedOn: 'Fighter', partialToLevel: 3, originId: 'hb-0' }))
      .toEqual({ image_url: 'u', based_on: 'Fighter', partial_to_level: 3, origin_id: 'hb-0' });
  });

  it('never emits id, owner or timestamps — those are the server’s', () => {
    const out = homebrewToRow({ ...piece(), id: 'spoofed', ownerUserId: 'spoofed' } as Partial<StoredHomebrew>);
    for (const forbidden of ['id', 'owner_user_id', 'created_at', 'updated_at']) {
      expect(Object.keys(out)).not.toContain(forbidden);
    }
  });

  it('omits untouched fields entirely, so a PATCH cannot blank what it did not mention', () => {
    expect(homebrewToRow({ name: 'X' })).toEqual({ name: 'X' });
  });

  it('empties to null rather than to the empty string', () => {
    expect(homebrewToRow({ summary: '' }).summary).toBeNull();
  });
});

describe('reading and writing', () => {
  it('the creator can always read their own, in every state', () => {
    for (const visibility of VISIBILITIES) {
      for (const status of STATUSES) {
        expect(canReadHomebrew(piece({ visibility, status }), { userId: OWNER }), `${visibility}/${status}`).toBe(true);
      }
    }
  });

  it('a stranger can read public and unlisted, never private', () => {
    expect(canReadHomebrew(piece({ visibility: 'public' }), { userId: OTHER })).toBe(true);
    expect(canReadHomebrew(piece({ visibility: 'unlisted' }), { userId: OTHER })).toBe(true);
    expect(canReadHomebrew(piece({ visibility: 'private' }), { userId: OTHER })).toBe(false);
    expect(canReadHomebrew(piece({ visibility: 'private' }), { userId: null })).toBe(false);
  });

  it('a draft shared by link stays readable — that is what the link is FOR', () => {
    expect(canReadHomebrew(piece({ visibility: 'unlisted', status: 'draft' }), { userId: OTHER })).toBe(true);
  });

  it('only the creator writes; not a stranger, not a signed-out caller', () => {
    expect(canWriteHomebrew(piece(), { userId: OWNER })).toBe(true);
    expect(canWriteHomebrew(piece(), { userId: OTHER })).toBe(false);
    expect(canWriteHomebrew(piece(), { userId: null })).toBe(false);
  });
});

describe('browsing — the rule that was wrong when first written', () => {
  it('REGRESSION: browse must not require BOTH public and approved', () => {
    // The first version of `isBrowsable` was `visibility === 'public' && status === 'approved'`. With public
    // self-serve, nothing ever sets `approved`, so that rule is always false: two plausible-looking
    // conditions multiplying into a permanently empty catalog. Publishing is `visibility`; `status` only
    // ever excludes.
    expect(isBrowsable(piece({ visibility: 'public', status: 'draft' })), 'public ⇒ browsable').toBe(true);
  });

  it('lists public, excluding only a rejected verdict', () => {
    for (const status of STATUSES) {
      expect(isBrowsable(piece({ visibility: 'public', status })), status).toBe(status !== 'rejected');
    }
  });

  it('never lists private or unlisted, in any status', () => {
    for (const visibility of ['private', 'unlisted'] as const) {
      for (const status of STATUSES) {
        expect(isBrowsable(piece({ visibility, status })), `${visibility}/${status}`).toBe(false);
      }
    }
  });

  it('unlisted is readable but not listed — the whole point of the middle option', () => {
    const p = piece({ visibility: 'unlisted', status: 'approved' });
    expect(canReadHomebrew(p, { userId: OTHER })).toBe(true);
    expect(isBrowsable(p)).toBe(false);
  });
});

describe('statusForVisibility keeps the two axes from drifting', () => {
  it('going public carries `approved` with it, so the LIBRARY sees it too', () => {
    // `isHomebrewPublished` — read by the library section and the AI grounding — tests `approved`. Without
    // this, a creator publishes something that shows in the Studio and nowhere else.
    const next = statusForVisibility('public', 'draft');
    expect(next).toBe('approved');
    expect(isHomebrewPublished({ ...piece(), status: next })).toBe(true);
  });

  it('coming back from public genuinely un-publishes', () => {
    for (const v of ['private', 'unlisted'] as const) expect(statusForVisibility(v, 'approved')).toBe('draft');
  });

  it('and a rejected verdict cannot be laundered away by flipping visibility', () => {
    for (const v of VISIBILITIES) expect(statusForVisibility(v, 'rejected'), v).toBe('rejected');
  });
});

describe('visibleHomebrew', () => {
  const mine = piece({ id: 'mine', visibility: 'private' } as Partial<StoredHomebrew>);
  const theirs = piece({ id: 'theirs', ownerUserId: OTHER, visibility: 'public' } as Partial<StoredHomebrew>);
  const hidden = piece({ id: 'hidden', ownerUserId: OTHER, visibility: 'private' } as Partial<StoredHomebrew>);

  it('shows only browsable pieces by default', () => {
    expect(visibleHomebrew([mine, theirs, hidden], { userId: OWNER }).map((p) => p.id)).toEqual(['theirs']);
  });

  it('and the viewer’s own drafts when asked — the "Mine" tab', () => {
    const ids = visibleHomebrew([mine, theirs, hidden], { userId: OWNER }, { includeOwn: true }).map((p) => p.id);
    expect(ids).toContain('mine');
    expect(ids, 'someone else’s private work is never included').not.toContain('hidden');
  });
});

describe('pickCreatorWritable', () => {
  it('keeps the creator’s own fields', () => {
    const out = pickCreatorWritable({ name: 'X', summary: 'y', payload: { effects: [] } });
    expect(out).toEqual({ name: 'X', summary: 'y', payload: { effects: [] } });
  });

  it('drops status — publishing has exactly one route, and rejection cannot be PATCHed away', () => {
    expect(CREATOR_WRITABLE_FIELDS as readonly string[]).not.toContain('status');
    expect(pickCreatorWritable({ status: 'approved', name: 'X' })).toEqual({ name: 'X' });
  });

  it('drops server-owned keys silently — a client echoing back what it was given is not an attack', () => {
    expect(pickCreatorWritable({ id: 'x', ownerUserId: 'y', createdAt: 'z', assessment: {} })).toEqual({});
  });

  it('normalizes visibility on the way through, so a junk value fails closed', () => {
    expect(pickCreatorWritable({ visibility: 'world-readable' }).visibility).toBe('private');
  });
});
