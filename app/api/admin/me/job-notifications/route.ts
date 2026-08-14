// app/api/admin/me/job-notifications/route.ts — slice N4 of
// docs/planning/completed/JOB_LIFECYCLE_AND_BRIEFINGS_2026-08-14.md
//
//   GET   → my settings, with the product defaults filled in for anything I never chose.
//   PATCH → change some of them.
//
// ── ALWAYS MINE ─────────────────────────────────────────────────────────────────────────────────
//
// There is no `?user=` and no admin override. A notification preference is the one setting where
// somebody else changing it for you produces exactly the failure the setting exists to prevent —
// you stop being told, and you have no way to know that is why. The row is keyed by the session
// email and nothing else.
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import {
  DEFAULT_JOB_EVENT_CHANNELS, channelFor, type JobNotificationPrefRow, type JobEventChannel,
} from '@/lib/notifications/job-prefs';

export const runtime = 'nodejs';

const CHANNELS: readonly JobEventChannel[] = ['immediate', 'digest', 'off'];
const KINDS = Object.keys(DEFAULT_JOB_EVENT_CHANNELS);

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabaseAdmin
    .from('job_notification_prefs')
    .select('user_email, channels, digest_hour')
    .eq('user_email', session.user.email)
    .maybeSingle();
  const row = data as JobNotificationPrefRow | null;

  // Resolved, not raw. The settings page shows what WILL happen, which for an untouched account is
  // the product defaults — a page rendering blanks for a user with no row would say "off" to
  // somebody who is in fact being notified about everything.
  return NextResponse.json({
    channels: Object.fromEntries(KINDS.map((k) => [k, channelFor(k, row)])),
    digestHour: typeof row?.digest_hour === 'number' ? row.digest_hour : 17,
    // So the UI can mark a row as "you chose this" rather than "this is the default".
    explicit: Object.keys(row?.channels ?? {}),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  const { data: existing } = await supabaseAdmin
    .from('job_notification_prefs')
    .select('channels, digest_hour')
    .eq('user_email', session.user.email)
    .maybeSingle();
  const current = (existing as JobNotificationPrefRow | null)?.channels ?? {};

  // MERGED, not replaced. The page sends only what changed, and a PATCH that overwrites the map
  // would reset every other event to its default the first time somebody flips one switch.
  const next: Record<string, string> = { ...current };
  if (body.channels && typeof body.channels === 'object') {
    for (const [kind, value] of Object.entries(body.channels as Record<string, unknown>)) {
      if (!KINDS.includes(kind)) {
        return NextResponse.json({ error: `Unknown event “${kind}”.` }, { status: 400 });
      }
      if (!CHANNELS.includes(value as JobEventChannel)) {
        return NextResponse.json(
          { error: `“${String(value)}” is not a setting. Expected immediate, digest or off.` },
          { status: 400 },
        );
      }
      next[kind] = value as string;
    }
  }

  const patch: Record<string, unknown> = {
    user_email: session.user.email,
    channels: next,
    updated_at: new Date().toISOString(),
  };
  if (body.digestHour !== undefined) {
    const hour = Number(body.digestHour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      return NextResponse.json({ error: 'The digest hour must be a whole hour between 0 and 23.' }, { status: 400 });
    }
    patch.digest_hour = hour;
  }

  const { error } = await supabaseAdmin
    .from('job_notification_prefs')
    .upsert(patch, { onConflict: 'user_email' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    channels: Object.fromEntries(KINDS.map((k) => [k, channelFor(k, { user_email: session.user!.email!, channels: next })])),
    digestHour: patch.digest_hour ?? (existing as JobNotificationPrefRow | null)?.digest_hour ?? 17,
    explicit: Object.keys(next),
  });
}
