// __tests__/dnd/exception-review.test.ts — the DM rules on EACH non-vanilla facet (slot plan S8d).
//
// The owner's directive: *"if the character is used in a campaign, the DM would need to be able to review
// all of the non-vanilla facets of the character and deny or approve them."*
//
// S8c made the facets visible; the only controls were approve-or-reject the WHOLE submission — all or
// nothing on a character that might have one questionable feat and four fine ones. This is the per-facet
// ruling, and most of what is tested is the shape of "no": a denial that deletes the pick, or that carries
// no reason, is worse than no review at all.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reviewExceptions, reviewSummary, type SlotException } from '@/lib/dnd/slots/entitlement';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const ROUTE = read('app/api/dnd/characters/[id]/exceptions/review/route.ts');
const PANEL = read('app/dnd/_ui/SheetApprovalPanel.tsx');

const exc = (name: string, review?: SlotException['review']): SlotException =>
  ({ name, reason: 'r', entitlement: 'expanded', ...(review ? { review } : {}) });
const RULING = { decision: 'approved' as const, by: 'DM', at: '2026-07-26T00:00:00.000Z' };

describe('applying a ruling', () => {
  it('marks the matching exception and leaves the rest alone', () => {
    const out = reviewExceptions(
      [{ exception: exc('Magic Initiate') }, { exception: exc('Alert') }],
      'Magic Initiate', RULING,
    );
    expect((out[0].exception as SlotException).review?.decision).toBe('approved');
    expect((out[1].exception as SlotException).review).toBeUndefined();
  });

  it('matches the way every picker does — case and spacing insensitive', () => {
    const out = reviewExceptions([{ exception: exc('Magic Initiate') }], '  magic   initiate ', RULING);
    expect((out[0].exception as SlotException).review?.decision).toBe('approved');
  });

  it('NEVER removes the pick', () => {
    // Silently deleting a player's content is the failure this codebase refuses everywhere else, and a
    // denial the player cannot see explains nothing. The pick stays, marked.
    const denied = { decision: 'denied' as const, note: 'too strong for tier 1' };
    const out = reviewExceptions([{ exception: exc('Magic Initiate') }], 'Magic Initiate', denied);
    expect(out).toHaveLength(1);
    expect((out[0].exception as SlotException).name).toBe('Magic Initiate');
    expect((out[0].exception as SlotException).review?.note).toBe('too strong for tier 1');
  });

  it('leaves rows that are not exceptions untouched', () => {
    const rows = [{ level: 4, kind: 'asi' }, { exception: exc('Alert') }];
    expect(reviewExceptions(rows, 'Alert', RULING)[0]).toEqual({ level: 4, kind: 'asi' });
  });

  it('survives the shapes persisted jsonb takes', () => {
    for (const bad of [undefined, null, [{ exception: null }], [{ exception: 'x' }] as never]) {
      expect(() => reviewExceptions(bad, 'Alert', RULING)).not.toThrow();
    }
  });
});

describe('what the DM still has to look at', () => {
  it('counts pending separately from approved and denied', () => {
    const s = reviewSummary([
      exc('a', { decision: 'approved' }),
      exc('b', { decision: 'denied', note: 'no' }),
      exc('c'),
    ]);
    expect(s).toMatchObject({ approved: 1, denied: 1, pending: 1, allReviewed: false });
  });

  it('unreviewed is NOT approved — absence has to read as awaiting', () => {
    // The whole value of the flag is that someone else signed it off. Defaulting to approved would make
    // an unreviewed character indistinguishable from a blessed one.
    expect(reviewSummary([exc('a')]).approved).toBe(0);
    expect(reviewSummary([exc('a')]).pending).toBe(1);
  });

  it('a character with no exceptions is not "all reviewed"', () => {
    expect(reviewSummary([]).allReviewed).toBe(false);
  });
});

describe('the route', () => {
  it('is DM-only, checked separately from write access', () => {
    // `requireCharacterWrite` grants the OWNER too — a player approving their own exception would make
    // the flag worthless.
    expect(ROUTE).toContain('if (!access.access.isDM)');
    expect(ROUTE).toMatch(/status: 403/);
  });

  it('refuses a denial with no reason', () => {
    expect(ROUTE).toContain("if (decision === 'denied' && !note)");
  });

  it('refuses to rule on something that is not there', () => {
    // Writing a decision against a name nobody holds would record a ruling no one can see.
    expect(ROUTE).toMatch(/is not a recorded exception[\s\S]{0,60}404/);
  });

  it('reaches whichever ledger the system uses', () => {
    expect(ROUTE).toContain("pathfinder2e: 'pf2Build'");
    expect(ROUTE).toContain("'intuitive-games': 'igBuild'");
  });

  it('does NOT move the badge on approval', () => {
    // An approved exception is still an exception. Collapsing it back to plain vanilla would erase the
    // very thing the next DM needs to see.
    expect(ROUTE).toContain('The BADGE does not move');
    expect(ROUTE).not.toContain('variantKindWithExceptions');
  });
});

describe('the panel', () => {
  it('shows a ruling to EVERYONE, and offers the buttons only to the DM', () => {
    // A player has to see a denial and its reason, or it explains nothing to them.
    expect(PANEL).toContain('{isDM && (');
    expect(PANEL).toContain("e.review.decision === 'approved' ? '✓ Approved' : '✕ Denied'");
  });

  it('reads "awaiting review" when there is no ruling', () => {
    expect(PANEL).toContain('awaiting review');
  });

  it('will not send a denial without a note', () => {
    expect(PANEL).toContain('if (!note) return;');
  });

  it('says how many are still outstanding', () => {
    expect(PANEL).toContain('awaiting your ruling');
  });
});
