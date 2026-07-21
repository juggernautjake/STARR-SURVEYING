// 5e weapons, armour and gear are reachable from library SEARCH, not just rendered on the page.
//
// The gap this closes was found while fixing the deep-link anchors, and it is the same
// reachability failure as the 2014 feat picker and the IG background reached from a third
// direction: both 5e editions have had full weapon and armour catalogs for some time, and the
// library PAGE renders them as expandable entries — but the SEARCH never pushed them. The two
// helpers that fed gear into the catalog were PF2-typed and PF2-only, with a comment saying 5e
// gear "lives elsewhere", which was true of the catalogs and false of the search.
//
// `searchLibrary('longsword', 'dnd5e-2014')` returned NOTHING, on a page that visibly lists
// Longsword. Nothing failed; the content was simply unfindable.
//
// These assert search RESULTS rather than reading library.ts, because a source check cannot tell
// the difference between "the loop exists" and "the loop runs for this system".
import { describe, expect, it } from 'vitest';
import { searchLibrary } from '@/lib/dnd/library';
import { WEAPONS_2014, ARMOR_2014, GEAR_2014 } from '@/lib/dnd/equipment/dnd5e-2014';
import { WEAPONS_2024, ARMOR_2024 } from '@/lib/dnd/equipment/dnd5e-2024';

const names = (q: string, system: string) => searchLibrary(q, system as never).map((h) => h.name);
const kinds = (q: string, system: string) => searchLibrary(q, system as never).map((h) => h.kind);

describe('5e gear is findable by search', () => {
  it('finds a weapon in BOTH editions — the regression itself', () => {
    // Before this fix, 2014 returned zero hits for its own longsword.
    expect(names('longsword', 'dnd5e-2014')).toContain('Longsword');
    expect(names('longsword', 'dnd5e-2024')).toContain('Longsword');
  });

  it('finds armour in both editions', () => {
    expect(names('chain mail', 'dnd5e-2014')).toContain('Chain Mail');
    expect(names('chain mail', 'dnd5e-2024')).toContain('Chain Mail');
  });

  it('finds 2014 adventuring gear, which only that edition catalogues', () => {
    const some = GEAR_2014[0];
    expect(names(some.name.toLowerCase(), 'dnd5e-2014')).toContain(some.name);
  });

  it('files gear under the kind that resolves to the right page section', () => {
    // A hit with the wrong kind lands on the wrong shelf — a quieter bug than a dead link, and
    // the same class of bug. `weapon`/`armor` are what `sectionForKind` maps to the gear sections.
    expect(kinds('longsword', 'dnd5e-2014')).toContain('weapon');
    expect(kinds('chain mail', 'dnd5e-2014')).toContain('armor');
  });

  it('every catalogued weapon and armour is searchable, not just the ones spot-checked', () => {
    // The spot checks above would pass with a single hard-coded entry. This is the claim that
    // actually matters: the catalog and the search index are the same set.
    for (const w of WEAPONS_2014) expect(names(w.name.toLowerCase(), 'dnd5e-2014')).toContain(w.name);
    for (const a of ARMOR_2014) expect(names(a.name.toLowerCase(), 'dnd5e-2014')).toContain(a.name);
    for (const w of WEAPONS_2024) expect(names(w.name.toLowerCase(), 'dnd5e-2024')).toContain(w.name);
    for (const a of ARMOR_2024) expect(names(a.name.toLowerCase(), 'dnd5e-2024')).toContain(a.name);
  });
});

describe('the editions do not bleed through gear search', () => {
  it('surfaces Weapon Mastery for 2024 and NEVER for 2014', () => {
    // The headline 2024 addition, and the single most likely thing to be wrongly assumed present
    // in 2014. `WeaponDef2014` has no mastery field by design; this asserts the same at the
    // search layer, where a shared loop would have quietly reintroduced it.
    const body2024 = searchLibrary('longsword', 'dnd5e-2024' as never).find((h) => h.name === 'Longsword')?.body ?? '';
    const body2014 = searchLibrary('longsword', 'dnd5e-2014' as never).find((h) => h.name === 'Longsword')?.body ?? '';
    expect(body2024.toLowerCase()).toContain('mastery');
    expect(body2014.toLowerCase()).not.toContain('mastery');
  });

  it('does not serve PF2 gear on a 5e page, or 5e gear on a PF2 page', () => {
    // PF2 has its own Longsword with entirely different stats. Both editions and PF2 all publish
    // a weapon by that name, which is exactly why the pipes must stay separate — this is bleed
    // B2's shape (a PF2 "Longsword" arriving with 5e numbers) checked at the search layer.
    const pf2 = searchLibrary('longsword', 'pathfinder2e' as never).find((h) => h.name === 'Longsword')?.body ?? '';
    const e2014 = searchLibrary('longsword', 'dnd5e-2014' as never).find((h) => h.name === 'Longsword')?.body ?? '';
    expect(pf2).not.toBe('');
    expect(e2014).not.toBe('');
    expect(pf2).not.toBe(e2014);
    // PF2 describes weapons by group and traits; 5e by category and properties.
    expect(e2014.toLowerCase()).toContain('martial');
    expect(e2014).toMatch(/D&D 5e \(2014\)/);
  });

  it('describes the Net honestly rather than rendering a null', () => {
    // The one 2014 weapon with no damage and a null damage type — the case a naive template
    // string turns into the literal text "null null".
    const net = WEAPONS_2014.find((w) => w.name === 'Net');
    if (!net) return; // catalog does not carry it; nothing to assert
    const body = searchLibrary('net', 'dnd5e-2014' as never).find((h) => h.name === 'Net')?.body ?? '';
    expect(body).not.toMatch(/null/);
    expect(body).toContain('no damage');
  });
});
