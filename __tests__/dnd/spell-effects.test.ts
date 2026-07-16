// __tests__/dnd/spell-effects.test.ts — spells become ledger sources (Slice 15/25).
//
// A spell with lasting effects (Bless, Mage Armor) is authored with the shared effect builder, then
// SNAPSHOTTED into an ActiveEffect on cast — so the ledger resolves it exactly like a potion, and
// editing the spell later never touches a buff already running. These tests pin (a) the ledger
// treats a spell-sourced ActiveEffect as a 'spell' source and resolves it, and (b) the wiring:
// castSpell snapshots, SpellEditor mounts the builder.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildLedger, collectSources } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character, ActiveEffect } from '@/app/dnd/_sheet/types';

const STORE = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/state/store.tsx'), 'utf8');
const EDITOR = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/ui/SpellEditor.tsx'), 'utf8');

function blessed(): Character {
  const c = blankCharacter('Cleric');
  // What castSpell writes: a snapshot of the spell's effects as an ActiveEffect sourced to 'spell'.
  c.activeEffects = [
    { id: 'spell-bless', label: 'Bless', source: 'spell', duration: '1 minute', effects: [{ target: 'all_saves', operation: 'add', value: 1 }] },
  ] as ActiveEffect[];
  return c;
}

describe('a cast spell resolves through the ledger like any other source', () => {
  it('a Bless buff is collected as a SPELL source and applies its bonus', () => {
    const led = buildLedger(blessed());
    const spellSrc = led.sources.find((s) => s.name === 'Bless');
    expect(spellSrc?.kind).toBe('spell');
    expect(led.isModified('all_saves')).toBe(true);
    expect(led.value('all_saves', 0)).toBe(1);
  });

  it('collectSources kinds a spell-sourced ActiveEffect as spell, not consumed', () => {
    const src = collectSources(blessed()).find((s) => s.name === 'Bless');
    expect(src?.kind).toBe('spell');
  });

  it('with no cast buff, nothing is modified', () => {
    expect(buildLedger(blankCharacter('Plain')).isModified('all_saves')).toBe(false);
  });
});

describe('the wiring: castSpell snapshots, SpellEditor authors', () => {
  it('castSpell snapshots spell.effects into a spell-sourced ActiveEffect, dedup by id', () => {
    expect(STORE).toContain('spell.effects && spell.effects.length');
    expect(STORE).toContain("source: 'spell'");
    expect(STORE).toContain('id: `spell-${spell.id}`');
    // snapshot COPY, not a reference (editing the spell later must not mutate a running buff).
    expect(STORE).toContain('spell.effects.map((e) => ({ ...e }))');
    // re-cast replaces the same spell's effect rather than stacking.
    expect(STORE).toContain('filter((x) => x.id !== ae.id)');
  });

  it('SpellEditor mounts the SAME effect builder and validates on save', () => {
    expect(EDITOR).toContain("import { EffectRows } from '../ItemBuilder'");
    expect(EDITOR).toContain('<EffectRows');
    expect(EDITOR).toContain("set('effects', effects)");
    expect(EDITOR).toContain('validateEffect(eff)');
  });
});
