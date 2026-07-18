import { describe, it, expect } from 'vitest';
import {
  readCampaignPreferences,
  writeCampaignPreferencesToTheme,
  CAMPAIGN_PREFERENCES_THEME_KEY,
} from '@/lib/dnd/campaign-preferences';
import { DEFAULT_CAMPAIGN_PREFERENCES } from '@/lib/dnd/preferences';

// Phase 2 · P2 — campaign preferences persist in the existing `dnd_campaigns.theme` jsonb. These pin the
// read/write path the GET + PATCH routes funnel everything through: legacy campaigns read as full vanilla,
// a hostile/partial patch is sanitised, and the other theme keys are never disturbed.

describe('readCampaignPreferences — a legacy/blank theme reads as full vanilla', () => {
  it('returns the vanilla defaults when there is no stored preferences key', () => {
    expect(readCampaignPreferences(null)).toEqual(DEFAULT_CAMPAIGN_PREFERENCES);
    expect(readCampaignPreferences({})).toEqual(DEFAULT_CAMPAIGN_PREFERENCES);
    expect(readCampaignPreferences({ artUrl: 'x', notes: 'y' })).toEqual(DEFAULT_CAMPAIGN_PREFERENCES);
  });

  it('reads back a stored, valid preferences block', () => {
    const theme = { [CAMPAIGN_PREFERENCES_THEME_KEY]: { equipLimits: { value: 'off', playerCanChoose: false } } };
    const prefs = readCampaignPreferences(theme);
    expect(prefs.equipLimits).toEqual({ value: 'off', playerCanChoose: false });
    // Unspecified fields still fill from vanilla.
    expect(prefs.exhaustionModel).toEqual({ value: 'vanilla', playerCanChoose: true });
  });
});

describe('writeCampaignPreferencesToTheme — sanitises + preserves other keys', () => {
  it('normalises a partial/hostile patch to valid, vanilla-defaulted settings', () => {
    const theme = writeCampaignPreferencesToTheme({}, { exhaustionModel: { value: 'HACK', playerCanChoose: 'yes' } });
    const stored = theme[CAMPAIGN_PREFERENCES_THEME_KEY] as Record<string, { value: string; playerCanChoose: boolean }>;
    expect(stored.exhaustionModel.value).toBe('vanilla'); // invalid enum → vanilla default
    expect(stored.exhaustionModel.playerCanChoose).toBe(true); // non-boolean → default true
    // Round-trips cleanly through the reader.
    expect(readCampaignPreferences(theme).exhaustionModel.value).toBe('vanilla');
  });

  it('preserves artUrl / notes / dmNotes and does not mutate the input theme', () => {
    const input = { artUrl: 'banner.png', notes: 'welcome', dmNotes: 'secret' };
    const out = writeCampaignPreferencesToTheme(input, { equipLimits: { value: 'off', playerCanChoose: true } });
    expect(out.artUrl).toBe('banner.png');
    expect(out.notes).toBe('welcome');
    expect(out.dmNotes).toBe('secret');
    expect(CAMPAIGN_PREFERENCES_THEME_KEY in out).toBe(true);
    // input untouched (pure).
    expect(CAMPAIGN_PREFERENCES_THEME_KEY in input).toBe(false);
  });
});
