// lib/notifications/notification-preferences.ts — eligibility, minus the people who said no.
//
// `audience.ts` answers "who is ALLOWED to hear this". This answers "and who still wants to",
// which is the question that decides what is actually sent.
//
// ── OPT-OUT, NOT OPT-IN ─────────────────────────────────────────────────────────────────────────
//
// A person with no row is notified. That direction is load-bearing: the opposite would mean the day
// this shipped, everybody's notifications went quiet until they found a settings page, and nobody
// would have reported it as a bug because silence is what a quiet week looks like too.
//
// ── FAILING TOWARD SENDING ──────────────────────────────────────────────────────────────────────
//
// Every failure here returns the full eligible list rather than an empty one. A duplicate bell is
// an annoyance; a customer call that told nobody because a preferences lookup timed out is a lost
// job, and it would be invisible.

import type { SupabaseClient } from '@supabase/supabase-js';
import { eligibleRecipients, broadcastKind } from './audience';

/** The kind whose opt-outs live in the older, richer table from seeds/579. */
const HOURS_KIND = 'hours.submitted';

/** Emails that have switched a kind OFF. */
async function optedOut(client: Pick<SupabaseClient, 'from'>, kindId: string): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    // `hours.submitted` predates this table and keeps its own, which also carries "only notify me
    // about these people" — a thing this table cannot express. Reading the right one per kind is
    // less surprising than migrating live opt-outs about money to make the code tidier.
    const table = kindId === HOURS_KIND ? 'hours_notification_preferences' : 'notification_preferences';
    const query = client.from(table).select(kindId === HOURS_KIND ? 'user_email, notify_on_submit' : 'user_email, enabled, kind');
    const { data, error } = kindId === HOURS_KIND ? await query : await query.eq('kind', kindId);
    if (error || !data) return out;
    for (const row of data as Array<Record<string, unknown>>) {
      const off = kindId === HOURS_KIND ? row.notify_on_submit === false : row.enabled === false;
      if (off && typeof row.user_email === 'string') out.add(row.user_email.toLowerCase());
    }
  } catch (err) {
    console.error(`[notifications] opt-out lookup failed for "${kindId}", notifying everyone eligible:`, err);
  }
  return out;
}

/**
 * Who to actually notify for a broadcast kind.
 *
 * Logs when a kind ends up with nobody. That state is legitimate — everybody may have opted out —
 * but it is indistinguishable at a glance from the notifier being broken, so it says so.
 */
export async function recipientsFor(
  client: Pick<SupabaseClient, 'from'>,
  kindId: string,
): Promise<string[]> {
  const eligible = await eligibleRecipients(client, kindId);
  if (!eligible.length) return [];
  const off = await optedOut(client, kindId);
  const out = eligible.filter((e) => !off.has(e));
  if (!out.length) {
    console.warn(`[notifications] every eligible person has opted out of "${kindId}" — telling nobody`);
  }
  return out;
}

/** What one person's toggles look like: every kind they are eligible for, and whether it is on. */
export async function preferencesFor(
  client: Pick<SupabaseClient, 'from'>,
  email: string,
  roles: readonly string[],
): Promise<Array<{ id: string; label: string; description: string; enabled: boolean }>> {
  const { BROADCAST_KINDS, isEligibleFor } = await import('./audience');
  // Kinds with their own settings panel are left to it: two switches for one setting is worse than
  // one, because the moment they disagree neither can be trusted.
  const mine = BROADCAST_KINDS.filter((k) => !k.hasOwnPanel && isEligibleFor(k.id, roles));
  const off = new Set<string>();
  try {
    const { data } = await client
      .from('notification_preferences')
      .select('kind, enabled')
      .eq('user_email', email.toLowerCase());
    for (const row of (data ?? []) as Array<{ kind: string; enabled: boolean }>) {
      if (row.enabled === false) off.add(row.kind);
    }
    const { data: hours } = await client
      .from('hours_notification_preferences')
      .select('notify_on_submit')
      .eq('user_email', email.toLowerCase())
      .maybeSingle();
    if ((hours as { notify_on_submit?: boolean } | null)?.notify_on_submit === false) off.add(HOURS_KIND);
  } catch { /* an unreadable preference reads as ON, matching the absent-row default */ }

  return mine.map((k) => ({ id: k.id, label: k.label, description: k.description, enabled: !off.has(k.id) }));
}

/** Turn one kind on or off for one person. Returns false when the kind is not a real one. */
export async function setPreference(
  client: Pick<SupabaseClient, 'from'>,
  email: string,
  kindId: string,
  enabled: boolean,
  by: string,
): Promise<boolean> {
  // Validated against the registry rather than trusted: `kind` is free text in the table, so an
  // unchecked id stores a preference that nothing will ever read and silently does nothing.
  if (!broadcastKind(kindId)) return false;
  const user_email = email.toLowerCase();

  if (kindId === HOURS_KIND) {
    await client.from('hours_notification_preferences')
      .upsert({ user_email, notify_on_submit: enabled, updated_at: new Date().toISOString(), updated_by: by },
        { onConflict: 'user_email' });
    return true;
  }
  await client.from('notification_preferences')
    .upsert({ user_email, kind: kindId, enabled, updated_at: new Date().toISOString(), updated_by: by },
      { onConflict: 'user_email,kind' });
  return true;
}
