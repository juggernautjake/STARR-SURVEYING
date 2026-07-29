// A real character index (P4-1, audit finding D-1).
//
// There was no `/dnd/characters` page. The only list of a user's characters was a card grid on the lobby
// showing **name, portrait and campaign** — no system, no class, no level — with no search, filter, sort,
// duplicate or delete, and no menu entry pointing anywhere near it.
//
// The obstacle was never the page: "what class is this and what level" lives in three different places
// depending on the system, so every surface that wanted it re-derived it inline. `characterCard` reads all
// three, and most of what is worth testing is that it survives the raw jsonb it is pointed at.
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { characterCard, characterMatches } from '@/lib/dnd/character-card';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('reading a character across all three shapes', () => {
  it('5e — data.meta', () => {
    const c = characterCard({ meta: { className: 'Fighter', subclass: 'Champion', level: 5 } }, 'dnd5e-2024');
    expect(c.line).toBe('Level 5 Fighter (Champion)');
    expect(c.systemName).toBe('D&D 5e (2024)');
  });

  it('PF2 — data.pf2e.identity', () => {
    const c = characterCard({ pf2e: { identity: { className: 'Wizard', subclass: 'Evocation', level: 3 } } }, 'pathfinder2e');
    expect(c.line).toBe('Level 3 Wizard (Evocation)');
  });

  it('IG — data.ig.identity', () => {
    const c = characterCard({ ig: { identity: { className: 'Marksman', level: 2 } } }, 'intuitive-games');
    expect(c.line).toBe('Level 2 Marksman');
  });

  it('reads the SIDECAR first, so a stale system column cannot mislabel a character', () => {
    // The column can disagree with what is stored — a character switched systems, a legacy row. The
    // sidecar cannot.
    const c = characterCard({ pf2e: { identity: { className: 'Wizard', level: 3 } }, meta: { className: 'Fighter', level: 9 } }, 'dnd5e-2024');
    expect(c.className).toBe('Wizard');
    expect(c.level).toBe(3);
  });
});

describe('it never throws on the jsonb it is actually pointed at', () => {
  it('survives every kind of junk', () => {
    // A listing that dies on one malformed row shows the user nothing, which is worse than showing them a
    // name with no class beside it.
    for (const junk of [null, undefined, 'nope', 42, [], { meta: 'not an object' }]) {
      expect(() => characterCard(junk, 'dnd5e-2024')).not.toThrow();
      expect(characterCard(junk, 'dnd5e-2024').line).toBe('');
    }
  });

  it('builds the line from what is THERE, not from a template with holes', () => {
    // A half-built character should read "Level 1" or "Fighter", never "Level  ()".
    expect(characterCard({ meta: { level: 1 } }, 'dnd5e-2024').line).toBe('Level 1');
    expect(characterCard({ meta: { className: 'Fighter' } }, 'dnd5e-2024').line).toBe('Fighter');
    expect(characterCard({ meta: { subclass: 'Champion' } }, 'dnd5e-2024').line).toBe('');
  });

  it('treats a missing or nonsense level as 0, not as level 0 the character', () => {
    expect(characterCard({ meta: { className: 'Fighter', level: 'five' } }, 'dnd5e-2024').level).toBe(0);
    expect(characterCard({ meta: { className: 'Fighter', level: -3 } }, 'dnd5e-2024').level).toBe(0);
  });

  it('and a system-less character says so rather than showing a blank badge', () => {
    expect(characterCard({}, null).systemName).toBe('No system yet');
  });
});

describe('search', () => {
  const card = characterCard({ meta: { className: 'Wizard', subclass: 'Evocation', level: 3 } }, 'pathfinder2e');

  it('matches name, class, subclass and system', () => {
    expect(characterMatches('Lazzuh', card, 'lazz')).toBe(true);
    expect(characterMatches('Lazzuh', card, 'wiz')).toBe(true);
    expect(characterMatches('Lazzuh', card, 'evoc')).toBe(true);
    expect(characterMatches('Lazzuh', card, 'pathfinder')).toBe(true);
  });

  it('is case-insensitive and matches everything on an empty query', () => {
    expect(characterMatches('Lazzuh', card, 'LAZZ')).toBe(true);
    expect(characterMatches('Lazzuh', card, '   ')).toBe(true);
  });

  it('and does not match what is not there', () => {
    expect(characterMatches('Lazzuh', card, 'barbarian')).toBe(false);
  });
});

describe('the page exists and is reachable', () => {
  const page = 'app/dnd/characters/page.tsx';

  it('is mounted', () => {
    expect(existsSync(join(process.cwd(), page))).toBe(true);
  });

  it('shows the three facts the lobby grid never did', () => {
    const src = read(page);
    expect(src).toContain('characterCard');
    expect(src).toMatch(/card\.line/);
    expect(src).toMatch(/card\.systemName/);
  });

  it('filters and searches from the URL, with no client JavaScript', () => {
    const src = read(page);
    expect(src).toContain('searchParams');
    expect(src).toMatch(/method="GET"/);
    expect(src, 'a server page should not declare itself a client one').not.toMatch(/^'use client'/);
  });

  it('counts come from the UNFILTERED set', () => {
    // Otherwise a chip reading "Pathfinder 2e · 3" becomes "· 0" the moment you filter to another system.
    const src = read(page);
    expect(src).toMatch(/countFor = \(key: string\) => cards\.filter/);
  });

  it('and it is personal — signed-out callers are redirected, not shown an empty list', () => {
    expect(read(page)).toMatch(/if \(!session\) redirect\('\/dnd'\)/);
  });
});

describe('the doors D-3 said were missing', () => {
  const header = read('app/dnd/_ui/DndHeader.tsx');

  it('the menu points at My Characters', () => {
    expect(header).toMatch(/href="\/dnd\/characters"/);
  });

  it('and at Profile, which nothing linked to in open-access mode', () => {
    // It was linked ONLY from CampaignDashboard — the branch that does not run when open access is on,
    // which is the default.
    expect(header).toMatch(/href="\/dnd\/profile"/);
  });

  it('the lobby grid offers a way to the full list', () => {
    expect(read('app/dnd/_ui/MyTable.tsx')).toMatch(/href="\/dnd\/characters"/);
  });
});
