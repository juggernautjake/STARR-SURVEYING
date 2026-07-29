// __tests__/dnd/palette.test.ts — the ⌘K command palette (P4-4, audit D-6).
//
// "The library has excellent search; nothing else does." Finding a character meant remembering which
// campaign it was in.
//
// The RANKING is what decides whether a palette feels good or useless, so it is pure and tested here. The
// route does fetching and permission scoping; those are asserted at the bottom against the source, because
// a palette that searches "everything" is a palette that leaks.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scoreItem, rankPalette, groupPalette, PALETTE_ACTIONS, type PaletteItem } from '@/lib/dnd/palette';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const item = (over: Partial<PaletteItem> = {}): PaletteItem =>
  ({ id: 'x', kind: 'character', title: 'Orin Sallowmere', href: '/x', ...over });

describe('scoring is tiered, not fuzzy', () => {
  it('exact beats prefix beats word-prefix beats substring', () => {
    const exact = scoreItem(item({ title: 'Rage' }), 'rage');
    const prefix = scoreItem(item({ title: 'Rage Beyond Death' }), 'rage');
    const wordPrefix = scoreItem(item({ title: 'Persistent Rage' }), 'rage');
    const substring = scoreItem(item({ title: 'Outrageous' }), 'rage');
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(wordPrefix);
    expect(wordPrefix).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(0);
  });

  it('a word inside the title matches by its own prefix', () => {
    // "sallow" should find "Orin Sallowmere" — surnames are how people search for characters.
    expect(scoreItem(item(), 'sallow')).toBeGreaterThanOrEqual(60);
  });

  it('and hidden keywords score BELOW every title match', () => {
    // A character literally named "Rogue" must outrank every rogue.
    const named = scoreItem(item({ title: 'Rogue' }), 'rogue');
    const classed = scoreItem(item({ title: 'Perrin', keywords: 'Rogue' }), 'rogue');
    expect(named).toBeGreaterThan(classed);
    expect(classed).toBeGreaterThan(0);
  });

  it('no match is 0, and an empty query matches nothing', () => {
    expect(scoreItem(item(), 'zzz')).toBe(0);
    expect(scoreItem(item(), '')).toBe(0);
    expect(scoreItem(item(), '   ')).toBe(0);
  });
});

describe('ranking puts what you are going TO above what you would read', () => {
  it('a character outranks a library article on an equal score', () => {
    // Both match by exact title; the character wins the tie. You can always keep typing to reach the
    // article, but a palette that opens a rules page when you meant your character is a palette you stop
    // using.
    const ranked = rankPalette([
      item({ id: 'l', kind: 'library', title: 'Rage' }),
      item({ id: 'c', kind: 'character', title: 'Rage' }),
    ], 'rage');
    expect(ranked[0].id).toBe('c');
  });

  it('and actions rank last, so they never crowd out real results', () => {
    const ranked = rankPalette([
      item({ id: 'a', kind: 'action', title: 'My characters' }),
      item({ id: 'c', kind: 'character', title: 'My characters' }),
    ], 'my characters');
    expect(ranked.map((r) => r.id)).toEqual(['c', 'a']);
  });

  it('score still wins over kind', () => {
    // An exact library match beats a weak character match — kind is only a tie-breaker.
    const ranked = rankPalette([
      item({ id: 'c', kind: 'character', title: 'Perrin', keywords: 'rage' }),
      item({ id: 'l', kind: 'library', title: 'Rage' }),
    ], 'rage');
    expect(ranked[0].id).toBe('l');
  });

  it('drops non-matches and honours the limit', () => {
    const many = Array.from({ length: 40 }, (_, i) => item({ id: `i${i}`, title: `Rage ${i}` }));
    expect(rankPalette([...many, item({ id: 'no', title: 'Nothing' })], 'rage', 5)).toHaveLength(5);
  });

  it('and is stable — same input, same order', () => {
    const input = [item({ id: 'b', title: 'Rage B' }), item({ id: 'a', title: 'Rage A' })];
    expect(rankPalette(input, 'rage').map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('grouping preserves rank order inside each group', () => {
  it('groups in a fixed order and skips empty ones', () => {
    const ranked = rankPalette([
      item({ id: 'l', kind: 'library', title: 'Rage' }),
      item({ id: 'c', kind: 'character', title: 'Rage' }),
    ], 'rage');
    const groups = groupPalette(ranked);
    expect(groups.map((g) => g.kind)).toEqual(['character', 'library']);
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
  });
});

describe('the actions are real destinations', () => {
  it('every action points somewhere under /dnd', () => {
    for (const a of PALETTE_ACTIONS) {
      expect(a.href, `${a.title} must have a /dnd href`).toMatch(/^\/dnd/);
      expect(a.kind).toBe('action');
    }
  });

  it('and each carries keywords, since their titles are terse', () => {
    // "New character" should be findable by typing "create" or "build".
    for (const a of PALETTE_ACTIONS) expect(a.keywords, `${a.title}`).toBeTruthy();
  });
});

describe('the route scopes what it searches', () => {
  const route = read('app/api/dnd/search/route.ts');

  it('requires a session', () => {
    expect(route).toContain("if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });");
  });

  it('characters are OWNED OR PLAYED, not every character in your campaigns', () => {
    // A DM browsing the palette should not have every player's sheet in their results.
    expect(route).toMatch(/owner_user_id\.eq\.\$\{session\.userId\},played_by_user_id\.eq\.\$\{session\.userId\}/);
  });

  it('campaigns come from membership', () => {
    expect(route).toContain("from('dnd_campaign_members')");
    expect(route).toContain(".eq('user_id', session.userId)");
  });

  it('custom content is yours or published', () => {
    expect(route).toMatch(/created_by\.eq\.\$\{session\.userId\},visibility\.eq\.public/);
  });

  it('and a missing Studio table does not break the other sources', () => {
    // The Studio is optional until seed 455 is applied.
    expect(route).toMatch(/try \{[\s\S]{0,900}dnd_homebrew[\s\S]{0,900}\} catch \{/);
  });

  it('library results are scored on their NAME, not their body', () => {
    // THE bug browser QA caught: passing `hit.body` as keywords made every article match any substring
    // anywhere in its prose, so "orin" returned "Restoring Touch" and "Spell-Storing Item" above the
    // character actually named Orin — seven rows of noise under one right answer.
    expect(route, 'the article body must not be searchable keywords').not.toMatch(/keywords: hit\.body/);
    expect(route).toContain('searchLibrary(q, null, 12)');
  });
});

describe('the palette costs nothing until summoned', () => {
  const ui = read('app/dnd/_ui/CommandPalette.tsx');

  it('renders no DOM while closed', () => {
    expect(ui).toContain('if (!open) return null;');
  });

  it('and does not fetch while closed', () => {
    expect(ui).toMatch(/if \(!open\) return;/);
  });

  it('guards against a slow response overwriting a newer one', () => {
    // The classic search race: typing "vex" fast enough leaves you looking at results for "v".
    expect(ui).toContain('const mine = ++seq.current;');
    expect(ui).toContain('if (mine !== seq.current) return;');
  });

  it('is keyboard-driven end to end', () => {
    expect(ui).toMatch(/e\.metaKey \|\| e\.ctrlKey/);
    expect(ui).toContain("e.key === 'Escape'");
    expect(ui).toContain("e.key === 'ArrowDown'");
    expect(ui).toContain("e.key === 'Enter'");
  });

  it('and is mounted for signed-in users only', () => {
    // Every source it searches is caller-scoped, so a signed-out visitor would open it onto a 401.
    expect(read('app/dnd/layout.tsx')).toContain('{session && <CommandPalette />}');
  });
});
