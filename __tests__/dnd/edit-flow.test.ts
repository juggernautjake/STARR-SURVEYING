// __tests__/dnd/edit-flow.test.ts — the unified edit flow's draft primitive (Workstream A) + proof that
// ALREADY-BUILT characters get the new system with no migration (everything is derived / defensively read).
import { describe, it, expect } from 'vitest';
import {
  beginDraft, commitDraftToOriginal, promoteDraftToVariant, discardDraft, isDraftActive,
  resolveOriginSlotId, forkSheet, readVariants, sheetCount, MAX_VARIANTS,
  type ActiveSheet, type SystemVariants,
} from '@/lib/dnd/system-variants';
import { buildVariantCards } from '@/lib/dnd/variant-view';

const meta5e = (over: Record<string, unknown> = {}) => ({ meta: { name: 'Gandalf', level: 5, className: 'Wizard', ...over } });
const active5e = (over: Partial<ActiveSheet> = {}): ActiveSheet => ({ system: 'dnd5e-2024', data: meta5e(), sheet_type: 'default', slotId: 'dnd5e-2024', kind: 'vanilla', ...over });

describe('edit-flow draft — begin / commit / promote / discard', () => {
  it('beginDraft forks a working copy off the source and makes it the active draft', () => {
    const { active, variants, draftSlotId } = beginDraft(active5e(), {}, { fromSlotId: 'dnd5e-2024' });
    expect(isDraftActive(active)).toBe(true);
    expect(active.slotId).toBe(draftSlotId);
    expect(active.parentSlotId).toBe('dnd5e-2024');
    expect(variants['dnd5e-2024']).toBeTruthy(); // the source is parked as a stored version
    // The draft is a deep clone — editing it must not touch the source.
    (active.data as { meta: { name: string } }).meta.name = 'Draft Name';
    expect((variants['dnd5e-2024'].data as { meta: { name: string } }).meta.name).toBe('Gandalf');
  });

  it('commit → "this version" overwrites the source with the edits and creates NO new version', () => {
    const begun = beginDraft(active5e(), {}, { fromSlotId: 'dnd5e-2024' });
    (begun.active.data as { meta: { level: number } }).meta.level = 6; // an edit on the draft
    const { active, variants, targetSlotId } = commitDraftToOriginal(begun.active, begun.variants);
    expect(targetSlotId).toBe('dnd5e-2024');
    expect(active.slotId).toBe('dnd5e-2024');
    expect(isDraftActive(active)).toBe(false);
    expect((active.data as { meta: { level: number } }).meta.level).toBe(6); // the edit landed on the source
    expect(sheetCount(active, variants)).toBe(1); // back to a single version — no branch kept
  });

  it('promote → "new variant" keeps the source untouched and branches the draft', () => {
    const begun = beginDraft(active5e(), {}, { fromSlotId: 'dnd5e-2024' });
    (begun.active.data as { meta: { level: number } }).meta.level = 9;
    const { active, variants } = promoteDraftToVariant(begun.active, begun.variants, { name: 'Epic Gandalf' });
    expect(isDraftActive(active)).toBe(false);
    expect(active.parentSlotId).toBe('dnd5e-2024');
    expect(sheetCount(active, variants)).toBe(2); // source + the new variant
    // Source is unchanged at level 5.
    expect((variants['dnd5e-2024'].data as { meta: { level: number } }).meta.level).toBe(5);
    // The draft no longer shows as a draft in the versions list; both versions render.
    const cards = buildVariantCards(active, variants, { characterName: 'Gandalf' });
    expect(cards).toHaveLength(2);
    expect(cards.every((c) => !('draft' in c))).toBe(true);
  });

  it('promote refuses when it would exceed the version cap', () => {
    const variants: SystemVariants = {};
    for (let i = 2; i <= MAX_VARIANTS; i++) variants[`dnd5e-2024#${i}`] = { data: meta5e({ name: `V${i}` }), sheet_type: 'default', system: 'dnd5e-2024', parentSlotId: 'dnd5e-2024' };
    // Now at MAX_VARIANTS real versions; begin a draft (transiently MAX+1) and try to promote.
    const begun = beginDraft(active5e(), variants, { fromSlotId: 'dnd5e-2024' });
    expect(() => promoteDraftToVariant(begun.active, begun.variants)).toThrow(/limit/i);
  });

  it('discard drops the draft and returns to the untouched source', () => {
    const begun = beginDraft(active5e(), {}, { fromSlotId: 'dnd5e-2024' });
    (begun.active.data as { meta: { level: number } }).meta.level = 99; // an edit we will throw away
    const { active, variants } = discardDraft(begun.active, begun.variants);
    expect(active.slotId).toBe('dnd5e-2024');
    expect(isDraftActive(active)).toBe(false);
    expect((active.data as { meta: { level: number } }).meta.level).toBe(5); // source unchanged
    expect(sheetCount(active, variants)).toBe(1);
  });

  it('a parked draft is never shown as a version', () => {
    const variants: SystemVariants = { 'dnd5e-2024#2': { data: meta5e({ name: 'WIP' }), sheet_type: 'default', system: 'dnd5e-2024', parentSlotId: 'dnd5e-2024', draft: true } };
    const cards = buildVariantCards(active5e(), variants, { characterName: 'Gandalf' });
    expect(cards).toHaveLength(1); // only the real version, not the parked draft
    expect(cards[0].name).toBe('Gandalf');
  });
});

describe('already-built characters need NO migration (back-compat)', () => {
  it('a legacy single-sheet character reads as its own original', () => {
    const active = active5e({ slotId: undefined }); // legacy: no active-slot meta / slotId
    const cards = buildVariantCards(active, {}, { characterName: 'Gandalf' });
    expect(cards).toHaveLength(1);
    expect(cards[0].origin).toBe(true);
    expect(cards[0].tags.map((t) => t.label)).toContain('Original');
  });

  it('a legacy multi-sheet character (old transpose, bare keys, no VT fields) still lists + forks', () => {
    // Exactly the shape old data has: system-name keys, no parentSlotId/summary/art/kind metadata.
    const raw = {
      'pathfinder2e': { data: { pf2e: { identity: { name: 'Gandalf', level: 5, className: 'Wizard' } } }, sheet_type: 'default' },
    };
    const variants = readVariants(raw);
    const active = active5e({ slotId: undefined });
    // Origin resolves deterministically; both sheets list without a crash.
    expect(resolveOriginSlotId(active, variants)).toBeTruthy();
    const cards = buildVariantCards(active, variants, { characterName: 'Gandalf' });
    expect(cards).toHaveLength(2);
    expect(cards.filter((c) => c.origin)).toHaveLength(1);
    // And the edit flow works on it: forking the legacy PF2 sheet backfills lineage without error.
    const forked = forkSheet(active, variants, { fromSlotId: 'pathfinder2e' });
    expect(forked.variants[forked.newSlotId].parentSlotId).toBe('pathfinder2e');
  });
});
