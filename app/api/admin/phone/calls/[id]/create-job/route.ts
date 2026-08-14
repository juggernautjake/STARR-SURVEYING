// app/api/admin/phone/calls/[id]/create-job/route.ts — slice L2 of
// docs/planning/in-progress/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
//
// Owner, 2026-08-14: *"we can use a call to create a new job."*
//
// The half of the feature that justified making `calls` its own table: a call arrives before anyone
// knows what it is about, and sometimes what it is about is a job that does not exist yet.
//
// ── IT CREATES A LEAD, NOT A JOB ────────────────────────────────────────────────────────────────
//
// Reading the request literally would insert a `jobs` row from a voicemail. That is wrong for this
// business: a job here has a number, a client, a scope and a price, and it is the unit the firm
// bills against. Minting one from a two-line voicemail creates a job with no scope and no agreed
// price, which then has to be either completed by hand or deleted — and a deleted job burns a job
// number.
//
// A lead is exactly the right shape: an enquiry that has not become work yet. And the lead → job
// conversion already exists, already carries contacts, quote and attachments across
// (`lib/leads/carry-over.ts`), and is where somebody sets the scope and the price. So this creates
// the lead and hands over to the flow that was already built for this.
//
// The call is linked to the lead immediately, so the two never drift apart.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { idFromPath } from '@/lib/phone/route-params';

interface CallSummaryJson {
  caller?: string | null;
  wanted?: string | null;
  callbackNumber?: string | null;
  referencedJob?: string | null;
  nextStep?: string | null;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = idFromPath(req.url, 1);
  if (!id) return NextResponse.json({ error: 'Bad call id.' }, { status: 400 });

  const { data: callRow, error: readErr } = await supabaseAdmin
    .from('calls')
    .select('id, from_number, caller_name, summary, summary_json, transcript, lead_id, started_at')
    .eq('id', id)
    .maybeSingle();

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!callRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const call = callRow as {
    id: string; from_number: string | null; caller_name: string | null;
    summary: string | null; summary_json: CallSummaryJson | null; transcript: string | null;
    lead_id: string | null; started_at: string;
  };

  // Idempotent: clicking twice must not create two leads for one voicemail. The second click
  // returns the first lead rather than an error, because the user's intent is "get me to the lead
  // for this call" either way.
  if (call.lead_id) {
    const { data: existing } = await supabaseAdmin
      .from('leads').select('id, name, phone, status').eq('id', call.lead_id).maybeSingle();
    if (existing) return NextResponse.json({ lead: existing, created: false });
  }

  const body = (await req.json().catch(() => ({}))) as { name?: string; phone?: string; notes?: string };
  const s = call.summary_json ?? {};

  const name = (body.name ?? '').trim() || s.caller || call.caller_name || 'Caller from voicemail';
  // The number they SPOKE takes precedence over the caller ID: people ring from a job site and ask
  // to be called back on the office line.
  const phone = (body.phone ?? '').trim() || s.callbackNumber || call.from_number || null;

  const notes = [
    body.notes?.trim(),
    s.wanted ? `Wanted: ${s.wanted}` : null,
    s.referencedJob ? `Referenced: ${s.referencedJob}` : null,
    s.nextStep ? `Next step: ${s.nextStep}` : null,
    call.summary ? `\nSummary of the call:\n${call.summary}` : null,
  ].filter(Boolean).join('\n');

  const { data: lead, error: insertErr } = await supabaseAdmin
    .from('leads')
    .insert({
      name,
      phone,
      // 'Phone' rather than 'phone': the column is free text and the rows already in it are
      // 'Website' and 'Pricing Calculator'. A lowercase variant would read as a second, different
      // source in every group-by the office runs. It is also the column's own default.
      source: 'Phone',
      status: 'new',
      notes: notes || null,
      created_by: session.user.email,
      // org_id, attachments and updated_at are all NOT NULL with defaults — deliberately left to
      // the database rather than guessed at here.
    })
    .select('id, name, phone, status')
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  await supabaseAdmin
    .from('calls')
    .update({ lead_id: (lead as { id: string }).id, updated_at: new Date().toISOString() })
    .eq('id', call.id);

  return NextResponse.json({ lead, created: true });
}, { routeName: 'admin/phone/calls/[id]/create-job' });
