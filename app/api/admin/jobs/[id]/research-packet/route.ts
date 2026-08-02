// app/api/admin/jobs/[id]/research-packet/route.ts — the packet, reachable from the job (plan R26).
//
// `research_projects.job_id` has been written on project creation since the table existed and read
// by nothing. Everything R13–R25 produced lived behind `/admin/research/<uuid>`, a screen a field
// crew has no reason to open. This is the crew-facing read: give it a job id, get the approved
// packet — or an honest statement of why there is not one.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { supabaseAdmin } from '@/lib/supabase';
import { fieldBrief, fieldHighlights, jobPacketStatus, type PacketRow } from '@/lib/research/job-packet';

function extractJobId(req: NextRequest): string | null {
  const after = req.nextUrl.pathname.split('/jobs/')[1];
  return after ? after.split('/')[0] || null : null;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const jobId = extractJobId(req);
  if (!jobId) return NextResponse.json({ error: 'Job ID required' }, { status: 400 });

  const { data: projects, error: projErr } = await supabaseAdmin
    .from('research_projects')
    .select('id')
    .eq('job_id', jobId);

  // A failed read is not "no research". A crew told there is nothing when a packet was approved
  // drives out and repeats work somebody already did.
  if (projErr) {
    return NextResponse.json(
      { error: 'The research for this job could not be read. This is not the same as there being none.' },
      { status: 500 },
    );
  }

  const projectIds = ((projects ?? []) as Array<{ id: string }>).map((p) => p.id);

  let packets: PacketRow[] = [];
  if (projectIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from('research_packets')
      .select('id, research_project_id, version, title, status, approved_by, approved_at, rendered_json')
      .in('research_project_id', projectIds)
      .order('approved_at', { ascending: false });
    if (error) {
      return NextResponse.json(
        { error: 'The research packets could not be read. This is not the same as there being none.' },
        { status: 500 },
      );
    }
    packets = (data ?? []) as PacketRow[];
  }

  const status = jobPacketStatus(projectIds, packets);
  const brief = fieldBrief(status.packet);

  return NextResponse.json(
    {
      ...status,
      brief,
      // The two things a crew reads first, lifted out — a packet with fifty facts buries them, and
      // nobody scrolls for them on a phone in a truck.
      highlights: fieldHighlights(brief),
      pdfUrl: status.packet
        ? `/api/admin/research/${status.packet.research_project_id}/packets/${status.packet.id}/pdf`
        : null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}, { routeName: 'jobs/research-packet' });
