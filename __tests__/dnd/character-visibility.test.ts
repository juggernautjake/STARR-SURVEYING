// __tests__/dnd/character-visibility.test.ts — the original-vs-campaign-version access model.
import { describe, it, expect } from 'vitest';
import {
  originalSheetAccess, campaignSheetAccess, canPromoteCampaignToOriginal, fellowPlayerCanView,
  campaignEditTarget, campaignReadFromOverride,
  type ViewerRelation,
} from '@/lib/dnd/character-visibility';

const rel = (o: Partial<ViewerRelation>): ViewerRelation => ({ isCreator: false, isDM: false, isAssignedPlayer: false, isCampaignMember: false, ...o });

describe('originalSheetAccess (the creator’s canonical copy)', () => {
  it('only the creator can edit the original', () => {
    expect(originalSheetAccess(rel({ isCreator: true }), 'private')).toEqual({ canView: true, canEdit: true });
    expect(originalSheetAccess(rel({ isDM: true }), 'private').canEdit).toBe(false); // the DM edits the campaign copy, not the original
  });
  it('the DM always sees the original (even when private)', () => {
    expect(originalSheetAccess(rel({ isDM: true }), 'private').canView).toBe(true);
  });
  it('public originals are viewable by anyone; private ones are not', () => {
    expect(originalSheetAccess(rel({}), 'public').canView).toBe(true);
    expect(originalSheetAccess(rel({}), 'private').canView).toBe(false);
  });
});

describe('campaignSheetAccess (the isolated in-campaign copy)', () => {
  it('the DM can edit the campaign version and always sees it', () => {
    expect(campaignSheetAccess(rel({ isDM: true }), 'private')).toEqual({ canView: true, canEdit: true });
  });
  it('the owner/assigned player edits their own campaign copy', () => {
    expect(campaignSheetAccess(rel({ isCreator: true }), 'private').canEdit).toBe(true);
    expect(campaignSheetAccess(rel({ isAssignedPlayer: true }), 'private').canEdit).toBe(true);
  });
  it('a fellow player can VIEW a public campaign character but never EDIT it', () => {
    const other = campaignSheetAccess(rel({ isCampaignMember: true }), 'public');
    expect(other.canView).toBe(true);
    expect(other.canEdit).toBe(false);
  });
  it('a private character is hidden from fellow players', () => {
    expect(campaignSheetAccess(rel({ isCampaignMember: true }), 'private').canView).toBe(false);
  });
});

describe('promote + fellow-player rule', () => {
  it('only the creator may replace their original with the campaign version', () => {
    expect(canPromoteCampaignToOriginal(rel({ isCreator: true }))).toBe(true);
    expect(canPromoteCampaignToOriginal(rel({ isDM: true }))).toBe(false);
  });
  it('fellowPlayerCanView is the private/public headline rule', () => {
    expect(fellowPlayerCanView('public')).toBe(true);
    expect(fellowPlayerCanView('private')).toBe(false);
  });
});

describe('campaignEditTarget (VIS6c write-routing decision)', () => {
  it('the DM (not the creator/player) edits the ISOLATED campaign copy', () => {
    expect(campaignEditTarget(rel({ isDM: true }), true)).toBe('campaign-override');
  });
  it('the creator / assigned player edits the ORIGINAL, never the override', () => {
    expect(campaignEditTarget(rel({ isCreator: true }), true)).toBe('original');
    expect(campaignEditTarget(rel({ isDM: true, isCreator: true }), true)).toBe('original'); // a DM editing their OWN character
    expect(campaignEditTarget(rel({ isDM: true, isAssignedPlayer: true }), true)).toBe('original');
  });
  it('outside a campaign there is only the original', () => {
    expect(campaignEditTarget(rel({ isDM: true }), false)).toBe('original');
  });
});

describe('campaignReadFromOverride (see exactly what you would edit)', () => {
  it('the DM reads the override when one exists (so view == what they edit)', () => {
    expect(campaignReadFromOverride(rel({ isDM: true }), true, true)).toBe(true);
  });
  it('no override yet → everyone reads the original', () => {
    expect(campaignReadFromOverride(rel({ isDM: true }), true, false)).toBe(false);
  });
  it('the creator always reads their original, never the override', () => {
    expect(campaignReadFromOverride(rel({ isCreator: true }), true, true)).toBe(false);
  });
});
