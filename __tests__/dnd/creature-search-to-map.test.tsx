// __tests__/dnd/creature-search-to-map.test.tsx — pull a creature onto the board (P13-13b).
//
// The slice is a picker over finished machinery, so the tests that matter are the SEAMS rather than the
// search itself (`bestiary-canonical.test.ts` already pins what `loadBestiary` returns):
//
//   · the id a pick hands over must be placeable — a token stores `{ creatureId }` and
//     `loadTokenSubjects` resolves it against `dnd_creatures`, so handing over anything else renders a
//     blank token rather than failing;
//   · picking must ARM, never place — placing stays "arm, then click the map" because the server owns
//     the coordinate;
//   · the armed state must be VISIBLE for a searched creature, which is the one path with no button of
//     its own to light up;
//   · the empty state must stop sending the DM to another page, because it no longer has to.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import CreatureSearch, { type FoundCreature } from '@/app/dnd/_ui/maps/CreatureSearch';
import { subjectKey, type TokenSubject } from '@/lib/dnd/maps/tokens';

const PLACE = readFileSync(join(process.cwd(), 'app/dnd/_ui/maps/PlaceToken.tsx'), 'utf8');
const ROUTE = readFileSync(join(process.cwd(), 'app/api/dnd/bestiary/search/route.ts'), 'utf8');

const WOLF: FoundCreature = { id: 'c-1', name: 'Wolf', cr: '1/4', type: 'beast', size: 'medium', systems: ['dnd5e-2014'] };

describe('the id a pick hands over is the id a token stores', () => {
  it('a catalogue creature id becomes a `creature:` subject, not a variant or a character', () => {
    // The three-way union is why this is worth pinning: `creatureVariantId` resolves against a DIFFERENT
    // table, so handing a variant id to the `creatureId` arm would look fine and render nothing.
    const subject: TokenSubject = { creatureId: WOLF.id };
    expect(subjectKey(subject)).toBe('creature:c-1');
  });

  it('PlaceToken arms a `creature` subject carrying the searched id and name', () => {
    expect(PLACE).toContain("subject: { kind: 'creature', id: c.id, name: c.name }");
  });

  it('and it writes that id to `creatureId`, which is the field the resolver reads', () => {
    expect(PLACE).toContain("[s.kind === 'character' ? 'characterId' : 'creatureId']: s.id");
  });
});

describe('picking arms — it does not place', () => {
  it('onPick only calls setArmed; there is no second write path', () => {
    const at = PLACE.indexOf('<CreatureSearch');
    const block = PLACE.slice(at, at + 400);
    expect(block).toContain('setArmed(');
    // A picker that placed at a guessed coordinate would be a second answer to "which square is this on",
    // and the server is the one that snaps and clamps.
    expect(block).not.toMatch(/send\(|place\(/);
  });

  it('the search is disabled while a request is in flight', () => {
    expect(PLACE).toMatch(/<CreatureSearch[\s\S]{0,200}disabled=\{busy\}/);
  });
});

describe('the armed state is visible for a searched creature', () => {
  it('PlaceToken renders a ready/cancel line when the armed subject is not in the shortlist', () => {
    // Without this the DM types a name, picks it, and the panel looks untouched — invisible arming, on
    // exactly the path this slice adds.
    expect(PLACE).toContain('is ready — click the map to place it.');
    expect(PLACE).toMatch(/!subjects\.some\(/);
  });

  it('and it offers a cancel, because an armed mode that swallows the next click is the failure this control already guards against', () => {
    const at = PLACE.indexOf('is ready — click the map');
    expect(PLACE.slice(at, at + 500)).toContain('setArmed(null)');
  });
});

describe('the empty state stops sending the DM away', () => {
  it('no longer tells them to go send a creature to a fight', () => {
    expect(PLACE).not.toContain('send a creature from the bestiary to a fight');
  });

  it('points at the control directly beneath it instead', () => {
    expect(PLACE).toContain('search the bestiary below');
  });
});

describe('the search route reuses loadBestiary rather than re-querying', () => {
  it('calls loadBestiary, so the canonical-view reasoning is not re-implemented', () => {
    expect(ROUTE).toContain("from '@/lib/dnd/bestiary/query'");
    expect(ROUTE).toContain('loadBestiary(');
    expect(ROUTE).not.toContain('supabaseAdmin');
  });

  it('requires a signed-in user', () => {
    expect(ROUTE).toContain('getDndSession()');
    expect(ROUTE).toContain('401');
  });

  it('narrows the payload — no statblocks on a keystroke', () => {
    const at = ROUTE.indexOf('creatures: page.creatures.map');
    const block = ROUTE.slice(at, at + 300);
    expect(block).toContain('id:');
    expect(block).toContain('name:');
    expect(block).not.toContain('statblock');
    expect(block).not.toContain('description');
  });

  it('returns the TOTAL, so a narrowed list cannot read as the whole catalogue', () => {
    expect(ROUTE).toContain('total: page.total');
  });
});

describe('the picker renders', () => {
  const html = renderToStaticMarkup(<CreatureSearch onPick={() => {}} />);

  it('starts collapsed, so it does not crowd the map controls', () => {
    expect(html).toContain('From the bestiary');
    expect(html).not.toContain('Search the bestiary');   // the input only exists once opened
  });

  it('says what it does', () => {
    expect(html).toMatch(/catalogue/i);
  });

  it('marks its expanded state for assistive tech', () => {
    expect(html).toContain('aria-expanded="false"');
  });
});
