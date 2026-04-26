// app/api/admin/receipts/route.ts — Admin list of all receipts
//
// Phase F2 #5 — bookkeeper approval queue.
//
// GET /api/admin/receipts?status=pending&from=2026-04-01&to=2026-04-30
//   - status:   one of pending | approved | rejected | exported (omit for all)
//   - from/to:  YYYY-MM-DD bounds on receipts.transaction_at OR (when null)
//               receipts.created_at — bookkeepers want "April expenses" even
//               for receipts that lack an extracted transaction date.
//   - email:    filter to a single submitter
//   - jobId:    filter to a single job
//
// Mobile receipts carry user_id (UUID) but the bookkeeper UI works in
// emails. We bulk-look-up auth.users via the service role and annotate
// each row with submitted_by_email + submitted_by_name. A
// per-job-id annotation pulls job.name + job_number for display.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface ReceiptRow {
  id: string;
  user_id: string | null;
  job_id: string | null;
  job_time_entry_id: string | null;
  vendor_name: string | null;
  vendor_address: string | null;
  transaction_at: string | null;
  subtotal_cents: number | null;
  tax_cents: number | null;
  tip_cents: number | null;
  total_cents: number | null;
  payment_method: string | null;
  payment_last4: string | null;
  category: string | null;
  category_source: string | null;
  tax_deductible_flag: string | null;
  notes: string | null;
  photo_url: string | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  extraction_status: string | null;
  extraction_error: string | null;
  extraction_cost_cents: number | null;
  ai_confidence_per_field: Record<string, number> | null;
  created_at: string;
  updated_at: string | null;
}

export interface AdminReceiptRow extends ReceiptRow {
  /** Joined from auth.users — bookkeeper-friendly view of who submitted. */
  submitted_by_email: string | null;
  submitted_by_name: string | null;
  /** Joined from jobs — saves the UI from a per-row fetch. */
  job_name: string | null;
  job_number: string | null;
  /** Pre-signed photo URL valid for 15 min. Null if signing failed. */
  photo_signed_url: string | null;
}

const SIGNED_URL_TTL_SEC = 60 * 15;
const STORAGE_BUCKET = 'starr-field-receipts';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const email = searchParams.get('email');
  const jobId = searchParams.get('jobId');
  // Cap at 500: bookkeeper queue rarely needs more in one page — a
  // tighter date range is the recommended path for big exports. The
  // client default of 100 fits ~3 screens of rows.
  const limit = Math.max(1, Math.min(500, parseInt(searchParams.get('limit') ?? '100', 10)));

  // When the bookkeeper filters by submitter email, resolve to the
  // matching auth.users.id BEFORE running the Postgres query so the
  // .limit applies to that user's receipts only. Without this, the
  // .limit caps the org-wide result first and the email filter
  // post-trims — which can return zero rows for valid users whose
  // receipts are deeper than the cap.
  let resolvedUserId: string | null | undefined = undefined;
  if (email) {
    resolvedUserId = await resolveUserIdByEmail(email);
    if (!resolvedUserId) {
      // No user with that email — return empty result but keep the
      // counters shape so the UI doesn't blow up.
      return NextResponse.json({
        receipts: [],
        counters: { pending: 0, approved: 0, rejected: 0, exported: 0, total: 0 },
      });
    }
  }

  let query = supabaseAdmin
    .from('receipts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) query = query.eq('status', status);
  if (jobId) query = query.eq('job_id', jobId);
  if (resolvedUserId) query = query.eq('user_id', resolvedUserId);
  if (from) {
    // Date filter applies to created_at only — see the in-line note
    // on the export route for the reasoning. Bookkeepers rarely care
    // about a single-day boundary cliff.
    query = query.gte('created_at', `${from}T00:00:00.000Z`);
  }
  if (to) {
    query = query.lte('created_at', `${to}T23:59:59.999Z`);
  }

  const { data: rows, error } = await query;
  if (error) {
    // withErrorHandler only catches throws — Supabase returning a
    // typed error object lands here. Log it so ops can correlate
    // bookkeeper-visible 500s with the underlying Postgres / PostgREST
    // message + code.
    console.error('[admin/receipts] list failed', {
      error: error.message,
      code: (error as { code?: string }).code ?? null,
      status,
      from,
      to,
      email,
      jobId,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const receiptRows = (rows ?? []) as ReceiptRow[];

  // Bulk-lookup user emails + names for every distinct user_id in the
  // result set. auth.admin.listUsers paginates; for the bookkeeper
  // queue we expect <100 distinct submitters, so one page suffices.
  const userIds = unique(receiptRows.map((r) => r.user_id).filter(isString));
  const userMap = await buildUserLookup(userIds);

  // Same idea for jobs — one fetch covers the page.
  const jobIds = unique(receiptRows.map((r) => r.job_id).filter(isString));
  const jobMap = await buildJobLookup(jobIds);

  // (No more post-filter — resolvedUserId already constrained the query.)
  const filtered = receiptRows;

  // Generate signed photo URLs in parallel. Failure is non-fatal —
  // the row still renders with a "photo unavailable" placeholder. We
  // log the FIRST FEW failures per request so a misconfigured bucket
  // policy is visible in worker logs without the page-load flooding
  // them.
  let signFailuresLogged = 0;
  const signed = await Promise.all(
    filtered.map(async (r) => {
      if (!r.photo_url) return null;
      const { data, error: signErr } = await supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(r.photo_url, SIGNED_URL_TTL_SEC);
      if (signErr) {
        if (signFailuresLogged < 3) {
          console.warn('[admin/receipts] sign failed', {
            path: r.photo_url,
            error: signErr.message,
          });
          signFailuresLogged += 1;
        }
        return null;
      }
      return data?.signedUrl ?? null;
    })
  );

  const annotated: AdminReceiptRow[] = filtered.map((r, idx) => {
    const user = r.user_id ? userMap.get(r.user_id) : undefined;
    const job = r.job_id ? jobMap.get(r.job_id) : undefined;
    return {
      ...r,
      submitted_by_email: user?.email ?? null,
      submitted_by_name: user?.name ?? null,
      job_name: job?.name ?? null,
      job_number: job?.job_number ?? null,
      photo_signed_url: signed[idx] ?? null,
    };
  });

  // Aggregate counters for the header — useful for "12 awaiting review."
  const counters = {
    pending: receiptRows.filter((r) => r.status === 'pending').length,
    approved: receiptRows.filter((r) => r.status === 'approved').length,
    rejected: receiptRows.filter((r) => r.status === 'rejected').length,
    exported: receiptRows.filter((r) => r.status === 'exported').length,
    total: receiptRows.length,
  };

  return NextResponse.json({
    receipts: annotated,
    counters,
  });
});

/**
 * Lookup a single auth.users.id by email. Returns null when no user
 * matches. Used by the email filter so we can constrain the Postgres
 * query BEFORE the LIMIT runs — see comment on the call site.
 */
async function resolveUserIdByEmail(email: string): Promise<string | null> {
  const lower = email.trim().toLowerCase();
  if (!lower) return null;
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error || !data) {
    // Distinguish "user not found" (returns null naturally below) from
    // "listUsers failed" (also returns null but for a different reason).
    // Without this log, a throttled / outaged listUsers makes a valid
    // bookkeeper query appear as "no receipts for this email."
    console.error(
      '[admin/receipts] listUsers failed during email resolve',
      { error: error?.message ?? null, email: lower }
    );
    return null;
  }
  const match = data.users.find((u) => u.email?.toLowerCase() === lower);
  return match?.id ?? null;
}

interface UserInfo {
  email: string | null;
  name: string | null;
}

async function buildUserLookup(userIds: string[]): Promise<Map<string, UserInfo>> {
  const out = new Map<string, UserInfo>();
  if (userIds.length === 0) return out;

  // listUsers is paginated; one page (1000 default) covers the
  // entire surveyor team. If Starr Surveying ever exceeds that we
  // can switch to per-id getUserById in a Promise.all.
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error || !data) return out;

  const wanted = new Set(userIds);
  for (const u of data.users) {
    if (!wanted.has(u.id)) continue;
    const meta = (u.user_metadata ?? {}) as { full_name?: string; name?: string };
    out.set(u.id, {
      email: u.email ?? null,
      name: meta.full_name ?? meta.name ?? null,
    });
  }
  return out;
}

interface JobInfo {
  name: string | null;
  job_number: string | null;
}

async function buildJobLookup(jobIds: string[]): Promise<Map<string, JobInfo>> {
  const out = new Map<string, JobInfo>();
  if (jobIds.length === 0) return out;

  const { data, error } = await supabaseAdmin
    .from('jobs')
    .select('id, name, job_number')
    .in('id', jobIds);
  if (error || !data) return out;

  for (const j of data as Array<{ id: string; name: string | null; job_number: string | null }>) {
    out.set(j.id, { name: j.name, job_number: j.job_number });
  }
  return out;
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function isString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}
