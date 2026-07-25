// __tests__/dnd/variant-tracker.test.ts — the character variant tracker (VT): per-system class/level
// breakdown, tag taxonomy, git-like lineage (origin derivation + fork), the 20-version cap, the AI-summary
// digest/hash + prompt selection, and the browser card model. All pure — no DB, no AI.
import { describe, it, expect } from 'vitest';
import {
  sheetClassBreakdown, breakdownLabel,
} from '@/lib/dnd/variant-breakdown';
import { variantTags } from '@/lib/dnd/variant-tags';
import {
  resolveOriginSlotId, isOriginSlot, ensureLineage, forkSheet, isAtVariantCap, sheetCount, MAX_VARIANTS,
  readVariants, type ActiveSheet, type SystemVariants,
} from '@/lib/dnd/system-variants';
import { variantDigest, digestHash, sheetSummaryHash, generateVariantSummary } from '@/lib/dnd/variant-summary';
import { buildVariantCards } from '@/lib/dnd/variant-view';

// ── helpers ──
const meta5e = (over: Record<string, unknown> = {}) => ({ meta: { name: 'Gandalf', level: 5, className: 'Wizard', subclass: 'Evocation', species: 'Human', ...over } });
const active5e = (over: Partial<ActiveSheet> = {}): ActiveSheet => ({ system: 'dnd5e-2024', data: meta5e(), sheet_type: 'default', ...over });

describe('sheetClassBreakdown — per-system level + class', () => {
  it('reads a 5e single-class sheet', () => {
    const b = sheetClassBreakdown(meta5e(), 'dnd5e-2024');
    expect(b.level).toBe(5);
    expect(b.classes).toHaveLength(1);
    expect(b.classes[0].levels).toBe(5);
    expect(b.multiclass).toBe(false);
  });

  it('reads a 5e MULTICLASS sheet (each class + its level count)', () => {
    const data = { meta: { name: 'X', level: 5, classes: [{ classKey: 'fighter', level: 3 }, { classKey: 'wizard', level: 2, subclassKey: 'evocation' }] } };
    const b = sheetClassBreakdown(data, 'dnd5e-2024');
    expect(b.multiclass).toBe(true);
    expect(b.classes).toHaveLength(2);
    expect(b.classes.map((c) => c.levels)).toEqual([3, 2]);
    expect(breakdownLabel(b)).toMatch(/\d.*\/.*\d/); // "Fighter 3 / Wizard 2"
  });

  it('reads a Pathfinder 2e sheet from the pf2e sidecar', () => {
    const data = { pf2e: { identity: { name: 'Val', level: 7, className: 'Fighter', subclass: 'Bravery', ancestry: 'Dwarf' } } };
    const b = sheetClassBreakdown(data, 'pathfinder2e');
    expect(b.level).toBe(7);
    expect(b.classes[0]).toMatchObject({ name: 'Fighter', levels: 7, subclass: 'Bravery' });
  });

  it('reads an Intuitive Games sheet from the ig sidecar', () => {
    const data = { ig: { identity: { name: 'Mig', level: 4, className: 'Freebooter', subclass: 'Duelist' } } };
    const b = sheetClassBreakdown(data, 'intuitive-games');
    expect(b.level).toBe(4);
    expect(b.classes[0]).toMatchObject({ name: 'Freebooter', levels: 4 });
  });

  it('defaults an unbuilt sheet to level 1 with no classes', () => {
    const b = sheetClassBreakdown({}, 'dnd5e-2024');
    expect(b.level).toBe(1);
    expect(b.classes).toHaveLength(0);
  });
});

describe('variantTags — the tag taxonomy', () => {
  it('tags the original vs a variant', () => {
    const orig = variantTags({ origin: true, active: true, system: 'dnd5e-2024', kind: 'vanilla' });
    expect(orig.map((t) => t.label)).toContain('Original');
    expect(orig.map((t) => t.label)).toContain('Viewing');
    const v = variantTags({ origin: false, active: false, system: 'dnd5e-2024', kind: 'custom' });
    expect(v.map((t) => t.label)).toContain('Variant');
    expect(v.map((t) => t.label)).toContain('Custom');
  });

  it('shows vanilla/custom, multiclass, campaign, different-system, npc and draft', () => {
    const labels = variantTags({
      origin: false, active: false, system: 'pathfinder2e', kind: 'vanilla', multiclass: true,
      campaignName: 'Curse of Strahd', inCampaign: true, differentSystemFromOrigin: true, isNpc: true, underConstruction: true,
    }).map((t) => t.label);
    expect(labels).toEqual(expect.arrayContaining(['Variant', 'Vanilla', 'Multiclass', 'Campaign: Curse of Strahd', 'Different system', 'NPC', 'Draft']));
  });

  it('shows a campaign review status only when in a campaign', () => {
    const labels = variantTags({ origin: true, active: false, system: 'dnd5e-2024', kind: 'vanilla', submissionStatus: 'approved' }).map((t) => t.label);
    expect(labels).toContain('Approved');
  });
});

describe('lineage — origin derivation + git-like fork', () => {
  it('a lone new character is its own origin', () => {
    const a = active5e();
    expect(isOriginSlot(resolveOriginSlotId(a, {}), a, {})).toBe(true);
  });

  it('forkSheet branches a child with parentSlotId = source, keeping the original as the root', () => {
    const a = active5e();
    const { active, variants, newSlotId } = forkSheet(a, {}, { fromSlotId: 'dnd5e-2024' });
    // origin got a real slot id; the fork points back at it.
    expect(active.slotId).toBe('dnd5e-2024');
    expect(variants[newSlotId].parentSlotId).toBe('dnd5e-2024');
    // The fork's data is a DEEP CLONE (mutating it must not touch the source).
    (variants[newSlotId].data as { meta: { name: string } }).meta.name = 'Changed';
    expect((a.data as { meta: { name: string } }).meta.name).toBe('Gandalf');
    // Origin is still the root even though a fork now exists.
    expect(resolveOriginSlotId(active, variants)).toBe('dnd5e-2024');
  });

  it('a fork of a fork records grandchild lineage; origin stays the root', () => {
    const a = active5e({ slotId: 'dnd5e-2024' });
    const f1 = forkSheet(a, {}, { fromSlotId: 'dnd5e-2024' }); // child
    const child = f1.newSlotId;
    const f2 = forkSheet(a, f1.variants, { fromSlotId: child }); // grandchild off the child
    expect(f2.variants[f2.newSlotId].parentSlotId).toBe(child);
    expect(resolveOriginSlotId(a, f2.variants)).toBe('dnd5e-2024');
  });

  it('ensureLineage backfills a stray parentless sheet onto the origin', () => {
    const a = active5e({ slotId: 'dnd5e-2024' });
    // A pre-lineage transpose left a parentless PF2 sheet.
    const variants: SystemVariants = { 'pathfinder2e': { data: { pf2e: { identity: { level: 5 } } }, sheet_type: 'default', system: 'pathfinder2e' } };
    const out = ensureLineage(a, variants);
    expect(out.variants['pathfinder2e'].parentSlotId).toBe(out.originSlotId);
  });
});

describe('the 20-version cap', () => {
  it('isAtVariantCap is true at exactly MAX_VARIANTS sheets', () => {
    const a = active5e({ slotId: 'dnd5e-2024' });
    const variants: SystemVariants = {};
    for (let i = 2; i <= MAX_VARIANTS; i++) variants[`dnd5e-2024#${i}`] = { data: meta5e(), sheet_type: 'default', system: 'dnd5e-2024' };
    expect(sheetCount(a, variants)).toBe(MAX_VARIANTS);
    expect(isAtVariantCap(a, variants)).toBe(true);
  });

  it('is not at cap below the limit', () => {
    const a = active5e({ slotId: 'dnd5e-2024' });
    expect(isAtVariantCap(a, {})).toBe(false);
  });
});

describe('AI summary — digest, hash, prompt selection', () => {
  it('builds a digest with name/level/class/abilities from a 5e sheet', () => {
    const dig = variantDigest({ meta: { name: 'Gandalf', level: 5, className: 'Wizard' }, abilities: { str: 10, int: 18 } }, 'dnd5e-2024');
    expect(dig.name).toBe('Gandalf');
    expect(dig.level).toBe(5);
    expect(dig.abilities.INT).toBe(18);
  });

  it('digestHash is stable and changes when the sheet changes', () => {
    const h1 = sheetSummaryHash(meta5e(), 'dnd5e-2024');
    const h2 = sheetSummaryHash(meta5e(), 'dnd5e-2024');
    const h3 = sheetSummaryHash(meta5e({ level: 6 }), 'dnd5e-2024');
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
  });

  it('uses the ORIGINAL-vs-VARIANT prompt when they differ, and the standalone prompt for the original', async () => {
    const prompts: string[] = [];
    const fakeComplete = async (o: { user: string }) => { prompts.push(o.user); return 'A summary.'; };
    const original = { data: meta5e(), system: 'dnd5e-2024' };
    const variant = { data: meta5e({ level: 8, name: 'Gandalf the White' }), system: 'dnd5e-2024' };

    const vGen = await generateVariantSummary(variant, original, fakeComplete);
    expect(vGen.summary).toBe('A summary.');
    expect(vGen.hash).toBe(digestHash(variantDigest(variant.data, variant.system)));
    expect(prompts[0]).toContain('VARIANT'); // difference-focused prompt

    await generateVariantSummary(original, original, fakeComplete); // target IS the original
    expect(prompts[1]).toContain('original');
  });
});

describe('buildVariantCards — the browser card model', () => {
  it('marks the active card, flags the origin, and computes tags + level line', () => {
    const a = active5e({ slotId: 'dnd5e-2024', artUrl: 'http://x/img.png' });
    const variants: SystemVariants = {
      'dnd5e-2024#2': { data: meta5e({ name: 'Gandalf the Grey', level: 8 }), sheet_type: 'default', system: 'dnd5e-2024', kind: 'custom', parentSlotId: 'dnd5e-2024' },
    };
    const cards = buildVariantCards(a, variants, { characterName: 'Gandalf' });
    expect(cards).toHaveLength(2);
    const activeCard = cards.find((c) => c.active)!;
    expect(activeCard.origin).toBe(true);
    expect(activeCard.name).toBe('Gandalf');
    expect(activeCard.artUrl).toBe('http://x/img.png');
    expect(activeCard.tags.map((t) => t.label)).toEqual(expect.arrayContaining(['Original', 'Viewing']));
    const variantCard = cards.find((c) => !c.active)!;
    expect(variantCard.origin).toBe(false);
    expect(variantCard.parentName).toBe('Gandalf'); // branched from the original
    expect(variantCard.tags.map((t) => t.label)).toContain('Variant');
    expect(variantCard.levelLabel).toContain('8');
  });

  it('flags a stale summary when the sheet changed since it was generated', () => {
    const a = active5e({ slotId: 'dnd5e-2024', summary: 'old', summaryHash: 'deadbeef' });
    const cards = buildVariantCards(a, {}, { characterName: 'Gandalf' });
    expect(cards[0].summaryStale).toBe(true);
  });
});
