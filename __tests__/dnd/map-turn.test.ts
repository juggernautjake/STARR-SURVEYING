// __tests__/dnd/map-turn.test.ts — the map knowing whose turn it is. M5-5.
//
// This slice is a CONNECTION, not a build. The initiative list, current turn and round counter already
// existed (`dnd_encounters` + `dnd_initiative_entries`, driven by `InitiativeTracker`). A first pass got
// as far as writing a new `seeds/511_dnd_encounters.sql` with its own tables before the apply failed on a
// column clash — the table was already there, with a different shape.
//
// So these tests guard the two things that connection can get wrong: matching the wrong token, and
// disagreeing with the tracker about whose turn it is.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isCurrentToken, turnSummary, type TurnView } from '@/lib/dnd/maps/turn';
import type { TokenSubject } from '@/lib/dnd/maps/tokens';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const turn = (over: Partial<TurnView> = {}): TurnView => ({
  encounterId: 'enc-1',
  encounterName: 'Ambush at the ford',
  round: 3,
  index: 2,
  currentName: 'Vashti Kelln',
  currentCharacterId: 'char-1',
  total: 7,
  ...over,
});

describe('matching a token to the combatant whose turn it is', () => {
  it('matches on the CHARACTER id', () => {
    expect(isCurrentToken(turn(), { characterId: 'char-1' })).toBe(true);
  });

  it('does NOT match a different character', () => {
    expect(isCurrentToken(turn(), { characterId: 'char-2' })).toBe(false);
  });

  it('never matches a creature token', () => {
    // `dnd_initiative_entries.character_id` is the only link the schema offers. A creature has none, so
    // it cannot be matched — correct rather than unfortunate, and better than guessing by name.
    expect(isCurrentToken(turn(), { creatureId: 'cre-1' } as TokenSubject)).toBe(false);
    expect(isCurrentToken(turn(), { creatureVariantId: 'var-1' } as TokenSubject)).toBe(false);
  });

  it('matches nothing when the current combatant has no character row', () => {
    // A typed-in "Goblin 3" is a real, common combatant. It highlights no token, and the banner says so
    // rather than leaving a DM wondering why nothing glows.
    expect(isCurrentToken(turn({ currentCharacterId: null }), { characterId: 'char-1' })).toBe(false);
  });

  it('is false for every no-fight state rather than throwing', () => {
    expect(isCurrentToken(null, { characterId: 'char-1' })).toBe(false);
    expect(isCurrentToken(turn(), null)).toBe(false);
    expect(isCurrentToken(null, null)).toBe(false);
  });
});

describe('the banner says where in the round we are', () => {
  it('names the combatant and the position, not just the name', () => {
    // A DM glancing at the map wants to know how far through the round they are, which a bare name does
    // not say. The index is 0-based in the data and 1-based in the sentence.
    expect(turnSummary(turn())).toBe("Round 3 · Vashti Kelln's turn (3 of 7)");
  });

  it('handles an encounter with an empty list', () => {
    expect(turnSummary(turn({ currentName: null, total: 0 })))
      .toBe('Round 3 — no one in the initiative list yet');
  });

  it('is null when there is no fight — the normal state of a map', () => {
    expect(turnSummary(null)).toBeNull();
  });
});

describe('the map reads the tracker’s authority, not its copy', () => {
  const SRC = read('lib/dnd/maps/turn.ts');
  const API = read('app/api/dnd/encounters/[id]/route.ts');

  it('the API derives the current entry from the INDEX', () => {
    // The fact this module depends on. If the API ever switches to the `is_current` flag, the two
    // screens can disagree and this test is the thing that notices.
    expect(API).toMatch(/entries\[loaded\.enc\.current_turn_index\]/);
  });

  it('and so does the map', () => {
    expect(SRC).toMatch(/list\[enc\.current_turn_index\]/);
    // `is_current` is a denormalised second opinion that any write can miss. Reading it here would let
    // the map highlight a different token from the tracker beside it, with no way to tell which is right.
    //
    // COMMENTS STRIPPED FIRST. The prose above explaining why not to read `is_current` contains the
    // string `is_current`, so a naive match fails on its own documentation — a mistake already made once
    // in this repo, against a guard for `window.innerHeight`.
    const code = SRC.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
    expect(code).not.toMatch(/is_current/);
  });

  it('orders entries the same way the tracker does', () => {
    // Position N here has to be position N there, or the index means something different on each screen.
    expect(SRC).toMatch(/order\('sort_order', \{ ascending: true \}\)/);
  });
});

describe('no second initiative model was created', () => {
  it('there is no rival encounters seed', () => {
    // Two initiative models in one app is worse than none: the DM's tracker and the map would each be
    // right about a different fight. The 511 seed that started this slice was deleted, not reconciled.
    let exists = true;
    try { read('seeds/511_dnd_encounters.sql'); } catch { exists = false; }
    expect(exists, 'seeds/511_dnd_encounters.sql came back — it duplicates dnd_encounters').toBe(false);
  });

  it('the map does not write turn state, only reads it', () => {
    const SRC = read('lib/dnd/maps/turn.ts');
    for (const write of ['.insert(', '.update(', '.upsert(', '.delete(']) {
      expect(SRC, `turn.ts performs a ${write} — the tracker owns this state`).not.toContain(write);
    }
  });
});

describe('the world page is actually wired', () => {
  const PAGE = read('app/dnd/campaigns/[id]/world/page.tsx');

  it('loads the live turn and renders the banner', () => {
    expect(PAGE).toMatch(/await loadLiveTurn\(campaignId\)/);
    expect(PAGE).toMatch(/data-testid="turn-banner"/);
  });

  it('rings the token whose turn it is, and turn outranks selection', () => {
    // A DM inspecting one token has not stopped the fight, so the turn ring must win.
    expect(PAGE).toMatch(/isCurrentToken\(turn, t\.subject\)/);
    expect(PAGE).toMatch(/isTurn \? 0\.13 : isSelected \? 0\.11 : 0\.07/);
  });

  it('says "current turn" in the accessible name too', () => {
    expect(PAGE).toMatch(/isTurn \? ', current turn' : ''/);
  });
});
