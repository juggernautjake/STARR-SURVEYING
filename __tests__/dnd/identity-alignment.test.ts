// __tests__/dnd/identity-alignment.test.ts — closes an Appendix-A-vs-registry gap: `alignment` is a
// catalog identity target that wasn't in the live registry. Add it exactly like gender/pronouns/
// profession — a text identity overlay with a Bio home, settable by the AI via set_meta.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { findTarget, validateEffect, describeEffect } from '@/lib/dnd/effects/targets';

const BIO = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/Bio.tsx'), 'utf8');
const EDITS = fs.readFileSync(path.join(process.cwd(), 'lib/dnd/sheet-edits.ts'), 'utf8');

describe('alignment is a first-class identity target', () => {
  it('exists as a text identity target set-able and homed on the Bio', () => {
    const t = findTarget('alignment');
    expect(t).toBeTruthy();
    expect(t!.group).toBe('identity');
    expect(t!.valueType).toBe('text');
    expect(t!.ops).toEqual(['set']);
    expect(t!.rendersAt).toMatch(/Bio/);
  });
  it('validates a set and describes it in plain English', () => {
    expect(validateEffect({ target: 'alignment', operation: 'set', value: 'Chaotic Good' })).toBeNull();
    expect(describeEffect({ target: 'alignment', operation: 'set', value: 'Chaotic Good' })).toBe('Alignment: Chaotic Good');
  });
});

describe('alignment is wired into its render + write paths', () => {
  it('the Bio Details line renders alignment alongside gender/profession', () => {
    expect(BIO).toContain("{ key: 'alignment', label: 'Alignment' }");
  });
  it('set_meta accepts alignment (type union + AI schema description)', () => {
    expect(EDITS).toContain("'profession' | 'alignment'");
    expect(EDITS).toContain('profession|alignment');
  });
});
