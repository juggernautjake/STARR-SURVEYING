// __tests__/dnd/preferences-sheet-wiring.test.ts — Area P2c. Proves the chain the character sheet page now
// runs end to end: a campaign's stored theme → readCampaignPreferences → resolvePreferences → the effective
// value the sheet store consumes → the actual mechanic (long-rest hit dice). Plus a source-anchor that the
// page + SheetRoot forward `preferences` into the store, so unwiring any hop fails here.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readCampaignPreferences } from '@/lib/dnd/campaign-preferences';
import { resolvePreferences } from '@/lib/dnd/preferences';
import { hitDiceAfterLongRest } from '@/lib/dnd/mechanics/long-rest';

// Reproduce the server component's resolution: a campaign row's `theme` jsonb → the effective prefs the sheet
// store is handed.
function effectiveFromTheme(theme: unknown, player = {}) {
  return resolvePreferences(readCampaignPreferences(theme), player);
}

describe('campaign preference → sheet mechanic, end to end (P2c)', () => {
  it('a campaign that sets the 2014-half long-rest model changes the sheet result', () => {
    const theme = { preferences: { longRestModel: { value: 'half-hit-dice', playerCanChoose: true } } };
    const eff = effectiveFromTheme(theme);
    expect(eff.longRestModel.value).toBe('half-hit-dice');
    // The store feeds that value to hitDiceAfterLongRest — a fully-spent 8-die pool now regains only 4.
    expect(hitDiceAfterLongRest(8, 0, eff.longRestModel.value)).toBe(4);
  });

  it('a campaign with no stored prefs resolves to vanilla → full restore (unchanged behavior)', () => {
    const eff = effectiveFromTheme({ artUrl: 'x' }); // legacy theme, no preferences key
    expect(eff.longRestModel.value).toBe('vanilla');
    expect(hitDiceAfterLongRest(8, 0, eff.longRestModel.value)).toBe(8);
  });

  it('a DM lock forces the campaign model even if a player tried to choose another', () => {
    const theme = { preferences: { longRestModel: { value: 'half-hit-dice', playerCanChoose: false } } };
    const eff = effectiveFromTheme(theme, { longRestModel: 'vanilla' }); // player attempts vanilla
    expect(eff.longRestModel).toEqual({ value: 'half-hit-dice', lockedByDM: true });
  });
});

describe('the sheet page + SheetRoot forward preferences into the store', () => {
  const page = readFileSync(join(process.cwd(), 'app/dnd/characters/[id]/page.tsx'), 'utf8');
  const sheetRoot = readFileSync(join(process.cwd(), 'app/dnd/_sheet/SheetRoot.tsx'), 'utf8');

  it('the page resolves the campaign preferences and passes them to SheetRoot', () => {
    expect(page).toContain('readCampaignPreferences');
    expect(page).toContain('resolvePreferences');
    expect(page).toMatch(/preferences=\{effectivePreferences\}/);
  });

  it('EVERY CharacterProvider in SheetRoot forwards preferences (not just one branch)', () => {
    // SheetRoot renders CharacterProvider in more than one branch (the main sheet AND the custom-
    // interactive sheet). The original anchor only checked that `preferences={preferences}` appeared
    // SOMEWHERE, which passed while the MAIN branch silently dropped it — so campaign/player preferences
    // never reached a normal sheet's store. Assert each provider opening tag forwards it, so unwiring any
    // single branch fails here. (Matches the opening tag up to the first '>'.)
    const providers = sheetRoot.match(/<CharacterProvider\b[^>]*>/g) ?? [];
    expect(providers.length).toBeGreaterThanOrEqual(2);
    for (const tag of providers) expect(tag).toMatch(/preferences=\{preferences\}/);
  });
});
