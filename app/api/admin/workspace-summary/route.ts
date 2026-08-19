// app/api/admin/workspace-summary/route.ts — the numbers a workspace landing shows (audit §2.1).
//
// GET ?workspace=work|office|research-cad → { stats: [{ label, value, href }] }
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
//
// §2.1 counted four competing "home" concepts, and three of them were the workspace landings, which
// rendered the sentence *"Phase 4 adds at-a-glance widgets here; for now this lists every accessible
// page."* Phase 4 arrived. A page that tells the reader it is unfinished is worse than a plain
// directory: it teaches them not to come back.
//
// ── COUNTS, NOT ROWS ────────────────────────────────────────────────────────────────────────────
//
// Every query here is `head: true` with `count: 'exact'` — Postgres returns the number and no data.
// A landing page is the second thing loaded on almost every navigation, and pulling rows to call
// `.length` on them would move real payloads across the wire to render a single integer.
//
// ── A FAILED COUNT IS OMITTED, NOT ZEROED ───────────────────────────────────────────────────────
//
// A stat that reads "0 open jobs" because a query errored is a lie that looks like good news — the
// same defect §1.1b, the compliance all-clear and the receivables page each shipped. A count that
// could not be taken is left out of the response entirely.
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { supabaseAdmin } from '@/lib/supabase';

export interface WorkspaceStat {
  label: string;
  value: number;
  href: string;
  /** 'attention' renders warm — a number somebody should do something about. */
  tone?: 'neutral' | 'attention';
}

type Counter = () => Promise<WorkspaceStat | null>;

/** One count, or nothing. `null` on any error, which the caller drops rather than rendering as 0. */
function counter(
  label: string,
  href: string,
  build: () => PromiseLike<{ count: number | null; error: unknown }>,
  tone: WorkspaceStat['tone'] = 'neutral',
): Counter {
  return async () => {
    try {
      const { count, error } = await build();
      if (error || count === null) return null;
      return { label, value: count, href, tone };
    } catch {
      return null;
    }
  };
}

const COUNTERS: Record<string, Counter[]> = {
  work: [
    // First, because a project is now the unit of work the firm takes on — a job is a step inside
    // one. Counting jobs without counting projects would report the parts and not the whole.
    counter('Active projects', '/admin/projects', () =>
      supabaseAdmin
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('is_archived', false)
        .eq('status', 'active'),
    ),
    counter('Active jobs', '/admin/jobs', () =>
      supabaseAdmin
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('is_archived', false)
        .not('stage', 'in', '("delivered","cancelled")'),
    ),
    counter('Priority jobs', '/admin/jobs', () =>
      supabaseAdmin
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('is_archived', false)
        .eq('is_priority', true),
      'attention',
    ),
    // Media stuck mid-upload, not "points collected". A count of points is a vanity number; a count
    // of captures that never finished landing is a thing somebody has to go and fix.
    counter('Uploads unfinished', '/admin/field-data', () =>
      supabaseAdmin
        .from('field_media')
        .select('id', { count: 'exact', head: true })
        .neq('upload_state', 'uploaded'),
      'attention',
    ),
  ],
  office: [
    counter('Open leads', '/admin/leads', () =>
      supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }).not('status', 'in', '("won","lost")'),
    ),
  ],
  // Money in, money out, and the one number that decides whether the firm is being paid — the three
  // things §2.2's four sections exist to separate.
  money: [
    counter('Unpaid invoices', '/admin/invoicing', () =>
      supabaseAdmin
        .from('customer_invoices')
        .select('id', { count: 'exact', head: true })
        .in('status', ['sent', 'overdue', 'partial'])
        .is('voided_at', null),
    ),
    counter('Past due', '/admin/receivables', () =>
      supabaseAdmin
        .from('customer_invoices')
        .select('id', { count: 'exact', head: true })
        .is('paid_at', null)
        .is('voided_at', null)
        .lt('due_at', new Date().toISOString()),
      'attention',
    ),
    counter('Receipts to approve', '/admin/receipts', () =>
      supabaseAdmin.from('receipts').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      'attention',
    ),
  ],
  'research-cad': [
    counter('Research in progress', '/admin/research', () =>
      supabaseAdmin
        .from('research_projects')
        .select('id', { count: 'exact', head: true })
        .is('archived_at', null)
        .is('completed_at', null),
    ),
    counter('Completed', '/admin/research', () =>
      supabaseAdmin.from('research_projects').select('id', { count: 'exact', head: true }).not('completed_at', 'is', null),
    ),
  ],
  equipment: [
    counter('Checked out', '/admin/equipment', () =>
      supabaseAdmin.from('equipment_assignments').select('id', { count: 'exact', head: true }).is('checked_in_at', null),
    ),
    counter('Overdue back', '/admin/equipment', () =>
      supabaseAdmin
        .from('equipment_assignments')
        .select('id', { count: 'exact', head: true })
        .is('checked_in_at', null)
        .lt('expected_back_at', new Date().toISOString()),
      'attention',
    ),
  ],
};

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const workspace = new URL(req.url).searchParams.get('workspace') ?? '';
  const counters = COUNTERS[workspace];
  // Not an error: `hub` and `knowledge` have their own landings and no counters here. An empty list
  // renders as no strip at all, which is the honest shape for "this workspace has no queue".
  if (!counters) return NextResponse.json({ stats: [] });

  const settled = await Promise.all(counters.map((c) => c()));
  return NextResponse.json(
    { stats: settled.filter((s): s is WorkspaceStat => s !== null) },
    { headers: { 'Cache-Control': 'private, max-age=30' } },
  );
});
