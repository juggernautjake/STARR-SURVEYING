// __tests__/dnd/ig-content-gaps.test.ts — keeps the owner's "what I need to grab from Brendan" list
// honest and current. The SITE_MASTER scrub doc names exactly which IG powers still need effect text
// (and which app powers aren't on the site roster). Those are computed from the code, so the doc can
// drift as Brendan's text lands. This guard fails the moment a NEW gap appears that the doc doesn't
// list — so the owner's grab-list is never quietly incomplete. (As a gap is FILLED, the doc keeps a
// harmless stale name until edited; that direction doesn't mislead, so it isn't failed.)
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { igSpellsMissingEffects, igPowersNotInRoster } from '@/lib/dnd/systems/intuitive-games/content';

const DOC = fs.readFileSync(path.join(process.cwd(), 'docs/reference/intuitive-games/SITE_MASTER.md'), 'utf8');

describe('SITE_MASTER lists every current IG content gap (owner grab-list)', () => {
  it('every power still missing effect text is named in the doc', () => {
    const undocumented = igSpellsMissingEffects().filter((name) => !DOC.includes(name));
    expect(undocumented, 'these powers need effect text but are not in SITE_MASTER § "WHAT I CAN\'T GRAB"').toEqual([]);
  });

  it('every app power not on the current site roster is named in the doc (reconcile list)', () => {
    const undocumented = igPowersNotInRoster().filter((name) => !DOC.includes(name));
    expect(undocumented, 'these app powers are off-roster but not flagged for reconcile in SITE_MASTER').toEqual([]);
  });

  it('the doc points at the computed source so the list is reproducible, not hand-maintained', () => {
    expect(DOC).toContain('igSpellsMissingEffects()');
  });
});
