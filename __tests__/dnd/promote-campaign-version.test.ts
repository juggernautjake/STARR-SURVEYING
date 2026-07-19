// __tests__/dnd/promote-campaign-version.test.ts — the creator's promote-to-original control + its gating.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const btn = readFileSync(join(process.cwd(), 'app/dnd/_ui/PromoteCampaignVersionButton.tsx'), 'utf8');
const page = readFileSync(join(process.cwd(), 'app/dnd/characters/[id]/page.tsx'), 'utf8');

describe('PromoteCampaignVersionButton', () => {
  it('is a client control that POSTs the promote route', () => {
    expect(btn).toContain("'use client'");
    expect(btn).toContain('/api/dnd/campaigns/${campaignId}/characters/${characterId}/promote');
    expect(btn).toContain("method: 'POST'");
  });
  it('requires a confirmation before overwriting the original', () => {
    expect(btn).toContain('confirming');
    expect(btn).toMatch(/overwrite/i);
  });
});

describe('sheet page wiring', () => {
  it('checks for a campaign override only for the owner', () => {
    expect(page).toContain('campaignOverridePending');
    expect(page).toContain('if (isOwner && character.campaign_id)');
    expect(page).toContain("select('data_override')");
  });
  it('renders the promote button only when an override is pending', () => {
    expect(page).toContain('{campaignOverridePending && character.campaign_id && (');
    expect(page).toContain('<PromoteCampaignVersionButton');
  });
});
