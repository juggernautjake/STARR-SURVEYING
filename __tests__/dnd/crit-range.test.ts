// __tests__/dnd/crit-range.test.ts — `crit_range` (Improved Critical): the lowest natural d20 that crits
// on attacks. Widens from 20 → 19 (Champion) / 18 (Superior) / a magic weapon. Aggregation is
// widest-wins (min across sources), sidestepping the ledger's set/add. Only attack rolls consult it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { rollD20 } from '@/app/dnd/_sheet/lib/dice';
import { findTarget, validateEffect, describeEffect } from '@/lib/dnd/effects/targets';
import { buildLedger } from '@/lib/dnd/effects/ledger';

const STORE = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/state/store.tsx'), 'utf8');
const ATTACKS = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/Attacks.tsx'), 'utf8');

describe('rollD20 honors a crit threshold', () => {
  it('crits on any natural >= critMin (but never on a 1), over many rolls', () => {
    for (let i = 0; i < 400; i++) {
      const r = rollD20(0, 'flat', 19);
      expect(r.crit).toBe(r.natural >= 19 && r.natural !== 1);
      expect(r.fumble).toBe(r.natural === 1);
    }
  });
  it('defaults to a 20-only crit when no threshold is given (backward compatible)', () => {
    for (let i = 0; i < 200; i++) {
      const r = rollD20(3, 'flat');
      expect(r.crit).toBe(r.natural === 20);
    }
  });
  it('critMin of 21 can never crit', () => {
    for (let i = 0; i < 200; i++) expect(rollD20(0, 'flat', 21).crit).toBe(false);
  });
});

describe('crit_range is a first-class roll target', () => {
  it('exists as a numeric roll target homed on the Attacks table', () => {
    const t = findTarget('crit_range');
    expect(t).toBeTruthy();
    expect(t!.group).toBe('roll');
    expect(t!.valueType).toBe('number');
    expect(t!.rendersAt).toMatch(/Attacks/);
  });
  it('validates a number and describes it', () => {
    expect(validateEffect({ target: 'crit_range', operation: 'set', value: 19 })).toBeNull();
    expect(describeEffect({ target: 'crit_range', operation: 'set', value: 19 })).toBe('Critical hit range set to 19');
  });
});

describe('widest-wins aggregation across sources', () => {
  it('the ledger exposes each crit_range contribution so min() takes the widest', () => {
    const char = {
      activeEffects: [
        { id: 'a', label: 'Improved Critical', sourceKind: 'dm', effects: [{ target: 'crit_range', operation: 'set', value: 19 }] },
        { id: 'b', label: 'Superior Critical', sourceKind: 'dm', effects: [{ target: 'crit_range', operation: 'set', value: 18 }] },
      ],
    } as unknown as Parameters<typeof buildLedger>[0];
    // NB: take min over ALL contributions — `set` marks the lower value suppressed (highest-wins), which
    // is backwards for crit range, so we must NOT filter on suppressed here.
    const vals = buildLedger(char).explain('crit_range').filter((c) => typeof c.effect.value === 'number').map((c) => Number(c.effect.value));
    expect(Math.min(20, ...vals)).toBe(18); // widest range wins
  });
});

describe('the sheet wires crit_range', () => {
  it('the store derives critMin (explain + min) and only attacks consult it', () => {
    expect(STORE).toContain("explain('crit_range')");
    expect(STORE).toContain('Math.min(20');
    expect(STORE).toContain("opts.kind === 'attack' ? critMin : 20");
  });
  it('the Attacks table surfaces the expanded range so it is not invisible', () => {
    expect(ATTACKS).toContain('critMin');
    expect(ATTACKS).toContain('crit {critMin}');
  });
});
