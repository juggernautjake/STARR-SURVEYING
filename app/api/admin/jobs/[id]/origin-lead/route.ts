// app/api/admin/jobs/[id]/origin-lead/route.ts
//
// LR6 of lead-reply-expansion-2026-06-18.md — returns the lead that was
// converted into this job, so the job page can render an "Originating
// inquiry" back-link card. The relationship is one-way today
// (leads.converted_job_id → jobs.id), so we look up the lead by that FK.
//
//   GET /api/admin/jobs/{id}/origin-lead
//        → { lead: { id, name, status, reference_number, last_replied_at? } | null }
//
// Auth: admin only.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { extractRefNumber } from '@/lib/leads/templates';

interface OriginLeadRow {
  id: string;
  name: string;
  status: string;
  notes: string | null;
}

function jobIdFromPath(req: NextRequest): string | null {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const idIdx = segments.indexOf('origin-lead') - 1;
  return idIdx >= 0 ? segments[idIdx] : null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const jobId = jobIdFromPath(req);
  if (!jobId) return NextResponse.json({ error: 'Missing job id' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('id, name, status, notes')
    .eq('converted_job_id', jobId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ lead: null });

  const lead = data as OriginLeadRow;

  // Count of recorded outbound replies + last sent_at so the card
  // can show "5 replies · last 2d ago".
  const { count: replyCount } = await supabaseAdmin
    .from('lead_replies')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', lead.id);

  const { data: latestReply } = await supabaseAdmin
    .from('lead_replies')
    .select('sent_at')
    .eq('lead_id', lead.id)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Same for notes — lets the card hint at the office's running log
  // without leaking the bodies (which can be sensitive).
  const { count: notesCount } = await supabaseAdmin
    .from('lead_notes')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', lead.id);

  return NextResponse.json({
    lead: {
      id: lead.id,
      name: lead.name,
      status: lead.status,
      reference_number: extractRefNumber(lead.notes),
      reply_count: replyCount ?? 0,
      notes_count: notesCount ?? 0,
      last_replied_at: (latestReply as { sent_at?: string } | null)?.sent_at ?? null,
    },
  });
}, { routeName: 'admin/jobs/[id]/origin-lead' });
