// __tests__/dnd/character-settings-modal.test.ts — the per-character settings gear (S-3 / S-DM).
//
// Source-anchors the two contracts the modal must keep, so a refactor that unwired either fails here:
//   1. it persists a player's choice to the /preferences endpoint (S-2), and
//   2. it HONOURS the DM lock — a `lockedByDM` setting is disabled and marked "set by your DM", which is
//      the visible half of the campaign override (S-DM). It reads the SHARED option catalog, so its option
//      coverage is asserted there (same as the DM panel), keeping the two lists from drifting.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_CAMPAIGN_PREFERENCES } from '@/lib/dnd/preferences';

const modal = readFileSync(join(process.cwd(), 'app/dnd/_ui/CharacterSettingsModal.tsx'), 'utf8');
const catalog = readFileSync(join(process.cwd(), 'lib/dnd/preference-options.ts'), 'utf8');
const page = readFileSync(join(process.cwd(), 'app/dnd/characters/[id]/page.tsx'), 'utf8');

describe('per-character settings modal (S-3)', () => {
  it('persists a choice to the /preferences endpoint and reloads', () => {
    expect(modal).toMatch(/\/preferences/);
    expect(modal).toMatch(/method: 'POST'/);
    expect(modal).toContain('preferences: next');
    expect(modal).toContain('window.location.reload()');
  });

  it('honours the DM lock — a locked setting is disabled and marked as the DM’s (S-DM override, visible)', () => {
    expect(modal).toContain('lockedByDM'); // reads the resolved lock flag
    expect(modal).toMatch(/set by your DM/);
    // Both control kinds disable when locked (locked || busy || !canWrite).
    expect(modal).toMatch(/disabled=\{locked/);
  });

  it('offers an "unset → follow campaign" choice, so a player never has to pin a value', () => {
    expect(modal).toMatch(/Follow campaign/);
  });

  it('renders from the shared catalog (so it can’t drift from the DM panel)', () => {
    expect(modal).toMatch(/from '@\/lib\/dnd\/preference-options'/);
    for (const field of Object.keys(DEFAULT_CAMPAIGN_PREFERENCES)) expect(catalog).toContain(field);
  });

  it('is mounted on the character page for every system (owner/DM only)', () => {
    expect(page).toContain('CharacterSettingsModal');
    expect(page).toMatch(/canWrite &&\s*\(\s*<CharacterSettingsModal/);
  });
});
