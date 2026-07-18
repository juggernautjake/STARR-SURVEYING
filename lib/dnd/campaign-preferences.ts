// lib/dnd/campaign-preferences.ts — Phase 2, Area P2 (persistence). The campaign's DM preferences live in
// the existing `dnd_campaigns.theme` jsonb (alongside artUrl / notes / dmNotes), so there's no schema
// migration: one more key, `preferences`, holding the normalized CampaignPreferences. These pure helpers are
// the single read/write path the campaign GET + PATCH routes use, so a corrupt or partial stored value can
// never wedge a campaign — everything is funnelled through `normalizeCampaignPreferences` (vanilla defaults
// fill any gap).
import { type CampaignPreferences, normalizeCampaignPreferences } from './preferences';

/** The key under `theme` that holds the campaign's DM preferences. */
export const CAMPAIGN_PREFERENCES_THEME_KEY = 'preferences';

/** Read the DM preferences out of a campaign's `theme` jsonb, normalized — vanilla defaults fill any missing
 *  or invalid field, so a legacy campaign with no stored preferences reads as the full vanilla set. */
export function readCampaignPreferences(theme: unknown): CampaignPreferences {
  const t = (theme ?? {}) as Record<string, unknown>;
  return normalizeCampaignPreferences(t[CAMPAIGN_PREFERENCES_THEME_KEY]);
}

/** Merge a raw preferences patch into a campaign's `theme` jsonb, returning the NEW theme object (the input
 *  is not mutated). Only the validated/normalized preferences are stored, so an attacker-supplied or corrupt
 *  body is sanitised before it ever touches the DB; every other theme key (artUrl, notes, dmNotes) is
 *  preserved untouched. */
export function writeCampaignPreferencesToTheme(theme: unknown, rawPreferences: unknown): Record<string, unknown> {
  const next = { ...((theme ?? {}) as Record<string, unknown>) };
  next[CAMPAIGN_PREFERENCES_THEME_KEY] = normalizeCampaignPreferences(rawPreferences);
  return next;
}
