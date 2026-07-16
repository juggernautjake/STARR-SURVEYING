// __tests__/dnd/effect-builder.test.ts — the manual effect builder (Slice 17).
//
// "Add effect → pick a target → define the value." The builder must produce the SAME Effect[] the
// AI emits (Slice 14), so the two paths can't diverge. The win over the old free-text field: a
// registry-driven picker means you can't type a target the ledger will silently reject. These tests
// pin (a) the builder is wired to the registry, and (b) the registry's own defaults are internally
// consistent — the first allowed op on each target, with a type-appropriate value, always validates.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { EFFECT_TARGETS, findTarget, validateEffect } from '@/lib/dnd/effects/targets';

const BUILDER = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/ItemBuilder.tsx'), 'utf8');

describe('the builder is registry-driven, not free text', () => {
  it('imports the registry and renders a grouped target picker', () => {
    expect(BUILDER).toContain("from '@/lib/dnd/effects/targets'");
    expect(BUILDER).toContain('targetsInGroup');
    expect(BUILDER).toContain('<optgroup');
    // The old free-text target field and its wrong hint are gone (the picker replaces them).
    expect(BUILDER).not.toContain("target 'str_score'");
    expect(BUILDER).not.toContain('placeholder="target (ac');
  });

  it('constrains the operation to the target and picks the value control by type', () => {
    expect(BUILDER).toContain('def?.ops');           // ops come from the target
    expect(BUILDER).toContain("vt === 'flag'");        // flags take no value
    expect(BUILDER).toContain("vt === 'number'");      // numbers get a number input
    expect(BUILDER).toContain('pickTarget');           // picking a target resets op + value
  });

  it('shows a plain-English preview line from the shared describeEffect renderer', () => {
    expect(BUILDER).toContain('describeEffect({ target: e.target');
  });
});

describe('every registry default the picker can produce is a VALID effect', () => {
  // Mirrors the builder: first allowed op, with a value chosen by valueType.
  const sampleValue = (vt: string): number | string | undefined => {
    if (vt === 'flag') return undefined;
    if (vt === 'number') return 1;
    if (vt === 'damage_type') return 'fire';
    if (vt === 'proficiency') return 'longswords';
    if (vt === 'sense') return 'darkvision 60';
    if (vt === 'dice') return '2d6';
    if (vt === 'ref') return 'Rage';
    return 'x'; // text
  };

  it('produces no rejected effect across the whole registry', () => {
    for (const t of EFFECT_TARGETS) {
      const op = t.ops[0];
      const value = op === 'advantage' || op === 'disadvantage' ? undefined : sampleValue(t.valueType);
      const err = validateEffect({ target: t.key, operation: op, value });
      expect(err, `${t.key} / ${op} should validate`).toBeNull();
    }
  });

  it('a number target with the default value 1 resolves (sanity on the common case)', () => {
    expect(findTarget('ac')?.valueType).toBe('number');
    expect(validateEffect({ target: 'ac', operation: 'add', value: 1 })).toBeNull();
  });
});
