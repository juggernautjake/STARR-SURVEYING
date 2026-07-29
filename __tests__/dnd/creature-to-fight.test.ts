// __tests__/dnd/creature-to-fight.test.ts — a Studio creature in a live fight (P6-14).
//
// P6-13 made the creature buildable: statblock, abilities, actions, artwork, all on one page. What it could
// not do was put the creature in a fight. `/encounters/[id]/entries` accepted a `characterId` and nothing
// else, so a DM dropping their own monster into combat re-typed its name and HP by hand — the exact work
// the Studio exists to remove, with a fresh chance to fat-finger the HP every time.
//
// The plan's requirement was that "a creature dropped into a fight and a creature opened from the Studio
// are the same object". `creatureCombatant` is that seam, and it is pure so the seam is testable.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { creatureCombatant } from '@/lib/dnd/homebrew/statblock';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const row = (over: Record<string, unknown> = {}) => ({
  name: 'Bone Choir',
  image_url: 'https://example.test/bone.png',
  payload: { statblock: { ac: 15, hp: 42, speed: '30 ft.' } },
  ...over,
});

describe('creatureCombatant', () => {
  it('carries the name, the art and the HP across', () => {
    expect(creatureCombatant(row())).toEqual({
      name: 'Bone Choir',
      tokenUrl: 'https://example.test/bone.png',
      hp: 42,
      maxHp: 42,
    });
  });

  it('returns BOTH current and max, because an initiative entry tracks them separately', () => {
    // A combatant added at full health still needs a max to count down from. Returning one number would
    // leave the tracker unable to say "18 / 42".
    const c = creatureCombatant(row())!;
    expect(c.hp).toBe(c.maxHp);
    expect(c.maxHp).not.toBeNull();
  });

  it('NEVER INVENTS AN HP', () => {
    // `normalizeStatblock` already drops a number it cannot trust, and guessing one here would put a
    // plausible wrong HP in front of a DM mid-combat — the failure that whole module exists to prevent.
    expect(creatureCombatant(row({ payload: { statblock: { ac: 15 } } }))).toMatchObject({ hp: null, maxHp: null });
    expect(creatureCombatant(row({ payload: {} }))).toMatchObject({ hp: null, maxHp: null });
    expect(creatureCombatant(row({ payload: { statblock: { hp: 'lots' } } }))).toMatchObject({ hp: null });
  });

  it('and refuses a row it cannot name', () => {
    // A nameless combatant in an initiative list is unusable, and the route's own "name required" check
    // then produces a sensible error instead of a blank row.
    expect(creatureCombatant(row({ name: '   ' }))).toBeNull();
    expect(creatureCombatant(row({ name: undefined }))).toBeNull();
    expect(creatureCombatant(null)).toBeNull();
    expect(creatureCombatant(undefined)).toBeNull();
  });

  it('survives a junk payload without throwing', () => {
    for (const payload of [null, 'nope', 42, [], { statblock: 'nope' }]) {
      expect(() => creatureCombatant(row({ payload })), String(payload)).not.toThrow();
    }
    expect(creatureCombatant(row({ payload: 'nope' }))?.name).toBe('Bone Choir');
  });

  it('and treats a missing image as no token rather than an empty string', () => {
    expect(creatureCombatant(row({ image_url: '' }))?.tokenUrl).toBeNull();
    expect(creatureCombatant(row({ image_url: undefined }))?.tokenUrl).toBeNull();
  });
});

describe('the entries route accepts a creature', () => {
  const route = read('app/api/dnd/encounters/[id]/entries/route.ts');

  it('takes a homebrewId alongside characterId', () => {
    expect(route).toContain('homebrewId');
    expect(route).toContain('creatureCombatant(');
  });

  it('leaves character_id NULL for one — it is a foreign key into a different table', () => {
    expect(route).toContain('character_id: characterId ?? null');
    expect(route).toMatch(/if \(!characterId && homebrewId\)/);
  });

  it('READS ONLY YOUR OWN OR A PUBLISHED CREATURE', () => {
    // "It is only an HP number" is not a reason to read another user's unpublished work out of their
    // Studio. The gate is ownership OR public, the same rule the rest of the Studio uses.
    expect(route).toMatch(/owner_user_id === session\.userId \|\| row\.visibility === 'public'/);
  });

  it('and refuses a piece that is not a creature', () => {
    // Every kind has a name and some have an image; without this a DM could add a "spell" to the
    // initiative order and it would look like it worked.
    expect(route).toMatch(/row\.kind !== 'creature'/);
  });

  it('degrades when seed 455 has not been applied', () => {
    // The Studio table arrives with a seed the owner has not run. A manual add must still work.
    expect(route).toMatch(/seed 455/);
  });

  it('is still DM-only', () => {
    expect(route).toContain("!== 'dm') return NextResponse.json({ error: 'DM only.' }");
  });
});

describe('the encounters list route, which did not exist', () => {
  const route = read('app/api/dnd/encounters/route.ts');

  it('lists only campaigns you DM', () => {
    // Every encounter route was `/encounters/[id]/…`, so anything wanting to offer "which fight?" had to
    // already know the id — which is why a creature in the Studio could not be sent to one.
    expect(route).toContain("from('dnd_campaign_members')");
    expect(route).toContain(".eq('role', 'dm')");
    expect(route).toContain(".eq('user_id', session.userId)");
  });

  it('and returns nothing rather than everything when you DM none', () => {
    // The dangerous shape: an empty `in()` list that a query builder turns into "no filter".
    expect(route).toMatch(/if \(!campaignIds\.length\) return NextResponse\.json\(\{ encounters: \[\] \}\)/);
    expect(route).toMatch(/if \(!sessions\.length\) return NextResponse\.json\(\{ encounters: \[\] \}\)/);
  });

  it('hides finished fights, newest first, and is bounded', () => {
    expect(route).toMatch(/e\.status !== 'done'/);
    expect(route).toContain("ascending: false");
    expect(route).toContain('.limit(100)');
  });
});

describe('AND IT HAS A DOOR', () => {
  const ui = read('app/dnd/_ui/SendCreatureToFight.tsx');
  const page = read('app/dnd/content/[id]/page.tsx');

  it('the creature page mounts it, and only for creatures', () => {
    expect(page).toContain("piece.kind === 'creature' && <SendCreatureToFight");
    expect(page).toContain("from '@/app/dnd/_ui/SendCreatureToFight'");
  });

  it('the copies are added SEQUENTIALLY', () => {
    // `sort_order` is assigned from the current row count, so firing the requests in parallel races and
    // lands several combatants on the same position. A pack of six wolves is the common case.
    expect(ui).toMatch(/for \(let i = 0; i < count; i \+= 1\)/);
    expect(ui).not.toContain('Promise.all');
  });

  it('loads the encounter list on OPEN, not on mount', () => {
    // It sits on a page that is mostly read, and most visits never touch it.
    expect(ui).toContain('async function load()');
    expect(ui).toMatch(/onClick=\{load\}/);
  });

  it('and explains an empty list instead of showing a blank panel', () => {
    // "No encounters" with no explanation reads as broken; it is almost always "you do not DM anything
    // with a live fight", which is a different problem and one the reader can act on.
    expect(ui).toMatch(/No encounters you run/);
  });
});
