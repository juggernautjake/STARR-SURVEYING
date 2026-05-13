'use client';
// app/platform/page.tsx
//
// Operator console home (/platform). Dashboard with live headline
// stats (customers / MRR / open tickets / audit) + recent signups +
// surface directory.
//
// Spec: docs/planning/in-progress/OPERATOR_CONSOLE.md §3.1 + §3.10.

import Link from 'next/link';
import { useEffect, useState } from 'react';

const SURFACES: { href: string; label: string; status: string }[] = [
  { href: '/platform/customers',  label: 'Customers',  status: 'Live — list + detail' },
  { href: '/platform/billing',    label: 'Billing',    status: 'Coming in C-4' },
  { href: '/platform/support',    label: 'Support',    status: 'Live — inbox' },
  { href: '/platform/releases',   label: 'Releases',   status: 'Live — list + composer' },
  { href: '/platform/broadcasts', label: 'Broadcasts', status: 'Coming in C-7' },
  { href: '/platform/health',     label: 'Health',     status: 'Coming in C-8' },
  { href: '/platform/audit',      label: 'Audit Log',  status: 'Live' },
  { href: '/platform/team',       label: 'Team',       status: 'Live — list + invite' },
];

interface DashboardData {
  customers: { total: number; active: number; trialing: number };
  mrrCents: number;
  openTickets: number;
  auditLast24h: number;
  recentSignups: Array<{ id: string; name: string; slug: string; status: string; createdAt: string }>;
}

function fmtMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
}

export default function PlatformHome() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/platform/dashboard', { cache: 'no-store' });
        if (!res.ok) {
          setError(`Couldn't load dashboard (status ${res.status}).`);
          return;
        }
        const d = (await res.json()) as DashboardData;
        if (!cancelled) setData(d);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ padding: '2rem 1.5rem', maxWidth: '1280px', margin: '0 auto' }}>
      <h1 style={{
        fontFamily: 'Sora, sans-serif',
        fontSize: '2rem',
        fontWeight: 600,
        margin: '0 0 0.5rem',
      }}>
        Operator Console
      </h1>
      <p style={{ color: 'rgba(255, 255, 255, 0.7)', marginBottom: '1.75rem' }}>
        Cross-tenant operations for the Starr Software SaaS. Customer admin shells live at{' '}
        <code style={{ color: '#FCD34D' }}>[org-slug].starrsoftware.com/admin</code>; this is the management side.
      </p>

      {error ? (
        <div style={{ padding: '1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#FCA5A5', marginBottom: '1.5rem' }}>
          {error}
        </div>
      ) : !data ? (
        <div style={{ padding: '1rem', color: 'rgba(255,255,255,0.5)', marginBottom: '1.5rem' }}>Loading headline stats…</div>
      ) : (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '0.85rem',
            marginBottom: '1.75rem',
          }}>
            <Stat
              label="Customers"
              primary={String(data.customers.total)}
              secondary={`${data.customers.active} active · ${data.customers.trialing} trial`}
            />
            <Stat
              label="MRR (mo)"
              primary={fmtMoney(data.mrrCents)}
              secondary="Active + trialing subs"
            />
            <Stat
              label="Open tickets"
              primary={String(data.openTickets)}
              secondary={data.openTickets > 0 ? 'Awaiting response' : 'All caught up'}
              accent={data.openTickets > 0 ? '#F59E0B' : undefined}
            />
            <Stat
              label="Audit (24h)"
              primary={String(data.auditLast24h)}
              secondary="Cross-tenant activity"
            />
          </div>

          {data.recentSignups.length > 0 && (
            <section style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '1.25rem',
              marginBottom: '1.75rem',
            }}>
              <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>
                Recent signups (last 7 days)
              </h2>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {data.recentSignups.map((s) => (
                  <li key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.85rem' }}>
                    <Link href={`/platform/customers/${s.id}`} style={{ color: '#FCD34D', textDecoration: 'none', fontWeight: 600 }}>
                      {s.name}
                    </Link>
                    <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.78rem', fontFamily: 'JetBrains Mono,monospace' }}>
                      {s.slug} · {s.status} · {new Date(s.createdAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 600 }}>
        Surfaces
      </h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: '0.85rem',
      }}>
        {SURFACES.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            style={{
              display: 'block',
              padding: '1rem',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              textDecoration: 'none',
              color: '#FFF',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{s.label}</div>
            <div style={{ fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.5)' }}>
              {s.status}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, primary, secondary, accent }: { label: string; primary: string; secondary: string; accent?: string }) {
  return (
    <div style={{
      padding: '1rem 1.1rem',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10,
    }}>
      <div style={{
        fontSize: '0.72rem',
        color: 'rgba(255,255,255,0.6)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        fontWeight: 600,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'Sora,sans-serif',
        fontSize: '1.6rem',
        fontWeight: 600,
        color: accent ?? '#FFF',
        marginTop: '0.25rem',
      }}>
        {primary}
      </div>
      <div style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.55)', marginTop: '0.15rem' }}>
        {secondary}
      </div>
    </div>
  );
}
