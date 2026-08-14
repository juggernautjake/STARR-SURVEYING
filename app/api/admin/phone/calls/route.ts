// app/api/admin/phone/calls/route.ts — slice S1 of
// docs/planning/in-progress/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
//
// The call list. Filters mirror the questions the office actually asks: what came in today, what is
// still unfiled, what has nobody listened to, and everything about one job.
//
// ── `unfiled` IS THE DEFAULT WORKING VIEW ───────────────────────────────────────────────────────
//
// Not "all calls, newest first". A phone log that shows everything is a log nobody works through;
// what makes this useful is the shrinking pile of calls not yet attached to a job. `job_id IS NULL`
// has its own partial index for exactly this query.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { normalizePhone } from '@/lib/integrations/google/hash';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const SELECT =
  'id, provider_call_sid, direction, status, from_number, to_number, caller_name, started_at, ' +
  'answered_at, ended_at, duration_seconds, is_voicemail, voicemail_reason, recording_path, ' +
  'recording_seconds, transcript, transcript_status, summary, summary_json, summary_status, ' +
  'job_id, matched_kind, matched_id, matched_label, handled_by, assigned_to, notes, reviewed_at, reviewed_by';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(sp.get('limit')) || DEFAULT_LIMIT));
  const offset = Math.max(0, Number(sp.get('offset')) || 0);

  let q = supabaseAdmin.from('calls').select(SELECT, { count: 'exact' }).is('deleted_at', null);

  const view = sp.get('view');
  if (view === 'unfiled') q = q.is('job_id', null);
  if (view === 'unread') q = q.is('reviewed_at', null);
  if (view === 'voicemail') q = q.eq('is_voicemail', true);

  const direction = sp.get('direction');
  if (direction === 'inbound' || direction === 'outbound') q = q.eq('direction', direction);

  const jobId = sp.get('jobId');
  if (jobId) q = q.eq('job_id', jobId);

  const from = sp.get('from');
  const to = sp.get('to');
  if (from) q = q.gte('started_at', `${from}T00:00:00.000Z`);
  if (to) q = q.lte('started_at', `${to}T23:59:59.999Z`);

  // A phone-number search is normalised first, so typing "(512) 555-0143" finds a row stored as
  // +15125550143. Without this the search box silently returns nothing for the format people
  // actually type, which reads as "we have no record of that caller".
  const number = sp.get('number');
  if (number) {
    const e164 = normalizePhone(number);
    const digits = (e164 ?? number).replace(/\D/g, '').slice(-10);
    if (digits.length >= 4) q = q.or(`from_number.ilike.%${digits}%,to_number.ilike.%${digits}%`);
  }

  // Free-text search across what was said. `q` is escaped for PostgREST's or() separators — an
  // unescaped comma or period is read as extra filter terms and quietly returns a different set.
  const text = sp.get('q');
  if (text) {
    const safe = text.replace(/[,.()]/g, ' ').replace(/[%_]/g, (m) => `\\${m}`).trim();
    if (safe) q = q.or(`transcript.ilike.%${safe}%,summary.ilike.%${safe}%,caller_name.ilike.%${safe}%`);
  }

  const { data, error, count } = await q
    .order('started_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    calls: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  });
}, { routeName: 'admin/phone/calls' });
