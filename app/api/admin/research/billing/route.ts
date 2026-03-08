// app/api/admin/research/billing/route.ts
// Phase 13: Billing & usage dashboard API.
//
// GET — Returns the current user's subscription info, usage metrics,
//       invoice summary, and per-document purchase transactions.
//       Aggregates data from research_subscriptions and research_usage_events
//       tables, and (when STRIPE_SECRET_KEY is configured) from Stripe.
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// ── Stripe (lazy init — only used when secret key is configured) ──────────────
let stripeClient: null | {
  subscriptions: { retrieve: (id: string) => Promise<unknown> };
  invoices: { list: (opts: object) => Promise<{ data: unknown[] }> };
} = null;

function getStripe() {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Stripe = require('stripe');
    stripeClient = new Stripe(key, { apiVersion: '2024-06-20' });
    return stripeClient;
  } catch {
    return null;
  }
}

// ── Usage event shape (matches research_usage_events table columns) ───────────
interface UsageEvent {
  event_type: string;
  model: string | null;
  total_tokens: number | null;
  cost_usd: number | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

// ── Tier display helpers ──────────────────────────────────────────────────────
const TIER_DISPLAY: Record<string, { label: string; color: string; monthlyUsd: number; reportLimit: number | null }> = {
  free:             { label: 'Free',             color: 'gray',   monthlyUsd: 0,   reportLimit: 3 },
  surveyor_pro:     { label: 'Surveyor Pro',     color: 'blue',   monthlyUsd: 99,  reportLimit: 50 },
  firm_unlimited:   { label: 'Firm Unlimited',   color: 'purple', monthlyUsd: 299, reportLimit: null },
};

function tierInfo(tier: string) {
  return TIER_DISPLAY[tier] ?? TIER_DISPLAY['free'];
}

/* GET — Billing & usage dashboard data */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const email = session.user.email;

  // 1. Subscription record
  const { data: sub } = await supabaseAdmin
    .from('research_subscriptions')
    .select('*')
    .eq('user_email', email)
    .maybeSingle();

  const tier = sub?.tier ?? 'free';
  const info = tierInfo(tier);

  const subscription = {
    tier,
    label: info.label,
    color: info.color,
    status: sub?.status ?? 'inactive',
    monthlyUsd: info.monthlyUsd,
    reportLimit: info.reportLimit,
    currentPeriodStart: sub?.current_period_start ?? null,
    currentPeriodEnd: sub?.current_period_end ?? null,
    cancelAtPeriodEnd: sub?.cancel_at_period_end ?? false,
    stripeCustomerId: sub?.stripe_customer_id ?? null,
    stripeSubscriptionId: sub?.stripe_subscription_id ?? null,
    isTrialing: sub?.status === 'trialing',
  };

  // 2. Usage events — last 12 months
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

  const { data: usageEvents } = await supabaseAdmin
    .from('research_usage_events')
    .select('event_type, model, total_tokens, cost_usd, created_at, metadata')
    .eq('user_email', email)
    .gte('created_at', twelveMonthsAgo.toISOString())
    .order('created_at', { ascending: false });

  const events: UsageEvent[] = (usageEvents ?? []) as UsageEvent[];
  const totalTokens = events.reduce((s: number, e: UsageEvent) => s + (e.total_tokens ?? 0), 0);
  const totalAiCostUsd = events.reduce((s: number, e: UsageEvent) => s + Number(e.cost_usd ?? 0), 0);
  const aiCallCount = events.filter((e: UsageEvent) => e.event_type === 'ai_call').length;
  const apiLookupCount = events.filter((e: UsageEvent) => e.event_type === 'api_lookup').length;
  const docFetchCount = events.filter((e: UsageEvent) => e.event_type === 'document_fetch').length;

  // Group by calendar month for bar chart
  const monthlyUsage: Record<string, { month: string; tokenCount: number; costUsd: number; callCount: number }> = {};
  for (const e of events as UsageEvent[]) {
    const m = new Date(e.created_at).toISOString().slice(0, 7); // YYYY-MM
    if (!monthlyUsage[m]) monthlyUsage[m] = { month: m, tokenCount: 0, costUsd: 0, callCount: 0 };
    monthlyUsage[m].tokenCount += e.total_tokens ?? 0;
    monthlyUsage[m].costUsd += Number(e.cost_usd ?? 0);
    monthlyUsage[m].callCount++;
  }

  // 3. Project stats — total reports run
  const { count: totalProjects } = await supabaseAdmin
    .from('research_projects')
    .select('*', { count: 'exact', head: true })
    .eq('created_by', email);

  // Reports this calendar month
  const thisMonthStart = new Date();
  thisMonthStart.setDate(1);
  thisMonthStart.setHours(0, 0, 0, 0);
  const { count: thisMonthCount } = await supabaseAdmin
    .from('research_projects')
    .select('*', { count: 'exact', head: true })
    .eq('created_by', email)
    .gte('created_at', thisMonthStart.toISOString());

  // 4. Invoices — from Stripe if available, otherwise stub
  const stripe = getStripe();
  let invoices: Array<{
    id: string; date: string; description: string; amountUsd: number;
    status: 'paid' | 'open' | 'uncollectible'; pdfUrl: string | null;
  }> = [];

  if (stripe && sub?.stripe_customer_id) {
    try {
      const result = await stripe.invoices.list({
        customer: sub.stripe_customer_id,
        limit: 24,
      });
      invoices = (result.data as Array<{
        id: string;
        created: number;
        description?: string | null;
        amount_paid: number;
        amount_due?: number;
        status?: string;
        invoice_pdf?: string | null;
        lines?: { data?: Array<{ description?: string }> };
      }>).map(inv => ({
        id: inv.id,
        date: new Date(inv.created * 1000).toISOString(),
        description: inv.description
          ?? inv.lines?.data?.[0]?.description
          ?? `${info.label} subscription`,
        amountUsd: (inv.amount_paid ?? inv.amount_due ?? 0) / 100,
        status: (inv.status === 'paid' ? 'paid' : inv.status === 'open' ? 'open' : 'uncollectible') as
          'paid' | 'open' | 'uncollectible',
        pdfUrl: inv.invoice_pdf ?? null,
      }));
    } catch {
      // Stripe unavailable — return empty invoices
    }
  }

  // 5. Purchase transactions — from research_usage_events where event_type='document_fetch'
  const purchases = (events as UsageEvent[])
    .filter((e: UsageEvent) => e.event_type === 'document_fetch')
    .slice(0, 50)
    .map((e: UsageEvent) => {
      const meta = (e.metadata as Record<string, unknown>) ?? {};
      return {
        date: e.created_at,
        eventType: 'document_fetch' as const,
        documentType: meta.document_type as string ?? 'unknown',
        instrumentNumber: meta.instrument_number as string ?? null,
        propertyAddress: meta.property_address as string ?? null,
        vendor: meta.vendor as string ?? null,
        vendorCostUsd: Number(meta.vendor_cost_usd ?? 0),
        serviceFeeUsd: Number(meta.service_fee_usd ?? 0),
        totalUsd: Number(e.cost_usd ?? 0),
        status: (meta.status as string) ?? 'completed',
      };
    });

  const totalSpentUsd = purchases.reduce((s: number, p) => s + p.totalUsd, 0);

  return NextResponse.json({
    subscription,
    usage: {
      totalReports: totalProjects ?? 0,
      reportsThisMonth: thisMonthCount ?? 0,
      totalTokens,
      totalAiCostUsd: Math.round(totalAiCostUsd * 100) / 100,
      aiCallCount,
      apiLookupCount,
      docFetchCount,
      monthlyBreakdown: Object.values(monthlyUsage).sort((a, b) => a.month.localeCompare(b.month)),
    },
    invoices,
    purchases,
    totals: {
      totalDocsPurchased: purchases.length,
      totalSpentUsd: Math.round(totalSpentUsd * 100) / 100,
    },
  });
}, { routeName: 'research/billing' });
