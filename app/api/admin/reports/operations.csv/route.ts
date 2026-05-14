// app/api/admin/reports/operations.csv/route.ts
//
// Per-section CSV export for the operations report. Reuses the
// same admin-gated, org-scoped query path as the JSON endpoint and
// flattens one section into spreadsheet-friendly rows.
//
// Phase R-5 of OWNER_REPORTS.md.
//
// GET /api/admin/reports/operations.csv?section=<name>&from=<iso>&to=<iso>
//   section ∈ {jobs, hours, receipts, mileage}

import { type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

type Section = 'jobs' | 'hours' | 'receipts' | 'mileage';

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowsToCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvEscape).join(',')];
  for (const r of rows) {
    lines.push(r.map(csvEscape).join(','));
  }
  return lines.join('\n');
}

export async function GET(req: NextRequest): Promise<Response> {
  const session = await auth();
  if (!session?.user?.email) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { data: user } = await supabaseAdmin
    .from('registered_users')
    .select('default_org_id')
    .eq('email', session.user.email)
    .maybeSingle();
  if (!user?.default_org_id) return new Response('No org', { status: 403 });

  const { data: membership } = await supabaseAdmin
    .from('organization_members')
    .select('role')
    .eq('org_id', user.default_org_id)
    .eq('user_email', session.user.email)
    .maybeSingle();
  if (!membership || membership.role !== 'admin') {
    return new Response('Forbidden — admins only', { status: 403 });
  }

  const url = new URL(req.url);
  const section = (url.searchParams.get('section') ?? 'jobs') as Section;
  const fromIso = url.searchParams.get('from') ?? '';
  const toIso = url.searchParams.get('to') ?? '';

  if (!fromIso || !toIso) {
    return new Response('from + to required', { status: 400 });
  }

  const orgId = user.default_org_id;
  let csv = '';

  switch (section) {
    case 'jobs': {
      const { data } = await supabaseAdmin
        .from('jobs')
        .select('id, name, client_name, stage, result, quote_amount, final_amount, date_started, date_delivered, assigned_to')
        .eq('org_id', orgId)
        .or(`date_started.gte.${fromIso},date_delivered.gte.${fromIso},result_set_at.gte.${fromIso},created_at.gte.${fromIso}`)
        .lte('created_at', toIso);
      csv = rowsToCsv(
        ['id', 'name', 'client', 'stage', 'result', 'quote', 'final', 'started', 'delivered', 'assigned_to'],
        (data ?? []).map((r: Record<string, unknown>) => [
          r.id, r.name, r.client_name, r.stage, r.result,
          r.quote_amount, r.final_amount,
          r.date_started, r.date_delivered, r.assigned_to,
        ]),
      );
      break;
    }
    case 'hours': {
      const { data } = await supabaseAdmin
        .from('job_time_entries')
        .select('id, user_email, job_id, clock_in_at, clock_out_at, duration_minutes, billable')
        .eq('org_id', orgId)
        .gte('clock_in_at', fromIso)
        .lte('clock_in_at', toIso);
      csv = rowsToCsv(
        ['id', 'user_email', 'job_id', 'clock_in', 'clock_out', 'duration_minutes', 'billable'],
        (data ?? []).map((r: Record<string, unknown>) => [
          r.id, r.user_email, r.job_id,
          r.clock_in_at, r.clock_out_at, r.duration_minutes, r.billable,
        ]),
      );
      break;
    }
    case 'receipts': {
      const { data } = await supabaseAdmin
        .from('receipts')
        .select('id, user_id, job_id, vendor_name, transaction_at, total_cents, status, category')
        .eq('org_id', orgId)
        .gte('transaction_at', fromIso)
        .lte('transaction_at', toIso);
      csv = rowsToCsv(
        ['id', 'user_id', 'job_id', 'vendor', 'transaction_at', 'total_cents', 'status', 'category'],
        (data ?? []).map((r: Record<string, unknown>) => [
          r.id, r.user_id, r.job_id, r.vendor_name,
          r.transaction_at, r.total_cents, r.status, r.category,
        ]),
      );
      break;
    }
    case 'mileage': {
      const { data } = await supabaseAdmin
        .from('mileage_entries')
        .select('id, user_email, job_id, entry_date, miles, rate_cents_per_mile, total_cents')
        .eq('org_id', orgId)
        .gte('entry_date', fromIso.slice(0, 10))
        .lte('entry_date', toIso.slice(0, 10));
      csv = rowsToCsv(
        ['id', 'user_email', 'job_id', 'entry_date', 'miles', 'rate_cents_per_mile', 'total_cents'],
        (data ?? []).map((r: Record<string, unknown>) => [
          r.id, r.user_email, r.job_id, r.entry_date,
          r.miles, r.rate_cents_per_mile, r.total_cents,
        ]),
      );
      break;
    }
    default:
      return new Response(`Unknown section: ${section}`, { status: 400 });
  }

  const filename = `report-${section}-${fromIso.slice(0, 10)}-to-${toIso.slice(0, 10)}.csv`;
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
