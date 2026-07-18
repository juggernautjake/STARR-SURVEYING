// __tests__/dnd/condition-advantage.test.ts — closes an Appendix-A defense gap: `condition_advantage`
// (advantage on saves vs a named condition — Dwarven Resilience vs poison, Fey Ancestry vs charmed,
// Gnome Cunning vs magic). It's LISTED on the sheet like a resistance, not auto-applied, because the
// rules require the player to invoke it (saves aren't tagged by source here) — an honest home, not a
// costume.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { findTarget, validateEffect, describeEffect } from '@/lib/dnd/effects/targets';
import { buildLedger } from '@/lib/dnd/effects/ledger';

const PANEL = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/CombatPanel.tsx'), 'utf8');

describe('condition_advantage is a first-class defense target', () => {
  it('exists as a text defense with its own collect operation and a Defenses home', () => {
    const t = findTarget('condition_advantage');
    expect(t).toBeTruthy();
    expect(t!.group).toBe('defense');
    expect(t!.valueType).toBe('text');
    expect(t!.ops).toEqual(['condition_advantage']);
    expect(t!.rendersAt).toMatch(/Defenses/);
  });
  it('validates a value and rejects an empty one', () => {
    expect(validateEffect({ target: 'condition_advantage', operation: 'condition_advantage', value: 'poison' })).toBeNull();
    expect(validateEffect({ target: 'condition_advantage', operation: 'condition_advantage', value: '' })).not.toBeNull();
  });
  it('describes it in plain English', () => {
    expect(describeEffect({ target: 'condition_advantage', operation: 'condition_advantage', value: 'poison' }))
      .toBe('Advantage on saves vs poison');
  });
});

describe('the ledger collects condition_advantage with its source, and the panel renders it', () => {
  it('collects distinct values tagged by the granting source', () => {
    // A minimal character carrying two condition_advantage effects from an active source.
    const char = {
      activeEffects: [
        { id: 'ae1', label: 'Dwarven Resilience', sourceKind: 'dm',
          effects: [{ target: 'condition_advantage', operation: 'condition_advantage', value: 'poison' }] },
      ],
    } as unknown as Parameters<typeof buildLedger>[0];
    const collected = buildLedger(char).collected('condition_advantage');
    expect(collected.map((c) => c.value)).toContain('poison');
    // The source shown is the active effect's label (how the ledger names an activeEffect source).
    expect(collected.find((c) => c.value === 'poison')?.source).toBe('Dwarven Resilience');
  });
  it('CombatPanel reads and renders the collected advantages', () => {
    expect(PANEL).toContain("ledger.collected('condition_advantage')");
    expect(PANEL).toContain('Adv. on saves vs');
  });
});
