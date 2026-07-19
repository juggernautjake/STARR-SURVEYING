// __tests__/dnd/campaign-scope.test.ts — campaign system-scoping: only same-system sheets are usable in a campaign.
import { describe, it, expect } from 'vitest';
import {
  sheetMatchesSystem, campaignEligibleSheets, characterHasCampaignSheet, campaignActiveSheet,
} from '@/lib/dnd/campaign-scope';
import type { SheetSlot } from '@/lib/dnd/system-variants';

const slot = (system: string, active = false, name = system): SheetSlot => ({ slotId: `s-${system}-${name}`, system, kind: 'vanilla', name, active });

const sheets: SheetSlot[] = [
  slot('dnd5e-2024', true, 'Barbarian build'),
  slot('pathfinder2e', false, 'PF2 build'),
  slot('dnd5e-2014', false, 'Old build'),
];

describe('campaign system-scoping', () => {
  it('matches on the normalized system', () => {
    expect(sheetMatchesSystem(slot('dnd5e-2024'), 'dnd5e-2024')).toBe(true);
    expect(sheetMatchesSystem(slot('pathfinder2e'), 'dnd5e-2024')).toBe(false);
  });

  it('only same-system sheets are eligible in the campaign', () => {
    const eligible = campaignEligibleSheets(sheets, 'dnd5e-2024');
    expect(eligible.map((s) => s.system)).toEqual(['dnd5e-2024']);
    // a Pathfinder campaign sees only the PF2 sheet
    expect(campaignEligibleSheets(sheets, 'pathfinder2e').map((s) => s.system)).toEqual(['pathfinder2e']);
    // a system the character has no sheet for → nothing eligible
    expect(campaignEligibleSheets(sheets, 'coc7e')).toEqual([]);
  });

  it('knows whether a character can be played in a campaign', () => {
    expect(characterHasCampaignSheet(sheets, 'dnd5e-2024')).toBe(true);
    expect(characterHasCampaignSheet(sheets, 'coc7e')).toBe(false);
    expect(characterHasCampaignSheet([], 'dnd5e-2024')).toBe(false);
  });

  it('picks the right active sheet for the campaign — never a mismatched one', () => {
    // dnd2024 campaign: the active dnd2024 slot.
    expect(campaignActiveSheet(sheets, 'dnd5e-2024')?.system).toBe('dnd5e-2024');
    // pf2 campaign: the active slot is dnd2024 (not eligible), so it falls back to the first PF2 slot.
    expect(campaignActiveSheet(sheets, 'pathfinder2e')?.system).toBe('pathfinder2e');
    // no matching sheet → null (character can't be opened in this campaign until they build one)
    expect(campaignActiveSheet(sheets, 'coc7e')).toBeNull();
  });
});
