// __tests__/dnd/house-rules-panel.test.ts — Area P3 scaffold. The player-facing, read-only view of the
// campaign's effective preferences. Source-anchors that it covers every setting and flags DM-locked ones,
// and that the sheet page renders it only when a campaign's preferences are present.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_CAMPAIGN_PREFERENCES } from '@/lib/dnd/preferences';

const panel = readFileSync(join(process.cwd(), 'app/dnd/_ui/HouseRulesPanel.tsx'), 'utf8');
const page = readFileSync(join(process.cwd(), 'app/dnd/characters/[id]/page.tsx'), 'utf8');

describe('HouseRulesPanel (P3 scaffold)', () => {
  it('lists a row for every preference (nothing the DM set is hidden from the player)', () => {
    for (const key of Object.keys(DEFAULT_CAMPAIGN_PREFERENCES)) expect(panel).toContain(key);
  });

  it('surfaces the DM lock state (🔒 when lockedByDM)', () => {
    expect(panel).toContain('lockedByDM');
    expect(panel).toContain('🔒');
  });

  it('gives human labels for the alternative values (not raw enum keys)', () => {
    expect(panel).toContain('half-hit-dice');
    expect(panel).toContain('2014 RAW');
    expect(panel).toContain('flat-2-per-level');
  });

  it('is rendered on the sheet page only when a campaign supplied preferences', () => {
    expect(page).toContain("import HouseRulesPanel from '@/app/dnd/_ui/HouseRulesPanel'");
    expect(page).toMatch(/effectivePreferences && <HouseRulesPanel preferences=\{effectivePreferences\}/);
  });
});
