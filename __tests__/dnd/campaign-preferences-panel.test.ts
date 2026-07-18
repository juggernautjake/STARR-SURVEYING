// __tests__/dnd/campaign-preferences-panel.test.ts — Area P4. The DM's comprehensive campaign preferences
// panel. Source-anchors that the panel exposes EVERY configurable setting, each with a "players may choose"
// lock, PATCHes the campaign preferences, and is wired into the DM-only campaign controls — so a refactor
// that dropped a setting or the lock, or unwired the panel, fails here.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_CAMPAIGN_PREFERENCES } from '@/lib/dnd/preferences';

const panel = readFileSync(join(process.cwd(), 'app/dnd/_ui/CampaignPreferencesDm.tsx'), 'utf8');
const client = readFileSync(join(process.cwd(), 'app/dnd/_ui/CampaignPageClient.tsx'), 'utf8');

describe('DM campaign preferences panel (P4)', () => {
  it('surfaces a control for every configurable preference (nothing hidden from the DM)', () => {
    // Every non-boolean setting the model defines must appear in the panel's enum-field ordering.
    const enumFields = Object.keys(DEFAULT_CAMPAIGN_PREFERENCES).filter((k) => k !== 'autoMechanics');
    for (const f of enumFields) expect(panel).toContain(f);
    // The boolean setting has its own control.
    expect(panel).toContain('autoMechanics');
  });

  it('gives every setting a DM lock ("players may choose")', () => {
    expect(panel).toContain('playerCanChoose');
    expect(panel).toMatch(/Players may choose/);
    expect(panel).toMatch(/Locked to this/);
  });

  it('offers every dice-roller style + every alternative mechanic option', () => {
    for (const style of ['futuristic', 'rugged', 'natural', 'fantasy', 'medieval']) expect(panel).toContain(style);
    for (const rec of ['auto', 'manual', 'irl']) expect(panel).toContain(rec);
    expect(panel).toContain('flat-2-per-level'); // the exhaustion alternative the owner named
  });

  it('persists via a PATCH to the campaign preferences and defaults to vanilla', () => {
    expect(panel).toMatch(/method: 'PATCH'/);
    expect(panel).toContain('preferences: next');
    expect(panel).toContain('DEFAULT_CAMPAIGN_PREFERENCES');
  });

  it('is wired into the DM-only campaign controls', () => {
    expect(client).toContain("import CampaignPreferencesDm from './CampaignPreferencesDm'");
    expect(client).toMatch(/<CampaignPreferencesDm campaignId=\{campaignId\} initialPreferences=\{data\.preferences\}/);
  });
});
