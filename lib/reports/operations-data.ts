// lib/reports/operations-data.ts
//
// Shared data-loaders for the operations report. Imported by:
//   - app/api/admin/reports/operations/route.ts        (JSON API)
//   - app/api/admin/reports/operations.pdf/route.ts    (PDF render)
//   - app/api/cron/weekly-reports/route.ts             (cron email)
//
// Phase R-6 of OWNER_REPORTS.md (the JSON endpoint shipped first
// with the loaders inlined; this file extracts them so the PDF
// route + cron can reuse them without HTTP round-trips).

import { supabaseAdmin } from '@/lib/supabase';

export interface JobDetail {
  id: string;
  name: string;
  client: string | null;
  stage: string;
  result: 'won' | 'lost' | 'abandoned' | null;
  quoteCents: number;
  finalCents: number | null;
  dateStarted: string | null;
  dateDelivered: string | null;
  assignedTo: string | null;
}

export interface HoursPerEmployee {
  email: string;
  name: string;
  regularHours: number;
  otHours: number;
  totalHours: number;
  laborCostCents: number;
}

export interface ReceiptEntry {
  id: string;
  date: string | null;
  vendor: string | null;
  amountCents: number;
  status: string;
  category: string | null;
  jobId: string | null;
}

export interface MileageEntry {
  id: string;
  date: string;
  email: string | null;
  miles: number;
  dollars: number;
  jobId: string | null;
}

export interface ReportPayload {
  range: { from: string; to: string };
  org: { id: string; name: string; slug: string };
  jobs: {
    started: number;
    inProgress: number;
    notStarted: number;
    completed: number;
    lost: number;
    abandoned: number;
    quotedTotalCents: number;
    invoicedTotalCents: number;
    outstandingCents: number;
    details: JobDetail[];
  };
  hours: {
    perEmployee: HoursPerEmployee[];
    totalRegularHours: number;
    totalOtHours: number;
    totalLaborCostCents: number;
  };
  receipts: {
    byStatus: { approved: number; pending: number; paid: number; rejected: number };
    byCategory: Record<string, number>;
    byEmployee: Array<{ email: string; name: string; totalCents: number }>;
    entries: ReceiptEntry[];
  };
  mileage: {
    totalMiles: number;
    totalDollars: number;
    perEmployee: Array<{ email: string; name: string; miles: number; dollars: number }>;
    entries: MileageEntry[];
  };
  financials: {
    revenueCents: number;
    laborCostCents: number;
    receiptsCostCents: number;
    mileageCostCents: number;
    grossMarginCents: number;
    grossMarginPct: number;
    outstandingInvoicesCents: number;
    pendingQuotesCents: number;
  };
  warnings: string[];
}

const OT_THRESHOLD_HOURS_PER_WEEK = 40;
const OT_MULTIPLIER = 1.5;

export async function buildOperationsReport(
  orgId: string,
  fromIso: string,
  toIso: string,
): Promise<ReportPayload> {
  const warnings: string[] = [];

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id, name, slug')
    .eq('id', orgId)
    .maybeSingle();
  if (!org) {
    throw new Error('Org not found');
  }

  const jobsSection = await loadJobs(orgId, fromIso, toIso, warnings);
  const hoursSection = await loadHours(orgId, fromIso, toIso, warnings);
  const receiptsSection = await loadReceipts(orgId, fromIso, toIso, warnings);
  const mileageSection = await loadMileage(orgId, fromIso, toIso, warnings);

  const revenueCents = jobsSection.invoicedTotalCents;
  const laborCostCents = hoursSection.totalLaborCostCents;
  const receiptsCostCents =
    receiptsSection.byStatus.approved + receiptsSection.byStatus.paid;
  const mileageCostCents = mileageSection.totalDollarsCents;
  const totalCost = laborCostCents + receiptsCostCents + mileageCostCents;
  const grossMarginCents = revenueCents - totalCost;
  const grossMarginPct = revenueCents > 0 ? (grossMarginCents / revenueCents) * 100 : 0;

  return {
    range: { from: fromIso, to: toIso },
    org: { id: org.id, name: org.name, slug: org.slug },
    jobs: jobsSection,
    hours: hoursSection,
    receipts: {
      byStatus: receiptsSection.byStatus,
      byCategory: receiptsSection.byCategory,
      byEmployee: receiptsSection.byEmployee,
      entries: receiptsSection.entries,
    },
    mileage: {
      totalMiles: mileageSection.totalMiles,
      totalDollars: mileageSection.totalDollarsCents / 100,
      perEmployee: mileageSection.perEmployee.map((e) => ({
        email: e.email,
        name: e.name,
        miles: e.miles,
        dollars: e.dollarsCents / 100,
      })),
      entries: mileageSection.entries,
    },
    financials: {
      revenueCents,
      laborCostCents,
      receiptsCostCents,
      mileageCostCents,
      grossMarginCents,
      grossMarginPct: Math.round(grossMarginPct * 10) / 10,
      outstandingInvoicesCents: jobsSection.outstandingCents,
      pendingQuotesCents: jobsSection.quotedTotalCents - jobsSection.invoicedTotalCents,
    },
    warnings,
  };
}

async function loadJobs(orgId: string, fromIso: string, toIso: string, warnings: string[]) {
  const { data, error } = await supabaseAdmin
    .from('jobs')
    .select('id, name, client_name, stage, result, result_set_at, quote_amount, final_amount, date_received, date_started, date_delivered, assigned_to')
    .eq('org_id', orgId)
    .or(`date_started.gte.${fromIso},date_delivered.gte.${fromIso},result_set_at.gte.${fromIso},created_at.gte.${fromIso}`)
    .lte('created_at', toIso);

  if (error) {
    warnings.push(`jobs query: ${error.message}`);
    return {
      started: 0, inProgress: 0, notStarted: 0, completed: 0, lost: 0, abandoned: 0,
      quotedTotalCents: 0, invoicedTotalCents: 0, outstandingCents: 0,
      details: [] as JobDetail[],
    };
  }

  type Row = {
    id: string;
    name: string;
    client_name: string | null;
    stage: string;
    result: 'won' | 'lost' | 'abandoned' | null;
    result_set_at: string | null;
    quote_amount: number | null;
    final_amount: number | null;
    date_received: string | null;
    date_started: string | null;
    date_delivered: string | null;
    assigned_to: string | null;
  };

  const rows = (data ?? []) as Row[];
  let started = 0, inProgress = 0, notStarted = 0, completed = 0, lost = 0, abandoned = 0;
  let quotedTotalCents = 0, invoicedTotalCents = 0;
  const details: JobDetail[] = [];

  for (const r of rows) {
    const inWindowStart = r.date_started && r.date_started >= fromIso && r.date_started <= toIso;
    const inWindowDeliver = r.date_delivered && r.date_delivered >= fromIso && r.date_delivered <= toIso;
    const inWindowResult = r.result_set_at && r.result_set_at >= fromIso && r.result_set_at <= toIso;
    const isCompleted = r.stage === 'completed' || r.result === 'won';
    const isInProgress = !isCompleted && !!r.date_started && !r.result;
    const isNotStarted = !isCompleted && !r.date_started && !r.result;

    if (inWindowStart) started++;
    if (inWindowDeliver && isCompleted) completed++;
    if (inWindowResult && r.result === 'lost') lost++;
    if (inWindowResult && r.result === 'abandoned') abandoned++;
    if (isInProgress) inProgress++;
    if (isNotStarted) notStarted++;

    const quoteCents = Math.round((r.quote_amount ?? 0) * 100);
    const finalCents = r.final_amount === null ? null : Math.round(r.final_amount * 100);
    quotedTotalCents += quoteCents;
    if (finalCents !== null) invoicedTotalCents += finalCents;

    details.push({
      id: r.id,
      name: r.name,
      client: r.client_name,
      stage: r.stage,
      result: r.result,
      quoteCents,
      finalCents,
      dateStarted: r.date_started,
      dateDelivered: r.date_delivered,
      assignedTo: r.assigned_to,
    });
  }

  return {
    started, inProgress, notStarted, completed, lost, abandoned,
    quotedTotalCents, invoicedTotalCents,
    outstandingCents: Math.max(0, invoicedTotalCents),
    details,
  };
}

async function loadHours(orgId: string, fromIso: string, toIso: string, warnings: string[]) {
  const { data: entries, error } = await supabaseAdmin
    .from('job_time_entries')
    .select('id, user_email, duration_minutes, clock_in_at, clock_out_at, billable, job_id')
    .eq('org_id', orgId)
    .gte('clock_in_at', fromIso)
    .lte('clock_in_at', toIso);

  if (error) {
    warnings.push(`hours query: ${error.message}`);
    return {
      perEmployee: [] as HoursPerEmployee[],
      totalRegularHours: 0,
      totalOtHours: 0,
      totalLaborCostCents: 0,
    };
  }

  type Entry = {
    user_email: string;
    duration_minutes: number | null;
    clock_in_at: string;
  };

  const byEmployeeWeek = new Map<string, Map<string, number>>();
  for (const e of (entries ?? []) as Entry[]) {
    if (!e.duration_minutes || e.duration_minutes <= 0) continue;
    const weekKey = isoWeekKey(new Date(e.clock_in_at));
    const bucket = byEmployeeWeek.get(e.user_email) ?? new Map<string, number>();
    bucket.set(weekKey, (bucket.get(weekKey) ?? 0) + e.duration_minutes);
    byEmployeeWeek.set(e.user_email, bucket);
  }

  const { data: profiles } = await supabaseAdmin
    .from('employee_profiles')
    .select('user_email, user_name, hourly_rate')
    .eq('org_id', orgId);
  const rateByEmail = new Map<string, { name: string; hourly: number }>();
  for (const p of (profiles ?? []) as Array<{ user_email: string; user_name: string | null; hourly_rate: number | null }>) {
    rateByEmail.set(p.user_email, { name: p.user_name ?? p.user_email, hourly: p.hourly_rate ?? 0 });
  }

  const perEmployee: HoursPerEmployee[] = [];
  let totalRegular = 0, totalOt = 0, totalCostCents = 0;

  for (const [email, weekBuckets] of byEmployeeWeek.entries()) {
    let regularMin = 0, otMin = 0;
    for (const minutes of weekBuckets.values()) {
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
    perEmployee.push({
      email,
      name: rateByEmail.get(email)?.name ?? email,
      regularHours, otHours,
      totalHours: regularHours + otHours,
      laborCostCents: laborCents,
    });
    totalRegular += regularHours;
    totalOt += otHours;
    totalCostCents += laborCents;
  }

  perEmployee.sort((a, b) => b.totalHours - a.totalHours);

  return {
    perEmployee,
    totalRegularHours: Math.round(totalRegular * 100) / 100,
    totalOtHours: Math.round(totalOt * 100) / 100,
    totalLaborCostCents: totalCostCents,
  };
}

async function loadReceipts(orgId: string, fromIso: string, toIso: string, warnings: string[]) {
  const { data, error } = await supabaseAdmin
    .from('receipts')
    .select('id, user_id, job_id, vendor_name, transaction_at, total_cents, status, category')
    .eq('org_id', orgId)
    .gte('transaction_at', fromIso)
    .lte('transaction_at', toIso);

  if (error) {
    warnings.push(`receipts query: ${error.message}`);
    return {
      byStatus: { approved: 0, pending: 0, paid: 0, rejected: 0 },
      byCategory: {} as Record<string, number>,
      byEmployee: [] as Array<{ email: string; name: string; totalCents: number }>,
      entries: [] as ReceiptEntry[],
    };
  }

  type Row = {
    id: string;
    user_id: string | null;
    job_id: string | null;
    vendor_name: string | null;
    transaction_at: string | null;
    total_cents: number | null;
    status: string;
    category: string | null;
  };

  const byStatus = { approved: 0, pending: 0, paid: 0, rejected: 0 } as Record<'approved' | 'pending' | 'paid' | 'rejected', number>;
  const byCategory: Record<string, number> = {};
  const byEmployeeMap = new Map<string, number>();
  const entries: ReceiptEntry[] = [];

  for (const r of (data ?? []) as Row[]) {
    const cents = r.total_cents ?? 0;
    if (r.status in byStatus) byStatus[r.status as keyof typeof byStatus] += cents;
    const cat = r.category ?? 'uncategorized';
    byCategory[cat] = (byCategory[cat] ?? 0) + cents;
    if (r.user_id) byEmployeeMap.set(r.user_id, (byEmployeeMap.get(r.user_id) ?? 0) + cents);
    entries.push({
      id: r.id,
      date: r.transaction_at,
      vendor: r.vendor_name,
      amountCents: cents,
      status: r.status,
      category: r.category,
      jobId: r.job_id,
    });
  }

  const byEmployee: Array<{ email: string; name: string; totalCents: number }> = [];
  if (byEmployeeMap.size > 0) {
    const userIds = Array.from(byEmployeeMap.keys());
    const { data: profiles } = await supabaseAdmin
      .from('employee_profiles')
      .select('user_id, user_email, user_name')
      .in('user_id', userIds);
    const nameById = new Map<string, { email: string; name: string }>();
    for (const p of (profiles ?? []) as Array<{ user_id: string; user_email: string; user_name: string | null }>) {
      nameById.set(p.user_id, { email: p.user_email, name: p.user_name ?? p.user_email });
    }
    for (const [userId, cents] of byEmployeeMap.entries()) {
      const meta = nameById.get(userId);
      byEmployee.push({ email: meta?.email ?? userId, name: meta?.name ?? userId, totalCents: cents });
    }
    byEmployee.sort((a, b) => b.totalCents - a.totalCents);
  }

  return { byStatus, byCategory, byEmployee, entries };
}

async function loadMileage(orgId: string, fromIso: string, toIso: string, warnings: string[]) {
  const { data, error } = await supabaseAdmin
    .from('mileage_entries')
    .select('id, user_email, miles, rate_cents_per_mile, total_cents, entry_date, job_id')
    .eq('org_id', orgId)
    .gte('entry_date', fromIso.slice(0, 10))
    .lte('entry_date', toIso.slice(0, 10));

  if (error) {
    warnings.push(`mileage query: ${error.message}`);
    return {
      totalMiles: 0,
      totalDollarsCents: 0,
      perEmployee: [] as Array<{ email: string; name: string; miles: number; dollarsCents: number }>,
      entries: [] as MileageEntry[],
    };
  }

  type Row = {
    id: string;
    user_email: string | null;
    miles: number | null;
    rate_cents_per_mile: number | null;
    total_cents: number | null;
    entry_date: string;
    job_id: string | null;
  };

  const perEmployeeMap = new Map<string, { miles: number; dollarsCents: number }>();
  let totalMiles = 0, totalDollarsCents = 0;
  const entries: MileageEntry[] = [];

  for (const r of (data ?? []) as Row[]) {
    const miles = r.miles ?? 0;
    const dollarsCents = r.total_cents ?? Math.round(miles * (r.rate_cents_per_mile ?? 0));
    totalMiles += miles;
    totalDollarsCents += dollarsCents;
    if (r.user_email) {
      const cur = perEmployeeMap.get(r.user_email) ?? { miles: 0, dollarsCents: 0 };
      cur.miles += miles;
      cur.dollarsCents += dollarsCents;
      perEmployeeMap.set(r.user_email, cur);
    }
    entries.push({
      id: r.id,
      date: r.entry_date,
      email: r.user_email,
      miles,
      dollars: dollarsCents / 100,
      jobId: r.job_id,
    });
  }

  const emails = Array.from(perEmployeeMap.keys());
  const nameByEmail = new Map<string, string>();
  if (emails.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from('employee_profiles')
      .select('user_email, user_name')
      .in('user_email', emails);
    for (const p of (profiles ?? []) as Array<{ user_email: string; user_name: string | null }>) {
      nameByEmail.set(p.user_email, p.user_name ?? p.user_email);
    }
  }

  const perEmployee = Array.from(perEmployeeMap.entries()).map(([email, v]) => ({
    email,
    name: nameByEmail.get(email) ?? email,
    miles: Math.round(v.miles * 100) / 100,
    dollarsCents: v.dollarsCents,
  })).sort((a, b) => b.miles - a.miles);

  return {
    totalMiles: Math.round(totalMiles * 100) / 100,
    totalDollarsCents,
    perEmployee,
    entries,
  };
}

function isoWeekKey(d: Date): string {
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
