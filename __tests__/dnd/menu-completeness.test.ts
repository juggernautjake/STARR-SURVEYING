// __tests__/dnd/menu-completeness.test.ts — every destination is reachable from the menu (P4-2, audit D-3).
//
// D-3's finding, and it is the audit's recurring shape in navigation form: pages existed that nothing linked
// to. `/dnd/profile` was linked ONLY from `CampaignDashboard` — the branch that does not run in open-access
// mode, which is the DEFAULT — so in the shipped configuration nothing pointed at it at all.
// `/dnd/suggestions` was linked only from a "View all suggestions →" anchor inside the SuggestionBox footer
// control, so the board collecting everyone's requests was reachable only by someone already looking at the
// box that submits them.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const header = read('app/dnd/_ui/DndHeader.tsx');
const badge = read('app/dnd/_ui/RequestsNavLink.tsx');
const route = read('app/api/dnd/suggestions/route.ts');

describe('the header reaches every signed-in destination', () => {
  it.each([
    ['/dnd', 'the lobby'],
    ['/dnd/library', 'the rules library'],
    ['/dnd/content', 'custom content'],
    ['/dnd/characters', 'the character index'],
    ['/dnd/characters/new', 'making a character'],
    ['/dnd/content/new', 'the content builder'],
    ['/dnd/profile', 'the profile page'],
  ])('links %s (%s)', (href) => {
    expect(header).toContain(`href="${href}"`);
  });

  it('and the requests board, via its own component', () => {
    // Not a plain Link, because it carries the unreviewed badge.
    expect(header).toContain('<RequestsNavLink');
    expect(badge).toContain('href="/dnd/suggestions"');
  });
});

describe('the unreviewed badge is OWNER-ONLY, decided on the server', () => {
  it('a non-owner gets 0 rather than the number', () => {
    // Hiding the badge client-side would still SEND every player the count. A player shown "12" on a board
    // they cannot action is handed a number they can do nothing with.
    expect(route).toMatch(/if \(!isDndOwner\(getDndSession\(\)\)\) return NextResponse\.json\(\{ count: 0 \}\)/);
  });

  it('and the count includes rows with no status yet', () => {
    // `status` is NULL for anything submitted before the review lifecycle existed, and the board's own GET
    // normalises that to 'untouched'. Counting only `eq('untouched')` would silently ignore every legacy
    // row — the ones most likely to still need reading.
    expect(route).toContain("status.is.null,status.eq.untouched");
  });

  it('the badge renders nothing at zero', () => {
    // A permanently-visible "0" is noise, and noise is how a badge stops being read.
    expect(badge).toContain('{count > 0 && (');
  });

  it('and caps its display without lying about the count', () => {
    expect(badge).toMatch(/count > 99 \? '99\+' : count/);
  });

  it('with the meaning in the accessible name, not just the digit', () => {
    // "Requests 3" tells a screen-reader user nothing about what the 3 is.
    expect(badge).toMatch(/aria-label=\{`\$\{count\} unreviewed`\}/);
  });
});

describe('the count endpoint cannot break navigation', () => {
  it('fails to 0 rather than erroring', () => {
    // The header mounts on every /dnd page. A missing `dnd_suggestions` table must not take the menu with
    // it — this is navigation, and a nav item that errors is worse than one with no badge.
    expect(route).toMatch(/catch \{[\s\S]{0,200}return NextResponse\.json\(\{ count: 0 \}\)/);
    expect(badge).toContain('.catch(() => {})');
  });

  it('and asks for a COUNT, not the whole board', () => {
    // The header renders everywhere; shipping every suggestion body to render one integer would put the
    // entire board on the wire on every navigation.
    expect(badge).toContain("fetch('/api/dnd/suggestions?count=1')");
    expect(route).toContain("{ count: 'exact', head: true }");
  });
});
