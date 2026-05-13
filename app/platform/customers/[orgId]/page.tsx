'use client';
// app/platform/customers/[orgId]/page.tsx
//
// Operator-side customer detail. Shows the org row, subscription
// state, headline stats (members / invoices / open tickets) + last
// 25 audit entries.
//
// Phase C-2 follow-up of OPERATOR_CONSOLE.md.

import Link from 'next/link';
import { use, useEffect, useState } from 'react';

interface CustomerDetail {
  org: {
    id: string;
    slug: string;
    name: string;
    status: string;
    state: string | null;
    country: string | null;
    primaryAdminEmail: string | null;
    billingContactEmail: string | null;
    phone: string | null;
    createdAt: string;
  };
  subscription: {
    status: string;
    bundles: string[];
    seatCount: number;
    baseCents: number;
    perSeatCents: number;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
  } | null;
  stats: {
    memberCount: number;
    invoiceCount: number;
    openTickets: number;
  };
  recentAudit: Array<{
    id: string;
    operatorEmail: string | null;
    customerEmail: string | null;
    action: string;
    severity: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
}

const STATUS_COLORS: Record<string, string> = {
  active:     '#10B981',
  trialing:   '#3B82F6',
  past_due:   '#F59E0B',
  suspended:  '#9CA3AF',
  canceled:   '#6B7280',
  pending:    '#FCD34D',
};

const SEVERITY_COLORS: Record<string, string> = {
  info:     '#9CA3AF',
  warning:  '#F59E0B',
  critical: '#EF4444',
};

function fmtMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

interface PageProps { params: Promise<{ orgId: string }> }

export default function PlatformCustomerDetailPage({ params }: PageProps) {
  const { orgId } = use(params);
  const [data, setData] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/platform/customers/${orgId}`, { cache: 'no-store' });
        if (!res.ok) {
          setError(`Couldn't load customer (status ${res.status}).`);
          return;
        }
        const d = (await res.json()) as CustomerDetail;
        if (!cancelled) setData(d);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed.');
      }
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  if (error) {
    return <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1.5rem', color: '#FCA5A5' }}>{error}</div>;
  }
  if (!data) {
    return <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1.5rem', color: 'rgba(255,255,255,0.6)' }}>Loading…</div>;
  }

  const { org, subscription, stats, recentAudit } = data;
  const monthlyMrr = subscription
    ? subscription.baseCents + Math.max(0, subscription.seatCount - 0) * subscription.perSeatCents
    : 0;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <Link href="/platform/customers" style={{ color: '#FCD34D', fontSize: '0.85rem', textDecoration: 'none' }}>
        ← Back to customers
      </Link>

      <header style={{ marginTop: '0.6rem', marginBottom: '1.5rem' }}>
        <h1 style={{ fontFamily: 'Sora,sans-serif', fontSize: '1.8rem', margin: '0 0 0.25rem' }}>
          {org.name}
        </h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <code style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>
            {org.slug}
          </code>
          <span style={{
            padding: '0.15rem 0.55rem',
            background: STATUS_COLORS[org.status] ?? '#6B7280',
            color: '#0F1419',
            borderRadius: 999,
            fontSize: '0.72rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}>
            {org.status}
          </span>
          {org.state && <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.6)' }}>{org.state}, {org.country ?? 'US'}</span>}
          <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.5)' }}>
            · founded {new Date(org.createdAt).toLocaleDateString()}
          </span>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem', marginBottom: '1.5rem' }}>
        <Stat label="Monthly MRR" value={fmtMoney(monthlyMrr)} />
        <Stat label="Active members" value={String(stats.memberCount)} />
        <Stat label="Invoices" value={String(stats.invoiceCount)} />
        <Stat label="Open tickets" value={String(stats.openTickets)} accent={stats.openTickets > 0 ? '#F59E0B' : undefined} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
        <section style={cardStyle}>
          <h2 style={cardTitle}>Contacts</h2>
          <KV k="Primary admin" v={org.primaryAdminEmail ?? '—'} mono />
          <KV k="Billing contact" v={org.billingContactEmail ?? '—'} mono />
          <KV k="Phone" v={org.phone ?? '—'} />
        </section>

        <section style={cardStyle}>
          <h2 style={cardTitle}>Subscription</h2>
          {subscription ? (
            <>
              <KV k="Status" v={subscription.status} />
              <KV k="Bundles" v={subscription.bundles.length > 0 ? subscription.bundles.join(' · ') : '—'} />
              <KV k="Seats" v={String(subscription.seatCount)} />
              <KV k="Base / mo" v={fmtMoney(subscription.baseCents)} />
              <KV k="Per-seat overage" v={fmtMoney(subscription.perSeatCents)} />
              <KV k="Trial ends" v={subscription.trialEndsAt ? new Date(subscription.trialEndsAt).toLocaleDateString() : '—'} />
              <KV k="Renews" v={subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : '—'} />
              <KV k="Cancel at period end" v={subscription.cancelAtPeriodEnd ? 'yes' : 'no'} accent={subscription.cancelAtPeriodEnd ? '#F59E0B' : undefined} />
              <KV k="Stripe customer" v={subscription.stripeCustomerId ?? '—'} mono />
              <KV k="Stripe subscription" v={subscription.stripeSubscriptionId ?? '—'} mono />
            </>
          ) : (
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', margin: 0 }}>No subscription on file.</p>
          )}
        </section>
      </div>

      <section style={cardStyle}>
        <h2 style={cardTitle}>Recent audit ({recentAudit.length})</h2>
        {recentAudit.length === 0 ? (
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', margin: 0 }}>No audit entries in the last window.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {recentAudit.map((a) => (
              <li key={a.id} style={{
                padding: '0.55rem 0.7rem',
                background: 'rgba(255,255,255,0.04)',
                borderLeft: `3px solid ${SEVERITY_COLORS[a.severity] ?? '#9CA3AF'}`,
                borderRadius: 6,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: '0.5rem',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: '0.78rem', fontWeight: 700 }}>{a.action}</div>
                  <div style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.55)' }}>
                    {a.operatorEmail ?? a.customerEmail ?? 'system'}
                  </div>
                </div>
                <div style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.55)', fontFamily: 'JetBrains Mono,monospace', whiteSpace: 'nowrap' }}>
                  {new Date(a.createdAt).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{
      padding: '0.85rem 1rem',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10,
    }}>
      <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'Sora,sans-serif', fontSize: '1.4rem', fontWeight: 600, color: accent ?? '#FFF', marginTop: '0.2rem' }}>
        {value}
      </div>
    </div>
  );
}

function KV({ k, v, mono, accent }: { k: string; v: string; mono?: boolean; accent?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', padding: '0.25rem 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.85rem' }}>
      <span style={{ color: 'rgba(255,255,255,0.6)' }}>{k}</span>
      <span style={{
        color: accent ?? '#FFF',
        fontFamily: mono ? 'JetBrains Mono,monospace' : 'inherit',
        fontSize: mono ? '0.78rem' : '0.85rem',
        textAlign: 'right',
        wordBreak: 'break-all',
      }}>
        {v}
      </span>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  padding: '1.1rem 1.25rem',
};

const cardTitle: React.CSSProperties = {
  fontFamily: 'Sora,sans-serif',
  fontSize: '1rem',
  margin: '0 0 0.75rem',
};
