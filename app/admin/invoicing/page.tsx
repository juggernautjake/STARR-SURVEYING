// app/admin/invoicing/page.tsx
//
// Customer-invoicing Phase 2 dashboard — **under construction**.
//
// Per the planning doc at
// `docs/planning/completed/CUSTOMER_INVOICING_PHASE2_2026-06-21.md`, this
// route exists today only as a status board the user (admin / developer)
// can preview while the four Phase-2 features build out behind it:
//
//   1. Upfront-payment rule (deposit % or fixed before partial payments
//      are accepted)
//   2. Financial-allocation categories + ledger + reports
//   3. This auth-gated dashboard you're looking at now
//   4. Mock-customer test harness
//
// The route is auth-gated to admin + developer only because the user
// explicitly asked: "make it so that it is password protected and so that
// only developers and admins can use their personal account passwords to
// login and see the page. It should say that the page is under construction."
//
// Non-admin / non-developer visitors get the "access denied" panel; signed-
// out visitors get redirected to the standard login flow by next-auth.
//
// Phase-1 work (the existing /pay + /admin/invoices/new system) is BLOCKED
// from going live by the table-name collision documented in
// `docs/payments-invoices-collision-2026-06-21.md`. Slice 1 of Phase 2 lands
// that rename; this banner stays in place until every slice in §4 of the
// Phase-2 doc is green.

'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';

interface SliceRow {
  id: string;
  label: string;
  state: 'done' | 'in-progress' | 'planned' | 'blocked' | 'deferred';
  detail: string;
}

const PHASE_2_SLICES: SliceRow[] = [
  { id: '0', label: 'Planning doc + this under-construction route + upfront-rule pure helper',
    state: 'in-progress',
    detail: 'shipped this slice — planning doc at docs/planning/completed/CUSTOMER_INVOICING_PHASE2_2026-06-21.md, this page, lib/payments/upfront-rule.ts.' },
  { id: '1', label: 'Phase-1 table-name collision fix (rename invoices → customer_invoices)',
    state: 'deferred',
    detail: 'BLOCKED on human decision per docs/payments-invoices-collision-2026-06-21.md — touches live Stripe billing. Needs user go-ahead + a Stripe test-mode confirmation pass. Once approved, this re-opens the plan and the half-2 queue ships.' },
  { id: '2', label: 'Schema: deposit_type + deposit_value + upfront_paid_at columns', state: 'deferred',
    detail: 'Depends on slice 1 — the table customer_invoices doesn\'t exist until the rename lands.' },
  { id: '3', label: 'Wire upfront-rule into the public payment route', state: 'deferred',
    detail: 'Depends on slice 2 columns. Pure rule + 28 tests (slice 0) already done; route wiring is trivial once the column exists.' },
  { id: '4', label: 'Customer-facing upfront banner', state: 'deferred',
    detail: 'Depends on slice 2 columns being readable from the invoice row.' },
  { id: '5', label: 'Admin composer: deposit-type picker', state: 'deferred',
    detail: 'Depends on slice 2 columns.' },
  { id: '6', label: 'Notification on upfront-paid transition', state: 'deferred',
    detail: 'Depends on slice 2 + slice 3. Pure isUpfrontPaid helper (slice 0) is the rising-edge detector waiting to be wired.' },
  { id: '7', label: 'Schema: financial_allocation_categories + financial_allocations + default seed', state: 'done',
    detail: 'seeds/374 — 5 user-named + 13 §2.2 proposed categories, all start at 0% pending dad\'s decision; tables FK to payments (not customer_invoices), so independent of the collision fix.' },
  { id: '8', label: 'Allocation engine (pure splitter)', state: 'done',
    detail: 'lib/payments/allocation-engine.ts — pure, last active category absorbs rounding remainder, refuses to write when target_percent ≠ 100. 30 source-locked tests including a books-balance sweep.' },
  { id: '9', label: 'Wire engine into the office-closeout + stripe-webhook paths', state: 'deferred',
    detail: 'Both call sites 500 today on the live invoices table because column names they read don\'t exist in the SaaS-billing schema. Slice 1 unblocks both. Pure allocatePayment engine (slice 8) + 30 tests are ready.' },
  { id: '10', label: 'Reports: /admin/invoicing/reports', state: 'in-progress',
    detail: 'Data layer shipped (lib/payments/allocation-reports.ts — rollupAllocationsByCategory + revenueByPeriod). UI page deferred until slice 1 exposes outstanding-invoices section.' },
  { id: '11', label: 'Category editor: /admin/invoicing/categories', state: 'done',
    detail: 'GET + PUT API at /api/admin/invoicing/categories; UI at /admin/invoicing/categories with inline validation + diff preview. ADD/DELETE deferred to a later slice.' },
  { id: '12', label: 'Mock-customer test harness', state: 'deferred',
    detail: 'Harness seeds rows into customer_invoices + deposit_* columns, neither of which exists until slices 1 + 2 land.' },
  { id: '13', label: 'Remove under-construction banner + graduate the route', state: 'deferred',
    detail: 'Terminal cleanup gate — ships when 1–12 are green. The banner stays until the user reopens this plan and walks the half-2 queue.' },
];

const STATE_COLORS: Record<SliceRow['state'], string> = {
  done:          '#059669',
  'in-progress': '#D97706',
  planned:       '#6B7280',
  blocked:       '#DC2626',
  deferred:      '#7C3AED',
};

const STATE_LABELS: Record<SliceRow['state'], string> = {
  done:          'Done',
  'in-progress': 'In progress',
  planned:       'Planned',
  blocked:       'Blocked',
  deferred:      'Deferred',
};

export default function InvoicingPhase2Page(): React.ReactElement {
  const { data: session, status } = useSession();
  const roles = (session?.user?.roles ?? []) as string[];
  const canView = roles.includes('admin') || roles.includes('developer');

  // Loading session — never flash the "access denied" panel.
  if (status === 'loading') {
    return <main style={styles.shell}><p style={styles.muted}>Loading session…</p></main>;
  }

  if (status === 'unauthenticated' || !session?.user) {
    return (
      <main style={styles.shell}>
        <div style={styles.gate}>
          <h2 style={styles.gateTitle}>Sign in required</h2>
          <p style={styles.gateBody}>
            The Customer Invoicing Phase 2 dashboard is admin- and developer-only
            while it&rsquo;s under construction.
          </p>
          <Link href="/api/auth/signin" style={styles.gateAction}>Sign in</Link>
        </div>
      </main>
    );
  }

  if (!canView) {
    return (
      <main style={styles.shell}>
        <div style={styles.gate}>
          <h2 style={styles.gateTitle}>Access denied</h2>
          <p style={styles.gateBody}>
            This route is restricted to admin and developer roles. You&rsquo;re signed
            in as <code>{session.user.email}</code> with roles{' '}
            <code>{roles.length > 0 ? roles.join(', ') : '(none)'}</code>.
          </p>
          <p style={styles.gateBody}>
            If you need access, ask an admin to add the role to your account.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.shell}>
      <div role="status" style={styles.banner}>
        <strong>🚧 Under construction — Phase 2.</strong>{' '}
        This dashboard is the staging ground for the four customer-invoicing
        features the user asked for on 2026-06-21 (upfront-payment rule,
        financial allocations, this gated route, mock-customer test harness).
        Each slice in the table below ships one at a time; the banner stays
        until every row is <strong>Done</strong>.
      </div>

      <header style={styles.header}>
        <h1 style={styles.h1}>Customer Invoicing — Phase 2</h1>
        <p style={styles.subtitle}>
          Live state of the planning doc at{' '}
          <code>docs/planning/completed/CUSTOMER_INVOICING_PHASE2_2026-06-21.md</code>.
          Hello, {session.user.email}.
        </p>
      </header>

      <section style={styles.section}>
        <h2 style={styles.h2}>Phase-1 status</h2>
        <p style={styles.body}>
          The original 22-slice payment infrastructure (
          <code>/pay</code> customer portal, <code>/admin/invoices/new</code>,
          office close-out, payout batches, Stripe webhook, etc.) is{' '}
          <strong>shipped in code but blocked from going live</strong> by a
          table-name collision between SaaS-billing&rsquo;s <code>invoices</code>{' '}
          table and the customer-invoicing seed-323 <code>invoices</code>{' '}
          table. The fix (rename to <code>customer_invoices</code> + repoint
          18 code sites) is documented in{' '}
          <code>docs/payments-invoices-collision-2026-06-21.md</code>{' '}
          and is Slice 1 of Phase 2.
        </p>
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>Phase-2 slice queue</h2>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>#</th>
              <th style={styles.th}>Slice</th>
              <th style={styles.th}>State</th>
              <th style={styles.th}>Detail</th>
            </tr>
          </thead>
          <tbody>
            {PHASE_2_SLICES.map((s) => (
              <tr key={s.id}>
                <td style={styles.tdCenter}>{s.id}</td>
                <td style={styles.td}>{s.label}</td>
                <td style={styles.td}>
                  <span
                    style={{
                      ...styles.statePill,
                      background: STATE_COLORS[s.state] + '22',
                      color: STATE_COLORS[s.state],
                      borderColor: STATE_COLORS[s.state] + '55',
                    }}
                  >
                    {STATE_LABELS[s.state]}
                  </span>
                </td>
                <td style={styles.tdMuted}>{s.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>Where the existing work lives</h2>
        <ul style={styles.list}>
          <li>Customer portal: <code>app/pay/page.tsx</code> + <code>app/pay/[invoice]/page.tsx</code></li>
          <li>Compose + send: <code>app/admin/invoices/new/page.tsx</code></li>
          <li>Office close-out: <code>app/admin/payments/inbox/page.tsx</code></li>
          <li>Payout batches: <code>app/admin/payouts/runs/*</code></li>
          <li>Stripe + Venmo / CashApp / Zelle helpers: <code>lib/payments/*</code></li>
          <li>Upfront-rule (new this slice): <code>lib/payments/upfront-rule.ts</code></li>
        </ul>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    maxWidth: 1080,
    margin: '0 auto',
    padding: '2rem 1.5rem',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    color: '#0F1419',
  },
  banner: {
    background: '#FEF3C7',
    border: '1px solid #F59E0B',
    color: '#78350F',
    padding: '0.85rem 1rem',
    borderRadius: 8,
    marginBottom: '1.25rem',
    fontSize: '0.92rem',
    lineHeight: 1.55,
  },
  header: { marginBottom: '1.5rem' },
  h1: {
    fontFamily: 'Sora, sans-serif',
    fontSize: '1.7rem',
    fontWeight: 600,
    margin: '0 0 0.35rem',
  },
  h2: {
    fontFamily: 'Sora, sans-serif',
    fontSize: '1.1rem',
    fontWeight: 600,
    margin: '0 0 0.65rem',
  },
  subtitle: { color: '#6B7280', margin: 0, fontSize: '0.92rem' },
  section: { marginBottom: '1.5rem' },
  body: { color: '#374151', lineHeight: 1.6, fontSize: '0.95rem' },
  muted: { color: '#6B7280', fontSize: '0.92rem' },
  table: {
    width: '100%',
    background: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: 8,
    borderCollapse: 'separate',
    borderSpacing: 0,
    overflow: 'hidden',
  },
  th: {
    textAlign: 'left',
    padding: '0.6rem 0.85rem',
    background: '#F9FAFB',
    borderBottom: '1px solid #E5E7EB',
    fontSize: '0.78rem',
    textTransform: 'uppercase',
    color: '#4B5563',
    letterSpacing: 0.04,
    fontWeight: 600,
  },
  td: {
    padding: '0.55rem 0.85rem',
    borderBottom: '1px solid #F3F4F6',
    fontSize: '0.88rem',
    verticalAlign: 'top',
  },
  tdCenter: {
    padding: '0.55rem 0.85rem',
    borderBottom: '1px solid #F3F4F6',
    fontSize: '0.88rem',
    textAlign: 'center',
    color: '#6B7280',
    fontFamily: 'JetBrains Mono, ui-monospace, monospace',
    verticalAlign: 'top',
    width: 36,
  },
  tdMuted: {
    padding: '0.55rem 0.85rem',
    borderBottom: '1px solid #F3F4F6',
    fontSize: '0.82rem',
    color: '#6B7280',
    verticalAlign: 'top',
    lineHeight: 1.5,
  },
  statePill: {
    display: 'inline-block',
    padding: '0.18rem 0.55rem',
    borderRadius: 999,
    fontSize: '0.72rem',
    fontWeight: 600,
    border: '1px solid transparent',
    textTransform: 'uppercase',
    letterSpacing: 0.04,
  },
  list: {
    margin: 0,
    paddingLeft: '1.25rem',
    color: '#374151',
    fontSize: '0.92rem',
    lineHeight: 1.7,
  },
  gate: {
    background: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: 12,
    padding: '2rem',
    maxWidth: 520,
    margin: '3rem auto',
    textAlign: 'center',
  },
  gateTitle: {
    fontFamily: 'Sora, sans-serif',
    fontSize: '1.3rem',
    margin: '0 0 0.6rem',
  },
  gateBody: { color: '#4B5563', lineHeight: 1.6, margin: '0 0 0.85rem' },
  gateAction: {
    display: 'inline-block',
    background: '#1D3095',
    color: '#FFFFFF',
    padding: '0.55rem 1.25rem',
    borderRadius: 8,
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: '0.92rem',
  },
};
