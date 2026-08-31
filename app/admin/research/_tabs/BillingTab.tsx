// app/admin/research/_tabs/BillingTab.tsx — a tab of the Research portal.
//
// C11b / P13 of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
// Was `/admin/research/billing/page.tsx`; the old route stays and forwards.
// app/admin/research/billing/page.tsx — Phase 13 Research Billing & Usage Dashboard
// Shows subscription status, usage metrics, invoice history, and document
// purchase transaction log for the current user's research account.
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  CreditCard, ExternalLink, AlertTriangle, Check, FileText, Receipt,
} from 'lucide-react';
import VendorAccountsPanel from '../components/VendorAccountsPanel';
// E2b — the shared portal vocabulary. `SegmentedTabs` brings the tablist contract with it: this
// tab's four sub-tabs were plain buttons with no role, no `aria-selected` and no arrow keys.
import {
  LoadingState, ErrorState, EmptyState, StatPill, SegmentedTabs, SectionHeader, type StatTone,
} from '../components/ui';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubscriptionInfo {
  tier: 'free' | 'surveyor_pro' | 'firm_unlimited';
  status: 'active' | 'past_due' | 'cancelled' | 'trialing' | 'none';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  reportsUsedThisPeriod: number;
  reportsLimit: number | 'unlimited';
  batchEnabled: boolean;
  nextInvoiceAmount: number | null;
  trialEndsAt?: string;
}

interface UsageMetrics {
  totalReports: number;
  reportsThisMonth: number;
  totalDocumentsPurchased: number;
  totalDocumentSpend: number;
  totalAiTokensUsed: number;
  aiCostEstimate: number;
  avgReportTimeMs: number;
  topCounties: Array<{ county: string; count: number }>;
  reportsByMonth: Array<{ month: string; count: number }>;
}

interface Invoice {
  invoiceId: string;
  date: string;
  description: string;
  amount: number;
  status: 'paid' | 'open' | 'void' | 'uncollectible';
  pdfUrl?: string;
}

interface PurchaseTransaction {
  transactionId: string;
  projectId: string;
  projectAddress?: string;
  documentType: string;
  instrumentNumber?: string;
  vendor: string;
  amount: number;
  serviceFee: number;
  total: number;
  status: 'completed' | 'failed' | 'refunded';
  purchasedAt: string;
}

// ── Raw API response (mirrors app/api/admin/research/billing/route.ts) ──────────
// The route's shape differs from the view-model above; loadBillingData adapts it.

interface ApiBillingResponse {
  subscription?: {
    tier?: string;
    status?: string;
    monthlyUsd?: number;
    reportLimit?: number;
    currentPeriodStart?: string | null;
    currentPeriodEnd?: string | null;
    isTrialing?: boolean;
  };
  usage?: {
    totalReports?: number;
    reportsThisMonth?: number;
    totalTokens?: number;
    totalAiCostUsd?: number;
    monthlyBreakdown?: Array<{ month: string; callCount?: number; tokenCount?: number; costUsd?: number }>;
  };
  totals?: {
    totalDocsPurchased?: number;
    totalSpentUsd?: number;
  };
  invoices?: Array<{
    id: string;
    date: string;
    description: string;
    amountUsd?: number;
    status: Invoice['status'];
    pdfUrl?: string | null;
  }>;
  purchases?: Array<{
    date: string;
    documentType: string;
    instrumentNumber?: string | null;
    propertyAddress?: string | null;
    vendor?: string | null;
    vendorCostUsd?: number;
    serviceFeeUsd?: number;
    totalUsd?: number;
    status?: string;
  }>;
}

// ── Tier config ───────────────────────────────────────────────────────────────

const TIER_LABELS: Record<SubscriptionInfo['tier'], string> = {
  free: 'Free Trial',
  surveyor_pro: 'Surveyor Pro',
  firm_unlimited: 'Firm Unlimited',
};


const TIER_PRICES: Record<SubscriptionInfo['tier'], string> = {
  free: 'Free (2 reports/mo)',
  surveyor_pro: '$99/month',
  firm_unlimited: '$299/month',
};

/**
 * Subscription status as a named meaning rather than a hex code.
 *
 * The dark version carried `STATUS_COLORS` — five hex values applied as `backgroundColor`. A pill
 * whose only signal is its colour says nothing to a reader who cannot distinguish amber from green,
 * and "past due" is not a state to communicate in a colour alone. `StatPill` takes a tone, and the
 * word is always rendered beside it.
 */
export const STATUS_TONES: Record<SubscriptionInfo['status'], StatTone> = {
  active: 'good',
  trialing: 'warn',
  past_due: 'bad',
  cancelled: 'neutral',
  none: 'neutral',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function BillingTab() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();

  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [usage, setUsage] = useState<UsageMetrics | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [purchases, setPurchases] = useState<PurchaseTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'overview' | 'invoices' | 'purchases' | 'usage'>('overview');

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') router.push('/admin/login');
  }, [sessionStatus, router]);

  const loadBillingData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/research/billing');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ApiBillingResponse;

      // The API route (app/api/admin/research/billing/route.ts) emits a
      // different shape than this page's view-model — it returns
      // `usage.monthlyBreakdown` / `usage.totalTokens` / top-level
      // `totals`, with no `topCounties`/`reportsByMonth`/`totalDocument*`
      // keys. Reading those directly produced `$NaN` everywhere and a
      // hard crash on `usage.topCounties.length` (error 175c7066,
      // 2026-03-18). Adapt the response here so the render stays simple.
      const a = data.subscription;
      const u = data.usage;
      const t = data.totals;

      const mappedStatus = ((): SubscriptionInfo['status'] => {
        switch (a?.status) {
          case 'active': return 'active';
          case 'trialing': return 'trialing';
          case 'past_due': return 'past_due';
          case 'cancelled':
          case 'canceled': return 'cancelled';
          default: return 'none';
        }
      })();
      const limit = a?.reportLimit;
      const reportsLimit: SubscriptionInfo['reportsLimit'] =
        limit == null || limit < 0 ? 'unlimited' : limit;

      setSubscription({
        tier: (a?.tier as SubscriptionInfo['tier']) ?? 'free',
        status: mappedStatus,
        currentPeriodStart: a?.currentPeriodStart ?? '',
        currentPeriodEnd: a?.currentPeriodEnd ?? '',
        reportsUsedThisPeriod: u?.reportsThisMonth ?? 0,
        reportsLimit,
        batchEnabled: (a?.tier === 'firm_unlimited'),
        nextInvoiceAmount: mappedStatus === 'active' ? (a?.monthlyUsd ?? null) : null,
        trialEndsAt: a?.isTrialing ? (a?.currentPeriodEnd ?? undefined) : undefined,
      });

      setUsage({
        totalReports: u?.totalReports ?? 0,
        reportsThisMonth: u?.reportsThisMonth ?? 0,
        totalDocumentsPurchased: t?.totalDocsPurchased ?? 0,
        totalDocumentSpend: t?.totalSpentUsd ?? 0,
        totalAiTokensUsed: u?.totalTokens ?? 0,
        aiCostEstimate: u?.totalAiCostUsd ?? 0,
        avgReportTimeMs: 0, // not tracked by the API yet
        topCounties: [], // not tracked by the API yet
        reportsByMonth: (u?.monthlyBreakdown ?? []).map((m) => ({
          month: m.month,
          count: m.callCount ?? 0,
        })),
      });

      setInvoices(
        (data.invoices ?? []).map((inv) => ({
          invoiceId: inv.id,
          date: inv.date,
          description: inv.description,
          amount: inv.amountUsd ?? 0,
          status: inv.status,
          pdfUrl: inv.pdfUrl ?? undefined,
        })),
      );

      setPurchases(
        (data.purchases ?? []).map((p, i) => ({
          transactionId: `${p.date}-${i}`,
          projectId: '',
          projectAddress: p.propertyAddress ?? undefined,
          documentType: p.documentType,
          instrumentNumber: p.instrumentNumber ?? undefined,
          vendor: p.vendor ?? '—',
          amount: p.vendorCostUsd ?? 0,
          serviceFee: p.serviceFeeUsd ?? 0,
          total: p.totalUsd ?? 0,
          status: (p.status === 'failed' ? 'failed' : p.status === 'refunded' ? 'refunded' : 'completed'),
          purchasedAt: p.date,
        })),
      );
    } catch (err) {
      setLoadError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBillingData(); }, [loadBillingData]);

  // ── "Manage Subscription ↗" was a button with no onClick ───────────────────────────────────
  //
  // It rendered an external-link arrow and did nothing at all. `/api/admin/billing/customer-portal`
  // has existed the whole time: it opens a Stripe portal session when `STRIPE_SECRET_KEY` and a
  // `stripe_customer_id` are both present, and otherwise returns a 503 whose `message` explains that
  // billing is still being finalised.
  //
  // That 503 is the answer most operators will get today — Stripe is deliberately off — and it is a
  // far better answer than a button that swallows the click. Showing it is the point: the previous
  // behaviour was indistinguishable from a broken page.
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalNote, setPortalNote] = useState<string | null>(null);

  const openCustomerPortal = useCallback(async () => {
    setPortalBusy(true);
    setPortalNote(null);
    try {
      const res = await fetch('/api/admin/billing/customer-portal', { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as { url?: string; message?: string; error?: string };
      if (res.ok && body.url) { window.location.href = body.url; return; }
      setPortalNote(
        body.message
          ?? body.error
          ?? `The billing portal could not be opened (HTTP ${res.status}).`,
      );
    } catch (err) {
      setPortalNote(`The billing portal could not be reached: ${String(err)}`);
    } finally {
      setPortalBusy(false);
    }
  }, []);


  // ── Render ─────────────────────────────────────────────────────────────────
  //
  // ── E2b: THE SECOND DARK FULL-PAGE LAYOUT INSIDE A LIGHT PORTAL ────────────────────────────
  //
  // 63 dark Tailwind utilities, its own `<header>`, and a `min-h-screen` that fills nothing inside
  // a tab panel — left from when this was `/admin/research/billing/page.tsx` and owned the viewport.
  // The Library tab was the first half of this entry; this is the second and larger one.
  //
  // Three things were wrong underneath the paint, and none of them were about colour:
  //
  //   · the four sub-tabs were plain `<button>`s — no `role="tablist"`, no `aria-selected`, no
  //     arrow keys — in a portal that has a `SegmentedTabs` primitive carrying all three;
  //   · "Manage Subscription ↗" had no `onClick` at all;
  //   · every table was bare `<table>` markup with no caption and no `scope` on its headers, so a
  //     screen reader read eight columns of purchase figures with nothing to tie them to.

  if (sessionStatus === 'loading' || loading) {
    return (
      <div className="research-page">
        <LoadingState label="Loading billing and usage…" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="research-page">
        <ErrorState
          title="Billing data could not be loaded"
          message={loadError}
          onRetry={loadBillingData}
        />
      </div>
    );
  }

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'invoices', label: 'Invoices', count: invoices.length },
    { id: 'purchases', label: 'Purchases', count: purchases.length },
    { id: 'usage', label: 'Usage' },
  ];

  return (
    <div className="research-page">
      <div className="research-page__header">
        <h1 className="research-page__title">
          <CreditCard size={20} strokeWidth={1.75} aria-hidden="true" /> Billing &amp; Usage
        </h1>
      </div>

      {subscription && (
        <section className="research-billing__plan" aria-labelledby="billing-plan-heading">
          <div className="research-billing__plan-main">
            <div className="research-billing__plan-id">
              <h2 id="billing-plan-heading" className="research-billing__tier">
                {TIER_LABELS[subscription.tier]}
              </h2>
              {/* Tone, not a hex code. The status was a pill coloured by `STATUS_COLORS` — "past
                  due" is not a thing to say in amber alone. */}
              <StatPill tone={STATUS_TONES[subscription.status]}>
                {subscription.status.replace('_', ' ')}
              </StatPill>
            </div>
            <p className="research-billing__price">{TIER_PRICES[subscription.tier]}</p>
            {subscription.status === 'trialing' && subscription.trialEndsAt && (
              <p className="research-billing__trial">
                <AlertTriangle size={14} strokeWidth={2} aria-hidden="true" />
                Trial ends {formatDate(subscription.trialEndsAt)}
              </p>
            )}
          </div>

          <div className="research-billing__plan-side">
            {subscription.nextInvoiceAmount !== null && (
              <div className="research-billing__next-amount">
                {formatCurrency(subscription.nextInvoiceAmount)}
              </div>
            )}
            <div className="research-billing__next-date">
              Next billing: {formatDate(subscription.currentPeriodEnd)}
            </div>
            <button
              type="button"
              className="research-billing__manage-btn"
              onClick={openCustomerPortal}
              disabled={portalBusy}
            >
              {portalBusy ? 'Opening…' : 'Manage Subscription'}
              <ExternalLink size={13} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>

          {/* The 503 this endpoint returns while Stripe is off is a real answer, and the button used
              to swallow it along with everything else. `role="status"`, not `alert`: it is the
              expected reply today, not an interruption. */}
          {portalNote && (
            <p className="research-billing__portal-note" role="status">{portalNote}</p>
          )}

          <div className="research-billing__usage-bar">
            <div className="research-billing__usage-labels">
              <span>Reports this period</span>
              <span className="research-billing__usage-count">
                {subscription.reportsUsedThisPeriod}
                {subscription.reportsLimit !== 'unlimited'
                  ? ` / ${subscription.reportsLimit}`
                  : ' / ∞'}
              </span>
            </div>
            <div
              className="research-billing__meter"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={subscription.reportsLimit === 'unlimited' ? undefined : Number(subscription.reportsLimit)}
              aria-valuenow={subscription.reportsUsedThisPeriod}
              aria-label="Reports used this billing period"
            >
              {/* The width is genuinely dynamic, so it stays inline. The COLOUR does not need to be:
                  it was `TIER_COLORS[tier]`, a hex per plan, which made the meter mean one thing on
                  Pro and another on Free for no reason a reader could act on. */}
              <div
                className="research-billing__meter-fill"
                style={{
                  width: subscription.reportsLimit === 'unlimited'
                    ? '20%'
                    : `${Math.min(100, (subscription.reportsUsedThisPeriod / (subscription.reportsLimit as number)) * 100)}%`,
                }}
              />
            </div>
          </div>

          {subscription.batchEnabled && (
            <p className="research-billing__batch">
              <Check size={13} strokeWidth={2.5} aria-hidden="true" /> Batch processing enabled
            </p>
          )}
        </section>
      )}

      {/* Four sub-tabs that were plain buttons. `SegmentedTabs` carries `role="tablist"`, roving
          tabIndex, arrow keys that wrap, and Home/End — the contract seventeen admin portals declare
          and three implement. It also scrolls sideways rather than wrapping, which is what the
          alignment audit asked for when "usage" sat 16px off the right edge at 390px. */}
      <SegmentedTabs
        tabs={TABS}
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        aria-label="Billing sections"
      />

      {activeTab === 'overview' && usage && (
        <div className="research-billing__grid">
          {[
            { label: 'Total Reports', value: usage.totalReports },
            { label: 'This Month', value: usage.reportsThisMonth },
            { label: 'Docs Purchased', value: usage.totalDocumentsPurchased },
            { label: 'Doc Spend', value: formatCurrency(usage.totalDocumentSpend) },
          ].map(stat => (
            <div key={stat.label} className="research-billing__stat">
              {/* These four were `color: '#3B82F6' | '#10B981' | '#F59E0B' | var(--color-error)`.
                  Nothing distinguished them — the colours were decoration standing where a reader
                  expects meaning, and "Doc Spend" being red said something untrue about it. */}
              <div className="research-billing__stat-value">{stat.value}</div>
              <div className="research-billing__stat-label">{stat.label}</div>
            </div>
          ))}

          {(usage.topCounties?.length ?? 0) > 0 && (
            <div className="research-billing__panel research-billing__panel--wide">
              <SectionHeader title="Top Counties" />
              {usage.topCounties.slice(0, 5).map(({ county, count }) => (
                <div key={county} className="research-billing__row">
                  <span>{county}</span>
                  <span className="research-billing__row-value">{count}</span>
                </div>
              ))}
            </div>
          )}

          <div className="research-billing__panel research-billing__panel--wide">
            <SectionHeader title="Performance" />
            <div className="research-billing__row">
              <span>Avg report time</span>
              <span className="research-billing__row-value">{(usage.avgReportTimeMs / 60_000).toFixed(1)} min</span>
            </div>
            <div className="research-billing__row">
              <span>AI tokens used</span>
              <span className="research-billing__row-value">{usage.totalAiTokensUsed.toLocaleString()}</span>
            </div>
            <div className="research-billing__row">
              <span>AI cost estimate</span>
              <span className="research-billing__row-value">{formatCurrency(usage.aiCostEstimate)}</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'invoices' && (
        invoices.length === 0 ? (
          <EmptyState
            icon={<FileText size={40} strokeWidth={1.5} />}
            title="No invoices yet."
            body="Invoices appear here once a billing period closes on a paid plan."
          />
        ) : (
          <div className="research-billing__table-wrap">
            <table className="research-billing__table">
              <caption className="research-billing__caption">Invoice history</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Description</th>
                  <th scope="col" className="research-billing__num">Amount</th>
                  <th scope="col">Status</th>
                  <th scope="col">PDF</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.invoiceId}>
                    <td>{formatDate(inv.date)}</td>
                    <td>{inv.description}</td>
                    <td className="research-billing__num">{formatCurrency(inv.amount)}</td>
                    <td>
                      <StatPill tone={inv.status === 'paid' ? 'good' : inv.status === 'open' ? 'warn' : 'neutral'}>
                        {inv.status}
                      </StatPill>
                    </td>
                    <td>
                      {inv.pdfUrl ? (
                        <a
                          href={inv.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="research-billing__link"
                        >
                          PDF <ExternalLink size={11} strokeWidth={2} aria-hidden="true" />
                        </a>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {activeTab === 'purchases' && (
        <>
          {/* The vendor accounts sit above the purchase log because they are what DECIDES whether
              the next purchase can happen: an account with no balance and no top-up limits will
              simply stop a run, and the log only shows what already succeeded. */}
          <div className="research-billing__vendors">
            <VendorAccountsPanel />
          </div>

          {purchases.length === 0 ? (
            <EmptyState
              icon={<Receipt size={40} strokeWidth={1.5} />}
              title="No document purchases yet."
              // Not a neutral fact. `research_document_purchases` has never had a row, and a run
              // that bought nothing may have been budget-capped rather than finished — so this says
              // where to look rather than leaving an empty box to interpret.
              body="A run buys documents only when a vendor account is funded and the run's budget allows it. Check the vendor accounts above and the skipped list on a run."
            />
          ) : (
            <div className="research-billing__table-wrap">
              <table className="research-billing__table">
                <caption className="research-billing__caption">Document purchases</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Document</th>
                    <th scope="col">Property</th>
                    <th scope="col">Vendor</th>
                    <th scope="col" className="research-billing__num">Cost</th>
                    <th scope="col" className="research-billing__num">Fee</th>
                    <th scope="col" className="research-billing__num">Total</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map(p => (
                    <tr key={p.transactionId}>
                      <td>{formatDate(p.purchasedAt)}</td>
                      <td>
                        <div>{p.documentType}</div>
                        {p.instrumentNumber && (
                          <div className="research-billing__instrument">{p.instrumentNumber}</div>
                        )}
                      </td>
                      <td>
                        {p.projectAddress ? (
                          <Link href={`/admin/research/${p.projectId}`} className="research-billing__link">
                            {p.projectAddress}
                          </Link>
                        ) : (
                          <span className="research-billing__muted">{p.projectId}</span>
                        )}
                      </td>
                      <td>{p.vendor}</td>
                      <td className="research-billing__num">{formatCurrency(p.amount)}</td>
                      <td className="research-billing__num">{formatCurrency(p.serviceFee)}</td>
                      <td className="research-billing__num research-billing__num--total">{formatCurrency(p.total)}</td>
                      <td>
                        <StatPill tone={p.status === 'completed' ? 'good' : p.status === 'failed' ? 'bad' : 'neutral'}>
                          {p.status}
                        </StatPill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {activeTab === 'usage' && usage && (
        <div className="research-billing__usage">
          {(usage.reportsByMonth?.length ?? 0) > 0 && (
            <div className="research-billing__panel">
              <SectionHeader title="Reports per Month" />
              <div className="research-billing__chart">
                {usage.reportsByMonth.slice(-12).map(({ month, count }) => {
                  const maxCount = Math.max(...usage.reportsByMonth.map(r => r.count), 1);
                  const pct = (count / maxCount) * 100;
                  return (
                    <div key={month} className="research-billing__bar-col">
                      {/* A bar chart carried entirely by `title=`, which never appears on a touch
                          device and is not announced. The figure is text now, above the bar. */}
                      <span className="research-billing__bar-value">{count}</span>
                      <div
                        className="research-billing__bar"
                        style={{ height: `${Math.max(pct, 4)}%` }}
                      />
                      <div className="research-billing__bar-label">{month.slice(5)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="research-billing__table-wrap">
            <table className="research-billing__table research-billing__table--pairs">
              <caption className="research-billing__caption">Usage detail</caption>
              <tbody>
                {[
                  ['Total reports run', usage.totalReports.toString()],
                  ['Reports this month', usage.reportsThisMonth.toString()],
                  ['Documents purchased', usage.totalDocumentsPurchased.toString()],
                  ['Total document spend', formatCurrency(usage.totalDocumentSpend)],
                  ['AI tokens used', usage.totalAiTokensUsed.toLocaleString()],
                  ['Estimated AI cost', formatCurrency(usage.aiCostEstimate)],
                  ['Avg pipeline time', `${(usage.avgReportTimeMs / 60_000).toFixed(1)} minutes`],
                ].map(([label, value]) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    <td className="research-billing__num">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
