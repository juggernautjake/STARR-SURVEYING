// lib/ai/context.ts — what the assistant knows about you before you say anything (audit §5).
//
// §5's first complaint, and the one that matters most:
//
//   *"No assistant knows anything about your data. The work-mode field assistant is a stateless chat
//    with a system prompt. It cannot see the crew's active job, cannot clock them in, cannot look up
//    which total station is checked out. It answers trig questions. That is a calculator with
//    manners, not an assistant."*
//
// And the third: *"No shared context layer. Nothing assembles 'who is this user, what role, what job
// are they on, what's on their plate' into a reusable digest — even though the D&D side already
// proved this pattern works (`characterDigest` + grounding blocks)."*
//
// This is that digest.
//
// ── IT IS A DIGEST, NOT A DUMP ──────────────────────────────────────────────────────────────────
//
// The temptation is to send everything and let the model sort it out. That fails in three ways at
// once: it costs input tokens on every turn, it buries the two facts that matter under forty that
// do not, and it leaks — a field crew member's assistant would be reading job financials because
// nobody filtered the query (Q51 asks exactly this). So the digest is small, role-filtered, and
// assembled from queries that already respect the tenant scope.
//
// ── EVERY QUERY GOES THROUGH THE SCOPED CLIENT ──────────────────────────────────────────────────
//
// `supabaseAdmin` is org-scoped (audit item 8g), so a digest built here cannot cross a tenant
// boundary even if a future field forgets to filter. That is the whole reason the scope lives in the
// client rather than in each call site.

import { supabaseAdmin } from '@/lib/supabase';
import type { UserRole } from '@/lib/auth';
import { getTenantProfile } from '@/lib/saas/tenant-profile';

export interface AssistantContext {
  /** Who is asking. */
  user: { email: string; name: string | null; roles: UserRole[] };
  firm: { name: string; state: string };
  /** Where they are in the app, so "what is this page for" is answerable. */
  page?: { path: string; label?: string; description?: string };
  /** Are they on the clock, and since when. */
  clock: { clockedIn: boolean; since: string | null; jobName: string | null } | null;
  /** The jobs assigned to them, newest first. Capped — see the digest note. */
  jobs: Array<{ id: string; number: string | null; name: string | null; stage: string | null; address: string | null }>;
  /** Equipment currently checked out to them. */
  equipment: Array<{ name: string; serial: string | null }>;
  /** Anything expiring soon that is theirs. */
  expiring: Array<{ title: string; daysRemaining: number }>;
  /** Facts deliberately withheld for this role, named so the model can say "I can't see that"
   *  rather than inventing an answer or claiming the data does not exist. */
  withheld: string[];
}

/** Roles allowed to see money. Q51 — *"Can a field crew member's assistant read job financials?"* —
 *  is unanswered by the owner, so this takes the conservative reading: no. It is one array to change
 *  when they decide otherwise. */
const MONEY_ROLES: UserRole[] = ['admin', 'developer'];

const MAX_JOBS = 8;

export async function buildAssistantContext(input: {
  email: string;
  name?: string | null;
  roles: UserRole[];
  orgId: string | null;
  page?: { path: string; label?: string; description?: string };
}): Promise<AssistantContext> {
  const { email, roles, orgId } = input;
  const withheld: string[] = [];
  if (!roles.some((r) => MONEY_ROLES.includes(r))) {
    withheld.push('job pricing, invoices and payroll');
  }

  const [profile, clockRes, jobsRes, equipRes, complianceRes] = await Promise.all([
    getTenantProfile(orgId),
    supabaseAdmin.from('active_clock_sessions').select('clock_in_at, job_id').eq('user_email', email).maybeSingle(),
    supabaseAdmin
      .from('jobs')
      .select('id, job_number, name, stage, address, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(MAX_JOBS),
    supabaseAdmin
      .from('equipment_assignments')
      .select('equipment_inventory(name, serial_number)')
      .eq('assigned_to_email', email)
      .is('returned_at', null)
      .limit(10),
    // Only what belongs to this person. An assistant that volunteers a colleague's licence expiry is
    // a privacy incident wearing a helpful hat.
    supabaseAdmin
      .from('compliance_register')
      .select('title, expires_on, subject_kind, subject_label')
      .eq('subject_label', email)
      .not('expires_on', 'is', null)
      .limit(10),
  ]);

  const clockRow = clockRes.data as { clock_in_at: string; job_id: string | null } | null;
  let clockJobName: string | null = null;
  if (clockRow?.job_id) {
    const { data } = await supabaseAdmin.from('jobs').select('name').eq('id', clockRow.job_id).maybeSingle();
    clockJobName = (data as { name: string | null } | null)?.name ?? null;
  }

  const today = new Date();
  const expiring = ((complianceRes.data ?? []) as Array<{ title: string; expires_on: string }>)
    .map((r) => {
      const d = new Date(`${r.expires_on}T00:00:00Z`);
      const days = Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86_400_000);
      return { title: r.title, daysRemaining: days };
    })
    .filter((r) => r.daysRemaining <= 90)
    .sort((a, b) => a.daysRemaining - b.daysRemaining);

  return {
    user: { email, name: input.name ?? null, roles },
    firm: { name: profile.name, state: profile.state },
    page: input.page,
    clock: clockRow
      ? { clockedIn: true, since: clockRow.clock_in_at, jobName: clockJobName }
      : { clockedIn: false, since: null, jobName: null },
    jobs: ((jobsRes.data ?? []) as Array<{ id: string; job_number: string | null; name: string | null; stage: string | null; address: string | null }>)
      .map((j) => ({ id: j.id, number: j.job_number, name: j.name, stage: j.stage, address: j.address })),
    equipment: ((equipRes.data ?? []) as Array<{ equipment_inventory: { name: string | null; serial_number: string | null } | null }>)
      .map((e) => e.equipment_inventory)
      .filter((e): e is { name: string | null; serial_number: string | null } => !!e)
      .map((e) => ({ name: e.name ?? 'Equipment', serial: e.serial_number })),
    expiring,
    withheld,
  };
}

/** The digest as a grounding block. Plain prose rather than JSON — the D&D side's `characterDigest`
 *  established that a model follows a readable paragraph more reliably than a nested object, and a
 *  JSON blob invites the model to echo field names back at the user.
 *
 *  Empty sections are OMITTED rather than rendered as "Jobs: none". A list of absences reads as a
 *  list of things the assistant checked and failed at, and it costs tokens on every turn. */
export function renderContext(ctx: AssistantContext): string {
  const lines: string[] = [];

  lines.push(`You are the in-app assistant for ${ctx.firm.name || 'this surveying firm'}${ctx.firm.state ? `, a ${ctx.firm.state} surveying firm` : ''}.`);
  lines.push(`You are talking to ${ctx.user.name || ctx.user.email} (${ctx.user.email}), whose roles are: ${ctx.user.roles.join(', ') || 'employee'}.`);

  if (ctx.page) {
    lines.push(`They are currently on the page ${ctx.page.path}${ctx.page.label ? ` ("${ctx.page.label}")` : ''}.${ctx.page.description ? ` That page: ${ctx.page.description}` : ''}`);
  }

  if (ctx.clock?.clockedIn) {
    lines.push(`They are CLOCKED IN since ${ctx.clock.since}${ctx.clock.jobName ? ` on the job "${ctx.clock.jobName}"` : ''}.`);
  } else if (ctx.clock) {
    lines.push('They are not currently clocked in.');
  }

  if (ctx.jobs.length) {
    lines.push('Recent jobs they can see:');
    for (const j of ctx.jobs) {
      lines.push(`  - ${j.number ?? '(no number)'} · ${j.name ?? 'Untitled'}${j.address ? ` · ${j.address}` : ''}${j.stage ? ` · stage: ${j.stage}` : ''}`);
    }
  }

  if (ctx.equipment.length) {
    lines.push(`Equipment checked out to them: ${ctx.equipment.map((e) => `${e.name}${e.serial ? ` (${e.serial})` : ''}`).join(', ')}.`);
  }

  if (ctx.expiring.length) {
    lines.push('Their own dates coming up:');
    for (const e of ctx.expiring) {
      lines.push(`  - ${e.title}: ${e.daysRemaining < 0 ? `EXPIRED ${Math.abs(e.daysRemaining)} days ago` : `${e.daysRemaining} days`}`);
    }
  }

  if (ctx.withheld.length) {
    // Told to the model on purpose. Without this it either invents a figure or says the data does
    // not exist — and "we don't track that" is a worse answer to an employee than "you can't see
    // that", because one is false.
    lines.push(`You cannot see the following for this user's role: ${ctx.withheld.join('; ')}. If they ask, say plainly that you can't see it from their account rather than guessing or implying the firm does not track it.`);
  }

  return lines.join('\n');
}
