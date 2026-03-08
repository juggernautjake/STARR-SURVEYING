// app/admin/research/billing/page.tsx — Phase 13 Research Billing & Usage Dashboard
// Shows subscription status, usage metrics, invoice history, and document
// purchase transaction log for the current user's research account.
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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

// ── Tier config ───────────────────────────────────────────────────────────────

const TIER_LABELS: Record<SubscriptionInfo['tier'], string> = {
  free: 'Free Trial',
  surveyor_pro: 'Surveyor Pro',
  firm_unlimited: 'Firm Unlimited',
};

const TIER_COLORS: Record<SubscriptionInfo['tier'], string> = {
  free: '#9CA3AF',
  surveyor_pro: '#3B82F6',
  firm_unlimited: '#8B5CF6',
};

const TIER_PRICES: Record<SubscriptionInfo['tier'], string> = {
  free: 'Free (2 reports/mo)',
  surveyor_pro: '$99/month',
  firm_unlimited: '$299/month',
};

const STATUS_COLORS: Record<SubscriptionInfo['status'], string> = {
  active: '#10B981',
  trialing: '#F59E0B',
  past_due: '#EF4444',
  cancelled: '#9CA3AF',
  none: '#9CA3AF',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ResearchBillingPage() {
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
    if (sessionStatus === 'unauthenticated') router.push('/auth/signin');
  }, [sessionStatus, router]);

  const loadBillingData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/research/billing');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        subscription: SubscriptionInfo;
        usage: UsageMetrics;
        invoices: Invoice[];
        purchases: PurchaseTransaction[];
      };
      setSubscription(data.subscription);
      setUsage(data.usage);
      setInvoices(data.invoices ?? []);
      setPurchases(data.purchases ?? []);
    } catch (err) {
      setLoadError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBillingData(); }, [loadBillingData]);

  if (sessionStatus === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-300 text-center">
          <div className="text-4xl mb-4 animate-spin">⟳</div>
          <p>Loading billing data…</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">Failed to load billing data</p>
          <p className="text-gray-500 text-sm mb-6">{loadError}</p>
          <button onClick={loadBillingData} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* ── Header ── */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/research" className="text-gray-400 hover:text-white text-sm">
            ← Research
          </Link>
          <h1 className="text-xl font-bold">💳 Billing & Usage</h1>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* ── Subscription card ── */}
        {subscription && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h2
                    className="text-2xl font-bold"
                    style={{ color: TIER_COLORS[subscription.tier] }}
                  >
                    {TIER_LABELS[subscription.tier]}
                  </h2>
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: STATUS_COLORS[subscription.status] }}
                  >
                    {subscription.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <p className="text-gray-400 text-sm">{TIER_PRICES[subscription.tier]}</p>
                {subscription.status === 'trialing' && subscription.trialEndsAt && (
                  <p className="text-yellow-400 text-sm mt-1">
                    ⚠ Trial ends {formatDate(subscription.trialEndsAt)}
                  </p>
                )}
              </div>

              <div className="text-right">
                {subscription.nextInvoiceAmount !== null && (
                  <div className="text-2xl font-bold text-white">
                    {formatCurrency(subscription.nextInvoiceAmount)}
                  </div>
                )}
                <div className="text-gray-400 text-sm">
                  Next billing: {formatDate(subscription.currentPeriodEnd)}
                </div>
                <button className="mt-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm">
                  Manage Subscription ↗
                </button>
              </div>
            </div>

            {/* Usage bar */}
            <div className="mt-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Reports this period</span>
                <span className="text-white">
                  {subscription.reportsUsedThisPeriod}
                  {subscription.reportsLimit !== 'unlimited'
                    ? ` / ${subscription.reportsLimit}`
                    : ' / ∞'}
                </span>
              </div>
              <div className="bg-gray-800 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: subscription.reportsLimit === 'unlimited'
                      ? '20%'
                      : `${Math.min(100, (subscription.reportsUsedThisPeriod / (subscription.reportsLimit as number)) * 100)}%`,
                    backgroundColor: TIER_COLORS[subscription.tier],
                  }}
                />
              </div>
            </div>

            {subscription.batchEnabled && (
              <div className="mt-3 text-xs text-purple-400">✓ Batch processing enabled</div>
            )}
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="flex gap-1 mb-4">
          {(['overview', 'invoices', 'purchases', 'usage'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors capitalize ${
                activeTab === tab
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* ── Overview tab ── */}
        {activeTab === 'overview' && usage && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Reports', value: usage.totalReports, color: '#3B82F6' },
              { label: 'This Month', value: usage.reportsThisMonth, color: '#10B981' },
              { label: 'Docs Purchased', value: usage.totalDocumentsPurchased, color: '#F59E0B' },
              { label: 'Doc Spend', value: formatCurrency(usage.totalDocumentSpend), color: '#EF4444' },
            ].map(stat => (
              <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <div className="text-2xl font-bold" style={{ color: stat.color }}>
                  {stat.value}
                </div>
                <div className="text-xs text-gray-400 mt-1">{stat.label}</div>
              </div>
            ))}

            {/* Top counties */}
            {usage.topCounties.length > 0 && (
              <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold mb-3 text-gray-300">Top Counties</h3>
                {usage.topCounties.slice(0, 5).map(({ county, count }) => (
                  <div key={county} className="flex justify-between text-sm py-1 border-b border-gray-800 last:border-0">
                    <span className="text-gray-300">{county}</span>
                    <span className="text-blue-400 font-medium">{count}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Avg report time */}
            <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-3 text-gray-300">Performance</h3>
              <div className="flex justify-between text-sm py-1 border-b border-gray-800">
                <span className="text-gray-400">Avg report time</span>
                <span className="text-white">{(usage.avgReportTimeMs / 60_000).toFixed(1)} min</span>
              </div>
              <div className="flex justify-between text-sm py-1 border-b border-gray-800">
                <span className="text-gray-400">AI tokens used</span>
                <span className="text-white">{usage.totalAiTokensUsed.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm py-1">
                <span className="text-gray-400">AI cost estimate</span>
                <span className="text-yellow-400">{formatCurrency(usage.aiCostEstimate)}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Invoices tab ── */}
        {activeTab === 'invoices' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {invoices.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No invoices yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Description</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center">PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.invoiceId} className="border-t border-gray-800 hover:bg-gray-800/50">
                      <td className="px-4 py-3 text-gray-300">{formatDate(inv.date)}</td>
                      <td className="px-4 py-3 text-gray-200">{inv.description}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(inv.amount)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          inv.status === 'paid' ? 'bg-green-900 text-green-300' :
                          inv.status === 'open' ? 'bg-yellow-900 text-yellow-300' :
                          'bg-gray-700 text-gray-400'
                        }`}>
                          {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {inv.pdfUrl ? (
                          <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 text-xs">PDF ↗</a>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Purchases tab ── */}
        {activeTab === 'purchases' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {purchases.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No document purchases yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Document</th>
                    <th className="px-4 py-3 text-left">Property</th>
                    <th className="px-4 py-3 text-left">Vendor</th>
                    <th className="px-4 py-3 text-right">Cost</th>
                    <th className="px-4 py-3 text-right">Fee</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map(p => (
                    <tr key={p.transactionId} className="border-t border-gray-800 hover:bg-gray-800/50">
                      <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(p.purchasedAt)}</td>
                      <td className="px-4 py-3">
                        <div className="text-gray-200 text-xs">{p.documentType}</div>
                        {p.instrumentNumber && (
                          <div className="text-gray-500 font-mono text-xs">{p.instrumentNumber}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {p.projectAddress ? (
                          <Link href={`/admin/research/${p.projectId}`}
                            className="text-blue-400 hover:text-blue-300 text-xs truncate max-w-32 block">
                            {p.projectAddress}
                          </Link>
                        ) : (
                          <span className="text-gray-500 text-xs">{p.projectId}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{p.vendor}</td>
                      <td className="px-4 py-3 text-right text-gray-300">{formatCurrency(p.amount)}</td>
                      <td className="px-4 py-3 text-right text-gray-400">{formatCurrency(p.serviceFee)}</td>
                      <td className="px-4 py-3 text-right font-medium text-white">{formatCurrency(p.total)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          p.status === 'completed' ? 'bg-green-900 text-green-300' :
                          p.status === 'failed' ? 'bg-red-900 text-red-300' :
                          'bg-gray-700 text-gray-400'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Usage tab ── */}
        {activeTab === 'usage' && usage && (
          <div className="space-y-4">
            {/* Monthly report chart (simple bar chart) */}
            {usage.reportsByMonth.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold mb-4 text-gray-300">Reports per Month</h3>
                <div className="flex items-end gap-2 h-24">
                  {usage.reportsByMonth.slice(-12).map(({ month, count }) => {
                    const maxCount = Math.max(...usage.reportsByMonth.map(r => r.count), 1);
                    const pct = (count / maxCount) * 100;
                    return (
                      <div key={month} className="flex flex-col items-center flex-1 min-w-0">
                        <div
                          className="w-full bg-blue-600 rounded-t transition-all"
                          style={{ height: `${Math.max(pct, 4)}%` }}
                          title={`${month}: ${count}`}
                        />
                        <div className="text-xs text-gray-500 mt-1 truncate w-full text-center">
                          {month.slice(5)} {/* Show MM part */}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Usage details table */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
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
                    <tr key={label} className="border-t border-gray-800 first:border-0">
                      <td className="px-5 py-3 text-gray-400">{label}</td>
                      <td className="px-5 py-3 text-right font-medium text-white">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
