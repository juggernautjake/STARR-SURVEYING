'use client';
// lib/hub/widgets/money/index.tsx
//
// Slice W9c (hub-cad-roles-polish-2026-06-18) — consolidated
// money widget. Absorbs:
//   - my-pay              — last payout + current pay rate
//   - monthly-revenue     — firm-wide revenue trend
//   - outstanding-invoices — open AR
//
// The three legacy widgets read distinct endpoints with no
// overlap. The consolidated tile fans out three parallel
// fetches and tabs / stacks the data by size bucket. Per the
// W5 pattern, 401 / 403 on a firm-wide endpoint resolves to a
// quiet "no data" — non-finance users still see their own pay
// without seeing fake error chrome for revenue / invoices.
//
// Size-relative content (W5 / W8 / W9a / W9b pattern):
//   tiny    — last payout amount (your pay)
//   small   — same — last payout + current rate
//   medium  — my-pay + monthly-revenue side by side
//   large   — three columns (pay / revenue / outstanding)
//   xlarge  — three columns + invoice list

import React, { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { defineWidget, type WidgetProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetSkeleton from '@/lib/hub/components/WidgetSkeleton';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import WidgetError from '@/lib/hub/components/WidgetError';

interface PayProfile {
  hourly_rate?: number | null;
  annual_salary?: number | null;
  salary_type?: string | null;
}
interface PayoutRow { amount: number; processed_at: string }
interface RevenuePoint { period: string; revenue: number }
interface Invoice { id: string; client_name?: string | null; amount_due?: number | null; due_date?: string | null }

interface MoneyContent extends Record<string, unknown> {
  showOpenLink: boolean;
}
const DEFAULTS: MoneyContent = { showOpenLink: true };

interface FetchState {
  status: 'loading' | 'ok' | 'empty' | 'error';
  errorMessage: string;
  payProfile: PayProfile | null;
  lastPayout: PayoutRow | null;
  revenueSeries: RevenuePoint[];
  invoices: Invoice[];
}

function MoneyWidget({ size, content }: WidgetProps<MoneyContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);
  const { data: session } = useSession();
  const email = session?.user?.email ?? '';
  const [state, setState] = useState<FetchState>({
    status: 'loading',
    errorMessage: '',
    payProfile: null,
    lastPayout: null,
    revenueSeries: [],
    invoices: [],
  });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading' }));
    try {
      const [profileRes, payoutRes, revenueRes, invoiceRes] = await Promise.all([
        email
          ? fetch(`/api/admin/payroll/employees?email=${encodeURIComponent(email)}`).catch(() => null)
          : Promise.resolve(null),
        email
          ? fetch(`/api/admin/payroll/payout-log?email=${encodeURIComponent(email)}&limit=1`).catch(() => null)
          : Promise.resolve(null),
        fetch('/api/admin/reports?metric=monthly-revenue&period=ytd').catch(() => null),
        fetch('/api/admin/billing/invoices').catch(() => null),
      ]);

      function readOrSkip(res: Response | null): Promise<unknown | null> | null {
        if (!res) return Promise.resolve(null);
        if (res.status === 401 || res.status === 403) return Promise.resolve(null);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      }

      const profileData = await readOrSkip(profileRes) as { profile?: PayProfile } | null;
      const payoutData = await readOrSkip(payoutRes) as { payouts?: PayoutRow[] } | null;
      const revenueData = await readOrSkip(revenueRes) as { series?: RevenuePoint[] } | null;
      const invoiceData = await readOrSkip(invoiceRes) as { invoices?: Invoice[] } | null;

      const payProfile = profileData?.profile ?? null;
      const lastPayout = payoutData?.payouts?.[0] ?? null;
      const revenueSeries = revenueData?.series ?? [];
      const invoices = invoiceData?.invoices ?? [];

      const hasAny =
        payProfile != null
        || lastPayout != null
        || revenueSeries.length > 0
        || invoices.length > 0;

      setState({
        status: hasAny ? 'ok' : 'empty',
        errorMessage: '',
        payProfile,
        lastPayout,
        revenueSeries,
        invoices,
      });
    } catch (err) {
      setState({
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
        payProfile: null,
        lastPayout: null,
        revenueSeries: [],
        invoices: [],
      });
    }
  }, [email]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (state.status === 'loading') return <WidgetSkeleton rows={3} />;
  if (state.status === 'error') {
    return <WidgetError message={`Couldn't load money data (${state.errorMessage}).`} onRetry={refresh} />;
  }
  if (state.status === 'empty') {
    return <WidgetEmpty icon="💰" title="No money data" description="No payouts, revenue, or open invoices to show right now." />;
  }

  // tiny — last payout amount.
  if (bucket === 'tiny') {
    return (
      <div style={tinyWrapStyle} data-testid="money-tiny">
        {state.lastPayout ? (
          <>
            <span style={tinyCountStyle}>{fmtCents(state.lastPayout.amount)}</span>
            <span style={tinyLabelStyle}>last paycheck</span>
          </>
        ) : (
          <>
            <span style={tinyCountStyle}>—</span>
            <span style={tinyLabelStyle}>no payouts</span>
          </>
        )}
      </div>
    );
  }

  if (bucket === 'small') {
    return (
      <div style={columnStyle} data-testid="money-small">
        <PaySection profile={state.payProfile} lastPayout={state.lastPayout} showOpenLink={settings.showOpenLink} />
      </div>
    );
  }

  if (bucket === 'medium') {
    return (
      <div style={twoColStyle} data-testid="money-medium">
        <PaySection profile={state.payProfile} lastPayout={state.lastPayout} showOpenLink={settings.showOpenLink} />
        <RevenueSection series={state.revenueSeries} showOpenLink={settings.showOpenLink} />
      </div>
    );
  }

  // large + xlarge — three columns
  return (
    <div style={threeColStyle} data-testid={`money-${bucket}`}>
      <PaySection profile={state.payProfile} lastPayout={state.lastPayout} showOpenLink={settings.showOpenLink} />
      <RevenueSection series={state.revenueSeries} showOpenLink={settings.showOpenLink} />
      <InvoiceSection
        invoices={state.invoices}
        showOpenLink={settings.showOpenLink}
        showList={bucket === 'xlarge'}
      />
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────

function PaySection({ profile, lastPayout, showOpenLink }: {
  profile: PayProfile | null;
  lastPayout: PayoutRow | null;
  showOpenLink: boolean;
}) {
  return (
    <section style={columnStyle}>
      <Header label="My pay" href="/admin/me?tab=pay" showOpenLink={showOpenLink} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={metricStyle}>
          {lastPayout ? fmtCents(lastPayout.amount) : '—'}
        </span>
        <span style={metricLabelStyle}>Last paycheck</span>
        {profile && (profile.hourly_rate ?? profile.annual_salary) && (
          <span style={metricSubStyle}>
            {profile.salary_type === 'salary'
              ? `${fmtUSD(profile.annual_salary ?? 0)}/yr`
              : `${fmtUSD(profile.hourly_rate ?? 0)}/hr`}
          </span>
        )}
      </div>
    </section>
  );
}

function RevenueSection({ series, showOpenLink }: {
  series: RevenuePoint[]; showOpenLink: boolean;
}) {
  const ytd = series.reduce((acc, p) => acc + (p.revenue ?? 0), 0);
  const last = series.length > 0 ? series[series.length - 1] : null;
  return (
    <section style={columnStyle}>
      <Header label="Revenue" href="/admin/reports" showOpenLink={showOpenLink} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={metricStyle}>{ytd > 0 ? fmtUSD(ytd) : '—'}</span>
        <span style={metricLabelStyle}>YTD</span>
        {last && (
          <span style={metricSubStyle}>
            {last.period}: {fmtUSD(last.revenue)}
          </span>
        )}
      </div>
    </section>
  );
}

function InvoiceSection({ invoices, showOpenLink, showList }: {
  invoices: Invoice[]; showOpenLink: boolean; showList: boolean;
}) {
  const total = invoices.reduce((acc, i) => acc + (i.amount_due ?? 0), 0);
  return (
    <section style={columnStyle}>
      <Header label="Outstanding" href="/admin/finances" showOpenLink={showOpenLink} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={metricStyle}>{total > 0 ? fmtUSD(total) : '—'}</span>
        <span style={metricLabelStyle}>{invoices.length} open invoice{invoices.length === 1 ? '' : 's'}</span>
      </div>
      {showList && invoices.length > 0 && (
        <ul style={listStyle}>
          {invoices.slice(0, 5).map((i) => (
            <li key={i.id} style={rowStyle}>
              <span style={rowTitleStyle}>{i.client_name ?? 'Invoice'}</span>
              <span style={rowMetaStyle}>{i.amount_due != null ? fmtUSD(i.amount_due) : '—'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Header({ label, href, showOpenLink }: {
  label: string; href: string; showOpenLink: boolean;
}) {
  return (
    <header style={sectionHeaderStyle}>
      <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{label}</span>
      {showOpenLink && (
        <a href={href} style={openLinkStyle}>Open →</a>
      )}
    </header>
  );
}

// ─── Pure helpers ──────────────────────────────────────────────────────

/** Format a dollar amount with currency style. Pure + exported. */
export function fmtUSD(amount: number | null | undefined): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return '—';
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/** Format a cents value (legacy payout-log amount). Pure + exported. */
export function fmtCents(cents: number | null | undefined): string {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '—';
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/** Pure helper — pick the layout variant from a SizeBucket. */
export function moneyLayoutForBucket(bucket: SizeBucket): 'tiny' | 'small' | 'medium' | 'three' {
  if (bucket === 'tiny') return 'tiny';
  if (bucket === 'small') return 'small';
  if (bucket === 'medium') return 'medium';
  return 'three';
}

// ─── Style fragments ───────────────────────────────────────────────────

const tinyWrapStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  height: '100%', gap: 2,
};
const tinyCountStyle: React.CSSProperties = {
  fontSize: 'clamp(1.1rem, 2.4vw, 1.9rem)', fontWeight: 700, lineHeight: 1,
  color: 'var(--theme-fg-primary)',
};
const tinyLabelStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)',
  textTransform: 'uppercase', letterSpacing: 0.5,
};
const columnStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0,
};
const twoColStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--hub-spc-3, 12px)', height: '100%', minHeight: 0,
};
const threeColStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--hub-spc-3, 12px)', height: '100%', minHeight: 0,
};
const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  borderBottom: '1px solid var(--theme-border)', paddingBottom: 4,
};
const openLinkStyle: React.CSSProperties = {
  fontSize: '0.7rem', color: 'var(--theme-accent, #3b82f6)', textDecoration: 'none',
};
const metricStyle: React.CSSProperties = {
  fontSize: '1.15rem', fontWeight: 700, color: 'var(--theme-fg-primary)',
};
const metricLabelStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.72rem)', color: 'var(--theme-fg-secondary)',
  textTransform: 'uppercase', letterSpacing: 0.4,
};
const metricSubStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.72rem)', color: 'var(--theme-fg-secondary)',
};
const listStyle: React.CSSProperties = {
  listStyle: 'none', margin: '4px 0 0', padding: 0,
  display: 'flex', flexDirection: 'column', gap: 4,
  overflow: 'auto', minHeight: 0,
};
const rowStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', gap: 8,
  padding: '2px 0',
};
const rowTitleStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-sm, 0.82rem)', color: 'var(--theme-fg-primary)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};
const rowMetaStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.72rem)', color: 'var(--theme-fg-secondary)',
};

defineWidget<MoneyContent>({
  id: 'money',
  label: 'Money',
  description: 'Pay, revenue, and open invoices — one glance.',
  category: 'financial',
  iconName: 'Wallet',
  defaultSize: { w: 6, h: 3 },
  minSize: { w: 1, h: 1 },
  maxSize: { w: 8, h: 8 },
  defaultContent: DEFAULTS,
  allowedRoles: [],
  Widget: MoneyWidget,
});
