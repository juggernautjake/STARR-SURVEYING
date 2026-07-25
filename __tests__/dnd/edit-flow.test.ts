// __tests__/dnd/edit-flow.test.ts — the unified edit flow's draft primitive (Workstream A) + proof that
// ALREADY-BUILT characters get the new system with no migration (everything is derived / defensively read).
import { describe, it, expect } from 'vitest';
import {
  beginDraft, commitDraftToOriginal, promoteDraftToVariant, discardDraft, isDraftActive,
  resolveOriginSlotId, forkSheet, readVariants, sheetCount, MAX_VARIANTS, deleteSheet, switchToSlot,
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

// Owner 2026-07-25: "only the original should be protected, all others can be individually deleted."
// Deleting the VIEWED version used to be refused ("switch to another sheet first"), which is what made
// some versions feel undeletable — the ✕ simply wasn't there.
describe('deleteSheet — any version but the original', () => {
  const withVariants = () => {
    const active = active5e({ slotId: 'dnd5e-2024' }); // the origin, and active
    const forked = forkSheet(active, {}, { fromSlotId: 'dnd5e-2024', name: 'Branch A' });
    const second = forkSheet(forked.active, forked.variants, { fromSlotId: 'dnd5e-2024', name: 'Branch B' });
    return { active: second.active, variants: second.variants, a: forked.newSlotId, b: second.newSlotId };
  };

  it('deletes a stored version without touching the active one', () => {
    const { active, variants, a, b } = withVariants();
    const res = deleteSheet(active, variants, a);
    expect(res.switchedTo).toBeNull();
    expect(res.variants[a]).toBeUndefined();
    expect(res.variants[b]).toBeTruthy();
    expect(res.active.slotId).toBe(active.slotId); // still viewing the same version
  });

  it('deletes the VIEWED version by switching away first — no manual switch needed', () => {
    const { active, variants, a } = withVariants();
    // Switch so a branch is the active version, then delete that very version.
    const onBranch = switchToSlot(active, variants, a);
    const res = deleteSheet(onBranch.active, onBranch.variants, a);
    expect(res.switchedTo).toBe('dnd5e-2024');      // landed on the original
    expect(res.active.slotId).toBe('dnd5e-2024');
    expect(res.variants[a]).toBeUndefined();        // and the deleted version is gone, not parked
  });

  it('accepts the synthetic `active:` id for a legacy character', () => {
    const active = active5e({ slotId: undefined });
    const forked = forkSheet(active, {}, { fromSlotId: `active:${active.system}` });
    const onFork = switchToSlot(forked.active, forked.variants, forked.newSlotId);
    const res = deleteSheet(onFork.active, onFork.variants, forked.newSlotId);
    expect(res.variants[forked.newSlotId]).toBeUndefined();
    expect(res.switchedTo).toBeTruthy();
  });

  it('REFUSES the original — every other version branches from it', () => {
    const { active, variants } = withVariants();
    expect(() => deleteSheet(active, variants, 'dnd5e-2024')).toThrow(/original version can’t be deleted/);
  });

  it('refuses a version that does not exist', () => {
    const { active, variants } = withVariants();
    expect(() => deleteSheet(active, variants, 'no-such-slot')).toThrow(/No sheet/);
  });

  it('a lone version is the original, so it is protected — never zero versions', () => {
    const active = active5e({ slotId: 'dnd5e-2024' });
    expect(() => deleteSheet(active, {}, 'dnd5e-2024')).toThrow(/original version can’t be deleted/);
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

  // Reported live: "+ Variant" on a pre-tracker character died with
  //   No sheet "active:dnd5e-2024" to fork.
  // A character with no stored slotId is named by the synthetic `active:<system>` marker everywhere the UI
  // and routes refer to it, but forkSheet ran ensureLineage FIRST — which mints a real slotId — and then
  // compared only against the minted id, so the marker matched nothing. It broke fork AND begin-draft
  // (Edit → "edit directly") on exactly the characters that predate the feature.
  describe('the active sheet can be forked by its synthetic `active:` id (legacy characters)', () => {
    it('forks from the marker the UI actually sends', () => {
      const active = active5e({ slotId: undefined });
      const marker = `active:${active.system}`;
      const forked = forkSheet(active, {}, { fromSlotId: marker });
      // A real new slot exists, distinct from the source, parented to the now-materialised active id.
      expect(forked.newSlotId).toBeTruthy();
      expect(forked.newSlotId).not.toBe(forked.active.slotId);
      expect(forked.variants[forked.newSlotId].parentSlotId).toBe(forked.active.slotId);
      // And it is a real copy of the source, not an empty slot.
      expect(forked.variants[forked.newSlotId].data).toEqual(active.data);
    });

    it('begins a draft from the marker too (Edit → edit directly)', () => {
      const active = active5e({ slotId: undefined });
      const begun = beginDraft(active, {}, { fromSlotId: `active:${active.system}` });
      // The draft becomes the ACTIVE sheet (switchToSlot moves it out of `variants`), and its parent is
      // the source's materialised id — never the `active:` marker, which names no stored slot.
      expect(isDraftActive(begun.active)).toBe(true);
      expect(begun.active.slotId).toBe(begun.draftSlotId);
      expect(begun.active.parentSlotId).toBeTruthy();
      expect(begun.active.parentSlotId?.startsWith('active:')).toBe(false);
      // The source is parked as a stored version under that same real id, so the lineage resolves.
      expect(begun.variants[begun.active.parentSlotId as string]).toBeTruthy();
    });

    it('still forks by the real slot id once the character has one', () => {
      const active = active5e({ slotId: 'dnd5e-2024' });
      const forked = forkSheet(active, {}, { fromSlotId: 'dnd5e-2024' });
      expect(forked.variants[forked.newSlotId].parentSlotId).toBe('dnd5e-2024');
    });

    it('still refuses a slot id that genuinely does not exist', () => {
      const active = active5e({ slotId: undefined });
      expect(() => forkSheet(active, {}, { fromSlotId: 'no-such-slot' })).toThrow(/No sheet/);
    });
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
