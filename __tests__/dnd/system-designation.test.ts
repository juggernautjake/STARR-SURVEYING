// __tests__/dnd/system-designation.test.ts — every sheet names the rulebook that adjudicates it
// (Slice 21).
//
// Why this matters: the librarian grounds every answer in the character's system. A sheet sitting
// at 'ambiguous' gets the edition-neutral prompt ("pick a system and the answers get specific")
// on the very sheet the AI should be most useful on.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GAME_SYSTEMS, SYSTEM_AMBIGUOUS, normalizeSystem, systemLabel } from '@/lib/dnd/systems';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const HERO = read('app/dnd/_sheet/components/Hero.tsx');
const THEME_CSS = read('app/dnd/_sheet/styles/theme.css');
const SEED = read('seeds/446_dnd_character_systems.sql');

describe('the seed designates the demo characters', () => {
  it('uses a system key that actually exists', () => {
    // 'dnd-5e-2024' is a plausible-looking typo that would silently designate nothing:
    // normalizeSystem would fall back to ambiguous and the seed would look like it worked.
    const key = SEED.match(/SET system = '([^']+)'/)?.[1];
    expect(key).toBeTruthy();
    expect(GAME_SYSTEMS.map((s) => s.key)).toContain(key);
    expect(normalizeSystem(key)).toBe(key);
    expect(normalizeSystem(key)).not.toBe(SYSTEM_AMBIGUOUS);
  });

  it('only touches rows that have no designation (idempotent, and never stomps a choice)', () => {
    // A re-run must not drag a character deliberately set to Pathfinder back to D&D.
    expect(SEED).toMatch(/WHERE system IS NULL OR system = 'ambiguous'/);
  });
});

describe('the sheet SHOWS its system', () => {
  it('Hero renders the designation from the sheet context', () => {
    // Hero is rendered by every template, so one badge covers them all.
    expect(HERO).toContain('useSheetSystem');
    expect(HERO).toContain('system-chip');
    expect(HERO).toContain('systemLabel');
  });

  it('an ambiguous character shows no badge rather than a wrong one', () => {
    // "ambiguous" is not a game. Showing it as one would be worse than showing nothing.
    expect(HERO).toMatch(/system !== SYSTEM_AMBIGUOUS/);
  });

  it('the badge is theme-token driven, not a hardcoded colour', () => {
    // Every skin re-tints it. A literal here would break the light skins and rightly fail the
    // contrast guard in sheet-contrast.test.ts.
    const i = THEME_CSS.indexOf('.dnd-sheet .chip.system-chip {');
    expect(i).toBeGreaterThan(-1);
    const block = THEME_CSS.slice(i, THEME_CSS.indexOf('}', i));
    expect(block).toMatch(/color:\s*var\(--tealbright\)/);
    expect(block).toMatch(/rgba\(var\(--tealbright-rgb\)/);
    expect(block).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});

describe('a system designation and homebrew are orthogonal', () => {
  it('systemLabel names a real game for the designated key', () => {
    expect(systemLabel('dnd5e-2024')).toBe('D&D 5e (2024)');
  });

  it('the seed says WHY a customized sheet still gets a system', () => {
    // The trap this slice exists to avoid: treating "it's homebrew" as a reason to leave a sheet
    // systemless. The system says which rulebook adjudicates; provenance says which parts are
    // house-ruled. Collapsing them is what left the AI with nothing to reason from.
    expect(SEED).toMatch(/ORTHOGONAL/);
  });
});

describe('normalizeSystem is a strict exact-key gate (the routing safety net)', () => {
  // This gates `isIG = normalizeSystem(system) === 'intuitive-games'` and every other system route, so its
  // exactness matters: an unknown value must fall back to ambiguous (never guess a rulebook), and a crafted
  // superset of a real key must NOT normalize to that key.
  it('returns every real system key unchanged', () => {
    for (const s of GAME_SYSTEMS) expect(normalizeSystem(s.key)).toBe(s.key);
  });

  it('falls back to ambiguous for nullish, non-string, and unknown/alias values (never guesses a rulebook)', () => {
    for (const v of [null, undefined, '', '   ', 42, {}, [], 'D&D', 'pathfinder', 'IG', 'dnd-5e-2024']) {
      expect(normalizeSystem(v)).toBe(SYSTEM_AMBIGUOUS);
    }
  });

  it('matches EXACTLY — a superset/near-miss of a real key does NOT route as that system', () => {
    // The security-relevant property: a crafted "intuitive-games-x" must not normalize to "intuitive-games"
    // (which drives isIG digest/edit routing). A regression to includes()/startsWith() would break this.
    expect(normalizeSystem('intuitive-games-x')).toBe(SYSTEM_AMBIGUOUS);
    expect(normalizeSystem('intuitive-game')).toBe(SYSTEM_AMBIGUOUS); // one char short
    expect(normalizeSystem('xdnd5e-2024')).toBe(SYSTEM_AMBIGUOUS);
  });

  it('trims surrounding whitespace on an otherwise-exact key', () => {
    expect(normalizeSystem('  intuitive-games  ')).toBe('intuitive-games');
  });
});
