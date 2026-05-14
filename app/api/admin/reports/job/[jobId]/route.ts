// app/api/admin/reports/job/[jobId]/route.ts
//
// Per-job operations report. Returns the job header + all time
// entries, receipts, and mileage attributed to this one job, plus
// totals. Admin-only, org-scoped.
//
// Phase R-12 of OWNER_REPORTS.md.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

interface RouteContext { params: Promise<{ jobId: string }> }

const OT_THRESHOLD_HOURS_PER_WEEK = 40;
const OT_MULTIPLIER = 1.5;

export async function GET(_req: Request, ctx: RouteContext): Promise<NextResponse> {
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

  const { jobId } = await ctx.params;
  const orgId = user.default_org_id;

  const { data: job, error: jobErr } = await supabaseAdmin
    .from('jobs')
    .select('id, name, client_name, job_number, address, stage, result, result_set_at, result_reason, quote_amount, final_amount, date_received, date_quoted, date_accepted, date_started, date_delivered, assigned_to, created_at, org_id')
    .eq('id', jobId)
    .maybeSingle();

  if (jobErr || !job || job.org_id !== orgId) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const [hoursRes, receiptsRes, mileageRes, payoutsRes] = await Promise.all([
    supabaseAdmin
      .from('job_time_entries')
      .select('id, user_email, duration_minutes, clock_in_at, clock_out_at, billable')
      .eq('job_id', jobId)
      .order('clock_in_at', { ascending: true }),
    supabaseAdmin
      .from('receipts')
      .select('id, user_id, vendor_name, transaction_at, total_cents, status, category')
      .eq('job_id', jobId)
      .order('transaction_at', { ascending: true }),
    supabaseAdmin
      .from('mileage_entries')
      .select('id, user_email, miles, rate_cents_per_mile, total_cents, entry_date')
      .eq('job_id', jobId)
      .order('entry_date', { ascending: true }),
    supabaseAdmin
      .from('employee_payouts')
      .select('id, user_email, amount_cents, method, reference, paid_at, notes')
      .eq('org_id', orgId)
      .eq('notes', `job:${jobId}`),     // convention: payouts referencing a job have notes='job:<id>'
  ]);

  // Pay rates for labor cost
  const { data: profiles } = await supabaseAdmin
    .from('employee_profiles')
    .select('user_email, user_name, hourly_rate')
    .eq('org_id', orgId);

  const rateByEmail = new Map<string, { name: string; hourly: number }>();
  for (const p of (profiles ?? []) as Array<{ user_email: string; user_name: string | null; hourly_rate: number | null }>) {
    rateByEmail.set(p.user_email, {
      name: p.user_name ?? p.user_email,
      hourly: p.hourly_rate ?? 0,
    });
  }

  // Hours grouped by employee + per-week OT calc
  const byEmployeeWeek = new Map<string, Map<string, number>>();
  type HourEntry = { id: string; user_email: string; duration_minutes: number | null; clock_in_at: string; clock_out_at: string | null; billable: boolean | null };
  for (const e of (hoursRes.data ?? []) as HourEntry[]) {
    if (!e.duration_minutes || e.duration_minutes <= 0) continue;
    const weekKey = isoWeekKey(new Date(e.clock_in_at));
    const bucket = byEmployeeWeek.get(e.user_email) ?? new Map<string, number>();
    bucket.set(weekKey, (bucket.get(weekKey) ?? 0) + e.duration_minutes);
    byEmployeeWeek.set(e.user_email, bucket);
  }

  const hoursPerEmployee: Array<{ email: string; name: string; regularHours: number; otHours: number; laborCostCents: number }> = [];
  let totalRegularHours = 0, totalOtHours = 0, totalLaborCostCents = 0;
  for (const [email, buckets] of byEmployeeWeek.entries()) {
    let regularMin = 0, otMin = 0;
    for (const minutes of buckets.values()) {
      const hours = minutes / 60;
      if (hours <= OT_THRESHOLD_HOURS_PER_WEEK) {
        regularMin += minutes;
      } else {
        regularMin += OT_THRESHOLD_HOURS_PER_WEEK * 60;
        otMin += (hours - OT_THRESHOLD_HOURS_PER_WEEK) * 60;
      }
    }
    const regularHours = Math.round((regularMin / 60) * 100) / 100;
    const otHours = Math.round((otMin / 60) * 100) / 100;
    const rate = rateByEmail.get(email)?.hourly ?? 0;
    const laborCents = Math.round((regularHours * rate + otHours * rate * OT_MULTIPLIER) * 100);
    hoursPerEmployee.push({
      email,
      name: rateByEmail.get(email)?.name ?? email,
      regularHours, otHours, laborCostCents: laborCents,
    });
    totalRegularHours += regularHours;
    totalOtHours += otHours;
    totalLaborCostCents += laborCents;
  }
  hoursPerEmployee.sort((a, b) => (b.regularHours + b.otHours) - (a.regularHours + a.otHours));

  // Receipts total
  let receiptsTotalCents = 0;
  type ReceiptRow = { id: string; user_id: string | null; vendor_name: string | null; transaction_at: string | null; total_cents: number | null; status: string; category: string | null };
  const receipts = ((receiptsRes.data ?? []) as ReceiptRow[]).map((r) => {
    receiptsTotalCents += r.total_cents ?? 0;
    return {
      id: r.id,
      userId: r.user_id,
      vendor: r.vendor_name,
      date: r.transaction_at,
      amountCents: r.total_cents ?? 0,
      status: r.status,
      category: r.category,
    };
  });

  // Mileage total
  let mileageTotalMiles = 0, mileageTotalCents = 0;
  type MileageRow = { id: string; user_email: string | null; miles: number | null; rate_cents_per_mile: number | null; total_cents: number | null; entry_date: string };
  const mileage = ((mileageRes.data ?? []) as MileageRow[]).map((m) => {
    const miles = m.miles ?? 0;
    const cents = m.total_cents ?? Math.round(miles * (m.rate_cents_per_mile ?? 0));
    mileageTotalMiles += miles;
    mileageTotalCents += cents;
    return {
      id: m.id,
      userEmail: m.user_email,
      miles,
      dollarsCents: cents,
      date: m.entry_date,
    };
  });

  // Payouts referencing this job
  let payoutsTotalCents = 0;
  type PayoutRow = { id: string; user_email: string; amount_cents: number; method: string; reference: string | null; paid_at: string; notes: string | null };
  const payouts = ((payoutsRes.data ?? []) as PayoutRow[]).map((p) => {
    payoutsTotalCents += p.amount_cents;
    return {
      id: p.id,
      userEmail: p.user_email,
      amountCents: p.amount_cents,
      method: p.method,
      reference: p.reference,
      paidAt: p.paid_at,
      notes: p.notes,
    };
  });

  const quoteCents = Math.round((job.quote_amount ?? 0) * 100);
  const finalCents = job.final_amount === null ? null : Math.round(job.final_amount * 100);
  const revenueCents = finalCents ?? 0;
  const totalCostCents = totalLaborCostCents + receiptsTotalCents + mileageTotalCents;
  const grossMarginCents = revenueCents - totalCostCents;
  const grossMarginPct = revenueCents > 0 ? (grossMarginCents / revenueCents) * 100 : 0;

  return NextResponse.json({
    job: {
      id: job.id,
      name: job.name,
      clientName: job.client_name,
      jobNumber: job.job_number,
      address: job.address,
      stage: job.stage,
      result: job.result,
      resultSetAt: job.result_set_at,
      resultReason: job.result_reason,
      quoteCents,
      finalCents,
      dateReceived: job.date_received,
      dateQuoted: job.date_quoted,
      dateAccepted: job.date_accepted,
      dateStarted: job.date_started,
      dateDelivered: job.date_delivered,
      assignedTo: job.assigned_to,
      createdAt: job.created_at,
    },
    hours: {
      perEmployee: hoursPerEmployee,
      totalRegularHours,
      totalOtHours,
      totalLaborCostCents,
    },
    receipts: { entries: receipts, totalCents: receiptsTotalCents },
    mileage: { entries: mileage, totalMiles: mileageTotalMiles, totalCents: mileageTotalCents },
    payouts: { entries: payouts, totalCents: payoutsTotalCents },
    financials: {
      revenueCents,
      totalCostCents,
      grossMarginCents,
      grossMarginPct: Math.round(grossMarginPct * 10) / 10,
    },
  });
}

function isoWeekKey(d: Date): string {
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
