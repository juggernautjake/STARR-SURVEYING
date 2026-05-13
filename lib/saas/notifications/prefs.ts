// lib/saas/notifications/prefs.ts
//
// Per-user notification preferences. The dispatcher's getUserPrefs
// stub (in ./index.ts) reads from this module. The /admin/me profile
// settings UI (Phase F-4) will write through setUserPrefs.
//
// Storage: public.user_notification_prefs (shipped in seeds/271).
// Shape: { "<event>": { "email": bool, "in_app": bool, "sms": bool } }
// Missing entries fall back to the event's `defaults`.
//
// Spec: docs/planning/completed/CUSTOMER_MESSAGING_PLAN.md §3.

import { supabaseAdmin } from '@/lib/supabase';

import type {
  ChannelKey,
  NotificationEvent,
} from './index';

export type EventPrefs = Partial<Record<ChannelKey, boolean>>;
export type AllUserPrefs = Partial<Record<NotificationEvent, EventPrefs>>;

/** Reads a user's full preferences map. Returns `{}` when the user
 *  has never set prefs (treat all events as default). Never throws —
 *  caller's worst case is "every event sends per defaults". */
export async function getAllUserPrefs(userEmail: string): Promise<AllUserPrefs> {
  if (!userEmail) return {};
  try {
    const { data, error } = await supabaseAdmin
      .from('user_notification_prefs')
      .select('prefs')
      .eq('user_email', userEmail)
      .maybeSingle();
    if (error || !data) return {};
    return (data.prefs as AllUserPrefs) ?? {};
  } catch {
    return {};
  }
}

/** Reads a user's prefs for a single event. Returns `{}` when
 *  unset (caller falls back to event defaults). */
export async function getEventPrefs(
  userEmail: string,
  event: NotificationEvent,
): Promise<EventPrefs> {
  const all = await getAllUserPrefs(userEmail);
  return all[event] ?? {};
}

/** Persists a user's full prefs map. Upserts; the new prefs replace
 *  any existing prefs (caller is responsible for merging if partial
 *  updates are intended). */
export async function setAllUserPrefs(
  userEmail: string,
  prefs: AllUserPrefs,
): Promise<boolean> {
  if (!userEmail) return false;
  try {
    const { error } = await supabaseAdmin
      .from('user_notification_prefs')
      .upsert(
        { user_email: userEmail, prefs, updated_at: new Date().toISOString() },
        { onConflict: 'user_email' },
      );
    if (error) {
      console.error('[notifications/prefs] upsert failed', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[notifications/prefs] upsert threw', err);
    return false;
  }
}

/** Persists a single event's prefs while preserving the user's other
 *  event prefs. Read-modify-write — not transactional, but writes are
 *  infrequent + non-critical. */
export async function setEventPrefs(
  userEmail: string,
  event: NotificationEvent,
  prefs: EventPrefs,
): Promise<boolean> {
  if (!userEmail) return false;
  const all = await getAllUserPrefs(userEmail);
  const next: AllUserPrefs = { ...all, [event]: prefs };
  return setAllUserPrefs(userEmail, next);
}

/** Convenience: returns the effective channel state for an event,
 *  combining user prefs with the event's defaults. The dispatcher
 *  uses this exact resolution logic when fanning out. */
export function effectiveChannels(
  userPrefs: EventPrefs,
  eventDefaults: Partial<Record<ChannelKey, boolean>>,
  eventChannelsAllowed: Partial<Record<ChannelKey, true>>,
): ChannelKey[] {
  const channels: ChannelKey[] = ['email', 'in_app', 'sms'];
  return channels.filter((ch) => {
    if (!eventChannelsAllowed[ch]) return false;   // event doesn't support
    if (userPrefs[ch] === false) return false;     // user opted out
    if (userPrefs[ch] === true) return true;       // user opted in
    return !!eventDefaults[ch];                    // fall back to default
  });
}
