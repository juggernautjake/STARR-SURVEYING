// lib/phone/settings.ts — slice I1 of
// docs/planning/completed/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
//
// Reading and writing the `phone` section of `app_settings`.
//
// The rule this file exists to enforce: settings are validated on the way OUT, not only on the way
// in. The obvious design validates in the PUT handler and trusts the column thereafter — which
// holds right up until somebody edits the row in the Supabase table editor, or an older deploy
// writes an older shape. The reader is the one with a caller on the line, so it is the one that
// cannot afford to throw.
//
// `parsePhoneHours` therefore runs on every read, and a store containing complete nonsense yields
// the defaults rather than an exception. The phone answering with the wrong hours is a bad day; the
// phone not answering is a lost customer.
import { supabaseAdmin } from '@/lib/supabase';
import { parsePhoneHours, DEFAULT_PHONE_HOURS, type PhoneHours } from './hours';

export const PHONE_SETTINGS_KEY = 'phone';

/** The configured hours, or the defaults if nothing usable is stored. Never throws. */
export async function loadPhoneHours(): Promise<PhoneHours> {
  try {
    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', PHONE_SETTINGS_KEY)
      .maybeSingle();
    if (error || !data) return DEFAULT_PHONE_HOURS;
    return parsePhoneHours((data as { value: unknown }).value);
  } catch {
    // A database blip must not take the phone line down — an inbound call still needs an answer,
    // and the default hours are a better answer than a 500.
    return DEFAULT_PHONE_HOURS;
  }
}

/** Persist hours. Returns the stored (re-parsed) value so the caller shows what was actually saved. */
export async function savePhoneHours(hours: unknown, updatedBy: string): Promise<PhoneHours> {
  const clean = parsePhoneHours(hours);
  const { error } = await supabaseAdmin.from('app_settings').upsert(
    {
      key: PHONE_SETTINGS_KEY,
      value: clean as unknown as Record<string, unknown>,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  );
  if (error) throw new Error(error.message);
  return clean;
}
