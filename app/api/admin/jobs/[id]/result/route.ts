// app/api/admin/jobs/[id]/result/route.ts
//
// Sets the pipeline-outcome on a job. Result ∈ {won, lost, abandoned}
// or null (clears the result, returning the job to "still active").
// Writes an audit_log entry on every change. Admin-only, org-scoped.
//
// Phase R-10 of OWNER_REPORTS.md.

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

const VALID_RESULTS = ['won', 'lost', 'abandoned'] as const;
type Result = (typeof VALID_RESULTS)[number];

interface RouteContext { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: user } = await supabaseAdmin
    .from('registered_users')
    .select('default_org_id')
    .eq('email', session.user.email)
    .maybeSingle();
  if (!user?.default_org_id) return NextResponse.json({ error: 'No org' }, { status: 403 });

  const { data: membership } = await supabaseAdmin
    .from('organization_members')
    .select('role')
    .eq('org_id', user.default_org_id)
    .eq('user_email', session.user.email)
    .maybeSingle();
  if (!membership || membership.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — admins only' }, { status: 403 });
  }

  const { id } = await ctx.params;

  let body: { result?: string | null; reason?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const result = body.result === null || body.result === '' ? null : (body.result as Result);
  if (result !== null && !VALID_RESULTS.includes(result)) {
    return NextResponse.json({ error: `result must be null or one of: ${VALID_RESULTS.join(', ')}` }, { status: 400 });
  }
  if ((result === 'lost' || result === 'abandoned') && !body.reason?.trim()) {
    return NextResponse.json({ error: 'reason required when marking lost or abandoned' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    result,
    result_set_at: result === null ? null : new Date().toISOString(),
    result_reason: result === null ? null : body.reason?.trim() ?? null,
  };

  const { data: updated, error } = await supabaseAdmin
    .from('jobs')
    .update(patch)
    .eq('id', id)
    .eq('org_id', user.default_org_id)
    .select('id, name, result')
    .maybeSingle();

  if (error || !updated) {
    console.error('[jobs/:id/result] update failed', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }

  await supabaseAdmin.from('audit_log').insert({
    org_id: user.default_org_id,
    customer_email: session.user.email,
    action: result === null ? 'JOB_RESULT_CLEARED' : `JOB_MARKED_${result.toUpperCase()}`,
    severity: 'info',
    metadata: { job_id: id, job_name: updated.name, result, reason: body.reason ?? null },
  });

  return NextResponse.json({ ok: true, result: updated.result });
}
