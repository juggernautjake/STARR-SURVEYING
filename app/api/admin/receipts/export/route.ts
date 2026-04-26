// app/api/admin/receipts/export/route.ts — CSV export for bookkeeping
//
// Phase F2 #7. Streams a CSV of every receipt matching the same
// filters supported by GET /api/admin/receipts (status, from, to,
// email, jobId). Output columns are deliberately flat + verbose so
// the bookkeeper can re-map into whatever QuickBooks Online / Xero /
// generic accounting CSV their workflow expects without having to
// open the receipt in the web admin to look up extra context.
//
// RFC 4180 escaping: any value containing a comma, double-quote, or
// newline is wrapped in double-quotes, with embedded double-quotes
// doubled. The header row is always emitted so a zero-row export
// still has the column list (matches mobile/lib/csvExport.ts).

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface ReceiptRow {
  id: string;
  user_id: string | null;
  job_id: string | null;
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
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  extraction_status: string | null;
  extraction_cost_cents: number | null;
  created_at: string;
}

const HEADERS = [
  'receipt_id',
  'date',
  'submitted_at',
  'submitted_by_email',
  'submitted_by_name',
  'vendor_name',
  'vendor_address',
  'subtotal',
  'tax',
  'tip',
  'total',
  'payment_method',
  'payment_last4',
  'category',
  'category_source',
  'tax_deductible_flag',
  'job_number',
  'job_name',
  'status',
  'approved_by_email',
  'approved_at',
  'rejected_reason',
  'ai_extraction_status',
  'ai_extraction_cost_cents',
  'notes',
] as const;

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
  // Cap export size — protects the bookkeeper from pulling 100K rows
  // and timing out the response. They can tighten the date range to
  // get more.
  const maxRows = Math.min(
    5000,
    Math.max(1, parseInt(searchParams.get('limit') ?? '5000', 10))
  );

  let query = supabaseAdmin
    .from('receipts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(maxRows);

  if (status) query = query.eq('status', status);
  if (jobId) query = query.eq('job_id', jobId);
  if (from) query = query.gte('created_at', `${from}T00:00:00.000Z`);
  if (to) query = query.lte('created_at', `${to}T23:59:59.999Z`);

  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  let receiptRows = (rows ?? []) as ReceiptRow[];

  // Pull user + job lookups in two bulk queries so we don't N+1.
  const userIds = unique(receiptRows.map((r) => r.user_id).filter(isString));
  const userMap = await buildUserLookup(userIds);

  const jobIds = unique(receiptRows.map((r) => r.job_id).filter(isString));
  const jobMap = await buildJobLookup(jobIds);

  // Same approver lookup so we can render the email instead of a UUID.
  const approverIds = unique(
    receiptRows.map((r) => r.approved_by).filter(isString)
  );
  const approverMap = await buildUserLookup(
    approverIds.filter((id) => !userMap.has(id))
  );
  // Merge — same surveyor approving their own receipts (rare) reuses
  // the userMap entry.
  for (const [k, v] of approverMap.entries()) userMap.set(k, v);

  if (email) {
    const lower = email.toLowerCase();
    receiptRows = receiptRows.filter(
      (r) => userMap.get(r.user_id ?? '')?.email?.toLowerCase() === lower
    );
  }

  const lines: string[] = [HEADERS.join(',')];
  for (const r of receiptRows) {
    const user = r.user_id ? userMap.get(r.user_id) : undefined;
    const job = r.job_id ? jobMap.get(r.job_id) : undefined;
    const approver = r.approved_by ? userMap.get(r.approved_by) : undefined;

    const dateLocal = (r.transaction_at ?? r.created_at).slice(0, 10);

    lines.push(
      [
        r.id,
        dateLocal,
        r.created_at,
        user?.email ?? '',
        user?.name ?? '',
        r.vendor_name ?? '',
        r.vendor_address ?? '',
        centsToDollarString(r.subtotal_cents),
        centsToDollarString(r.tax_cents),
        centsToDollarString(r.tip_cents),
        centsToDollarString(r.total_cents),
        r.payment_method ?? '',
        r.payment_last4 ?? '',
        r.category ?? '',
        r.category_source ?? '',
        r.tax_deductible_flag ?? '',
        job?.job_number ?? '',
        job?.name ?? '',
        r.status,
        approver?.email ?? '',
        r.approved_at ?? '',
        r.rejected_reason ?? '',
        r.extraction_status ?? '',
        r.extraction_cost_cents != null ? String(r.extraction_cost_cents) : '',
        r.notes ?? '',
      ]
        .map(escapeCell)
        .join(',')
    );
  }
  // Trailing newline keeps tools like `wc -l` happy and matches the
  // mobile csvExport convention.
  const csv = lines.join('\n') + '\n';

  const filename = `starr-field-receipts-${dateRangeSlug(from, to)}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

interface UserInfo {
  email: string | null;
  name: string | null;
}

async function buildUserLookup(userIds: string[]): Promise<Map<string, UserInfo>> {
  const out = new Map<string, UserInfo>();
  if (userIds.length === 0) return out;

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

function centsToDollarString(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return '';
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${(abs / 100).toFixed(2)}`;
}

function escapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function dateRangeSlug(from: string | null, to: string | null): string {
  if (from && to) return `${from}_to_${to}`;
  if (from) return `from_${from}`;
  if (to) return `through_${to}`;
  const today = new Date().toISOString().slice(0, 10);
  return `as_of_${today}`;
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function isString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}
