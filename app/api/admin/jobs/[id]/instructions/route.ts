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
import {
  resolveInstructions, brokenInstructionRefs, canReadInstructions, canWriteInstructions,
} from '@/lib/jobs/instructions';
import { notifyJobEvent } from '@/lib/notifications/job-event';

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

/**
 * Is this person on THIS job's crew?
 *
 * ── THE CREW COULD NOT READ THE INSTRUCTIONS WRITTEN FOR THEM (fixed 2026-08-14) ────────────────
 *
 * Read access was `orgMember()` alone, which needs BOTH a `registered_users.default_org_id` AND a
 * matching `organization_members` row. The firm's only `field_crew` user has neither — so
 * `GET /api/admin/jobs/<id>/instructions` returned 403 for him, and Work Mode's Instructions tab
 * (which calls exactly this route) showed *"Could not load instructions."*
 *
 * The whole feature exists so the crew reads it on the truck. Its entire audience was locked out,
 * and nobody found out because the office side — every admin has an org row — worked perfectly.
 *
 * Being on the job's crew is a STRONGER claim to that job's instructions than generic org
 * membership, not a weaker one: it names this job rather than every job in the tenant. So it is an
 * additional path to read, not a relaxation of the org rule — and it is READ ONLY. Authoring stays
 * lead-RPLS-or-admin, unchanged.
 *
 * The underlying data gap is real and still wants fixing (a crew member with no org row also
 * cannot see anything else org-scoped). This makes the feature correct regardless.
 */
async function onJobCrew(jobId: string, email: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('job_team')
    .select('id')
    .eq('job_id', jobId)
    .eq('user_email', email)
    // Same definition of "on the job" as lib/notifications/job-event.ts: removed and declined are
    // both exits, and only checking one of them is how the stage notifier used to leak.
    .is('removed_at', null)
    .is('declined_at', null)
    .maybeSingle();
  return Boolean(data);
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

  const { id } = await ctx.params;
  const { data: job } = await supabaseAdmin
    .from('jobs').select('id, org_id, instructions, lead_rpls_email').eq('id', id).maybeSingle();
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  // Two ways to be allowed to read: a member of the job's org, or on the job's crew. See
  // `onJobCrew` — the second is why the field crew can see this at all.
  const member = await orgMember(session.user.email);
  const sameOrg = Boolean(member && (job as { org_id: string }).org_id === member.orgId);
  const actor = {
    orgRole: member?.role ?? null,
    sameOrg,
    onCrew: sameOrg ? false : await onJobCrew(id, session.user.email),
    isLeadRpls: (job as { lead_rpls_email: string | null }).lead_rpls_email === session.user.email,
  };
  if (!canReadInstructions(actor)) {
    // Deliberately 404, not 403: to somebody with no claim on this job, its existence is not their
    // business either. An org member on the wrong tenant's job gets the same answer.
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const text = (job as { instructions: string | null }).instructions ?? '';
  const files = await jobFiles(id);
  const segments = resolveInstructions(text, files, (f) => (f as { url?: string | null }).url ?? null);
  return NextResponse.json({ instructions: text, segments, canEdit: canWriteInstructions(actor) });
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

  // N2 (2026-08-14) — the crew reads these before they leave, so a change to them is the single most
  // worth-knowing thing that can happen to a job they are on. `high`, unlike most job events: this is
  // the one where finding out late means driving somewhere with the wrong instructions.
  await notifyJobEvent(
    id,
    {
      kind: 'instructions_changed',
      title: 'Field instructions updated',
      body: 'Read them before you head out.',
      link: `/admin/jobs/${id}`,
      escalation: 'high',
    },
    session.user.email,
  );

  // Warn the RPLS if any embedded file link points at a file that isn't on the job (removed/typo'd).
  const files = await jobFiles(id);
  const broken = brokenInstructionRefs(text, files.map((f) => f.id));
  return NextResponse.json({ ok: true, brokenRefs: broken });
}
