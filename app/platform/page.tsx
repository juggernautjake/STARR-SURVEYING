'use client';
// app/platform/page.tsx
//
// Operator console home (/platform). Phase C-1 placeholder — the full
// dashboard (MRR / ticket queue / recent signups / health) lands in
// C-8 after the cross-tenant aggregation queries are in place.
//
// For now: links to the surfaces that will exist + status of each.
//
// Spec: docs/planning/in-progress/OPERATOR_CONSOLE.md §3.1.

import Link from 'next/link';

const SURFACES: { href: string; label: string; status: string; phase: string }[] = [
  { href: '/platform/customers',  label: 'Customers',  status: 'Coming in C-2', phase: 'Phase C-2' },
  { href: '/platform/billing',    label: 'Billing',    status: 'Coming in C-4', phase: 'Phase C-4' },
  { href: '/platform/support',    label: 'Support',    status: 'Coming in E-4', phase: 'Phase E-4' },
  { href: '/platform/releases',   label: 'Releases',   status: 'Coming in C-7', phase: 'Phase C-7' },
  { href: '/platform/broadcasts', label: 'Broadcasts', status: 'Coming in C-7', phase: 'Phase C-7' },
  { href: '/platform/health',     label: 'Health',     status: 'Coming in C-8', phase: 'Phase C-8' },
  { href: '/platform/audit',      label: 'Audit Log',  status: 'Coming in C-5', phase: 'Phase C-5' },
  { href: '/platform/team',       label: 'Team',       status: 'Coming in C-9', phase: 'Phase C-9' },
];

export default function PlatformHome() {
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
      <p style={{ color: 'rgba(255, 255, 255, 0.7)', marginBottom: '2rem' }}>
        Cross-tenant operations for the Starr Software SaaS. Customer
        admin shells live at <code style={{ color: '#FCD34D' }}>[org-slug].starrsoftware.com/admin</code>;
        this console is the management side.
      </p>

      <section style={{
        background: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '2rem',
      }}>
        <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 600 }}>
          Status
        </h2>
        <p style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: '0.9rem', lineHeight: 1.6 }}>
          Foundational schema for organizations, subscriptions, support
          tickets, audit logs, and notifications has shipped via
          seeds/260-270. The auth refactor (master plan slice M-9)
          turns this surface into the live operator console. Until M-9
          lands, every `/platform/*` route gates on
          <code style={{ color: '#FCD34D', margin: '0 4px' }}>session.user.isOperator</code>
          which is false by default; reaching this page in production
          requires the operator&apos;s email to be present in the
          <code style={{ color: '#FCD34D', margin: '0 4px' }}>operator_users</code>
          table (seeded in seeds/265 with the three founding admins).
        </p>
      </section>

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
