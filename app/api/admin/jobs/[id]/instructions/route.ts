// app/api/admin/jobs/[id]/instructions/route.ts — the Work Mode JOB INSTRUCTIONS surface (Area D5, owner
// 2026-07-18: "a page where the RPLS can clearly list out all of the instructions for the job … hyperlink
// files/documents/images in the instructions").
//
//   • GET — any org member on the job reads the instructions: raw text + the RESOLVED segments (each
//     [label](job-file:<id>) embed attached to its job_files name+url, or flagged broken if the file is gone),
//     so web + mobile render from the one server-side resolve.
//   • PUT { instructions } — the job's lead RPLS (or an org admin) saves the text. The response warns which
//     referenced files no longer exist (brokenInstructionRefs) so a dead link is caught at save time.
//
// Text is stored in jobs.instructions (seed 452); parsing/resolving is the pure lib/jobs/instructions.ts.
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveInstructions, brokenInstructionRefs } from '@/lib/jobs/instructions';

export const runtime = 'nodejs';

interface RouteContext { params: Promise<{ id: string }> }

async function orgMember(email: string): Promise<{ orgId: string; role: string } | null> {
  const { data: user } = await supabaseAdmin
    .from('registered_users').select('default_org_id').eq('email', email).maybeSingle();
  if (!user?.default_org_id) return null;
  const { data: m } = await supabaseAdmin
    .from('organization_members').select('role').eq('org_id', user.default_org_id).eq('user_email', email).maybeSingle();
  if (!m) return null;
  return { orgId: user.default_org_id as string, role: (m as { role: string }).role };
}

/** The job's files, shaped for the instructions resolver (name + url). */
async function jobFiles(jobId: string): Promise<{ id: string; name: string | null; url: string | null }[]> {
  const { data } = await supabaseAdmin
    .from('job_files')
    .select('id, name, file_name, file_url')
    .eq('job_id', jobId)
    .neq('is_deleted', true);
  return ((data ?? []) as { id: string; name: string | null; file_name: string | null; file_url: string | null }[])
    .map((f) => ({ id: f.id, name: f.name ?? f.file_name ?? null, url: f.file_url ?? null }));
}

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const member = await orgMember(session.user.email);
  if (!member) return NextResponse.json({ error: 'No org' }, { status: 403 });

  const { id } = await ctx.params;
  const { data: job } = await supabaseAdmin
    .from('jobs').select('id, org_id, instructions, lead_rpls_email').eq('id', id).maybeSingle();
  if (!job || (job as { org_id: string }).org_id !== member.orgId) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  const text = (job as { instructions: string | null }).instructions ?? '';
  const files = await jobFiles(id);
  const segments = resolveInstructions(text, files, (f) => (f as { url?: string | null }).url ?? null);
  const canEdit = member.role === 'admin' || (job as { lead_rpls_email: string | null }).lead_rpls_email === session.user.email;
  return NextResponse.json({ instructions: text, segments, canEdit });
}

export async function PUT(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const member = await orgMember(session.user.email);
  if (!member) return NextResponse.json({ error: 'No org' }, { status: 403 });

  const { id } = await ctx.params;
  const { data: job } = await supabaseAdmin
    .from('jobs').select('id, org_id, lead_rpls_email').eq('id', id).maybeSingle();
  if (!job || (job as { org_id: string }).org_id !== member.orgId) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  // Only the job's lead RPLS or an org admin authors instructions.
  const isLead = (job as { lead_rpls_email: string | null }).lead_rpls_email === session.user.email;
  if (member.role !== 'admin' && !isLead) {
    return NextResponse.json({ error: 'Only the job’s lead RPLS (or an admin) can edit instructions.' }, { status: 403 });
  }

  let body: { instructions?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (typeof body.instructions !== 'string') {
    return NextResponse.json({ error: 'instructions (string) is required.' }, { status: 400 });
  }
  const text = body.instructions;

  const { error } = await supabaseAdmin.from('jobs').update({ instructions: text }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Warn the RPLS if any embedded file link points at a file that isn't on the job (removed/typo'd).
  const files = await jobFiles(id);
  const broken = brokenInstructionRefs(text, files.map((f) => f.id));
  return NextResponse.json({ ok: true, brokenRefs: broken });
}
