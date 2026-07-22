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
// The option/label metadata now lives in ONE shared catalog (settings S-3); the panel and the
// per-character modal both read it, so coverage is asserted against the catalog + that the panel uses it.
const catalog = readFileSync(join(process.cwd(), 'lib/dnd/preference-options.ts'), 'utf8');

describe('DM campaign preferences panel (P4)', () => {
  it('surfaces a control for every configurable preference (nothing hidden from the DM)', () => {
    // Every non-boolean setting the model defines must appear in the shared catalog's enum metadata…
    const enumFields = Object.keys(DEFAULT_CAMPAIGN_PREFERENCES).filter((k) => k !== 'autoMechanics');
    for (const f of enumFields) expect(catalog).toContain(f);
    expect(catalog).toContain('autoMechanics'); // the boolean setting
    // …and the panel must actually render from that catalog (import + drive its rows off the orderings).
    expect(panel).toMatch(/from '@\/lib\/dnd\/preference-options'/);
    expect(panel).toContain('ENUM_ORDER');
    expect(panel).toContain('BOOL_ORDER');
  });

  it('gives every setting a DM lock ("players may choose")', () => {
    expect(panel).toContain('playerCanChoose');
    expect(panel).toMatch(/Players may choose/);
    expect(panel).toMatch(/Locked to this/);
  });

  it('offers every dice-roller style + every alternative mechanic option', () => {
    for (const style of ['futuristic', 'rugged', 'natural', 'fantasy', 'medieval']) expect(catalog).toContain(style);
    for (const rec of ['auto', 'manual', 'irl']) expect(catalog).toContain(rec);
    expect(catalog).toContain('flat-2-per-level'); // the exhaustion alternative the owner named
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
