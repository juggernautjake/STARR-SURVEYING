// __tests__/dnd/variant-kind-wiring.test.ts — the sheet knows whether it is vanilla or custom (S2).
//
// Nothing could enforce the rules before this: SheetVariantKind existed on the stored variant
// metadata, but the sheet store never surfaced it, so a builder had no way to ask "is this a
// vanilla character?". This is the keystone for the hard blocks in S3–S5.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { variantKind, readActiveSlotMeta } from '@/lib/dnd/system-variants';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('the flag defaults to the SAFE direction', () => {
  it('an unlabelled variant is vanilla, not custom', () => {
    // Defaulting to custom would let every legacy sheet escape the rules silently — the exact
    // failure this work exists to fix.
    expect(variantKind(undefined)).toBe('vanilla');
    expect(variantKind(null)).toBe('vanilla');
    expect(variantKind({})).toBe('vanilla');
  });

  it('only an explicit "custom" is custom', () => {
    expect(variantKind({ kind: 'custom' })).toBe('custom');
    expect(variantKind({ kind: 'anything-else' })).toBe('vanilla');
  });

  it('readActiveSlotMeta yields undefined for a sheet with no metadata', () => {
    // It reports ABSENCE rather than guessing — `kind` is optional on ActiveSlotMeta by design.
    // The vanilla default is applied one layer down, in the store, which is asserted below. The
    // important property is that the CHAIN ends at vanilla, not that every link invents it.
    expect(readActiveSlotMeta(undefined).kind).toBeUndefined();
    expect(readActiveSlotMeta({}).kind).toBeUndefined();
  });

  it('an absent kind still lands on vanilla by the time a builder sees it', () => {
    // The end-to-end property that actually matters: a legacy sheet with no metadata must obey
    // the rules, not escape them. `variantKind = 'vanilla'` in the store is what guarantees it.
    const store = read('app/dnd/_sheet/state/store.tsx');
    expect(store).toContain("variantKind = 'vanilla'");
  });
});

describe('the flag reaches the sheet', () => {
  it('the store accepts it and defaults to vanilla', () => {
    const store = read('app/dnd/_sheet/state/store.tsx');
    expect(store).toContain("variantKind = 'vanilla'");
    expect(store).toContain('variantKind?: SheetVariantKind');
  });

  it('useChar() exposes it, so a builder can gate on it', () => {
    const store = read('app/dnd/_sheet/state/store.tsx');
    expect(store).toContain('variantKind: SheetVariantKind');
    // Present in the context VALUE, not just the type — a type-only addition would compile and
    // hand every consumer undefined at runtime.
    expect(store).toMatch(/canWrite: canWrite \?\? isDM,\s*\n\s*variantKind,/);
  });

  it('SheetRoot forwards it to the provider', () => {
    const root = read('app/dnd/_sheet/SheetRoot.tsx');
    expect(root).toContain('variantKind?: SheetVariantKind');
    // Both provider call sites — the custom-sheet branch and the normal one.
    expect((root.match(/variantKind=\{variantKind\}/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('the character page reads it from the ACTIVE slot rather than assuming', () => {
    const page = read('app/dnd/characters/[id]/page.tsx');
    expect(page).toContain('variantKind={readActiveSlotMeta(');
  });
});
