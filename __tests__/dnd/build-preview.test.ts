// __tests__/dnd/build-preview.test.ts — the guided builder's live preview (P5-7).
//
// The guided builder's design was "each slot becomes one screen with a LIVE PREVIEW PANEL". Checking that
// against the code first — the lesson from P8-3 — the screens turned out to be done: all three systems'
// level walkers are wired into the flow, not just 5e's. The preview was the half that never shipped, so a
// player walked nine levels of choices watching a form and found out what they built by leaving.
//
// The assertions that matter are about AGREEMENT and about ABSENCE: a preview that disagrees with the sheet
// is worse than none, and a field it cannot resolve must read as unknown rather than as zero.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildPreview, signed } from '@/lib/dnd/builder/preview';
import { resolveHp } from '@/lib/dnd/combat-hp';
import { assemblePF2VanillaCharacter } from '@/lib/dnd/systems/pathfinder2e/builder';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('signed', () => {
  it('always carries a sign, and a real minus', () => {
    expect(signed(3)).toBe('+3');
    expect(signed(0)).toBe('+0');
    expect(signed(-1)).toBe('−1');
    expect(signed(-1)).not.toContain('-'); // U+2212, not a hyphen
  });
});

describe('it AGREES with the sheet, because it delegates', () => {
  it('HP comes through resolveHp, not a fourth opinion', () => {
    // `resolveHp` is the module that already knows each system stores HP somewhere different (P1-1). A
    // preview computing its own would be the fourth place that disagrees.
    const built = assemblePF2VanillaCharacter({ name: 'Vex', className: 'Cleric', level: 5, subclass: 'Warpriest' });
    const hp = resolveHp('pathfinder2e', built);
    const p = buildPreview('pathfinder2e', 'Vex', built);
    expect(hp.maxHp).toBeTruthy();
    expect(p.stats.find((s) => s.label === 'HP')?.value).toContain(String(hp.maxHp));
  });

  it('and reads a real PF2 character’s identity and abilities', () => {
    const built = assemblePF2VanillaCharacter({
      name: 'Vex', className: 'Cleric', ancestry: 'Human', level: 5, subclass: 'Warpriest',
      keyAttribute: 'WIS', attributes: { STR: 1, DEX: 1, CON: 2, INT: 0, WIS: 4, CHA: 1 },
    });
    const p = buildPreview('pathfinder2e', 'Vex', built);
    expect(p.headline).toContain('Level 5');
    expect(p.headline).toContain('Cleric');
    expect(p.headline).toContain('(Warpriest)');
    // PF2 stores MODIFIERS, not scores. Treating +4 WIS as a score would print −3.
    expect(p.stats.find((s) => s.label === 'WIS')?.value).toBe('+4');
    expect(p.empty).toBe(false);
  });
});

describe('5e-shaped data', () => {
  const data = {
    meta: { level: 3, className: 'Fighter', subclass: 'Champion', race: 'Dwarf' },
    abilities: { str: { score: 16, mod: 3 }, dex: { score: 12, mod: 1 }, con: { score: 14, mod: 2 } },
    // `currentHp`, not `hp` — that is the key `resolveHp` reads for 5e. My first fixture used `hp`, the
    // test failed, and it was the TEST that was wrong: the module was agreeing with itself.
    combat: { ac: 18, speed: 25, currentHp: 28, maxHp: 28 },
  };

  it('reads the shared meta block and the ability mods', () => {
    const p = buildPreview('dnd5e-2024', 'Thora', data);
    expect(p.headline).toBe('Level 3 Dwarf Fighter (Champion)');
    expect(p.stats.find((s) => s.label === 'STR')?.value).toBe('+3');
    expect(p.stats.find((s) => s.label === 'AC')?.value).toBe('18');
    expect(p.stats.find((s) => s.label === 'Speed')?.value).toBe('25 ft');
  });

  it('derives a modifier when only a score is stored', () => {
    // Both shapes are in the database today, so both are read rather than one being declared canonical.
    const p = buildPreview('dnd5e-2024', 'X', { abilities: { str: 8 } });
    expect(p.stats.find((s) => s.label === 'STR')?.value).toBe('−1');
  });

  it('and shows current / max only when they differ', () => {
    const hurt = buildPreview('dnd5e-2024', 'X', { ...data, combat: { ...data.combat, currentHp: 11 } });
    expect(hurt.stats.find((s) => s.label === 'HP')?.value).toBe('11 / 28');
    expect(buildPreview('dnd5e-2024', 'X', data).stats.find((s) => s.label === 'HP')?.value).toBe('28');
  });
});

describe('A FIELD IT CANNOT RESOLVE IS OMITTED, NEVER ZEROED', () => {
  it('no AC, no AC row — not "AC 0"', () => {
    // "AC —" reads as "not set yet", which is true during a build. "AC 0" reads as a character with no
    // armour class, which is a bug report.
    const p = buildPreview('dnd5e-2024', 'X', { meta: { className: 'Wizard' } });
    expect(p.stats.some((s) => s.label === 'AC')).toBe(false);
    expect(p.stats.some((s) => s.value === '0')).toBe(false);
  });

  it('a partially-built character is NOT "empty"', () => {
    // A class with no abilities has started. `empty` means genuinely nothing but a name — the difference
    // between an encouraging blank state and a grid of dashes.
    const p = buildPreview('dnd5e-2024', 'X', { meta: { className: 'Wizard' } });
    expect(p.empty).toBe(false);
    expect(p.headline).toBe('Wizard');
  });

  it('a brand-new character IS empty, and still has a name', () => {
    const p = buildPreview('dnd5e-2024', 'Nobody', {});
    expect(p.empty).toBe(true);
    expect(p.name).toBe('Nobody');
    expect(p.stats).toEqual([]);
  });

  it('and it survives junk without throwing', () => {
    for (const raw of [null, undefined, 'nope', 42, [], { meta: 'nope', abilities: 7, combat: null }]) {
      expect(() => buildPreview('dnd5e-2024', 'X', raw), String(raw)).not.toThrow();
    }
    expect(buildPreview('dnd5e-2024', '', null).name).toBe('New character');
  });
});

describe('the panel', () => {
  const panel = read('app/dnd/_ui/builder/BuildPreviewPanel.tsx');

  it('is SERVER-rendered — no client directive, no state', () => {
    // A client-side preview mirroring form state shows what the player is about to save, which is the
    // same thing right up until a save fails, and then it is a lie on screen.
    expect(panel).not.toContain("'use client'");
    expect(panel).not.toContain('useState');
  });

  it('shows an encouraging blank state rather than a grid of dashes', () => {
    expect(panel).toMatch(/Nothing chosen yet/);
    expect(panel).toMatch(/preview\.empty \?/);
  });

  it('and says when it updates', () => {
    // A panel that looks stale for a second after a choice is a panel people stop trusting.
    expect(panel).toMatch(/Updates as each choice saves/);
  });
});

describe('IT IS MOUNTED, for every system', () => {
  const page = read('app/dnd/characters/[id]/builder/page.tsx');
  const shell = read('app/dnd/_ui/builder/GuidedBuilder.tsx');

  it('the builder page renders it from the stored data', () => {
    expect(page).toContain('buildPreview(system, character.name, character.data)');
    expect(page).toContain('<BuildPreviewPanel');
  });

  it('once, outside the per-system branches, so no system can be forgotten', () => {
    // The three systems' steps are assembled in separate branches. A preview added inside them would be
    // three chances to miss one — which is exactly how PF2 and IG went without a level walker in this
    // flow until someone noticed.
    expect(page.match(/<BuildPreviewPanel/g) ?? []).toHaveLength(1);
  });

  it('and the shell places it without knowing what it is', () => {
    // A `ReactNode`, not data: the shell never learns what a stat is, exactly as it never learns what a
    // mechanic is.
    expect(shell).toMatch(/preview\?: ReactNode/);
    expect(shell).not.toContain('BuildPreviewPanel');
  });
});
