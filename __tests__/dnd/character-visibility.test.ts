// __tests__/dnd/character-visibility.test.ts — the original-vs-campaign-version access model.
import { describe, it, expect } from 'vitest';
import {
  originalSheetAccess, campaignSheetAccess, canPromoteCampaignToOriginal, fellowPlayerCanView,
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
