// __tests__/dnd/effect-star.test.ts — the ★ marker + "why is this number what it is?" popover
// (Slice 13). Two halves: the ledger behaviour the star reads (no false positives; stars exactly
// what moved; the tooltip names every source), and the wiring that puts one accessible marker on
// every ability-derived value.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildLedger } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character, InvItem } from '@/app/dnd/_sheet/types';
import type { Effect } from '@/app/dnd/_sheet/engine/effects';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const STAR = read('app/dnd/_sheet/components/ui/EffectStar.tsx');
const ABILITIES = read('app/dnd/_sheet/components/Abilities.tsx');
const SAVES = read('app/dnd/_sheet/components/SavesSkills.tsx');
const ATTACKS = read('app/dnd/_sheet/components/Attacks.tsx');
const COMBAT = read('app/dnd/_sheet/components/CombatPanel.tsx');
const CSS = read('app/dnd/_sheet/styles/theme.css');

function belted(bonus: number): Character {
  const c = blankCharacter('Rangor');
  c.abilities = { ...c.abilities, str: 16 };
  c.inventory = [
    { id: 'belt', name: 'Belt of the Bear', desc: '', qty: 1, tags: [], equipped: true, effects: [{ target: 'ability_str', operation: 'add', value: bonus }] } as InvItem,
  ];
  return c;
}

describe('the ledger behaviour the ★ reads', () => {
  it('no false positives: a vanilla sheet modifies nothing', () => {
    // A star that is always on is noise the reader learns to ignore. Every ability target must
    // report unmodified when nothing touches it.
    const led = buildLedger(blankCharacter('Plain'));
    for (const k of ['str', 'dex', 'con', 'int', 'wis', 'cha']) {
      expect(led.isModified(`ability_${k}`)).toBe(false);
    }
  });

  it('stars exactly the modified stat and nothing else', () => {
    const led = buildLedger(belted(2));
    expect(led.isModified('ability_str')).toBe(true);
    for (const k of ['dex', 'con', 'int', 'wis', 'cha']) {
      expect(led.isModified(`ability_${k}`)).toBe(false);
    }
  });

  it('the tooltip data names every contributing source, base → final', () => {
    const led = buildLedger(belted(2));
    const entry = led.byTarget['ability_str'];
    expect(entry.base).toBe(16);
    expect(entry.final).toBe(18);
    const contribs = led.explain('ability_str');
    expect(contribs).toHaveLength(1);
    expect(contribs[0].source).toBe('Belt of the Bear');
    expect(contribs[0].label).toMatch(/str/i);
  });

  it('a suppressed contribution is still surfaced (so "my belt does nothing" has an answer)', () => {
    const c = belted(0); // +0 → present but contributes nothing
    c.inventory[0].effects = [{ target: 'ability_str', operation: 'add', value: 0 } as Effect];
    const led = buildLedger(c);
    expect(led.isModified('ability_str')).toBe(true); // shown...
    expect(led.explain('ability_str')[0].suppressed).toBe(true); // ...struck through
  });

  it('AC is starred when an ac-target effect touches it, and clean otherwise', () => {
    expect(buildLedger(blankCharacter('Plain')).isModified('ac')).toBe(false);
    const c = blankCharacter('Warded');
    c.inventory = [
      { id: 'ring', name: 'Ring of Protection', desc: '', qty: 1, tags: [], equipped: true, effects: [{ target: 'ac', operation: 'add', value: 1 }] } as InvItem,
    ];
    const led = buildLedger(c);
    expect(led.isModified('ac')).toBe(true);
    expect(led.explain('ac')[0].source).toBe('Ring of Protection');
  });
});

describe('EffectStar is one accessible marker, not a hover-only tooltip', () => {
  it('renders nothing extra when nothing is modified (children pass straight through)', () => {
    expect(STAR).toMatch(/if \(!active\.length\) return <>\{children\}<\/>/);
  });

  it('reads the ledger it is given rather than re-deriving numbers', () => {
    expect(STAR).toContain('ledger.isModified');
    expect(STAR).toContain('ledger.explain');
    expect(STAR).toContain('ledger.byTarget');
  });

  it('the ★ is a real <button>, so it is keyboard- and touch-reachable (not hover-only)', () => {
    expect(STAR).toMatch(/<button[\s\S]*?effect-star-trigger/);
    expect(STAR).toContain('aria-label');
    // ...and it still carries the plain-text summary as a native title for the hover path.
    expect(STAR).toContain('title={summary}');
  });

  it('is inline-safe: every popover node is a <span>, never a <div>/<p>', () => {
    // A marker can sit inside a feature <p>; a block child force-closes the paragraph (the RuleTip
    // trap). The popover reuses RuleTip chrome and must stay all-spans. Strip comments first — the
    // component's own docstring names the <div>/<p> it avoids.
    const code = STAR.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).toContain('ruletip-pop');
    expect(code).not.toMatch(/<div/);
    expect(code).not.toMatch(/<p[ >]/);
  });
});

describe('every ability-derived value on the sheet carries the star', () => {
  it('abilities show it, keyed to their own target', () => {
    expect(ABILITIES).toContain('EffectStar');
    expect(ABILITIES).toContain('target={`ability_${a.key}`}');
  });

  it('saves and skills show it, watching the ability AND the bonus targets the roll folds', () => {
    // The star must light for EVERY target that moves the number, not just the governing ability — a
    // Cloak of Protection touches only `all_saves`, a +skill item only `skill.<key>`/`all_skills`.
    expect(SAVES).toContain('EffectStar');
    expect(SAVES).toContain('target={[`ability_${a.key}`, `${a.key}_saves`, \'all_saves\']}'); // saves
    expect(SAVES).toContain('target={[`ability_${sk.ability}`, `skill.${sk.key}`, \'all_skills\']}'); // skills
    expect(SAVES).toContain('target={`ability_${cs.ability}`}'); // custom checks (fold no ledger bonus → ability only)
    expect(SAVES).toContain('target="ability_wis"'); // passive perception
  });

  it('attacks show it on both to-hit and save DC', () => {
    expect(ATTACKS).toContain('EffectStar');
    expect(ATTACKS).toContain('target={`ability_${abilityKey}`}'); // to hit
    expect(ATTACKS).toContain("target={`ability_${a.saveDcAbility ?? 'str'}`}"); // save DC
  });

  it('walking speed is folded through the ledger and starred (Slice 15)', () => {
    // The DISPLAYED speed must be the ledger value, not the raw base — else a Boots +10 stars a
    // number it never moved. Max HP is starred via hp_max; AC is starred via the `ac` target.
    expect(COMBAT).toContain("ledger.value('speed_walk', combat.speed)");
    expect(COMBAT).toContain('target="speed_walk"');
    expect(COMBAT).toContain('{walkSpeed} ft');
  });

  it('Max HP and AC carry the star too (the last two headline defenses)', () => {
    expect(COMBAT).toContain('target="hp_max"');
    expect(COMBAT).toContain('target="ac"'); // Ring of Protection etc. now explain the AC number
  });
});

describe('the marker is theme-token driven (the contrast guard would fail a literal)', () => {
  it('defines the effect-star chrome with tokens only', () => {
    expect(CSS).toContain('.effect-star-trigger');
    expect(CSS).toContain('.effect-star-pop');
    // The star and its accents use tokens, never a hex literal.
    const block = CSS.slice(CSS.indexOf('.effect-star'), CSS.indexOf('.effect-star') + 1600);
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });
});
