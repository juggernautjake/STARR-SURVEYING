// __tests__/dnd/campaign-character-copy.test.ts — the isolated in-campaign character copy (fork / render / promote).
import { describe, it, expect } from 'vitest';
import {
  cloneSheetData, campaignRenderData, hasCampaignOverride, forkCampaignCopy, promoteOverrideToOriginal,
} from '@/lib/dnd/campaign-character-copy';

describe('cloneSheetData', () => {
  it('deep-clones so the copy can diverge without aliasing the original', () => {
    const orig = { meta: { level: 3 }, items: ['a'] };
    const copy = cloneSheetData(orig);
    copy.meta.level = 5; copy.items.push('b');
    expect(orig.meta.level).toBe(3);
    expect(orig.items).toEqual(['a']);
  });
  it('passes null/undefined through', () => {
    expect(cloneSheetData(null)).toBeNull();
  });
});

describe('campaignRenderData', () => {
  it('shows the override when present, else the original', () => {
    expect(campaignRenderData({ hp: 10 }, { hp: 99 })).toEqual({ hp: 99 });
    expect(campaignRenderData({ hp: 10 }, null)).toEqual({ hp: 10 });
    expect(campaignRenderData({ hp: 10 }, undefined)).toEqual({ hp: 10 });
  });
  it('hasCampaignOverride reflects whether the campaign has forked its own copy', () => {
    expect(hasCampaignOverride(null)).toBe(false);
    expect(hasCampaignOverride({ any: 1 })).toBe(true);
  });
});

describe('forkCampaignCopy', () => {
  it('snapshots the original on the first edit, leaving the original untouched', () => {
    const original = { meta: { level: 3 } };
    const copy = forkCampaignCopy(original, null);
    copy.meta.level = 7;
    expect(original.meta.level).toBe(3); // original untouched — the copy is isolated
  });
  it('returns the existing override unchanged once it exists (already isolated)', () => {
    const override = { meta: { level: 7 } };
    expect(forkCampaignCopy({ meta: { level: 3 } }, override)).toBe(override);
  });
});

describe('promoteOverrideToOriginal', () => {
  it('returns a deep clone of the override to write over the original', () => {
    const override = { meta: { level: 7 }, items: ['x'] };
    const promoted = promoteOverrideToOriginal(override)!;
    expect(promoted).toEqual(override);
    promoted.meta.level = 9;
    expect(override.meta.level).toBe(7); // clone, not alias
  });
  it('is null when there is nothing to promote', () => {
    expect(promoteOverrideToOriginal(null)).toBeNull();
  });
});
